import { and, eq, isNull } from 'drizzle-orm'
import type { Db, Tx } from '../db/client.ts'
import { membership, project } from '../db/schema.ts'

export async function findProjectBySlug(db: Db, slug: string) {
  const [row] = await db.select().from(project).where(eq(project.slug, slug)).limit(1)
  return row ?? null
}

export async function findMembership(db: Db, projectId: string, userId: string) {
  const [row] = await db
    .select()
    .from(membership)
    .where(and(eq(membership.projectId, projectId), eq(membership.userId, userId)))
    .limit(1)
  return row ?? null
}

export async function hasMembership(db: Db, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: membership.userId })
    .from(membership)
    .where(eq(membership.userId, userId))
    .limit(1)
  return row !== undefined
}

export async function isProjectAdminAnywhere(db: Db, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: membership.userId })
    .from(membership)
    .where(and(eq(membership.userId, userId), eq(membership.role, 'admin')))
    .limit(1)
  return row !== undefined
}

// Binds pending memberships to the hub user of GitHub account `githubId` — never by login.
export async function bindMemberships(db: Db | Tx, userId: string, githubId: string): Promise<void> {
  await db
    .update(membership)
    .set({ userId })
    .where(and(eq(membership.githubId, githubId), isNull(membership.userId)))
}
