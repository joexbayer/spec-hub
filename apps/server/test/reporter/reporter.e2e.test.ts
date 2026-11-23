import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { and, eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../../src/db/client.ts'
import { apikey, cloneBranch, cloneFeature, document, landedFeature, project } from '../../src/db/schema.ts'
import { addMember, createProject, createToken, createUser, truncateAll } from '../helpers.ts'
import { CONFIG, type Hub, Repo, Sandbox, startHub, stopHub, waitFor } from './harness.ts'

let hub: Hub
let seq = 0

beforeAll(async () => {
  await truncateAll()
  hub = await startHub()
})

afterAll(async () => {
  await stopHub(hub)
})

const SPEC = '# Feature Specification: X\n\nSome text.\n'

/** A fresh user, project, token and connected clone (clone-managed hooks). */
async function connectedClone(opts: { initialFiles?: Record<string, string> } = {}) {
  seq++
  const u = await createUser(`dev${seq}`)
  const p = await createProject(`proj${seq}`)
  await addMember(p, u)
  const token = await createToken(u)
  const sb = new Sandbox()
  const repo = sb.repo({ hubPort: hub.port, project: p.slug, ...opts })
  await repo.connect(token.key)
  return { sb, repo, user: u, project: p, token, cloneId: repo.cloneId() }
}

const branchesOf = (cloneId: string) => db.select().from(cloneBranch).where(eq(cloneBranch.cloneId, cloneId))
const featuresOf = (cloneId: string) =>
  db.select().from(cloneFeature).where(eq(cloneFeature.cloneId, cloneId))

const featureRow = async (cloneId: string, branch: string, dir: string) =>
  (
    await db
      .select()
      .from(cloneFeature)
      .where(
        and(eq(cloneFeature.cloneId, cloneId), eq(cloneFeature.branch, branch), eq(cloneFeature.dir, dir)),
      )
  )[0]

const normalize = (s: string) => s.replace(/\b[0-9a-f]{7,64}\b/g, '<oid>')

function localDate(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function hooksSnapshot(dir: string): string[] {
  return readdirSync(dir)
    .sort()
    .map((f) => {
      const p = join(dir, f)
      const st = statSync(p)
      const hash = st.isFile() ? createHash('sha256').update(readFileSync(p)).digest('hex') : 'dir'
      return `${f} ${(st.mode & 0o777).toString(8)} ${hash}`
    })
}

describe('reporter end to end (real hub, real git)', () => {
  it('reports a commit on an unpushed branch, prints nothing extra, and the hook returns fast', async () => {
    const { sb, repo, cloneId } = await connectedClone()

    repo.git('checkout', '-q', '-b', '001-x')
    repo.write('specs/001-x/spec.md', SPEC)
    const out = repo.commit(['specs/001-x/spec.md'], 'add spec')

    // control: the same commit in a clone without hooks
    const control = sb.repo({ hubPort: hub.port, project: 'unused', name: 'control' })
    control.git('checkout', '-q', '-b', '001-x')
    control.write('specs/001-x/spec.md', SPEC)
    const ctl = control.commit(['specs/001-x/spec.md'], 'add spec')

    expect(out.stderr).toBe(ctl.stderr)
    expect(normalize(out.stdout)).toBe(normalize(ctl.stdout))
    expect(out.stdout + out.stderr).not.toContain('spec-hub')

    const feature = await waitFor(() => featureRow(cloneId, '001-x', '001-x'), 'feature 001-x')
    expect(feature.specOid).toBe(repo.git('rev-parse', 'HEAD:specs/001-x/spec.md').trim())
    const branch = (await branchesOf(cloneId)).find((b) => b.name === '001-x')
    expect(branch?.pushed).toBe(false)

    const times: number[] = []
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now()
      const r = repo.spechubSync(['hook', 'post-commit'])
      times.push(performance.now() - t0)
      expect(r).toMatchObject({ status: 0, stdout: '', stderr: '' })
    }
    const median = [...times].sort((a, b) => a - b)[2]!
    console.log(
      `spec-hub hook post-commit foreground median: ${median.toFixed(1)} ms (${times.map((t) => t.toFixed(1)).join(', ')})`,
    )
    expect(median).toBeLessThan(150)
  })

  it('stores task progress from a committed tasks.md', async () => {
    const { repo, cloneId } = await connectedClone()
    repo.git('checkout', '-q', '-b', '001-x')
    repo.write('specs/001-x/spec.md', SPEC)
    repo.write(
      'specs/001-x/tasks.md',
      [
        '# Tasks',
        '',
        '- [x] T001 Set up the project',
        '- [x] T002 [P] Write the model',
        '- [ ] T003 Write the route',
        '- [ ] T004 [US1] Write the page',
        '- [ ] T005 Document it',
        '',
      ].join('\n'),
    )
    repo.commit(['specs/001-x'], 'tasks')

    const doc = await waitFor(async () => {
      const f = await featureRow(cloneId, '001-x', '001-x')
      if (!f?.tasksOid) return undefined
      return (await db.select().from(document).where(eq(document.oid, f.tasksOid)))[0]
    }, 'tasks document')
    expect(doc).toMatchObject({ tasksDone: 2, tasksTotal: 5 })
  })

  it('drops a deleted branch on the next report', async () => {
    const { repo, cloneId } = await connectedClone()
    repo.git('checkout', '-q', '-b', '001-x')
    repo.write('specs/001-x/spec.md', SPEC)
    repo.commit(['specs/001-x/spec.md'], 'add spec')
    await waitFor(() => featureRow(cloneId, '001-x', '001-x'), 'feature 001-x')

    repo.git('checkout', '-q', 'main')
    repo.git('branch', '-q', '-D', '001-x')
    expect(await repo.spechub(['report', '--quiet'])).toMatchObject({ status: 0, stdout: '', stderr: '' })

    await waitFor(async () => {
      const gone = !(await branchesOf(cloneId)).some((b) => b.name === '001-x')
      return gone && (await featuresOf(cloneId)).length === 0 ? true : undefined
    }, 'branch 001-x to disappear')
  })

  it('never reports a branch under a private prefix', async () => {
    const { repo, cloneId } = await connectedClone()
    expect((await repo.spechub(['private', 'add', 'scratch/'])).status).toBe(0)
    repo.git('checkout', '-q', '-b', 'scratch/y')
    repo.write('specs/002-y/spec.md', SPEC)
    repo.commit(['specs/002-y/spec.md'], 'private spec')
    // a public branch too, so we know reports are flowing
    repo.git('checkout', '-q', '-b', '003-pub', 'main')
    repo.write('specs/003-pub/spec.md', SPEC)
    repo.commit(['specs/003-pub/spec.md'], 'public spec')
    expect((await repo.spechub(['report', '--quiet'])).status).toBe(0)

    await waitFor(() => featureRow(cloneId, '003-pub', '003-pub'), 'public feature')
    const branches = await branchesOf(cloneId)
    expect(branches.map((b) => b.name)).not.toContain('scratch/y')
    const features = await featuresOf(cloneId)
    expect(features.filter((f) => f.branch === 'scratch/y')).toEqual([])
    expect(features.map((f) => f.dir)).toEqual(['003-pub'])
  })

  it('commits silently while the hub is down and catches up once it is back', async () => {
    const { repo, cloneId } = await connectedClone()
    const port = hub.port
    await stopHub(hub)
    try {
      repo.git('checkout', '-q', '-b', '003-z')
      repo.write('specs/003-z/spec.md', SPEC)
      const down = repo.commit(['specs/003-z/spec.md'], 'spec while hub is down')
      expect(down.stderr).toBe('')
      expect(down.stdout).not.toMatch(/spec-hub|unreachable/i)
      expect(await featuresOf(cloneId)).toEqual([])
    } finally {
      hub = await startHub(port)
    }

    repo.write('specs/003-z/plan.md', '# Plan\n')
    const up = repo.commit(['specs/003-z/plan.md'], 'plan with hub back')
    expect(up.stderr).toBe('')

    const f = await waitFor(async () => {
      const row = await featureRow(cloneId, '003-z', '003-z')
      return row?.planOid ? row : undefined
    }, 'feature 003-z with both commits')
    expect(f.specOid).toBe(repo.git('rev-parse', 'HEAD:specs/003-z/spec.md').trim())
    expect(f.planOid).toBe(repo.git('rev-parse', 'HEAD:specs/003-z/plan.md').trim())
    expect(existsSync(join(repo.commonDir(), 'spec-hub', 'error'))).toBe(false)
  })

  it('shows a revoked token notice once a day', async () => {
    const { repo, token } = await connectedClone()
    await db.delete(apikey).where(eq(apikey.id, token.id))
    const state = join(repo.commonDir(), 'spec-hub')

    expect(repo.spechubSync(['hook', 'post-commit']).stderr).toBe('')
    await waitFor(async () => (existsSync(join(state, 'error')) ? true : undefined), 'recorded error')

    const first = repo.spechubSync(['hook', 'post-commit'])
    const lines = first.stderr.split('\n').filter((l) => l !== '')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/^spec-hub: the hub rejected your token/)
    expect(first.stdout).toBe('')

    expect(repo.spechubSync(['hook', 'post-commit']).stderr).toBe('')

    writeFileSync(join(state, 'error-shown'), `${localDate(-1)}\n`)
    const again = repo
      .spechubSync(['hook', 'post-commit'])
      .stderr.split('\n')
      .filter((l) => l !== '')
    expect(again).toHaveLength(1)
    expect(again[0]).toMatch(/^spec-hub: /)
  })

  it('works with team-managed hooks and leaves the team pre-push hook running', async () => {
    seq++
    const u = await createUser(`dev${seq}`)
    const p = await createProject(`proj${seq}`)
    await addMember(p, u)
    const token = await createToken(u)
    const sb = new Sandbox()
    const repo = sb.repo({ hubPort: hub.port, project: p.slug })
    const marker = join(sb.root, 'pre-push-ran')
    repo.git('config', 'core.hooksPath', '.githooks')
    repo.write('.githooks/pre-push', `#!/bin/sh\ntouch '${marker}'\n`)
    sb.run(repo.dir, 'chmod', ['+x', '.githooks/pre-push'])

    expect((await repo.spechub(['hooks', '.githooks'])).status).toBe(0)
    const connect = await repo.connect(token.key)
    expect(connect.stdout).not.toContain('missing the spec-hub line')
    const cloneId = repo.cloneId()

    repo.git('checkout', '-q', '-b', '005-t')
    repo.write('specs/005-t/spec.md', SPEC)
    repo.commit(['specs/005-t/spec.md'], 'team hooks')
    await waitFor(() => featureRow(cloneId, '005-t', '005-t'), 'feature from team hooks')

    repo.git('push', '-q', '-u', 'origin', '005-t')
    expect(existsSync(marker)).toBe(true)
    expect((await repo.spechub(['report', '--quiet'])).status).toBe(0)
    await waitFor(
      async () => ((await branchesOf(cloneId)).find((b) => b.name === '005-t')?.pushed ? true : undefined),
      'pushed branch',
    )
  })

  it('installs into .husky (not husky 9 generated .husky/_) and runs before a hook that ends in exec', async () => {
    const { repo, sb, token, cloneId } = await connectedClone()
    // husky 9: core.hooksPath=.husky/_ holds ignored stubs that run .husky/<hook> through h
    repo.git('config', 'core.hooksPath', '.husky/_')
    repo.write('.husky/_/.gitignore', '*\n')
    repo.write(
      '.husky/_/h',
      '#!/bin/sh\ns="$(dirname "$(dirname "$0")")/$(basename "$0")"\n[ -f "$s" ] || exit 0\nsh -e "$s" "$@"\n',
    )
    for (const e of ['post-commit', 'post-checkout', 'post-merge', 'post-rewrite']) {
      repo.write(`.husky/_/${e}`, '#!/bin/sh\n. "$(dirname "$0")/h"\n')
      sb.run(repo.dir, 'chmod', ['+x', `.husky/_/${e}`])
    }
    const marker = join(sb.root, 'team-hook-ran')
    repo.write('.husky/post-commit', `#!/bin/sh\ntouch '${marker}'\nexec true\n`)

    const hooks = await repo.spechub(['hooks', repo.git('config', 'core.hooksPath').trim()])
    expect(hooks.status).toBe(0)
    expect(readFileSync(join(repo.dir, '.husky/post-commit'), 'utf8')).toMatch(
      /^#!\/bin\/sh\n# spec-hub\n.*spec-hub hook post-commit.*\ntouch /,
    )
    expect(readFileSync(join(repo.dir, '.husky/_/post-commit'), 'utf8')).not.toContain('spec-hub')
    expect((await repo.connect(token.key)).stdout).not.toContain('missing the spec-hub line')

    repo.git('checkout', '-q', '-b', '006-h')
    repo.write('specs/006-h/spec.md', SPEC)
    repo.commit(['specs/006-h/spec.md'], 'husky hooks')
    expect(existsSync(marker)).toBe(true)
    await waitFor(() => featureRow(cloneId, '006-h', '006-h'), 'feature from husky hooks')
  })

  it('reports only what the branch changed, not what main changed since (FR-012)', async () => {
    const { repo, cloneId } = await connectedClone({ initialFiles: { 'specs/001-a/spec.md': SPEC } })
    repo.git('branch', '002-b')
    repo.write('specs/001-a/spec.md', `${SPEC}\nChanged on main.\n`)
    repo.commit(['specs/001-a/spec.md'], 'main moves on')
    repo.git('push', '-q', 'origin', 'main')

    repo.git('checkout', '-q', '002-b')
    repo.write('specs/002-b/spec.md', SPEC)
    repo.commit(['specs/002-b/spec.md'], 'feature b')

    await waitFor(() => featureRow(cloneId, '002-b', '002-b'), 'feature 002-b')
    const dirs = (await featuresOf(cloneId)).filter((f) => f.branch === '002-b').map((f) => f.dir)
    expect(dirs).toEqual(['002-b'])

    const manifest = JSON.parse((await repo.spechub(['report', '--print-manifest'])).stdout)
    const b = manifest.branches.find((x: { name: string }) => x.name === '002-b')
    expect(b.features.map((f: { dir: string }) => f.dir)).toEqual(['002-b'])
  })

  it('disconnect restores the clone exactly', async () => {
    seq++
    const u = await createUser(`dev${seq}`)
    const p = await createProject(`proj${seq}`)
    await addMember(p, u)
    const token = await createToken(u)
    const sb = new Sandbox()
    const repo = sb.repo({ hubPort: hub.port, project: p.slug })
    const hooksDir = join(repo.commonDir(), 'hooks')
    const configBefore = repo.git('config', '--list', '--local')
    const hooksBefore = hooksSnapshot(hooksDir)

    await repo.connect(token.key)
    expect((await repo.spechub(['private', 'add', 'scratch/'])).status).toBe(0)
    expect(hooksSnapshot(hooksDir)).not.toEqual(hooksBefore)
    expect((await repo.spechub(['disconnect'])).status).toBe(0)

    expect(repo.git('config', '--list', '--local')).toBe(configBefore)
    expect(hooksSnapshot(hooksDir)).toEqual(hooksBefore)
    expect(existsSync(join(repo.commonDir(), 'spec-hub'))).toBe(false)
  })

  it('mcp writes a .mcp.json whose headersHelper authenticates the agent to the project', async () => {
    const { repo, sb, project } = await connectedClone()

    const created = await repo.spechub(['mcp'])
    expect(created.status).toBe(0)
    const server = JSON.parse(readFileSync(join(repo.dir, '.mcp.json'), 'utf8')).mcpServers['spec-hub']
    expect(server.url).toBe(`http://127.0.0.1:${hub.port}/mcp/${project.slug}`)

    // as Claude Code runs it: through a shell, from the project directory
    const helper = await sb.runAsync(repo.dir, 'sh', ['-c', server.headersHelper], {
      env: { CLAUDE_CODE_MCP_SERVER_URL: server.url },
    })
    expect(helper.status).toBe(0)
    const client = new Client({ name: 'test', version: '0.0.0' })
    await client.connect(
      new StreamableHTTPClientTransport(new URL(server.url), {
        requestInit: { headers: JSON.parse(helper.stdout) },
      }),
    )
    expect((await client.listTools()).tools.map((t) => t.name)).toContain('board')
    await client.close()

    const again = await repo.spechub(['mcp'])
    expect(again.status).toBe(0)
    expect(again.stdout).toContain('already has')
  })

  it('mcp prints the entry instead of touching an existing .mcp.json', async () => {
    const { repo } = await connectedClone()
    const existing = '{\n  "mcpServers": {\n    "other": { "type": "stdio", "command": "x" }\n  }\n}\n'
    repo.write('.mcp.json', existing)

    const r = await repo.spechub(['mcp'])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain(
      '"headersHelper": "sh .specify/extensions/spec-hub/scripts/spec-hub mcp-headers"',
    )
    expect(readFileSync(join(repo.dir, '.mcp.json'), 'utf8')).toBe(existing)
  })

  it('mcp-headers tells the developer to connect when there is no token', async () => {
    seq++
    const p = await createProject(`proj${seq}`)
    const repo = new Sandbox().repo({ hubPort: hub.port, project: p.slug })

    const r = await repo.spechub(['mcp-headers'], {
      env: { CLAUDE_CODE_MCP_SERVER_URL: `http://127.0.0.1:${hub.port}/mcp/${p.slug}` },
    })
    expect(r.status).toBe(1)
    expect(r.stdout).toBe('')
    expect(r.stderr).toContain('connect')
  })

  it('mcp-headers never sends the token to a url other than the configured hub', async () => {
    const { repo, token } = await connectedClone()

    for (const env of [
      { CLAUDE_CODE_MCP_SERVER_URL: 'https://evil.example/mcp/x' },
      { CLAUDE_CODE_MCP_SERVER_URL: '' },
    ]) {
      const r = await repo.spechub(['mcp-headers'], { env })
      expect(r.status).toBe(1)
      expect(r.stdout).toBe('')
      expect(r.stderr).not.toContain(token.key)
      expect(r.stderr).toContain('refusing')
    }
  })
})

