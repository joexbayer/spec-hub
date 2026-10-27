import { existsSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../../src/db/client.ts'
import { cloneBranch, cloneFeature, landedFeature } from '../../src/db/schema.ts'
import { addMember, createProject, createToken, createUser, truncateAll } from '../helpers.ts'
import { type Hub, Sandbox, startHub, stopHub, waitFor } from './harness.ts'

let hub: Hub

beforeAll(async () => {
  await truncateAll()
  hub = await startHub()
})

afterAll(async () => {
  await stopHub(hub)
})

// Refnames cannot hold a space or a backslash (git check-ref-format), so the branch uses ${IFS};
// the directory and author names carry both literally.
// biome-ignore lint/suspicious/noTemplateCurlyInString: literal shell text, never a template
const BRANCH = 'feat/"q"$(touch${IFS}pwned)`touch${IFS}pwned`blåbær-日本'
const DIR = '001-"q" \\ $(touch pwned) `touch pwned` blåbær-日本'
const MAIN_DIR = '000-"q" \\ $(touch pwned) `touch pwned` blåbær-日本'
const AUTHOR = 'Eve "q" \\ $(touch pwned) `touch pwned` blåbær-日本 x'
const TAB_BRANCH = 'tab-author'
const TAB_DIR = '002-tab'
const CTL_DIR = '003-ctl\u0001x'
// > 255 bytes; components stay under the file-name limit so the loose ref can exist on disk
const LONG_BRANCH = ['b'.repeat(100), 'b'.repeat(100), 'b'.repeat(100)].join('/')

const SPEC = '# Feature Specification: hostile\n'

function pwnedFiles(root: string): string[] {
  return readdirSync(root, { recursive: true, encoding: 'utf8' }).filter((p) => basename(p) === 'pwned')
}

type ManifestBranch = { name: string; features: { dir: string; author: { name: string } | null }[] }

describe('hostile names (SEC-A05)', () => {
  it('carries quotes, backslashes, substitutions and non-ASCII byte for byte and runs none of them', async () => {
    const u = await createUser('mallory')
    const p = await createProject('hostile')
    await addMember(p, u)
    const token = await createToken(u)
    const sb = new Sandbox()
    const repo = sb.repo({
      hubPort: hub.port,
      project: p.slug,
      initialFiles: { [`specs/${MAIN_DIR}/spec.md`]: SPEC, 'specs/000-ctl\u0002main/spec.md': SPEC },
    })
    await repo.connect(token.key)
    const cloneId = repo.cloneId()

    repo.git('checkout', '-q', '-b', BRANCH, 'main')
    repo.write(`specs/${DIR}/spec.md`, SPEC)
    repo.commit([`specs/${DIR}/spec.md`], 'hostile', { GIT_AUTHOR_NAME: AUTHOR })

    repo.git('checkout', '-q', '-b', TAB_BRANCH, 'main')
    repo.write(`specs/${TAB_DIR}/spec.md`, SPEC)
    repo.write(`specs/${CTL_DIR}/spec.md`, SPEC)
    repo.commit([`specs/${TAB_DIR}/spec.md`, `specs/${CTL_DIR}/spec.md`], 'tab author', {
      GIT_AUTHOR_NAME: 'Tab\there',
    })
    repo.git('branch', LONG_BRANCH, TAB_BRANCH)
    repo.git('checkout', '-q', 'main')

    const printed = await repo.spechub(['report', '--print-manifest'])
    expect(printed.status).toBe(0)
    const manifest = JSON.parse(printed.stdout) as { branches: ManifestBranch[] }
    const byName = new Map(manifest.branches.map((b) => [b.name, b]))
    expect([...byName.keys()].sort()).toEqual([BRANCH, TAB_BRANCH].sort())
    expect(byName.get(BRANCH)?.features).toMatchObject([{ dir: DIR, author: { name: AUTHOR } }])
    expect(byName.get(TAB_BRANCH)?.features).toMatchObject([{ dir: TAB_DIR, author: { name: 'Tabhere' } }])

    expect(await repo.spechub(['report', '--quiet'])).toMatchObject({ status: 0, stdout: '', stderr: '' })

    const branches = await waitFor(async () => {
      const rows = await db.select().from(cloneBranch).where(eq(cloneBranch.cloneId, cloneId))
      return rows.length === 2 ? rows : undefined
    }, 'both branches stored')
    expect(branches.map((b) => b.name).sort()).toEqual([BRANCH, TAB_BRANCH].sort())

    const features = await db.select().from(cloneFeature).where(eq(cloneFeature.cloneId, cloneId))
    expect(
      features
        .map((f) => ({ branch: f.branch, dir: f.dir, authorName: f.authorName }))
        .sort((a, b) => a.dir.localeCompare(b.dir)),
    ).toEqual([
      { branch: BRANCH, dir: DIR, authorName: AUTHOR },
      { branch: TAB_BRANCH, dir: TAB_DIR, authorName: 'Tabhere' },
    ])

    // the default branch listing (connect's first report) carries the hostile dir, not the control-char one
    const landed = await db.select().from(landedFeature).where(eq(landedFeature.projectId, p.id))
    expect(landed.map((l) => l.dir)).toEqual([MAIN_DIR])

    expect(pwnedFiles(sb.root)).toEqual([])
    expect(existsSync(join(process.cwd(), 'pwned'))).toBe(false)
  })
})
