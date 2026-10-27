// FR-025..027: anyone can sign in; access starts when an admin assigns the person to a project,
// by GitHub username, before or after they first sign in.
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { auth } from '../src/auth/auth.ts'
import { db } from '../src/db/client.ts'
import { user } from '../src/db/schema.ts'
import { loadBoard } from '../src/services/board-query.ts'
import {
  addMember,
  createProject,
  createUser,
  HUB_ADMIN_ID,
  jsonRequest,
  request,
  sessionCookie,
  stubGithub,
  type TestUser,
  truncateAll,
} from './helpers.ts'

beforeEach(truncateAll)
afterEach(() => {
  vi.restoreAllMocks()
})

const as = async (u: TestUser) => ({ cookie: await sessionCookie(u) })
const me = async (cookie: { cookie: string }) =>
  (await (await request('/api/me', { headers: cookie })).json()) as {
    isHubAdmin: boolean
    waiting: boolean
    projects: { slug: string }[]
  }
const addToken = (cookie: { cookie: string }) =>
  jsonRequest('/api/tokens', 'POST', { name: 'laptop' }, cookie)
const assign = (slug: string, githubLogin: string, cookie: { cookie: string }, role = 'member') =>
  jsonRequest(`/api/projects/${slug}/members`, 'POST', { githubLogin, role }, cookie)
// a first GitHub sign-in: Better Auth creates the user, running the user-create hooks
const signUp = async (login: string, githubId: string) => {
  const ctx = await auth.$context
  const created = await ctx.internalAdapter.createUser(
    {
      name: login,
      email: `${login}@example.test`,
      emailVerified: true,
      githubLogin: login,
      githubId,
    },
    { method: 'oauth', oauth: { providerId: 'github' } },
  )
  const [row] = await db.select().from(user).where(eq(user.id, created.id))
  if (!row) throw new Error('user not created')
  return row
}

describe('sign-in', () => {
  it('keeps the GitHub account id and lowercased login from the profile, with no sign-up gate', () => {
    const github = auth.options.socialProviders.github
    expect(github.mapProfileToUser?.({ id: 583231, login: 'OctoCat' } as never)).toEqual({
      githubLogin: 'octocat',
      githubId: '583231',
    })
    expect(github.overrideUserInfoOnSignIn).toBe(true)
    // the only user-create hook binds memberships; nothing refuses a sign-up
    expect(Object.keys(auth.options.databaseHooks.user.create)).toEqual(['after'])
  })
})

describe('waiting for access', () => {
  it('a stranger signs in and is waiting: no tokens, no project data', async () => {
    await createProject('acme')
    const cookie = await as(await createUser('stranger'))
    expect(await me(cookie)).toMatchObject({ isHubAdmin: false, waiting: true, projects: [] })
    const token = await addToken(cookie)
    expect(token.status).toBe(403)
    expect(await token.json()).toEqual({ error: 'waiting for access' })
    expect((await request('/api/projects/acme', { headers: cookie })).status).toBe(403)
    expect((await request('/api/projects/acme/board', { headers: cookie })).status).toBe(403)
    expect((await request('/api/people', { headers: cookie })).status).toBe(403)
  })

  it('assigning gives access; removing the last membership puts them back to waiting', async () => {
    const admin = await createUser('ann')
    const p = await createProject('acme')
    await addMember(p, admin, 'admin')
    const adminCookie = await as(admin)
    const bob = await createUser('bob')
    const bobCookie = await as(bob)

    const people = (await (await request('/api/people', { headers: adminCookie })).json()) as {
      id: string
      githubLogin: string
      waiting: boolean
      lastSignInAt: string | null
    }[]
    expect(people.map((x) => [x.githubLogin, x.waiting])).toEqual([
      ['ann', false],
      ['bob', true],
    ])
    expect(people.every((x) => typeof x.lastSignInAt === 'string')).toBe(true)

    stubGithub({ bob: bob.githubId })
    expect((await assign('acme', 'bob', adminCookie)).status).toBe(201)
    expect(await me(bobCookie)).toMatchObject({ waiting: false, projects: [{ slug: 'acme' }] })
    expect((await addToken(bobCookie)).status).toBe(201)
    expect((await request('/api/projects/acme', { headers: bobCookie })).status).toBe(200)

    const removed = await jsonRequest(
      `/api/projects/acme/members/${bob.githubId}`,
      'DELETE',
      undefined,
      adminCookie,
    )
    expect(removed.status).toBe(204)
    expect(await me(bobCookie)).toMatchObject({ waiting: true, projects: [] })
    expect((await addToken(bobCookie)).status).toBe(403)
  })
})

