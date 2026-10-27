import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../src/db/client.ts'
import { clone, cloneBranch, cloneFeature } from '../src/db/schema.ts'
import { env } from '../src/env.ts'
import { addMember, createProject, createUser, request, sessionCookie, truncateAll } from './helpers.ts'

beforeEach(truncateAll)

describe('GET /api/projects/:slug/connect', () => {
  it('gives a member the urls and no clones', async () => {
    const u = await createUser('amy')
    const p = await createProject('acme')
    await addMember(p, u)
    const res = await request('/api/projects/acme/connect', {
      headers: { cookie: await sessionCookie(u) },
    })
    expect(res.status).toBe(200)
    const hub = env.PUBLIC_URL
    expect(await res.json()).toEqual({
      hubUrl: hub,
      slug: 'acme',
      mcpUrl: `${hub}/mcp/acme`,
      installCommand: `specify extension add spec-hub --from ${hub}/extension/spec-hub.zip`,
      configSnippet: `hub_url: ${hub}\nproject: acme\n`,
      clones: [],
    })
  })

  it('counts distinct feature dirs per own clone only', async () => {
    const u = await createUser('amy')
    const other = await createUser('bob')
    const p = await createProject('acme')
    await addMember(p, u)
    await addMember(p, other)
    const mk = async (userId: string, dirs: string[]) => {
      const id = crypto.randomUUID()
      await db.insert(clone).values({
        id,
        projectId: p.id,
        userId,
        commitEmail: 'a@example.test',
        generatedAt: 1,
        reportedAt: new Date('2026-01-02T03:04:05Z'),
      })
      await db
        .insert(cloneBranch)
        .values({ cloneId: id, name: 'main', tip: 'abc', tipAt: new Date(), pushed: true })
      await db
        .insert(cloneFeature)
        .values(dirs.map((dir) => ({ cloneId: id, branch: 'main', dir, lastChangeAt: new Date() })))
      return id
    }
    const mine = await mk(u.id, ['001-a', '002-b'])
    await mk(other.id, ['001-a'])
    const res = await request('/api/projects/acme/connect', {
      headers: { cookie: await sessionCookie(u) },
    })
    const body = (await res.json()) as { clones: unknown[] }
    expect(body.clones).toEqual([{ id: mine, reportedAt: '2026-01-02T03:04:05.000Z', features: 2 }])
  })

  it('refuses a non-member', async () => {
    const u = await createUser('eve')
    await createProject('acme')
    const res = await request('/api/projects/acme/connect', {
      headers: { cookie: await sessionCookie(u) },
    })
    expect(res.status).toBe(403)
  })
})
