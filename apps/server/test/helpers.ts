import { makeSignature } from 'better-auth/crypto'
import { sql } from 'drizzle-orm'
import { vi } from 'vitest'
import { app } from '../src/app.ts'
import { auth } from '../src/auth/auth.ts'
import { db } from '../src/db/client.ts'
import { membership, project, user } from '../src/db/schema.ts'

export const ORIGIN = 'http://localhost:5173'

export type TestUser = typeof user.$inferSelect
export type TestProject = typeof project.$inferSelect

export async function truncateAll(): Promise<void> {
  await db.execute(
    sql`TRUNCATE project, membership, clone, clone_branch, clone_feature, document, landed_feature, land_place, security_event, "user", session, account, verification, apikey RESTART IDENTITY CASCADE`,
  )
}

// vitest.config.ts sets SPEC_HUB_ADMINS to this GitHub account id
export const HUB_ADMIN_ID = '1001'
let nextGithubId = 500000

export async function createUser(
  login: string,
  opts: { name?: string; githubId?: string } = {},
): Promise<TestUser> {
  const lower = login.toLowerCase()
  const [row] = await db
    .insert(user)
    .values({
      id: crypto.randomUUID(),
      name: opts.name ?? login,
      email: `${lower}@example.test`,
      emailVerified: true,
      githubLogin: lower,
      githubId: opts.githubId ?? String(nextGithubId++),
    })
    .returning()
  if (!row) throw new Error('user insert returned no row')
  return row
}

/** Cookie header that Better Auth accepts as a signed session for `u`. */
export async function sessionCookie(u: TestUser): Promise<string> {
  const ctx = await auth.$context
  const session = await ctx.internalAdapter.createSession(u.id, false, {}, true)
  const signature = await makeSignature(session.token, ctx.secret)
  return `${ctx.authCookies.sessionToken.name}=${encodeURIComponent(`${session.token}.${signature}`)}`
}

export async function createToken(
  u: TestUser,
  permissions: Record<string, string[]> = { hub: ['report', 'read'] },
): Promise<{ key: string; id: string }> {
  const created = await auth.api.createApiKey({
    body: { name: 'test', userId: u.id, permissions },
  })
  return { key: created.key, id: created.id }
}

export async function createProject(
  slug: string,
  opts: { numbering?: 'sequential' | 'timestamp'; defaultBranch?: string; name?: string } = {},
): Promise<TestProject> {
  const [row] = await db
    .insert(project)
    .values({
      slug,
      name: opts.name ?? slug,
      ...(opts.numbering ? { numbering: opts.numbering } : {}),
      ...(opts.defaultBranch ? { defaultBranch: opts.defaultBranch } : {}),
    })
    .returning()
  if (!row) throw new Error('project insert returned no row')
  return row
}

export async function addMember(
  p: TestProject,
  u: TestUser,
  role: 'admin' | 'member' = 'member',
): Promise<void> {
  await db
    .insert(membership)
    .values({ projectId: p.id, githubId: u.githubId, assignedLogin: u.githubLogin, userId: u.id, role })
}

export function request(path: string, init?: RequestInit): Response | Promise<Response> {
  return app.request(path, init)
}

export function jsonRequest(
  path: string,
  method: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Response | Promise<Response> {
  return app.request(path, {
    method,
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

/**
 * Stubs GitHub's `GET /users/<login>` (env GITHUB_API_URL is http://github.test in tests).
 * `accounts` maps a login to its account id; other logins answer 404. 'down' fails every lookup.
 * Every other fetch passes through.
 */
export function stubGithub(accounts: Record<string, string> | 'down' | 500) {
  if (vi.isMockFunction(globalThis.fetch)) vi.mocked(globalThis.fetch).mockRestore()
  const real = globalThis.fetch
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (url.origin !== 'http://github.test') return real(input, init)
    if (accounts === 'down') throw new TypeError('fetch failed')
    if (accounts === 500) return new Response('{}', { status: 500 })
    const login = decodeURIComponent(url.pathname.replace(/^\/users\//, '')).toLowerCase()
    const id = accounts[login]
    if (!id) return Response.json({ message: 'Not Found' }, { status: 404 })
    return Response.json({ id: Number(id), login, type: 'User' })
  })
}
