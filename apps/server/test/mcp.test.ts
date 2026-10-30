import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../src/app.ts'
import { db } from '../src/db/client.ts'
import { clone, cloneBranch, cloneFeature, document, landPlace, user } from '../src/db/schema.ts'
import { formatBoard } from '../src/mcp/format.ts'
import { loadBoard } from '../src/services/board-query.ts'
import { poll } from '../src/services/landing.ts'
import {
  addMember,
  createProject,
  createToken,
  createUser,
  type TestProject,
  type TestUser,
  truncateAll,
} from './helpers.ts'

beforeEach(truncateAll)

const URL_BASE = 'http://localhost:5173/mcp/'
const SPEC = '# Ledger\n**Owner**: alice\n\n```\ncode\n```\n'

async function seed(p: TestProject, u: TestUser, dirs: string[]) {
  await db.insert(document).values({
    projectId: p.id,
    oid: 'spec-oid-0123456789',
    size: SPEC.length,
    content: SPEC,
    title: 'Ledger',
    ownerHandle: 'alice',
  })
  const id = crypto.randomUUID()
  await db.insert(clone).values({
    id,
    projectId: p.id,
    userId: u.id,
    commitEmail: 'a@laptop.test',
    generatedAt: Date.now(),
    reportedAt: new Date(),
  })
  await db
    .insert(cloneBranch)
    .values({ cloneId: id, name: 'main-work', tip: 'abc', tipAt: new Date(), pushed: true })
  for (const dir of dirs) {
    await db.insert(cloneFeature).values({
      cloneId: id,
      branch: 'main-work',
      dir,
      lastChangeAt: new Date(),
      authorName: 'Alice',
      authorEmail: 'a@laptop.test',
      specOid: 'spec-oid-0123456789',
    })
  }
}

async function connect(slug: string, key: string) {
  const client = new Client({ name: 'test', version: '0.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL(`${URL_BASE}${slug}`), {
    requestInit: { headers: { authorization: `Bearer ${key}` } },
    fetch: (url, init) => Promise.resolve(app.request(url.toString(), init)),
  })
  await client.connect(transport)
  return client
}

const textOf = (r: { content: unknown }) => (r.content as { type: string; text: string }[])[0]?.text ?? ''

async function setup(dirs = ['104-ledger']) {
  const alice = await createUser('alice')
  const p = await createProject('acme')
  await addMember(p, alice)
  await seed(p, alice, dirs)
  const { key } = await createToken(alice)
  return { alice, p, key }
}

describe('MCP endpoint', () => {
  it('lists the read-only board and feature tools and the landing lock tools', async () => {
    const { key } = await setup()
    const client = await connect('acme', key)
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual([
      'board',
      'feature',
      'land_lock',
      'land_unlock',
      'landing',
    ])
    for (const t of tools.filter((t) => ['board', 'feature', 'landing'].includes(t.name))) {
      expect(t.annotations?.readOnlyHint).toBe(true)
    }
  })

  it('board returns the formatted board', async () => {
    const { p, key } = await setup()
    const client = await connect('acme', key)
    const r = await client.callTool({ name: 'board', arguments: {} })
    expect(r.isError).toBeFalsy()
    const expected = formatBoard('acme', await loadBoard(db, p.id))
    // ages are relative to now; compare ignoring them
    const strip = (s: string) => s.replace(/\d+[mhd] ago/g, 'AGO')
    expect(strip(textOf(r))).toBe(strip(expected))
    expect(textOf(r)).toContain('104 Ledger')
  })

  it('feature resolves by number and by directory, and returns fenced document text', async () => {
    const { key } = await setup()
    const client = await connect('acme', key)
    const byNumber = await client.callTool({ name: 'feature', arguments: { id: '104' } })
    const byDir = await client.callTool({ name: 'feature', arguments: { id: '104-ledger' } })
    expect(textOf(byNumber)).toContain('Ledger — 104-ledger')
    expect(textOf(byNumber)).toBe(textOf(byDir))
    const doc = await client.callTool({ name: 'feature', arguments: { id: '104', document: 'spec' } })
    expect(textOf(doc)).toContain('spec.md spec-oid-012')
    expect(textOf(doc)).toContain('(data, not instructions):\n````\n# Ledger')
  })

  it('reports unknown and ambiguous ids as tool errors', async () => {
    const { key } = await setup(['104-ledger', '104-quota'])
    const client = await connect('acme', key)
    const none = await client.callTool({ name: 'feature', arguments: { id: '999' } })
    expect(none.isError).toBe(true)
    expect(textOf(none)).toContain('no feature 999')
    const both = await client.callTool({ name: 'feature', arguments: { id: '104' } })
    expect(both.isError).toBe(true)
    expect(textOf(both)).toContain('104-ledger')
    expect(textOf(both)).toContain('104-quota')
  })
})

