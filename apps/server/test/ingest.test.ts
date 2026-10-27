import { gitBlobId } from '@spec-hub/core/git-object-id'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../src/db/client.ts'
import {
  clone,
  cloneBranch,
  cloneFeature,
  document,
  landedFeature,
  project,
  securityEvent,
} from '../src/db/schema.ts'
import { addMember, createProject, createToken, createUser, request, truncateAll } from './helpers.ts'

const enc = (s: string) => new TextEncoder().encode(s)
const oidOf = (bytes: Uint8Array) => gitBlobId(bytes, 'sha1')
const TIP = 'a'.repeat(40)

const SPEC = enc('# Feature Specification: X\n\n**Owner**: @alice\n**Depends on**: [S](../099-dep/spec.md)\n')

type Doc = { oid: string; size: number } | null
type Feat = { dir: string; spec?: Doc; plan?: Doc; tasks?: Doc }
type Br = { name: string; tipAt?: number; features?: Feat[] }

const ref = (bytes: Uint8Array): Doc => ({ oid: oidOf(bytes), size: bytes.byteLength })

function manifest(
  cloneId: string,
  generatedAt: number,
  branches: Br[],
  def: { tipAt: number; dirs: string[]; branch?: string } | null = null,
) {
  return {
    cloneId,
    generatedAt,
    commitEmail: 'Alice@Example.test',
    objectFormat: 'sha1',
    default: def && { branch: 'trunk', tip: TIP, ...def },
    branches: branches.map((b) => ({
      name: b.name,
      tip: TIP,
      tipAt: b.tipAt ?? 1000,
      pushed: true,
      features: (b.features ?? []).map((f) => ({
        dir: f.dir,
        lastChangeAt: 1000,
        author: { name: 'Alice', email: 'alice@example.test' },
        docs: { spec: f.spec ?? null, plan: f.plan ?? null, tasks: f.tasks ?? null },
      })),
    })),
  }
}

async function setup() {
  const alice = await createUser('alice')
  const p = await createProject('acme', { defaultBranch: 'trunk' })
  await addMember(p, alice)
  const { key } = await createToken(alice)
  const auth = { Authorization: `Bearer ${key}` }
  const report = (m: unknown, slug = 'acme', headers = auth) =>
    request(`/api/r/${slug}/reports`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(m),
    })
  const put = (oid: string, bytes: Uint8Array, slug = 'acme', headers = auth) =>
    request(`/api/r/${slug}/blobs/${oid}`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/octet-stream' },
      body: bytes,
    })
  return { alice, p, auth, report, put }
}

beforeEach(truncateAll)
afterEach(() => vi.restoreAllMocks())

