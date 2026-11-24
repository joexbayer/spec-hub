import type {
  Board,
  BoardEntry,
  DocFacts,
  FeatureVersion,
  FinishedFeature,
  FinishedRow,
  LandedFeature,
  MemberIdentity,
} from '@spec-hub/core'
import {
  activityAt,
  buildBoard,
  buildFinished,
  compareVersions,
  dropRemoteCopies,
  finishedFeature,
} from '@spec-hub/core'
import { and, eq, inArray, ne } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Db } from '../db/client.ts'
import {
  clone,
  cloneBranch,
  cloneFeature,
  document,
  featureDone,
  landedFeature,
  membership,
  project,
  user,
} from '../db/schema.ts'
import { docsKey } from './done.ts'

export type DocKind = 'spec' | 'plan' | 'tasks'
const KINDS: DocKind[] = ['spec', 'plan', 'tasks']

export interface VersionSummary {
  branch: string
  carrierUserId: string | null
  pushed: boolean
  lastChangeAt: number
  spec: DocFacts | null
  plan: DocFacts | null
  tasks: DocFacts | null
}

export interface ShownDoc {
  oid: string
  size: number
  content: string | null
  tooLarge: boolean
  unreadable: boolean
  facts: DocFacts
}

export interface ExtraRef {
  name: string
  oid: string
  size: number
}

export interface ShownVersion {
  branch: string
  extra: { name: string; doc: ShownDoc }[]
  docs: Record<DocKind, ShownDoc | null>
}

export interface FeatureDetail {
  dir: string
  entry: BoardEntry | null
  landed: {
    dir: string
    firstSeenAt: number
    baseline: boolean
    branch: string
    finished: FinishedFeature
  } | null
  versions: VersionSummary[]
  shown: ShownVersion | null
  // set when the folder has marked copies and none that count
  done: DoneMark | null
}

export interface DoneMark {
  by: { githubLogin: string; name: string } | null // null: no marker recorded, or the user is gone
  at: number // ms, earliest matching mark
}

const docColumns = (d: typeof document) => ({
  oid: d.oid,
  size: d.size,
  tooLarge: d.tooLarge,
  unreadable: d.unreadable,
  title: d.title,
  ownerHandle: d.ownerHandle,
  openClarifications: d.openClarifications,
  tasksDone: d.tasksDone,
  tasksTotal: d.tasksTotal,
  dependsOn: d.dependsOn,
})

interface DocRow {
  oid: string | null
  size: number | null
  tooLarge: boolean | null
  unreadable: boolean | null
  title: string | null
  ownerHandle: string | null
  openClarifications: number | null
  tasksDone: number | null
  tasksTotal: number | null
  dependsOn: string[] | null
}

// A left-joined document row; no stored row (oid null) means no document.
function factsOf(row: DocRow | null): DocFacts | null {
  if (!row || row.oid === null) return null
  if (row.tooLarge) {
    return {
      title: null,
      ownerHandle: null,
      dependsOn: [],
      openClarifications: 0,
      tasksDone: 0,
      tasksTotal: 0,
      tooLarge: true,
      unreadable: false,
    }
  }
  return {
    title: row.title,
    ownerHandle: row.ownerHandle,
    dependsOn: row.dependsOn ?? [],
    openClarifications: row.openClarifications ?? 0,
    tasksDone: row.tasksDone ?? 0,
    tasksTotal: row.tasksTotal ?? 0,
    tooLarge: false,
    unreadable: row.unreadable ?? false,
  }
}

