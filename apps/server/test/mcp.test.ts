import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { beforeEach, describe, expect, it } from 'vitest'
import { app } from '../src/app.ts'
import { db } from '../src/db/client.ts'
import { clone, cloneBranch, cloneFeature, document } from '../src/db/schema.ts'
import { formatBoard } from '../src/mcp/format.ts'
import { loadBoard } from '../src/services/board-query.ts'
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
  it('lists exactly the read-only board and feature tools', async () => {
    const { key } = await setup()
    const client = await connect('acme', key)
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual(['board', 'feature'])
    for (const t of tools) expect(t.annotations?.readOnlyHint).toBe(true)
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
