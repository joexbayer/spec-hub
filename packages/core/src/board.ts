import { resolveOwner } from './owner.ts'
import { inferPhase } from './phase.ts'
import type { Board, BoardEntry, FeatureVersion, LandedFeature, MemberIdentity, Numbering } from './types.ts'

export const WINDOW_MS = 14 * 24 * 60 * 60 * 1000

export interface BoardInput {
  versions: FeatureVersion[]
  landed: LandedFeature[]
  members: MemberIdentity[]
  numbering: Numbering
  now: number
}

const SEQUENTIAL = /^(\d+)-/
const TIMESTAMP = /^(\d{8}-\d{6})(?=-|$)/

export function featureNumber(dir: string, numbering: Numbering): string | null {
  const m = (numbering === 'sequential' ? SEQUENTIAL : TIMESTAMP).exec(dir)
  return m?.[1] ?? null
}

export function titleFromDir(dir: string): string {
  const words = dir
    .replace(/^(?:\d{8}-\d{6}|\d+)-/, '')
    .replace(/[-_]+/g, ' ')
    .trim()
  if (!words) return dir
  return words.charAt(0).toUpperCase() + words.slice(1)
}

// Spec Kit names a feature's branch after it (`010-eval-gate`, or `joe/010-eval-gate`), so a branch
// whose last segment carries the feature's number is the feature's own branch.
export function isOwnBranch(branch: string, dir: string, numbering: Numbering): boolean {
  const n = featureNumber(dir, numbering)
  return n !== null && featureNumber(branch.slice(branch.lastIndexOf('/') + 1), numbering) === n
}

/** When a version last saw work: a commit to its folder, or any commit on the feature's own branch. */
export function activityAt(
  v: Pick<FeatureVersion, 'branch' | 'dir' | 'lastChangeAt' | 'branchTipAt'>,
  numbering: Numbering,
): number {
  return isOwnBranch(v.branch, v.dir, numbering) ? Math.max(v.lastChangeAt, v.branchTipAt) : v.lastChangeAt
}

const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

// Newest change first; ties broken by the given key so output is deterministic.
const newestFirst =
  <T extends { lastChangeAt: number }>(key: (x: T) => string) =>
  (a: T, b: T) =>
    b.lastChangeAt - a.lastChangeAt || byString(key(a), key(b))

/** The order of one feature's versions; the first is the one the board and the detail page show. */
export const compareVersions = (
  a: Pick<FeatureVersion, 'lastChangeAt' | 'branch' | 'carrierUserId'>,
  b: Pick<FeatureVersion, 'lastChangeAt' | 'branch' | 'carrierUserId'>,
): number =>
  b.lastChangeAt - a.lastChangeAt ||
  byString(a.branch, b.branch) ||
  byString(a.carrierUserId, b.carrierUserId)

// FR-011..FR-018: every version passed in is already in flight (filtered by the reporter).
export function buildBoard(input: BoardInput): Board {
  const { versions, landed, members, numbering, now } = input
  const landedDirs = new Set(landed.map((l) => l.dir))

  // FR-016: work on a feature's own branch keeps it in flight even when the folder itself is untouched.
  const byDir = new Map<string, FeatureVersion[]>()
  for (const raw of versions) {
    const v = { ...raw, lastChangeAt: activityAt(raw, numbering) }
    const group = byDir.get(v.dir)
    if (group) group.push(v)
    else byDir.set(v.dir, [v])
  }

  const entries: BoardEntry[] = []
  for (const [dir, group] of byDir) {
    group.sort(compareVersions)
    const shown = group[0]
    if (!shown) continue
    entries.push({
      dir,
      number: featureNumber(dir, numbering),
      title: shown.spec?.title ?? titleFromDir(dir),
      owner: resolveOwner(shown, members),
      phase: inferPhase(shown),
      openClarifications: shown.spec?.openClarifications ?? 0,
      dependsOn: (shown.spec?.dependsOn ?? []).filter((d) => d !== dir),
      branches: group.map((v) => ({
        branch: v.branch,
        pushed: v.pushed,
        lastChangeAt: v.lastChangeAt,
        carrierUserId: v.carrierUserId,
      })),
      lastChangeAt: shown.lastChangeAt,
      changesLandedFeature: landedDirs.has(dir),
      collisions: [],
    })
  }

  // FR-017: number reuse across in-flight entries and landed features; timestamp numbers never collide.
  if (numbering === 'sequential') {
    const dirsByNumber = new Map<string, Set<string>>()
    const add = (dir: string) => {
      const n = featureNumber(dir, numbering)
      if (n === null) return
      const set = dirsByNumber.get(n)
      if (set) set.add(dir)
      else dirsByNumber.set(n, new Set([dir]))
    }
    for (const e of entries) add(e.dir)
    for (const l of landed) add(l.dir)
    for (const e of entries) {
      if (e.number === null) continue
      e.collisions = [...(dirsByNumber.get(e.number) ?? [])].filter((d) => d !== e.dir).sort()
    }
  }

  const byChange = newestFirst((e: BoardEntry) => e.dir)
  const inFlight = entries.filter((e) => now - e.lastChangeAt <= WINDOW_MS).sort(byChange)
  const stale = entries.filter((e) => now - e.lastChangeAt > WINDOW_MS).sort(byChange)

  const recentlyLanded = landed
    .filter((l) => !l.baseline && now - l.firstSeenAt <= WINDOW_MS)
    .sort((a, b) => b.firstSeenAt - a.firstSeenAt || (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0))

  return { inFlight, stale, recentlyLanded, landedDirs: [...landedDirs].sort(), members }
}