// One query: every clone_feature of this project's clones whose user is still a member,
// with branch pushed-state, the three documents' facts and the done mark matching its (dir, docsKey), if any.
async function loadVersionRows(db: Db, projectId: string) {
  // Aliases are cast to the base table type only to reuse docColumns; the SQL uses the alias.
  const specDoc = alias(document, 'spec_doc')
  const planDoc = alias(document, 'plan_doc')
  const tasksDoc = alias(document, 'tasks_doc')
  const rows = await db
    .select({
      dir: cloneFeature.dir,
      branch: cloneFeature.branch,
      pushed: cloneBranch.pushed,
      remote: cloneBranch.remote,
      branchTipAt: cloneBranch.tipAt,
      lastChangeAt: cloneFeature.lastChangeAt,
      carrierUserId: clone.userId,
      authorName: cloneFeature.authorName,
      authorEmail: cloneFeature.authorEmail,
      extraDocs: cloneFeature.extraDocs,
      spec: docColumns(specDoc as unknown as typeof document),
      plan: docColumns(planDoc as unknown as typeof document),
      tasks: docColumns(tasksDoc as unknown as typeof document),
      doneAt: featureDone.doneAt,
      doneBy: featureDone.doneBy,
    })
    .from(cloneFeature)
    .innerJoin(clone, eq(clone.id, cloneFeature.cloneId))
    .innerJoin(
      membership,
      and(eq(membership.projectId, clone.projectId), eq(membership.userId, clone.userId)),
    )
    .innerJoin(
      cloneBranch,
      and(eq(cloneBranch.cloneId, cloneFeature.cloneId), eq(cloneBranch.name, cloneFeature.branch)),
    )
    .leftJoin(specDoc, and(eq(specDoc.projectId, projectId), eq(specDoc.oid, cloneFeature.specOid)))
    .leftJoin(planDoc, and(eq(planDoc.projectId, projectId), eq(planDoc.oid, cloneFeature.planOid)))
    .leftJoin(tasksDoc, and(eq(tasksDoc.projectId, projectId), eq(tasksDoc.oid, cloneFeature.tasksOid)))
    .leftJoin(
      featureDone,
      and(
        eq(featureDone.projectId, clone.projectId),
        eq(featureDone.dir, cloneFeature.dir),
        eq(featureDone.docsKey, docsKey),
      ),
    )
    .where(eq(clone.projectId, projectId))
  return rows.map((r) => ({
    ...r,
    lastChangeAt: r.lastChangeAt.getTime(),
    branchTipAt: r.branchTipAt.getTime(),
    doneAt: r.doneAt?.getTime() ?? null,
    docs: { spec: r.spec, plan: r.plan, tasks: r.tasks },
  }))
}

async function loadMembers(db: Db, projectId: string): Promise<MemberIdentity[]> {
  const [memberRows, emailRows] = await Promise.all([
    db
      .select({
        userId: user.id,
        githubLogin: user.githubLogin,
        name: user.name,
        image: user.image,
        email: user.email,
      })
      .from(membership)
      .innerJoin(user, eq(user.id, membership.userId))
      .where(eq(membership.projectId, projectId)),
    db
      .selectDistinct({ userId: clone.userId, email: clone.commitEmail })
      .from(clone)
      .where(and(eq(clone.projectId, projectId), ne(clone.commitEmail, ''))),
  ])
  // A commit email is self-declared by the reporter, so it never overrides a GitHub account email
  // and counts only when exactly one member's clones claim it (else anyone could take others' features).
  const accountEmails = new Set(memberRows.map((m) => m.email.toLowerCase()))
  const memberIds = new Set(memberRows.map((m) => m.userId))
  const claimants = new Map<string, Set<string>>()
  for (const e of emailRows) {
    if (!memberIds.has(e.userId)) continue
    const email = e.email.toLowerCase()
    const set = claimants.get(email) ?? new Set<string>()
    set.add(e.userId)
    claimants.set(email, set)
  }
  const commitEmailsOf = (userId: string) =>
    [...claimants]
      .filter(([email, users]) => users.has(userId) && users.size === 1 && !accountEmails.has(email))
      .map(([email]) => email)
  return memberRows.map((m) => ({
    userId: m.userId,
    githubLogin: m.githubLogin,
    name: m.name,
    image: m.image,
    emails: [...new Set([m.email.toLowerCase(), ...commitEmailsOf(m.userId)])].filter((e) => e !== ''),
  }))
}

