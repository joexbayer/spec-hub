import type {
  Board,
  BoardEntry,
  DocFacts,
  FeatureVersion,
  LandedFeature,
  MemberIdentity,
} from '@spec-hub/core'
import { activityAt, buildBoard, compareVersions } from '@spec-hub/core'
import { and, eq, inArray, isNotNull, ne } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Db } from '../db/client.ts'
import {
  clone,
  cloneBranch,
  cloneFeature,
  document,
  landedFeature,
  membership,
  project,
  user,
} from '../db/schema.ts'

export type DocKind = 'spec' | 'plan' | 'tasks'
const KINDS: DocKind[] = ['spec', 'plan', 'tasks']

export interface VersionSummary {
  branch: string
  carrierUserId: string
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

export interface ShownVersion {
  branch: string
  docs: Record<DocKind, ShownDoc | null>
}

export interface FeatureDetail {
  entry: BoardEntry | null
  landed: LandedFeature | null
  versions: VersionSummary[]
  shown: ShownVersion | null
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
// with branch pushed-state and the three documents' facts.
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
      branchTipAt: cloneBranch.tipAt,
      lastChangeAt: cloneFeature.lastChangeAt,
      carrierUserId: clone.userId,
      authorName: cloneFeature.authorName,
      authorEmail: cloneFeature.authorEmail,
      spec: docColumns(specDoc as unknown as typeof document),
      plan: docColumns(planDoc as unknown as typeof document),
      tasks: docColumns(tasksDoc as unknown as typeof document),
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
    .where(eq(clone.projectId, projectId))
  return rows.map((r) => ({
    ...r,
    lastChangeAt: r.lastChangeAt.getTime(),
    branchTipAt: r.branchTipAt.getTime(),
    docs: { spec: r.spec, plan: r.plan, tasks: r.tasks },
  }))
}

export async function loadBoard(db: Db, projectId: string, now = Date.now()): Promise<Board> {
  const [versionRows, landedRows, memberRows, emailRows, [proj]] = await Promise.all([
    loadVersionRows(db, projectId),
    db.select().from(landedFeature).where(eq(landedFeature.projectId, projectId)),
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
    db.select({ numbering: project.numbering }).from(project).where(eq(project.id, projectId)),
  ])
  if (!proj) throw new Error(`project ${projectId} not found`)

  const versions: FeatureVersion[] = versionRows.map((r) => ({
    dir: r.dir,
    branch: r.branch,
    pushed: r.pushed,
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
  const members: MemberIdentity[] = memberRows.map((m) => ({
    userId: m.userId,
    githubLogin: m.githubLogin,
    name: m.name,
    image: m.image,
    emails: [...new Set([m.email.toLowerCase(), ...commitEmailsOf(m.userId)])].filter((e) => e !== ''),
  }))
  return buildBoard({ versions, landed, members, numbering: proj.numbering, now })
}

export async function loadFeature(
  db: Db,
  projectId: string,
  dir: string,
  branch?: string,
): Promise<FeatureDetail | null> {
  // the board's order and activity rule, so the detail page shows the board's version and dates
  const [proj] = await db
    .select({ numbering: project.numbering })
    .from(project)
    .where(eq(project.id, projectId))
  if (!proj) return null
  const versions = (await loadVersionRows(db, projectId))
    .filter((v) => v.dir === dir)
    .map((v) => ({ ...v, lastChangeAt: activityAt(v, proj.numbering) }))
    .sort(compareVersions)
  const [landedRow] = await db
    .select()
    .from(landedFeature)
    .where(and(eq(landedFeature.projectId, projectId), eq(landedFeature.dir, dir)))
  if (versions.length === 0 && !landedRow) return null

  // Reusing loadBoard for the entry costs a few extra queries; fine at this scale.
  const board = await loadBoard(db, projectId)
  const entry = [...board.inFlight, ...board.stale].find((e) => e.dir === dir) ?? null

  const shownVersion = (branch ? versions.find((v) => v.branch === branch) : undefined) ?? versions[0]
  let shown: ShownVersion | null = null
  if (shownVersion) {
    const oids = KINDS.map((k) => shownVersion.docs[k]?.oid ?? null).filter((o): o is string => o !== null)
    const contents =
      oids.length === 0
        ? []
        : await db
            .select({ oid: document.oid, content: document.content })
            .from(document)
            .where(
              and(eq(document.projectId, projectId), inArray(document.oid, oids), isNotNull(document.oid)),
            )
    const contentByOid = new Map(contents.map((c) => [c.oid, c.content]))
    const docs = {} as Record<DocKind, ShownDoc | null>
    for (const k of KINDS) {
      const row = shownVersion.docs[k]
      const facts = factsOf(row)
      docs[k] =
        !row || row.oid === null || row.size === null || !facts
          ? null
          : {
              oid: row.oid,
              size: row.size,
              content: facts.tooLarge ? null : (contentByOid.get(row.oid) ?? null),
              tooLarge: facts.tooLarge,
              unreadable: facts.unreadable,
              facts,
            }
    }
    shown = { branch: shownVersion.branch, docs }
  }

  return {
    entry,
    landed: landedRow
      ? { dir: landedRow.dir, firstSeenAt: landedRow.firstSeenAt.getTime(), baseline: landedRow.baseline }
      : null,
    versions: versions.map((v) => ({
      branch: v.branch,
      carrierUserId: v.carrierUserId,
      pushed: v.pushed,
      lastChangeAt: v.lastChangeAt,
      spec: factsOf(v.spec),
      plan: factsOf(v.plan),
      tasks: factsOf(v.tasks),
    })),
    shown,
  }
}
