import { featureNumber, titleFromDir } from './board.ts'
import { resolveOwner } from './owner.ts'
import type { FinishedFeature, FinishedRow, MemberIdentity, Numbering, Owner } from './types.ts'

export function finishedFeature(
  r: FinishedRow,
  members: MemberIdentity[],
  numbering: Numbering,
  activeDirs: ReadonlySet<string>,
): FinishedFeature {
  return {
    dir: r.dir,
    number: featureNumber(r.dir, numbering),
    title: r.spec?.title ?? titleFromDir(r.dir),
    owner: resolveOwner(r, members),
    landedAt: r.baseline ? r.addedAt : r.firstSeenAt,
    lastChangeAt: r.lastChangeAt,
    tasks: r.tasks && r.tasks.tasksTotal > 0 ? { done: r.tasks.tasksDone, total: r.tasks.tasksTotal } : null,
    reported: r.addedAt !== null,
    inFlight: activeDirs.has(r.dir),
  }
}

/** Newest landedAt first, unknown last, ties by folder name. */
export function buildFinished(
  rows: FinishedRow[],
  members: MemberIdentity[],
  numbering: Numbering,
  activeDirs: ReadonlySet<string>,
): FinishedFeature[] {
  return rows
    .map((r) => finishedFeature(r, members, numbering, activeDirs))
    .sort((a, b) => {
      if (a.landedAt !== b.landedAt) {
        if (a.landedAt === null) return 1
        if (b.landedAt === null) return -1
        return b.landedAt - a.landedAt
      }
      return a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0
    })
}

export function ownerKey(o: Owner): string {
  switch (o.kind) {
    case 'member':
      return o.githubLogin.toLowerCase()
    case 'handle':
      return o.handle.toLowerCase()
    case 'git-name':
      return o.name.toLowerCase()
    case 'unknown':
      return ''
  }
}

/** The list's text filter: an exact number match first, then title or folder name (case-insensitive). */
export function matchFinished(list: FinishedFeature[], query: string, owner?: string): FinishedFeature[] {
  const q = query.trim().toLowerCase()
  const byOwner = owner ? list.filter((f) => ownerKey(f.owner) === owner.toLowerCase()) : list
  if (!q) return byOwner
  const exact = byOwner.filter((f) => f.number === q)
  const rest = byOwner.filter((f) => f.number !== q && `${f.title} ${f.dir}`.toLowerCase().includes(q))
  return [...exact, ...rest]
}