// landed_feature rows of the project with their three documents' columns, optionally one dir.
async function loadLandedRows(db: Db, projectId: string, dir?: string) {
  const specDoc = alias(document, 'spec_doc')
  const planDoc = alias(document, 'plan_doc')
  const tasksDoc = alias(document, 'tasks_doc')
  const rows = await db
    .select({
      landed: landedFeature,
      spec: docColumns(specDoc as unknown as typeof document),
      plan: docColumns(planDoc as unknown as typeof document),
      tasks: docColumns(tasksDoc as unknown as typeof document),
    })
    .from(landedFeature)
    .leftJoin(specDoc, and(eq(specDoc.projectId, projectId), eq(specDoc.oid, landedFeature.specOid)))
    .leftJoin(planDoc, and(eq(planDoc.projectId, projectId), eq(planDoc.oid, landedFeature.planOid)))
    .leftJoin(tasksDoc, and(eq(tasksDoc.projectId, projectId), eq(tasksDoc.oid, landedFeature.tasksOid)))
    .where(
      and(eq(landedFeature.projectId, projectId), dir === undefined ? undefined : eq(landedFeature.dir, dir)),
    )
  return rows.map(({ landed: l, spec, plan, tasks }) => ({
    docs: { spec, plan, tasks },
    extraDocs: l.extraDocs,
    row: {
      dir: l.dir,
      firstSeenAt: l.firstSeenAt.getTime(),
      baseline: l.baseline,
      addedAt: l.addedAt?.getTime() ?? null,
      lastChangeAt: l.lastChangeAt?.getTime() ?? null,
      author: l.authorName ? { name: l.authorName, email: l.authorEmail ?? '' } : null,
      spec: factsOf(spec),
      plan: factsOf(plan),
      tasks: factsOf(tasks),
    } satisfies FinishedRow,
  }))
}

export async function loadBoard(db: Db, projectId: string, now = Date.now()): Promise<Board> {
  const [versionRows, landedRows, members, [proj]] = await Promise.all([
    loadVersionRows(db, projectId),
    db.select().from(landedFeature).where(eq(landedFeature.projectId, projectId)),
    loadMembers(db, projectId),
    db.select({ numbering: project.numbering }).from(project).where(eq(project.id, projectId)),
  ])
  if (!proj) throw new Error(`project ${projectId} not found`)

  const versions: FeatureVersion[] = versionRows
    .filter((r) => r.doneAt === null)
    .map((r) => ({
      dir: r.dir,
      branch: r.branch,
      pushed: r.pushed,
      remote: r.remote,
      lastChangeAt: r.lastChangeAt,
      branchTipAt: r.branchTipAt,
      carrierUserId: r.carrierUserId,
      author: r.authorName ? { name: r.authorName, email: r.authorEmail ?? '' } : null,
      spec: factsOf(r.spec),
      plan: factsOf(r.plan),
      tasks: factsOf(r.tasks),
    }))
  const landed: LandedFeature[] = landedRows.map((r) => ({
    dir: r.dir,
    firstSeenAt: r.firstSeenAt.getTime(),
    baseline: r.baseline,
  }))
  return buildBoard({ versions, landed, members, numbering: proj.numbering, now })
}

const activeDirsOf = (board: Board) => new Set([...board.inFlight, ...board.stale].map((e) => e.dir))

export async function loadFinished(
  db: Db,
  projectId: string,
): Promise<{ defaultBranch: string; finishedTipAt: number | null; finished: FinishedFeature[] }> {
  const [[proj], landed, members, board] = await Promise.all([
    db
      .select({
        numbering: project.numbering,
        defaultBranch: project.defaultBranch,
        finishedTipAt: project.finishedTipAt,
      })
      .from(project)
      .where(eq(project.id, projectId)),
    loadLandedRows(db, projectId),
    loadMembers(db, projectId),
    loadBoard(db, projectId),
  ])
  if (!proj) throw new Error(`project ${projectId} not found`)
  return {
    defaultBranch: proj.defaultBranch,
    finishedTipAt: proj.finishedTipAt?.getTime() ?? null,
    finished: buildFinished(
      landed.map((l) => l.row),
      members,
      proj.numbering,
      activeDirsOf(board),
    ),
  }
}