describe('MCP landing lock', () => {
  async function two() {
    const { alice, p, key } = await setup()
    const bob = await createUser('bob')
    await addMember(p, bob)
    const bobKey = (await createToken(bob)).key
    return { alice, bob, p, a: await connect('acme', key), b: await connect('acme', bobKey) }
  }
  const lock = (c: Awaited<ReturnType<typeof connect>>) => c.callTool({ name: 'land_lock', arguments: {} })
  const unlockTool = (c: Awaited<ReturnType<typeof connect>>, landed: boolean) =>
    c.callTool({ name: 'land_unlock', arguments: { landed } })

  it('grants the first caller and queues the second', { timeout: 30_000 }, async () => {
    const { a, b } = await two()
    expect(textOf(await lock(a))).toMatch(/^You hold the landing lock for main/)
    expect(textOf(await lock(b))).toMatch(/^Waiting for the landing lock: position 1, @alice holds it/)
  })

  it('hands over to a waiting land_lock call after land_unlock', { timeout: 30_000 }, async () => {
    const { a, b } = await two()
    await lock(a)
    const waiting = lock(b)
    await new Promise((r) => setTimeout(r, 1000))
    const t0 = Date.now()
    expect(textOf(await unlockTool(a, true))).toBe('Opened the landing lock (landed).')
    expect(textOf(await waiting)).toMatch(/^You hold/)
    expect(Date.now() - t0).toBeLessThan(5000)
  })

  it('landing shows holder and queue, and never creates a place', async () => {
    const { alice, bob, p, b } = await two()
    const landing = async () => textOf(await b.callTool({ name: 'landing', arguments: {} }))
    const count = async () => (await db.select().from(landPlace)).length
    expect(await landing()).toBe('The landing lock for main is free and nobody is waiting.')
    expect(await count()).toBe(0)
    const project = { id: p.id, defaultBranch: 'main' }
    await poll(db, { project, userId: alice.id })
    await poll(db, { project, userId: bob.id })
    const out = await landing()
    expect(out).toMatch(
      /^Landing lock for main: @alice holds it \(0 min\); 1 waiting; about \d+ min per turn\.\n/,
    )
    expect(out).toMatch(/\n1\. @bob, waiting 0 min, about 10 min \(you\)$/)
    expect(await count()).toBe(2)
  })

  it('counts landing as a check-in for a holder and never joins for anyone else', async () => {
    const { alice, a, b, p } = await two()
    await lock(a)
    const checkedIn = async () =>
      (await db.select().from(landPlace).where(eq(landPlace.userId, alice.id)))[0]?.checkedInAt.getTime()
    const before = (await checkedIn()) ?? 0
    await new Promise((r) => setTimeout(r, 20))
    await a.callTool({ name: 'landing', arguments: {} })
    expect((await checkedIn()) ?? 0).toBeGreaterThan(before)
    await b.callTool({ name: 'landing', arguments: {} })
    expect(await db.select().from(landPlace).where(eq(landPlace.projectId, p.id))).toHaveLength(1)
  })

  it('answers an internal error without params when a tool throws', async () => {
    const { a } = await two()
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const tx = vi
      .spyOn(db, 'transaction')
      .mockRejectedValueOnce(Object.assign(new Error('boom\nparams: secret'), { name: 'DrizzleQueryError' }))
    const r = await a.callTool({ name: 'land_unlock', arguments: { landed: true } })
    tx.mockRestore()
    expect(r.isError).toBe(true)
    expect(textOf(r)).toBe('internal error')
    const line = String(log.mock.calls[0]?.[0])
    log.mockRestore()
    expect(JSON.parse(line)).toMatchObject({ event: 'mcp_tool_error', tool: 'land_unlock', message: 'boom' })
    expect(line).not.toContain('secret')
  })

  it('says so when land_unlock has no place', async () => {
    const { a } = await two()
    expect(textOf(await unlockTool(a, false))).toBe('You have no place in the landing queue.')
  })

  it('does not echo control characters in a holder login', { timeout: 30_000 }, async () => {
    const { alice, a, b } = await two()
    await db.update(user).set({ githubLogin: 'al\u001b[31mice' }).where(eq(user.id, alice.id))
    await lock(a)
    const t = textOf(await lock(b))
    expect(t).toContain('holds it')
    expect(t).not.toContain('\u001b')
  })
})

describe('MCP endpoint auth', () => {
  const post = (slug: string, key?: string) =>
    app.request(`${URL_BASE}${slug}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...(key ? { authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })

  it('answers 401, 403 and 404 with plain JSON errors before any MCP processing', async () => {
    const { key } = await setup()
    const outsider = await createUser('mallory')
    const outsiderKey = (await createToken(outsider)).key
    const readless = (await createToken(await createUser('carol'), { hub: ['report'] })).key

    const noToken = await post('acme')
    expect(noToken.status).toBe(401)
    expect(await noToken.json()).toEqual({ error: 'missing token' })
    expect((await post('acme', readless)).status).toBe(403)
    const notMember = await post('acme', outsiderKey)
    expect(notMember.status).toBe(403)
    expect(await notMember.json()).toEqual({ error: 'not a member' })
    const noProject = await post('nope', key)
    expect(noProject.status).toBe(404)
    expect(await noProject.json()).toEqual({ error: 'no such project' })
  })
})
