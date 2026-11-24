import { and, eq, sql } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import { clone, cloneFeature, featureDone, membership } from '../db/schema.ts'

// A reported copy's document version: its spec, plan and tasks oids together, '-' for a missing one.
// The one definition of feature_done.docs_key; the board's join and markDone both use it.
export const docsKey = sql<string>`coalesce(${cloneFeature.specOid}, '-') || ':' || coalesce(${cloneFeature.planOid}, '-') || ':' || coalesce(${cloneFeature.tasksOid}, '-')`

// Marks a feature done at every document version the project's member clones report for it now
// (the board's own population); a copy with another version counts again. Null when none reports it.
export async function markDone(
  db: Db,
  projectId: string,
  dir: string,
  userId: string,
): Promise<{ dir: string; versions: number } | null> {
  const keys = await db
    .selectDistinct({ key: docsKey })
    .from(cloneFeature)
    .innerJoin(clone, eq(clone.id, cloneFeature.cloneId))
    .innerJoin(
      membership,
      and(eq(membership.projectId, clone.projectId), eq(membership.userId, clone.userId)),
    )
    .where(and(eq(clone.projectId, projectId), eq(cloneFeature.dir, dir)))
  if (keys.length === 0) return null
  // Two members marking at once leave one row per version.
  await db
    .insert(featureDone)
    .values(keys.map(({ key }) => ({ projectId, dir, docsKey: key, doneBy: userId })))
    .onConflictDoNothing()
  return { dir, versions: keys.length }
}

export async function unmarkDone(db: Db, projectId: string, dir: string): Promise<void> {
  await db.delete(featureDone).where(and(eq(featureDone.projectId, projectId), eq(featureDone.dir, dir)))
}
