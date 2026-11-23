import type { ReportManifest } from '@spec-hub/core'
import { MAX_DOCUMENT_BYTES, manifestDocs, parseDocument, uploadableOids } from '@spec-hub/core'
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm'
import type { Project } from '../app-env.ts'
import type { Db, Tx } from '../db/client.ts'
import {
  cloneBranch as cloneBranchT,
  cloneFeature as cloneFeatureT,
  clone as cloneT,
  document as documentT,
  landedFeature as landedFeatureT,
  project as projectT,
} from '../db/schema.ts'
import { audit } from './audit.ts'

export type IngestResult =
  | { kind: 'stored' }
  | { kind: 'stale' }
  | { kind: 'foreign-clone'; cloneId: string }
  | { kind: 'missing'; oids: string[] }

export type IngestInput = { project: Project; userId: string; manifest: ReportManifest }

type DefaultBranchReport = NonNullable<ReportManifest['default']>

// One report = one transaction. Any thrown error rolls everything back (fail closed).
// Concurrency control is the clone row lock plus the generatedAt comparison (constitution 7.4).
export async function ingestReport(
  db: Db,
  { project, userId, manifest }: IngestInput,
): Promise<IngestResult> {
  return db.transaction(async (tx) => {
    const [clone] = await tx.select().from(cloneT).where(eq(cloneT.id, manifest.cloneId)).for('update')
    // a clone id belongs to one person and one project; anything else would mix projects' data (Art. 5.2)
    if (clone && (clone.userId !== userId || clone.projectId !== project.id))
      return { kind: 'foreign-clone', cloneId: clone.id }
    if (clone && clone.generatedAt >= manifest.generatedAt) return { kind: 'stale' }
    const wanted = uploadableOids(manifest, MAX_DOCUMENT_BYTES)
    const missing = await missingDocuments(tx, project.id, wanted)
    if (missing.length > 0) return { kind: 'missing', oids: missing }
    await storeTooLargeMarkers(tx, project.id, manifest, MAX_DOCUMENT_BYTES)
    await upsertClone(tx, {
      id: manifest.cloneId,
      projectId: project.id,
      userId,
      commitEmail: manifest.commitEmail.toLowerCase(),
      generatedAt: manifest.generatedAt,
      isNew: !clone,
    })
    // Cascades to clone_feature via the composite FK.
    await tx.delete(cloneBranchT).where(eq(cloneBranchT.cloneId, manifest.cloneId))
    await insertBranchesAndFeatures(tx, manifest)
    if (manifest.default) {
      const before = await advanceDefaultBranch(tx, project.id, manifest.default)
      await storeFinished(tx, before, manifest.default)
    }
    return { kind: 'stored' }
  })
}

// The caller (route, T021) has already verified that `bytes` hash to `oid`; this only stores.
export async function storeDocument(
  db: Db,
  projectId: string,
  oid: string,
  bytes: Uint8Array,
): Promise<void> {
  let text: string | null
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    text = null
  }
  // Postgres text cannot hold NUL, and no Markdown document needs it
  if (text?.includes('\u0000')) text = null
  const size = bytes.byteLength
  if (text === null) {
    await db
      .insert(documentT)
      .values({ projectId, oid, size, content: null, unreadable: true })
      .onConflictDoNothing()
    return
  }
  const facts = parseDocument(text)
  await db
    .insert(documentT)
    .values({
      projectId,
      oid,
      size,
      content: text,
      title: facts.title,
      ownerHandle: facts.ownerHandle,
      dependsOn: facts.dependsOn,
      openClarifications: facts.openClarifications,
      tasksDone: facts.tasksDone,
      tasksTotal: facts.tasksTotal,
    })
    .onConflictDoNothing()
}

// Documents are project-scoped: a doc stored under another project counts as missing (R6).
async function missingDocuments(tx: Tx, projectId: string, oids: string[]): Promise<string[]> {
  if (oids.length === 0) return []
  const rows = await tx
    .select({ oid: documentT.oid })
    .from(documentT)
    .where(and(eq(documentT.projectId, projectId), inArray(documentT.oid, oids)))
  const have = new Set(rows.map((r) => r.oid))
  return oids.filter((oid) => !have.has(oid))
}

async function storeTooLargeMarkers(tx: Tx, projectId: string, manifest: ReportManifest, maxBytes: number) {
  const sizes = new Map<string, number>()
  for (const d of manifestDocs(manifest)) if (d.size > maxBytes) sizes.set(d.oid, d.size)
  if (sizes.size === 0) return
  // one order for every transaction, so two reports sharing oids cannot deadlock on the inserts
  const sorted = [...sizes].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  await tx
    .insert(documentT)
    .values(sorted.map(([oid, size]) => ({ projectId, oid, size, content: null, tooLarge: true })))
    .onConflictDoNothing()
}

async function upsertClone(
  tx: Tx,
  c: {
    id: string
    projectId: string
    userId: string
    commitEmail: string
    generatedAt: number
    isNew: boolean
  },
) {
  const reportedAt = new Date()
  await tx
    .insert(cloneT)
    .values({
      id: c.id,
      projectId: c.projectId,
      userId: c.userId,
      commitEmail: c.commitEmail,
      generatedAt: c.generatedAt,
      reportedAt,
    })
    .onConflictDoUpdate({
      target: cloneT.id,
      set: { commitEmail: c.commitEmail, generatedAt: c.generatedAt, reportedAt },
    })
  if (c.isNew) {
    await audit(tx, {
      type: 'clone_connected',
      actorUserId: c.userId,
      projectId: c.projectId,
      detail: { cloneId: c.id },
    })
  }
}

