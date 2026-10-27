import { beforeEach, describe, expect, it } from 'vitest'
import { auth } from '../src/auth/auth.ts'
import { createToken, createUser, request, sessionCookie, truncateAll } from './helpers.ts'

beforeEach(truncateAll)

describe('test harness', () => {
  it('authenticates a created user via signed session cookie', async () => {
    const u = await createUser('Alice')
    const res = await request('/api/auth/get-session', {
      headers: { cookie: await sessionCookie(u) },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { user: { githubLogin: string } }
    expect(body.user.githubLogin).toBe('alice')
    const direct = await auth.api.getSession({
      headers: new Headers({ cookie: await sessionCookie(u) }),
    })
    expect(direct?.user.id).toBe(u.id)
  })

  it('creates a verifiable API token', async () => {
    const u = await createUser('bob')
    const { key } = await createToken(u)
    const result = await auth.api.verifyApiKey({ body: { key, permissions: { hub: ['report'] } } })
    expect(result.valid).toBe(true)
  })

  it('serves /healthz', async () => {
    const res = await request('/healthz')
    expect(await res.text()).toContain('ok')
  })
})