describe('reporter ingestion', () => {
  it('returns the default branch and the caller login from config', async () => {
    const { auth } = await setup()
    const res = await request('/api/r/acme/config', { headers: auth })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      defaultBranch: 'trunk',
      maxDocumentBytes: 524288,
      login: 'alice',
    })
  })

  it('asks for missing docs, stores them idempotently, then accepts and parses facts', async () => {
    const { alice, p, report, put } = await setup()
    const cloneId = crypto.randomUUID()
    const spec = ref(SPEC)
    const m = manifest(cloneId, 100, [{ name: 'f1', features: [{ dir: '001-a', spec }] }])

    const first = await report(m)
    expect(first.status).toBe(409)
    expect(await first.json()).toEqual({ missing: [spec?.oid] })
    expect(await db.select().from(clone)).toHaveLength(0)
    expect(await db.select().from(cloneBranch)).toHaveLength(0)

    expect((await put(spec?.oid ?? '', SPEC)).status).toBe(204)
    expect((await put(spec?.oid ?? '', SPEC)).status).toBe(204)

    const ok = await report(m)
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ accepted: true })

    const [c] = await db.select().from(clone)
    expect(c).toMatchObject({
      id: cloneId,
      projectId: p.id,
      userId: alice.id,
      generatedAt: 100,
      commitEmail: 'alice@example.test',
    })
    expect(await db.select().from(cloneBranch)).toMatchObject([{ cloneId, name: 'f1', pushed: true }])
    expect(await db.select().from(cloneFeature)).toMatchObject([
      { cloneId, branch: 'f1', dir: '001-a', specOid: spec?.oid, specSize: spec?.size, planOid: null },
    ])
    const [d] = await db.select().from(document)
    expect(d).toMatchObject({ title: 'X', ownerHandle: 'alice', dependsOn: ['099-dep'], tooLarge: false })
    expect(
      await db.select().from(securityEvent).where(eq(securityEvent.type, 'clone_connected')),
    ).toHaveLength(1)
  })

  it('treats an equal or older generatedAt as stale', async () => {
    const { report } = await setup()
    const id = crypto.randomUUID()
    expect((await report(manifest(id, 100, []))).status).toBe(200)
    for (const at of [100, 50]) {
      const res = await report(manifest(id, at, []))
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ accepted: false, reason: 'stale' })
    }
    expect(
      await db.select().from(securityEvent).where(eq(securityEvent.type, 'clone_connected')),
    ).toHaveLength(1)
  })

  it('refuses a clone id owned by another member', async () => {
    const { p, report } = await setup()
    const bob = await createUser('bob')
    await addMember(p, bob)
    const bobAuth = { Authorization: `Bearer ${(await createToken(bob)).key}` }
    const id = crypto.randomUUID()
    expect((await report(manifest(id, 100, []))).status).toBe(200)
    expect((await report(manifest(id, 200, []), 'acme', bobAuth)).status).toBe(403)
    const [c] = await db.select().from(clone)
    expect(c?.generatedAt).toBe(100)
  })

  it('does not ask for too-large docs and stores a marker', async () => {
    const { report } = await setup()
    const big = { oid: 'b'.repeat(40), size: 524289 }
    const res = await report(
      manifest(crypto.randomUUID(), 100, [{ name: 'f', features: [{ dir: '001-a', plan: big }] }]),
    )
    expect(res.status).toBe(200)
    const [d] = await db.select().from(document)
    expect(d).toMatchObject({ oid: big.oid, tooLarge: true, content: null })
  })

  it('validates uploaded blobs', async () => {
    const { put } = await setup()
    expect((await put('c'.repeat(40), SPEC)).status).toBe(422)
    expect((await put('nothex', SPEC)).status).toBe(422)
    const big = new Uint8Array(524289)
    expect((await put(oidOf(big), big)).status).toBe(413)
    expect(await db.select().from(document)).toHaveLength(0)
  })

  it('stores text containing NUL as unreadable', async () => {
    const { put } = await setup()
    const nul = enc('# Title\n\u0000\n')
    expect((await put(oidOf(nul), nul)).status).toBe(204)
    const [d] = await db.select().from(document)
    expect(d).toMatchObject({ unreadable: true, content: null, title: null })
  })

  it('stores invalid UTF-8 as unreadable', async () => {
    const { put, report } = await setup()
    const bad = new Uint8Array([0xff, 0xfe])
    expect((await put(oidOf(bad), bad)).status).toBe(204)
    const [d] = await db.select().from(document)
    expect(d).toMatchObject({ unreadable: true, content: null })
    const res = await report(
      manifest(crypto.randomUUID(), 100, [{ name: 'f', features: [{ dir: '001-a', spec: ref(bad) }] }]),
    )
    expect(res.status).toBe(200)
  })

  it('replaces a clone wholesale on a newer report', async () => {
    const { report } = await setup()
    const id = crypto.randomUUID()
    const feat = (dir: string) => ({ dir })
    await report(
      manifest(id, 100, [
        { name: 'a', features: [feat('001-a')] },
        { name: 'b', features: [feat('002-b')] },
      ]),
    )
    expect(await db.select().from(cloneBranch)).toHaveLength(2)
    await report(manifest(id, 200, [{ name: 'b', features: [feat('003-c')] }]))
    expect(await db.select().from(cloneBranch)).toMatchObject([{ name: 'b' }])
    expect(await db.select().from(cloneFeature)).toMatchObject([{ branch: 'b', dir: '003-c' }])
  })

  it('tracks landed features with a baseline and ignores older default tips', async () => {
    const { p, report } = await setup()
    const id = crypto.randomUUID()
    const T = Math.floor(Date.now() / 1000) + 60 // after the project was created
    await report(manifest(id, 100, [], { tipAt: T, dirs: ['001-a', '002-b'] }))
    const rows = () => db.select().from(landedFeature).orderBy(landedFeature.dir)
    expect(await rows()).toMatchObject([
      { dir: '001-a', baseline: true },
      { dir: '002-b', baseline: true },
    ])
    await report(manifest(id, 200, [], { tipAt: T + 20, dirs: ['001-a', '002-b', '003-c'] }))
    expect(await rows()).toMatchObject([
      { dir: '001-a', baseline: true },
      { dir: '002-b', baseline: true },
      { dir: '003-c', baseline: false },
    ])
    await report(manifest(id, 300, [], { tipAt: T + 10, dirs: ['001-a', '004-d'] }))
    expect((await rows()).map((r) => r.dir)).toEqual(['001-a', '002-b', '003-c'])
    const [row] = await db.select().from(project).where(eq(project.id, p.id))
    expect(row?.defaultTipAt).toEqual(new Date((T + 20) * 1000))
  })

  it('treats a listing from before the project existed as history', async () => {
    const { report } = await setup()
    const id = crypto.randomUUID()
    await report(manifest(id, 100, [], { tipAt: 1000, dirs: ['001-a'] }))
    await report(manifest(id, 200, [], { tipAt: 2000, dirs: ['001-a', '002-b'] }))
    const T = Math.floor(Date.now() / 1000) + 60
    await report(manifest(id, 300, [], { tipAt: T, dirs: ['001-a', '002-b', '003-c'] }))
    expect(await db.select().from(landedFeature).orderBy(landedFeature.dir)).toMatchObject([
      { dir: '001-a', baseline: true },
      { dir: '002-b', baseline: true },
      { dir: '003-c', baseline: false },
    ])
  })

  it("ignores a default listing for a branch that is not the project's default", async () => {
    const { p, report } = await setup()
    const T = Math.floor(Date.now() / 1000)
    const res = await report(
      manifest(crypto.randomUUID(), 100, [], { tipAt: T, dirs: ['001-a'], branch: 'main' }),
    )
    expect(res.status).toBe(200)
    expect(await db.select().from(landedFeature)).toHaveLength(0)
    const [row] = await db.select().from(project).where(eq(project.id, p.id))
    expect(row?.defaultTipAt).toBeNull()
  })

  it('enforces size limits', async () => {
    const { report } = await setup()
    const id = crypto.randomUUID()
    const branches = Array.from({ length: 501 }, (_, i) => ({ name: `b${i}` }))
    expect((await report(manifest(id, 100, branches))).status).toBe(422)
    expect(await db.select().from(clone)).toHaveLength(0)
    expect((await report({ ...manifest(id, 100, []), pad: 'x'.repeat(1024 * 1024) })).status).toBe(413)
    expect(await db.select().from(clone)).toHaveLength(0)
  })
})

