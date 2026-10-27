import { and, desc, eq, getTableColumns, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../app-env.ts'
import { requireAssigner, requireProjectRole, requireSession } from '../auth/session.ts'
import type { Tx } from '../db/client.ts'
import { db } from '../db/client.ts'
import { clone, membership, securityEvent, user } from '../db/schema.ts'
import { audit } from '../services/audit.ts'
import { type GithubAccount, GithubUnavailable, lookupGithubUser } from '../services/github.ts'
import { zv } from '../validate.ts'

const role = z.enum(['admin', 'member'])
const addBody = z.object({ githubLogin: z.string().regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/), role })
const memberParam = z.object({ slug: z.string(), githubId: z.string().regex(/^[1-9][0-9]{0,19}$/) })
const PAGE = 100

// true when removing/demoting `githubId` would leave the project without an admin
async function isLastAdmin(tx: Tx, projectId: string, githubId: string): Promise<boolean> {
  const admins = await tx
    .select({ githubId: membership.githubId })
    .from(membership)
    .where(and(eq(membership.projectId, projectId), eq(membership.role, 'admin')))
    .for('update')
  return admins.length === 1 && admins[0]?.githubId === githubId
}

// the member's current login once bound, else the login GitHub gave at assign time
const displayLogin = sql<string>`coalesce(${user.githubLogin}, ${membership.assignedLogin})`

const findMember = (tx: Tx, projectId: string, githubId: string) =>
  tx
    .select({ role: membership.role, userId: membership.userId, githubLogin: displayLogin })
    .from(membership)
    .leftJoin(user, eq(user.id, membership.userId))
    .where(and(eq(membership.projectId, projectId), eq(membership.githubId, githubId)))
    .for('update', { of: membership })

const guard = [requireSession, requireProjectRole('admin')] as const

