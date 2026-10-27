import type { Db, Tx } from '../db/client.ts'
import { securityEvent } from '../db/schema.ts'

// `detail` must never contain token values or document content: ids, logins and counts only.
export async function audit(
  db: Db | Tx,
  event: {
    type: string
    actorUserId?: string | null
    projectId?: string | null
    detail?: Record<string, unknown>
  },
): Promise<void> {
  await db.insert(securityEvent).values({
    type: event.type,
    actorUserId: event.actorUserId ?? null,
    projectId: event.projectId ?? null,
    detail: event.detail ?? {},
  })
}