describe('default branch listing (finished features)', () => {
  const ADDED = Math.floor(Date.now() / 1000) - 20 * 86_400 // the 003-merged branch commit
  const MERGED = ADDED + 10 * 86_400 // its merge into main

  /**
   * main gets 001-full (spec, plan, tasks), 002-spec-only and 003-merged (through a --no-ff merge,
   * back-dated), pushed. Hooks are off while building, so no background report races the push.
   */
  function buildMain(repo: Repo) {
    const git = (args: string[], env?: NodeJS.ProcessEnv) => {
      const r = repo.sb.run(repo.dir, 'git', ['-c', 'core.hooksPath=/dev/null', ...args], env ? { env } : {})
      if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`)
    }
    const at = (t: number) => ({ GIT_AUTHOR_DATE: `${t} +0000`, GIT_COMMITTER_DATE: `${t} +0000` })
    repo.write('specs/001-full/spec.md', `${SPEC}\nfull\n`)
    repo.write('specs/001-full/plan.md', '# Plan\n\nfull\n')
    repo.write('specs/001-full/tasks.md', '# Tasks\n\n- [ ] T001 full\n')
    repo.write('specs/002-spec-only/spec.md', `${SPEC}\nspec only\n`)
    git(['add', 'specs'])
    git(['commit', '-q', '-m', 'two features'])
    git(['checkout', '-q', '-b', '003-merged'])
    repo.write('specs/003-merged/spec.md', `${SPEC}\nmerged\n`)
    git(['add', 'specs'])
    git(['commit', '-q', '-m', 'merged feature'], at(ADDED))
    git(['checkout', '-q', 'main'])
    git(['merge', '-q', '--no-ff', '-m', 'merge 003-merged', '003-merged'], at(MERGED))
    git(['branch', '-q', '-D', '003-merged'])
    git(['push', '-q', 'origin', 'main'])
  }

  type DefaultFeature = {
    dir: string
    addedAt: number
    lastChangeAt: number
    author: { name: string; email: string } | null
    docs: Record<'spec' | 'plan' | 'tasks', { oid: string; size: number } | null>
    extra?: { name: string; oid: string; size: number }[]
  }
  const printDefault = async (repo: Repo) => {
    const r = await repo.spechub(['report', '--print-manifest'])
    expect(r).toMatchObject({ status: 0, stderr: '' })
    return JSON.parse(r.stdout).default as { tip: string; dirs: string[]; features?: DefaultFeature[] }
  }
  const blob = (repo: Repo, path: string) => repo.git('rev-parse', `origin/main:${path}`).trim()

  it('lists every feature on the default branch with its docs, owner and merge time', async () => {
    const { repo, project: p } = await connectedClone()
    buildMain(repo)
    await forgetTips(p.id)

    const features = (await printDefault(repo)).features!
    expect(features.map((f) => f.dir)).toEqual(['001-full', '002-spec-only', '003-merged'])
    const [full, specOnly, merged] = features as [DefaultFeature, DefaultFeature, DefaultFeature]
    expect(full.docs).toEqual({
      spec: { oid: blob(repo, 'specs/001-full/spec.md'), size: `${SPEC}\nfull\n`.length },
      plan: { oid: blob(repo, 'specs/001-full/plan.md'), size: '# Plan\n\nfull\n'.length },
      tasks: { oid: blob(repo, 'specs/001-full/tasks.md'), size: '# Tasks\n\n- [ ] T001 full\n'.length },
    })
    expect(specOnly.docs).toEqual({
      spec: { oid: blob(repo, 'specs/002-spec-only/spec.md'), size: expect.any(Number) },
      plan: null,
      tasks: null,
    })
    expect(merged.docs.spec?.oid).toBe(blob(repo, 'specs/003-merged/spec.md'))
    for (const f of features) expect(f.author).toEqual({ name: 'Test Dev', email: 'dev@example.test' })

    // a merge commit is credited with what it brought in: added when it landed on main
    expect(repo.git('log', '-1', '--format=%ct', 'origin/main').trim()).toBe(String(MERGED))
    expect(merged).toMatchObject({ addedAt: MERGED, lastChangeAt: MERGED })
    expect(full.addedAt).toBe(full.lastChangeAt)
    expect(full.addedAt).toBeGreaterThan(MERGED - 86_400 * 10)
  })

  it('uploads the default branch documents with a real report, and the commit stays silent', async () => {
    const { repo, cloneId, project: p } = await connectedClone()
    buildMain(repo)
    await forgetTips(p.id)
    const oids = [
      'specs/001-full/spec.md',
      'specs/001-full/plan.md',
      'specs/001-full/tasks.md',
      'specs/002-spec-only/spec.md',
      'specs/003-merged/spec.md',
    ].map((p) => blob(repo, p))

    repo.git('checkout', '-q', '-b', '004-new')
    repo.write('specs/004-new/spec.md', SPEC)
    const out = repo.commit(['specs/004-new/spec.md'], 'new feature')
    expect(out.stderr).toBe('')
    expect(out.stdout).not.toContain('spec-hub')

    await waitFor(() => featureRow(cloneId, '004-new', '004-new'), 'feature 004-new')
    await waitFor(async () => {
      const rows = await db.select({ oid: document.oid }).from(document).where(inArray(document.oid, oids))
      return new Set(rows.map((r) => r.oid)).size === oids.length ? true : undefined
    }, 'default branch documents')
  })

  it('leaves the listing out while the hub already has the default branch tip', async () => {
    const { repo, project: p } = await connectedClone()
    buildMain(repo)
    await forgetTips(p.id)
    expect((await printDefault(repo)).features).toHaveLength(3)

    const tip = repo.git('rev-parse', 'origin/main').trim()
    await db.update(project).set({ finishedTip: tip, finishedTipAt: new Date() }).where(eq(project.id, p.id))
    const unchanged = await printDefault(repo)
    expect(unchanged.tip).toBe(tip)
    expect(unchanged.dirs).toEqual(['001-full', '002-spec-only', '003-merged'])
    expect(unchanged).not.toHaveProperty('features')
  })

  // ---- main moves, lagging clones, older reporters (quickstart 3, 4, 5)

  const landedOf = (projectId: string) =>
    db.select().from(landedFeature).where(eq(landedFeature.projectId, projectId)).orderBy(landedFeature.dir)
  const projectRow = async (id: string) => (await db.select().from(project).where(eq(project.id, id)))[0]!
  /**
   * connect already reported the initial commit (tip time: now), and buildMain's tip is back-dated,
   * so the hub would ignore its listing as older: forget the tips first.
   */
  const forgetTips = (projectId: string) =>
    db
      .update(project)
      .set({ defaultTip: null, defaultTipAt: null, finishedTip: null, finishedTipAt: null })
      .where(eq(project.id, projectId))
  /** Rows with every fact stored, so a later change to them is visible. */
  const storedListing = (projectId: string) =>
    waitFor(async () => {
      const rows = await landedOf(projectId)
      return rows.length === 3 && rows.every((r) => r.specOid) ? rows : undefined
    }, 'stored listing')
  /** git with the clone's hooks off, so no background report races what the test does next. */
  const quiet = (repo: Repo, args: string[], env?: NodeJS.ProcessEnv) => {
    const r = repo.sb.run(repo.dir, 'git', ['-c', 'core.hooksPath=/dev/null', ...args], env ? { env } : {})
    if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`)
  }

  it('follows main: an edited spec, a renamed folder and a removed folder reach the hub', async () => {
    const { repo, project: p } = await connectedClone()
    buildMain(repo)
    await forgetTips(p.id)
    expect((await repo.spechub(['report', '--quiet'])).status).toBe(0)
    await storedListing(p.id)

    // commit times have 1 s resolution: put the new tip clearly after the stored one
    const later = String(Math.floor(Date.now() / 1000) + 60)
    const at = { GIT_AUTHOR_DATE: `${later} +0000`, GIT_COMMITTER_DATE: `${later} +0000` }
    repo.write('specs/001-full/spec.md', `${SPEC}\nfull, edited on main\n`)
    quiet(repo, ['add', 'specs'])
    quiet(repo, ['mv', 'specs/002-spec-only', 'specs/005-renamed'])
    quiet(repo, ['rm', '-q', '-r', 'specs/003-merged'])
    quiet(repo, ['commit', '-q', '-m', 'main moves'], at)
    quiet(repo, ['push', '-q', 'origin', 'main'])
    expect((await repo.spechub(['report', '--quiet'])).status).toBe(0)

    const edited = blob(repo, 'specs/001-full/spec.md')
    const rows = await waitFor(async () => {
      const r = await landedOf(p.id)
      return r.find((x) => x.dir === '001-full')?.specOid === edited ? r : undefined
    }, 'main listing')
    expect(rows.map((r) => r.dir)).toEqual(['001-full', '005-renamed'])
    expect(rows.find((r) => r.dir === '005-renamed')?.specOid).toBe(blob(repo, 'specs/005-renamed/spec.md'))
  })

  it('a second commit after a stored listing sends no features and uploads nothing', async () => {
    const { repo, project: p } = await connectedClone()
    buildMain(repo)
    await forgetTips(p.id)
    expect((await repo.spechub(['report', '--quiet'])).status).toBe(0)
    await storedListing(p.id)
    // observed through the document table (the in-process hub's PUT /blobs/ requests are not counted)
    const documents = async () => (await db.select({ oid: document.oid }).from(document)).length
    const before = await documents()

    quiet(repo, ['checkout', '-q', '-b', 'tweak'])
    repo.write('README.md', '# test\n\nchanged\n')
    quiet(repo, ['-c', 'user.name=T', '-c', 'user.email=t@example.test', 'commit', '-q', '-am', 'readme'])
    expect(await printDefault(repo)).not.toHaveProperty('features')
    expect((await repo.spechub(['report', '--quiet'])).status).toBe(0)
    expect(await documents()).toBe(before)
  })

  it('GET /config carries finishedTipAt in Unix seconds, null before any listing', async () => {
    const { project: p, token } = await connectedClone()
    const config = async () =>
      (await (
        await fetch(`http://127.0.0.1:${hub.port}/api/r/${p.slug}/config`, {
          headers: { Authorization: `Bearer ${token.key}` },
        })
      ).json()) as { finishedTipAt: number | null }
    await forgetTips(p.id)
    expect((await config()).finishedTipAt).toBeNull()
    await db
      .update(project)
      .set({ finishedTipAt: new Date(1_700_000_000_999) })
      .where(eq(project.id, p.id))
    expect((await config()).finishedTipAt).toBe(1_700_000_000)
  })

  it('a clone that lacks the hub tip commit but is not newer than the hub sends no listing', async () => {
    const { sb, repo, project: p, token } = await connectedClone()
    buildMain(repo)
    await forgetTips(p.id)

    // a second clone of the same origin, as another member would have it
    sb.git(sb.root, 'clone', '-q', join(sb.root, 'clone-origin.git'), 'second')
    const second = new Repo(sb, join(sb.root, 'second'))
    await second.connect(token.key)
    await db
      .update(project)
      .set({ finishedTip: '1'.repeat(40), finishedTipAt: new Date() })
      .where(eq(project.id, p.id))
    expect(await printDefault(second)).not.toHaveProperty('features')
  })

  it('a shallow clone sends no listing even when the hub has none', async () => {
    const { sb, project: p, token } = await connectedClone()
    sb.git(sb.root, 'clone', '-q', '--depth', '1', `file://${join(sb.root, 'clone-origin.git')}`, 'shallow')
    const shallow = new Repo(sb, join(sb.root, 'shallow'))
    expect(shallow.git('rev-parse', '--is-shallow-repository').trim()).toBe('true')
    await shallow.connect(token.key)
    await forgetTips(p.id)
    expect(await printDefault(shallow)).not.toHaveProperty('features')
  })

  it('a manifest without features, as an older reporter sends it, changes no finished feature', async () => {
    const { repo, project: p, token } = await connectedClone()
    buildMain(repo)
    await forgetTips(p.id)
    expect((await repo.spechub(['report', '--quiet'])).status).toBe(0)
    const before = await storedListing(p.id)
    const stored = await projectRow(p.id)

    // the hub has the tip now, so the reporter leaves the listing out
    const manifest = JSON.parse((await repo.spechub(['report', '--print-manifest'])).stdout)
    expect(manifest.default).not.toHaveProperty('features')
    manifest.cloneId = randomUUID()
    manifest.generatedAt = Date.now()
    manifest.default.tipAt += 60
    const res = await fetch(`http://127.0.0.1:${hub.port}/api/r/${p.slug}/reports`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(manifest),
    })
    expect(res.status).toBe(200)

    const after = await projectRow(p.id)
    expect(after.defaultTipAt!.getTime()).toBe(stored.defaultTipAt!.getTime() + 60_000) // it was applied
    expect(after.finishedTipAt).toEqual(stored.finishedTipAt)
    expect(await landedOf(p.id)).toEqual(before)
  })

  // ---- extra documents (FR-014–FR-016)

  const PREVIEW = '# Preview\n\nWhat it looks like.\n'
  /** Adds a documents line to the work tree's config (read by every report, hooks included). */
  const setDocuments = (repo: Repo, value: string) =>
    writeFileSync(
      join(repo.dir, CONFIG),
      `${readFileSync(join(repo.dir, CONFIG), 'utf8')}documents: ${value}\n`,
    )
  type Manifest = {
    default: { features?: DefaultFeature[] }
    branches: { name: string; features: { dir: string; extra?: DefaultFeature['extra'] }[] }[]
  }
  const printManifest = async (repo: Repo) => {
    const r = await repo.spechub(['report', '--print-manifest'])
    expect(r).toMatchObject({ status: 0, stderr: '' })
    return { text: r.stdout, manifest: JSON.parse(r.stdout) as Manifest }
  }
  const branchFeature = (m: Manifest, branch: string, dir: string) =>
    m.branches.find((b) => b.name === branch)?.features.find((f) => f.dir === dir)

  it('reports and uploads a configured extra document of a branch feature', async () => {
    const { repo, cloneId } = await connectedClone()
    setDocuments(repo, 'preview.md')
    repo.git('checkout', '-q', '-b', '007-x')
    repo.write('specs/007-x/spec.md', SPEC)
    repo.write('specs/007-x/preview.md', PREVIEW)
    repo.write('specs/007-x/notes.md', 'not configured\n')
    repo.write('specs/007-x/sub/preview.md', 'not top level\n')
    repo.commit(['specs/007-x'], 'feature with a preview')
    const oid = repo.git('rev-parse', 'HEAD:specs/007-x/preview.md').trim()
    const extra = [{ name: 'preview.md', oid, size: PREVIEW.length }]

    expect(branchFeature((await printManifest(repo)).manifest, '007-x', '007-x')?.extra).toEqual(extra)
    expect((await repo.spechub(['report', '--quiet'])).status).toBe(0)
    const row = await waitFor(async () => {
      const f = await featureRow(cloneId, '007-x', '007-x')
      return f?.extraDocs.length ? f : undefined
    }, 'feature 007-x with its extra document')
    expect(row.extraDocs).toEqual(extra)
    await waitFor(
      async () => ((await db.select().from(document).where(eq(document.oid, oid))).length ? true : undefined),
      'uploaded preview.md',
    )
  })

  it('reports a configured extra document of a default branch feature', async () => {
    const { repo, project: p } = await connectedClone()
    setDocuments(repo, 'preview.md')
    repo.write('specs/001-full/preview.md', PREVIEW)
    buildMain(repo)
    await forgetTips(p.id)

    const features = (await printDefault(repo)).features!
    expect(features.find((f) => f.dir === '001-full')?.extra).toEqual([
      { name: 'preview.md', oid: blob(repo, 'specs/001-full/preview.md'), size: PREVIEW.length },
    ])
    for (const f of features.filter((x) => x.dir !== '001-full')) expect(f).not.toHaveProperty('extra')
  })

  it('without the documents key no feature carries extra documents', async () => {
    const { repo, project: p } = await connectedClone()
    repo.write('specs/001-full/preview.md', PREVIEW)
    buildMain(repo)
    await forgetTips(p.id)
    // hooks off: a background report would store the listing and drop it from the next manifest
    quiet(repo, ['checkout', '-q', '-b', '008-y'])
    repo.write('specs/008-y/spec.md', SPEC)
    repo.write('specs/008-y/preview.md', PREVIEW)
    quiet(repo, ['add', 'specs'])
    quiet(repo, ['commit', '-q', '-m', 'feature with a preview'])

    const { text, manifest } = await printManifest(repo)
    expect(manifest.default.features).toHaveLength(3)
    expect(branchFeature(manifest, '008-y', '008-y')).toBeDefined()
    expect(text).not.toContain('"extra"')
  })

  it('ignores invalid and reserved names in the documents key', async () => {
    const { repo } = await connectedClone()
    setDocuments(repo, '../x.md spec.md preview.md')
    repo.git('checkout', '-q', '-b', '009-z')
    repo.write('specs/009-z/spec.md', SPEC)
    repo.write('specs/009-z/preview.md', PREVIEW)
    repo.write('specs/x.md', 'outside the feature folder\n')
    repo.commit(['specs'], 'feature with a preview')

    const extra = branchFeature((await printManifest(repo)).manifest, '009-z', '009-z')?.extra
    expect(extra?.map((e) => e.name)).toEqual(['preview.md'])
  })
})
