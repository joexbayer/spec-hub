import { and, eq } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import { branchHide, clone, cloneBranch } from '../db/schema.ts'

// Hides a branch at every tip the project's clones report for it now; a copy at a later tip counts again.
// Returns null when no clone reports the branch.
export async function hideBranch(
  db: Db,
  projectId: string,
  branch: string,
  userId: string,
): Promise<{ branch: string; tips: number } | null> {
  const tips = await db
    .selectDistinct({ tip: cloneBranch.tip })
    .from(cloneBranch)
    .innerJoin(clone, eq(clone.id, cloneBranch.cloneId))
    .where(and(eq(clone.projectId, projectId), eq(cloneBranch.name, branch)))
  if (tips.length === 0) return null
  // Two members hiding at once leave one row per tip.
  await db
    .insert(branchHide)
    .values(tips.map(({ tip }) => ({ projectId, branch, tip, hiddenBy: userId })))
    .onConflictDoNothing()
  return { branch, tips: tips.length }
}

export async function showBranch(db: Db, projectId: string, branch: string): Promise<void> {
  await db.delete(branchHide).where(and(eq(branchHide.projectId, projectId), eq(branchHide.branch, branch)))
}
