import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import type { AppEnv } from '../app-env.ts'
import { isHubAdmin, requireAnyAdmin, requireSession } from '../auth/session.ts'
import { db } from '../db/client.ts'
import { membership, securityEvent, user } from '../db/schema.ts'

// FR-027: everyone who has signed in, for admins assigning people to projects
export const peopleRoutes = new Hono<AppEnv>().get('/people', requireSession, requireAnyAdmin, async (c) => {
  const rows = await db
    .select({
      id: user.id,
      githubLogin: user.githubLogin,
      githubId: user.githubId,
      name: user.name,
      image: user.image,
      projects: sql<number>`(select count(*)::int from ${membership} where ${membership.userId} = ${user.id})`,
      lastSignInAt: sql<string | null>`(select max(${securityEvent.at}) from ${securityEvent} where ${and(
        eq(securityEvent.actorUserId, user.id),
        eq(securityEvent.type, 'sign_in'),
        isNull(securityEvent.projectId),
      )})`,
    })
    .from(user)
    .orderBy(asc(user.githubLogin))
  return c.json(
    rows.map((r) => ({
      id: r.id,
      githubLogin: r.githubLogin,
      name: r.name,
      image: r.image ?? null,
      waiting: r.projects === 0 && !isHubAdmin(r),
      lastSignInAt: r.lastSignInAt ? new Date(r.lastSignInAt).toISOString() : null,
    })),
  )
})
