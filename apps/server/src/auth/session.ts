import { createMiddleware } from 'hono/factory'
import type { AppEnv, SessionUser } from '../app-env.ts'
import { db } from '../db/client.ts'
import { env } from '../env.ts'
import {
  findMembership,
  findProjectBySlug,
  hasMembership,
  isProjectAdminAnywhere,
} from '../services/membership.ts'
import { auth } from './auth.ts'

// By GitHub account id, never login (FR-026): a login can be renamed and then taken by someone else.
export const isHubAdmin = (u: Pick<SessionUser, 'githubId'>) => env.SPEC_HUB_ADMINS.includes(u.githubId)

// Signed in, not a hub admin, in no project: sees only the waiting page (FR-025).
export const isWaiting = async (u: SessionUser) => !isHubAdmin(u) && !(await hasMembership(db, u.id))

export const requireSession = createMiddleware<AppEnv>(async (c, next) => {
  const s = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!s) return c.json({ error: 'sign in required' }, 401)
  const { id, githubLogin, githubId, name, email, image } = s.user
  c.set('userId', id)
  c.set('user', { id, githubLogin: String(githubLogin), githubId: String(githubId), name, email, image })
  await next()
})

export const requireHubAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (!isHubAdmin(c.var.user)) return c.json({ error: 'hub admin only' }, 403)
  await next()
})

// Who may see the people list: hub admins and admins of at least one project.
export const requireAnyAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (!isHubAdmin(c.var.user) && !(await isProjectAdminAnywhere(db, c.var.userId))) {
    return c.json({ error: 'admins only' }, 403)
  }
  await next()
})

export const requireProjectRole = (role: 'member' | 'admin' = 'member') =>
  createMiddleware<AppEnv>(async (c, next) => {
    const project = await findProjectBySlug(db, c.req.param('slug') ?? '')
    if (!project) return c.json({ error: 'no such project' }, 404)
    const m = await findMembership(db, project.id, c.var.userId)
    if (!m || (role === 'admin' && m.role !== 'admin')) return c.json({ error: 'not a member' }, 403)
    c.set('project', project)
    c.set('membership', m)
    await next()
  })

// Assigning people (FR-027): the project's admins, or any hub admin. Sets only `project`.
export const requireAssigner = createMiddleware<AppEnv>(async (c, next) => {
  const project = await findProjectBySlug(db, c.req.param('slug') ?? '')
  if (!project) return c.json({ error: 'no such project' }, 404)
  if (!isHubAdmin(c.var.user)) {
    const m = await findMembership(db, project.id, c.var.userId)
    if (m?.role !== 'admin') return c.json({ error: 'not a member' }, 403)
  }
  c.set('project', project)
  await next()
})