// Loads the contents of the given documents; a missing row, or one without a stored oid, is no document.
// Extra documents are read by their oid alone; one with no stored row (too large, marker missing) is left out.
async function shownDocs(
  db: Db,
  projectId: string,
  branch: string,
  docs: Record<DocKind, DocRow | null>,
  extraRefs: ExtraRef[],
): Promise<ShownVersion> {
  const oids = [
    ...KINDS.map((k) => docs[k]?.oid ?? null).filter((o): o is string => o !== null),
    ...extraRefs.map((e) => e.oid),
  ]
  const rows =
    oids.length === 0
      ? []
      : await db
          .select({ ...docColumns(document), content: document.content })
          .from(document)
          .where(and(eq(document.projectId, projectId), inArray(document.oid, oids)))
  const rowByOid = new Map(rows.map((r) => [r.oid, r]))
  const shownDoc = (row: DocRow | null | undefined): ShownDoc | null => {
    const facts = factsOf(row ?? null)
    if (!row || row.oid === null || row.size === null || !facts) return null
    return {
      oid: row.oid,
      size: row.size,
      content: facts.tooLarge ? null : (rowByOid.get(row.oid)?.content ?? null),
      tooLarge: facts.tooLarge,
      unreadable: facts.unreadable,
      facts,
    }
  }
  const shown = {} as Record<DocKind, ShownDoc | null>
  for (const k of KINDS) shown[k] = shownDoc(docs[k])
  const extra = extraRefs.flatMap((e) => {
    const doc = shownDoc(rowByOid.get(e.oid))
    return doc ? [{ name: e.name, doc }] : []
  })
  return { branch, extra, docs: shown }
}

export async function loadFeature(
  db: Db,
  projectId: string,
  dir: string,
  branch?: string,
): Promise<FeatureDetail | null> {
  // the board's order and activity rule, so the detail page shows the board's version and dates
  const [proj] = await db
    .select({ numbering: project.numbering, defaultBranch: project.defaultBranch })
    .from(project)
    .where(eq(project.id, projectId))
  if (!proj) return null
  const rows = (await loadVersionRows(db, projectId)).filter((v) => v.dir === dir)
  const visible = rows.filter((v) => v.doneAt === null)
  const versions = dropRemoteCopies(
    visible.map((v) => ({ ...v, lastChangeAt: activityAt(v, proj.numbering) })),
  ).sort(compareVersions)
  const done = visible.length === 0 ? await doneMark(db, rows) : null
  const [landed] = await loadLandedRows(db, projectId, dir)
  if (versions.length === 0 && !done && !landed) return null

  // Reusing loadBoard for the entry costs a few extra queries; fine at this scale.
  const [board, members] = await Promise.all([loadBoard(db, projectId), loadMembers(db, projectId)])
  const entry = [...board.inFlight, ...board.stale].find((e) => e.dir === dir) ?? null

  const shownVersion = (branch ? versions.find((v) => v.branch === branch) : undefined) ?? versions[0]
  // The default branch's documents are known once its facts were reported.
  const showDefault = landed?.row.addedAt != null && (branch === proj.defaultBranch || versions.length === 0)
  let shown: ShownVersion | null = null
  if (showDefault && landed)
    shown = await shownDocs(db, projectId, proj.defaultBranch, landed.docs, landed.extraDocs)
  else if (shownVersion)
    shown = await shownDocs(db, projectId, shownVersion.branch, shownVersion.docs, shownVersion.extraDocs)

  return {
    dir,
    entry,
    landed: landed
      ? {
          dir: landed.row.dir,
          firstSeenAt: landed.row.firstSeenAt,
          baseline: landed.row.baseline,
          branch: proj.defaultBranch,
          finished: finishedFeature(landed.row, members, proj.numbering, activeDirsOf(board)),
        }
      : null,
    versions: versions.map((v) => ({
      branch: v.branch,
      carrierUserId: v.remote ? null : v.carrierUserId,
      pushed: v.pushed,
      lastChangeAt: v.lastChangeAt,
      spec: factsOf(v.spec),
      plan: factsOf(v.plan),
      tasks: factsOf(v.tasks),
    })),
    shown,
    done,
  }
}

// The earliest mark among a folder's marked copies, with its marker (looked up in user, so one who left
// the project is still named); null when no copy is marked.
async function doneMark(
  db: Db,
  markedRows: { doneAt: number | null; doneBy: string | null }[],
): Promise<DoneMark | null> {
  let first: { at: number; by: string | null } | null = null
  for (const r of markedRows)
    if (r.doneAt !== null && (!first || r.doneAt < first.at)) first = { at: r.doneAt, by: r.doneBy }
  if (!first) return null
  const [by] =
    first.by === null
      ? []
      : await db
          .select({ githubLogin: user.githubLogin, name: user.name })
          .from(user)
          .where(eq(user.id, first.by))
  return { by: by ?? null, at: first.at }
}