async function insertBranchesAndFeatures(tx: Tx, manifest: ReportManifest) {
  const cloneId = manifest.cloneId
  if (manifest.branches.length === 0) return
  await tx.insert(cloneBranchT).values(
    manifest.branches.map((b) => ({
      cloneId,
      name: b.name,
      tip: b.tip,
      tipAt: new Date(b.tipAt * 1000),
      pushed: b.pushed,
    })),
  )
  const features = manifest.branches.flatMap((b) =>
    b.features.map((f) => ({
      cloneId,
      branch: b.name,
      dir: f.dir,
      lastChangeAt: new Date(f.lastChangeAt * 1000),
      authorName: f.author?.name ?? null,
      authorEmail: f.author?.email ?? null,
      specOid: f.docs.spec?.oid ?? null,
      planOid: f.docs.plan?.oid ?? null,
      tasksOid: f.docs.tasks?.oid ?? null,
      specSize: f.docs.spec?.size ?? null,
      planSize: f.docs.plan?.size ?? null,
      tasksSize: f.docs.tasks?.size ?? null,
    })),
  )
  if (features.length > 0) await tx.insert(cloneFeatureT).values(features)
}

type ProjectRow = typeof projectT.$inferSelect

// the first listing ever, or one from before the project existed, is history (FR-017)
function isBaseline(p: { defaultTipAt: Date | null; createdAt: Date }, tipAt: Date): boolean {
  return p.defaultTipAt === null || tipAt <= p.createdAt
}

// Returns the project row as read (locked) BEFORE the update: storeFinished needs the pre-update
// defaultTipAt to decide the baseline the same way.
async function advanceDefaultBranch(tx: Tx, projectId: string, d: DefaultBranchReport): Promise<ProjectRow> {
  const [p] = await tx.select().from(projectT).where(eq(projectT.id, projectId)).for('update')
  if (!p) throw new Error(`project ${projectId} not found`)
  if (d.branch !== p.defaultBranch) return p // listed against a default branch the project no longer has
  const tipAt = new Date(d.tipAt * 1000)
  if (p.defaultTipAt && p.defaultTipAt >= tipAt) return p // an older (or the same) origin/main: ignore
  const baseline = isBaseline(p, tipAt)
  await tx.update(projectT).set({ defaultTip: d.tip, defaultTipAt: tipAt }).where(eq(projectT.id, projectId))
  if (d.dirs.length > 0) {
    const firstSeenAt = new Date()
    await tx
      .insert(landedFeatureT)
      .values(d.dirs.map((dir) => ({ projectId, dir, firstSeenAt, baseline })))
      .onConflictDoNothing()
  }
  return p
}

const excluded = (column: string) => sql.raw(`excluded.${column}`)

// `p` is the pre-update row, locked FOR UPDATE by advanceDefaultBranch in this transaction.
async function storeFinished(tx: Tx, p: ProjectRow, d: DefaultBranchReport): Promise<void> {
  if (!d.features) return
  if (d.branch !== p.defaultBranch) return
  const tipAt = new Date(d.tipAt * 1000)
  if (p.finishedTipAt && p.finishedTipAt >= tipAt) return // an older or the same listing (FR-005)
  await tx.update(projectT).set({ finishedTip: d.tip, finishedTipAt: tipAt }).where(eq(projectT.id, p.id))
  const listed = d.features.map((f) => f.dir)
  // removed or renamed on the default branch (FR-011); not when a newer dirs step already ran (it would delete a just-landed folder)
  if (!p.defaultTipAt || tipAt >= p.defaultTipAt) {
    await tx
      .delete(landedFeatureT)
      .where(
        and(
          eq(landedFeatureT.projectId, p.id),
          listed.length > 0 ? notInArray(landedFeatureT.dir, listed) : undefined,
        ),
      )
  }
  if (d.features.length === 0) return
  const firstSeenAt = new Date()
  const baseline = isBaseline(p, tipAt)
  await tx
    .insert(landedFeatureT)
    .values(
      d.features.map((f) => ({
        projectId: p.id,
        dir: f.dir,
        firstSeenAt,
        baseline,
        addedAt: new Date(f.addedAt * 1000),
        lastChangeAt: new Date(f.lastChangeAt * 1000),
        authorName: f.author?.name ?? null,
        authorEmail: f.author?.email ?? null,
        specOid: f.docs.spec?.oid ?? null,
        planOid: f.docs.plan?.oid ?? null,
        tasksOid: f.docs.tasks?.oid ?? null,
        specSize: f.docs.spec?.size ?? null,
        planSize: f.docs.plan?.size ?? null,
        tasksSize: f.docs.tasks?.size ?? null,
      })),
    )
    .onConflictDoUpdate({
      target: [landedFeatureT.projectId, landedFeatureT.dir],
      // only the facts; first_seen_at and baseline keep their first value
      set: {
        addedAt: excluded('added_at'),
        lastChangeAt: excluded('last_change_at'),
        authorName: excluded('author_name'),
        authorEmail: excluded('author_email'),
        specOid: excluded('spec_oid'),
        planOid: excluded('plan_oid'),
        tasksOid: excluded('tasks_oid'),
        specSize: excluded('spec_size'),
        planSize: excluded('plan_size'),
        tasksSize: excluded('tasks_size'),
      },
    })
}