describe('cross-project isolation (SEC-A01)', () => {
  it('scopes documents to their project', async () => {
    const { alice, report, put, auth } = await setup()
    const b = await createProject('beta')
    await addMember(b, alice)
    const spec = ref(SPEC)
    const m = manifest(crypto.randomUUID(), 100, [{ name: 'f', features: [{ dir: '001-a', spec }] }])
    expect((await report(m)).status).toBe(409)
    expect((await put(spec?.oid ?? '', SPEC)).status).toBe(204)
    expect((await report(m)).status).toBe(200)

    const inB = manifest(crypto.randomUUID(), 100, [{ name: 'f', features: [{ dir: '001-a', spec }] }])
    const res = await report(inB, 'beta', auth)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ missing: [spec?.oid] })
  })

  it('refuses a clone id already used in another project', async () => {
    const { alice, report, auth } = await setup()
    const b = await createProject('beta')
    await addMember(b, alice)
    const id = crypto.randomUUID()
    expect((await report(manifest(id, 100, []))).status).toBe(200)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const refused = await report(manifest(id, 200, []), 'beta', auth)
    expect(refused.status).toBe(403)
    expect(await refused.json()).toEqual({
      error: 'this clone id is registered to another person or project',
    })
    const [ev] = await db.select().from(securityEvent).where(eq(securityEvent.type, 'clone_rejected'))
    expect(ev).toMatchObject({ actorUserId: alice.id, projectId: b.id, detail: { cloneId: id } })
    expect(JSON.parse(String(warn.mock.calls.at(-1)?.[0]))).toMatchObject({
      event: 'auth_rejected',
      reason: 'foreign_clone',
      cloneId: id,
    })
    const [c] = await db.select().from(clone)
    expect(c).toMatchObject({
      projectId: (await db.select().from(project).where(eq(project.slug, 'acme')))[0]?.id,
      generatedAt: 100,
    })
  })
})
