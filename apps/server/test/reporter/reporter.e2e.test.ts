import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../../src/db/client.ts'
import { apikey, cloneBranch, cloneFeature, document } from '../../src/db/schema.ts'
import { addMember, createProject, createToken, createUser, truncateAll } from '../helpers.ts'
import { type Hub, Sandbox, startHub, stopHub, waitFor } from './harness.ts'

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
})