export const memberRoutes = new Hono<AppEnv>()
  .get('/projects/:slug/members', ...guard, async (c) => {
    const rows = await db
      .select({
        githubId: membership.githubId,
        githubLogin: displayLogin,
        userId: membership.userId,
        role: membership.role,
        name: user.name,
        image: user.image,
      })
      .from(membership)
      .leftJoin(user, eq(user.id, membership.userId))
      .where(eq(membership.projectId, c.var.project.id))
      .orderBy(displayLogin)
    return c.json(
      rows.map((r) => ({ ...r, name: r.name ?? null, image: r.image ?? null, pending: r.userId === null })),
    )
  })
  // FR-027: assign by GitHub username, signed in or not; hub admins to any project, project admins
  // to their own. GitHub resolves the username to the account id the membership belongs to.
  .post('/projects/:slug/members', requireSession, requireAssigner, zv('json', addBody), async (c) => {
    const body = c.req.valid('json')
    const p = c.var.project
    let account: GithubAccount | null
    try {
      account = await lookupGithubUser(body.githubLogin)
    } catch (err) {
      if (!(err instanceof GithubUnavailable)) throw err
      console.warn(err.message)
      return c.json({ error: "couldn't reach GitHub" }, 502)
    }
    if (!account) return c.json({ error: `no GitHub user @${body.githubLogin.toLowerCase()}` }, 404)
    const gh = account
    const result = await db.transaction(async (tx) => {
      // already signed in: bind now; otherwise their first sign-in binds it (bindMemberships)
      const [known] = await tx.select({ id: user.id }).from(user).where(eq(user.githubId, gh.id))
      const rows = await tx
        .insert(membership)
        .values({
          projectId: p.id,
          githubId: gh.id,
          assignedLogin: gh.login,
          userId: known?.id ?? null,
          role: body.role,
          invitedBy: c.var.userId,
        })
        .onConflictDoNothing()
        .returning()
      if (rows.length === 0) return null
      await audit(tx, {
        type: 'member_added',
        actorUserId: c.var.userId,
        projectId: p.id,
        detail: { githubLogin: gh.login, githubId: gh.id, role: body.role },
      })
      return { githubId: gh.id, githubLogin: gh.login, role: body.role, pending: known === undefined }
    })
    if (!result) return c.json({ error: 'already a member' }, 409)
    return c.json(result, 201)
  })
  .patch(
    '/projects/:slug/members/:githubId',
    ...guard,
    zv('param', memberParam),
    zv('json', z.object({ role })),
    async (c) => {
      const { githubId } = c.req.valid('param')
      const { role: next } = c.req.valid('json')
      const p = c.var.project
      const result = await db.transaction(async (tx) => {
        const [current] = await findMember(tx, p.id, githubId)
        if (!current) return 'missing' as const
        if (current.role === next) return 'ok' as const
        if (next === 'member' && (await isLastAdmin(tx, p.id, githubId))) return 'last' as const
        await tx
          .update(membership)
          .set({ role: next })
          .where(and(eq(membership.projectId, p.id), eq(membership.githubId, githubId)))
        await audit(tx, {
          type: 'role_changed',
          actorUserId: c.var.userId,
          projectId: p.id,
          detail: { githubLogin: current.githubLogin, githubId, from: current.role, to: next },
        })
        return 'ok' as const
      })
      if (result === 'missing') return c.json({ error: 'no such member' }, 404)
      if (result === 'last') return c.json({ error: 'a project needs at least one admin' }, 409)
      return c.json({ githubId, role: next })
    },
  )
  // Pending members can be removed too. Removing someone's last membership puts them back to
  // waiting for access (FR-025).
  .delete('/projects/:slug/members/:githubId', ...guard, zv('param', memberParam), async (c) => {
    const { githubId } = c.req.valid('param')
    const p = c.var.project
    const result = await db.transaction(async (tx) => {
      const [current] = await findMember(tx, p.id, githubId)
      if (!current) return 'missing' as const
      if (await isLastAdmin(tx, p.id, githubId)) return 'last' as const
      await tx
        .delete(membership)
        .where(and(eq(membership.projectId, p.id), eq(membership.githubId, githubId)))
      if (current.userId) {
        // FR-030: a removed member's clones leave the board (branches/features cascade)
        await tx.delete(clone).where(and(eq(clone.projectId, p.id), eq(clone.userId, current.userId)))
      }
      await audit(tx, {
        type: 'member_removed',
        actorUserId: c.var.userId,
        projectId: p.id,
        detail: { githubLogin: current.githubLogin, githubId },
      })
      return 'ok' as const
    })
    if (result === 'missing') return c.json({ error: 'no such member' }, 404)
    if (result === 'last') return c.json({ error: 'a project needs at least one admin' }, 409)
    return c.body(null, 204)
  })
  .get(
    '/projects/:slug/security-events',
    ...guard,
    zv('query', z.object({ before: z.coerce.number().int().positive().optional() })),
    async (c) => {
      const { before } = c.req.valid('query')
      const projectId = c.var.project.id
      // FR-031: the project's events, plus hub-level events (sign-ins, tokens) of its current members
      const memberUsers = db
        .select({ id: membership.userId })
        .from(membership)
        .where(and(eq(membership.projectId, projectId), isNotNull(membership.userId)))
      const where = and(
        or(
          eq(securityEvent.projectId, projectId),
          and(isNull(securityEvent.projectId), inArray(securityEvent.actorUserId, memberUsers)),
        ),
        before === undefined ? undefined : lt(securityEvent.id, before),
      )
      const rows = await db
        .select({ ...getTableColumns(securityEvent), actorLogin: user.githubLogin })
        .from(securityEvent)
        .leftJoin(user, eq(user.id, securityEvent.actorUserId))
        .where(where)
        .orderBy(desc(securityEvent.id))
        .limit(PAGE + 1)
      const events = rows
        .slice(0, PAGE)
        .map((r) => ({ ...r, scope: r.projectId === null ? ('person' as const) : ('project' as const) }))
      return c.json({ events, next: rows.length > PAGE ? (events.at(-1)?.id ?? null) : null })
    },
  )