describe('hub admins', () => {
  it('are named by GitHub account id, not login', async () => {
    const real = await createUser('hubadmin', { githubId: HUB_ADMIN_ID })
    expect(await me(await as(real))).toMatchObject({ isHubAdmin: true, waiting: false })
    // someone else holding the login a hub admin used to have is a stranger
    await db.update(user).set({ githubLogin: 'renamed-admin' }).where(eq(user.id, real.id))
    const impostor = await createUser('hubadmin-x')
    await db.update(user).set({ githubLogin: 'hubadmin' }).where(eq(user.id, impostor.id))
    const cookie = await as(impostor)
    expect(await me(cookie)).toMatchObject({ isHubAdmin: false, waiting: true })
    expect((await jsonRequest('/api/projects', 'POST', { slug: 'acme', name: 'Acme' }, cookie)).status).toBe(
      403,
    )
  })

  it('assign to any project; project admins only to their own', async () => {
    const hub = await as(await createUser('hubadmin', { githubId: HUB_ADMIN_ID }))
    const ann = await createUser('ann')
    const acme = await createProject('acme')
    await createProject('other')
    await addMember(acme, ann, 'admin')
    const bob = await createUser('bob')
    const github = stubGithub({ bob: bob.githubId })

    // ann admins acme only
    const annCookie = await as(ann)
    expect((await assign('other', 'bob', annCookie)).status).toBe(403)
    expect(github).not.toHaveBeenCalled()
    expect((await assign('acme', 'bob', annCookie)).status).toBe(201)

    // the hub admin is in neither project and can still assign
    expect((await assign('other', 'bob', hub, 'admin')).status).toBe(201)
    expect((await assign('nope', 'bob', hub)).status).toBe(404)
    expect((await me(await as(bob))).projects.map((x) => x.slug)).toEqual(['acme', 'other'])
    // ...but assigning does not make the hub admin a member
    expect((await request('/api/projects/other/members', { headers: hub })).status).toBe(403)
  })
})

describe('renamed logins', () => {
  it('keep their memberships, and owner attribution follows the current login', async () => {
    const p = await createProject('acme')
    const amy = await createUser('amy')
    await addMember(p, amy)
    await db.update(user).set({ githubLogin: 'amy-new' }).where(eq(user.id, amy.id))
    // a new account taking the old login gets nothing
    const taker = await createUser('amy-taker')
    await db.update(user).set({ githubLogin: 'amy' }).where(eq(user.id, taker.id))

    expect((await me(await as(amy))).projects.map((x) => x.slug)).toEqual(['acme'])
    expect(await me(await as(taker))).toMatchObject({ waiting: true })
    const board = await loadBoard(db, p.id)
    expect(board.members.map((m) => [m.userId, m.githubLogin])).toEqual([[amy.id, 'amy-new']])
  })
})

describe('assigned before signing in', () => {
  const setup = async () => {
    const admin = await createUser('ann')
    const p = await createProject('acme')
    await addMember(p, admin, 'admin')
    return { p, adminCookie: await as(admin) }
  }
  const membersOf = async (cookie: { cookie: string }) =>
    (await (await request('/api/projects/acme/members', { headers: cookie })).json()) as {
      githubId: string
      githubLogin: string
      pending: boolean
    }[]

  it('the account goes straight in on its first sign-in', async () => {
    const { adminCookie } = await setup()
    stubGithub({ carol: '7001' })
    expect((await assign('acme', 'carol', adminCookie)).status).toBe(201)
    expect((await membersOf(adminCookie)).find((m) => m.githubId === '7001')?.pending).toBe(true)

    const carol = await signUp('carol', '7001')
    expect(await me(await as(carol))).toMatchObject({ waiting: false, projects: [{ slug: 'acme' }] })
    expect((await membersOf(adminCookie)).find((m) => m.githubId === '7001')).toMatchObject({
      githubLogin: 'carol',
      pending: false,
    })
  })

  it('a different account that took the username before signing in is not bound', async () => {
    const { adminCookie } = await setup()
    stubGithub({ dan: '7002' })
    expect((await assign('acme', 'dan', adminCookie)).status).toBe(201)
    // @dan renamed, and a new account (7003) took the name before the original signed in
    const taker = await signUp('dan', '7003')
    expect(await me(await as(taker))).toMatchObject({ waiting: true, projects: [] })
    expect((await membersOf(adminCookie)).find((m) => m.githubId === '7002')).toMatchObject({
      githubLogin: 'dan',
      pending: true,
    })
  })

  it('a pending member can be removed', async () => {
    const { adminCookie } = await setup()
    stubGithub({ erin: '7004' })
    await assign('acme', 'erin', adminCookie)
    const res = await jsonRequest('/api/projects/acme/members/7004', 'DELETE', undefined, adminCookie)
    expect(res.status).toBe(204)
    expect((await membersOf(adminCookie)).map((m) => m.githubLogin)).toEqual(['ann'])
    // and their later sign-in finds nothing to bind
    expect(await me(await as(await signUp('erin', '7004')))).toMatchObject({ waiting: true })
  })
})
