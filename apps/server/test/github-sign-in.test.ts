import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../src/db/client.ts'
import { account, user } from '../src/db/schema.ts'
import { createUser, jsonRequest, request, sessionCookie, truncateAll } from './helpers.ts'

beforeEach(truncateAll)
afterEach(() => vi.restoreAllMocks())

// GitHub's side of the OAuth flow: the token exchange, the profile and the email list.
function stubGithubOAuth(profile: { id: number; login: string }, email = 'new@person.test') {
  const real = globalThis.fetch
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (url.href === 'https://github.com/login/oauth/access_token') {
      return Response.json({ access_token: 'gho_test', token_type: 'bearer', scope: 'read:user,user:email' })
    }
    if (url.href === 'https://api.github.com/user') {
      return Response.json({ ...profile, name: 'New Person', email: null, avatar_url: '' })
    }
    if (url.href === 'https://api.github.com/user/emails') {
      return Response.json([{ email, primary: true, verified: true }])
    }
    return real(input, init)
  })
}

// Starts a sign-in like the web does, then lands on the callback as GitHub would send the browser.
async function signInWithGithub(): Promise<Response> {
  const start = await jsonRequest('/api/auth/sign-in/social', 'POST', {
    provider: 'github',
    callbackURL: '/',
  })
  expect(start.status).toBe(200)
  const { url } = (await start.json()) as { url: string }
  const state = new URL(url).searchParams.get('state') ?? ''
  const cookies = start.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ')
  return request(`/api/auth/callback/github?code=abc&state=${encodeURIComponent(state)}`, {
    headers: { cookie: cookies },
  })
}

describe('GitHub sign-in', () => {
  it('creates the account with its GitHub id and lowercased login', async () => {
    stubGithubOAuth({ id: 4242, login: 'NewPerson' })
    const res = await signInWithGithub()
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/')
    const [row] = await db.select().from(user).where(eq(user.githubId, '4242'))
    expect(row?.githubLogin).toBe('newperson')
  })

  it('refreshes the login on a later sign-in after a rename', async () => {
    stubGithubOAuth({ id: 4242, login: 'NewPerson' })
    await signInWithGithub()
    vi.restoreAllMocks()
    stubGithubOAuth({ id: 4242, login: 'Renamed' })
    const res = await signInWithGithub()
    expect(res.status).toBe(302)
    const rows = await db.select().from(user).where(eq(user.githubId, '4242'))
    expect(rows.map((r) => r.githubLogin)).toEqual(['renamed'])
  })

  it('never joins a different GitHub account to an existing user by email', async () => {
    // someone who controls a member's old address adds it to their own GitHub account
    const victim = await createUser('victim')
    await db.update(user).set({ email: 'shared@corp.test' }).where(eq(user.id, victim.id))
    await db.insert(account).values({
      id: crypto.randomUUID(),
      accountId: String(victim.githubId),
      providerId: 'github',
      userId: victim.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    stubGithubOAuth({ id: 999, login: 'mallory' }, 'shared@corp.test')
    const res = await signInWithGithub()
    expect(res.headers.get('location')).toContain('error=')
    expect(res.headers.getSetCookie().some((c) => c.includes('session_token=') && !c.includes('=;'))).toBe(
      false,
    )
    const [row] = await db.select().from(user).where(eq(user.id, victim.id))
    expect(row?.githubId).toBe(victim.githubId)
  })

  it('offers no endpoint for a user to change their own GitHub id or login', async () => {
    const u = await createUser('someone')
    const res = await jsonRequest(
      '/api/auth/update-user',
      'POST',
      { githubId: '1001' },
      {
        cookie: await sessionCookie(u),
      },
    )
    expect(res.status).toBe(404)
    const [row] = await db.select().from(user).where(eq(user.id, u.id))
    expect(row?.githubId).toBe(u.githubId)
  })

  it('has no email sign-up that could set them either', async () => {
    const res = await jsonRequest('/api/auth/sign-up/email', 'POST', {
      email: 'x@x.test',
      password: 'correct-horse-battery',
      name: 'x',
      githubId: '1001',
      githubLogin: 'admin',
    })
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(await db.select().from(user).where(eq(user.githubId, '1001'))).toEqual([])
  })
})
