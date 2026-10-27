import type { DocumentFacts } from './parse-document.ts'

export type Numbering = 'sequential' | 'timestamp'

export type Phase =
  | { kind: 'clarify'; open: number }
  | { kind: 'implement'; done: number; total: number }
  | { kind: 'implemented'; total: number }
  | { kind: 'tasks'; total: number }
  | { kind: 'plan' }
  | { kind: 'specify' }
export type PhaseKind = Phase['kind']

// A document's stored facts (parseDocument output plus storage flags).
export interface DocFacts extends DocumentFacts {
  tooLarge: boolean
  unreadable: boolean
}

export interface MemberIdentity {
  userId: string
  githubLogin: string
  name: string
  image: string | null
  emails: string[] // lowercase: account email plus every commit email their clones reported
}

export type Owner =
  | { kind: 'member'; userId: string; githubLogin: string; name: string; image: string | null }
  | { kind: 'handle'; handle: string }
  | { kind: 'git-name'; name: string }
  | { kind: 'unknown' }

// One clone_feature row joined with its documents' facts.
export interface FeatureVersion {
  dir: string
  branch: string
  pushed: boolean
  /** Last commit that touched the feature's folder on this branch. */
  lastChangeAt: number
  /** The branch's own last commit, whatever it touched. */
  branchTipAt: number
  carrierUserId: string
  author: { name: string; email: string } | null
  spec: DocFacts | null
  plan: DocFacts | null
  tasks: DocFacts | null
}

export interface LandedFeature {
  dir: string
  firstSeenAt: number
  baseline: boolean
}

export interface BranchRef {
  branch: string
  pushed: boolean
  lastChangeAt: number
  carrierUserId: string
}

export interface BoardEntry {
  dir: string
  number: string | null
  title: string
  owner: Owner
  phase: Phase
  openClarifications: number
  dependsOn: string[]
  branches: BranchRef[]
  lastChangeAt: number
  changesLandedFeature: boolean
  collisions: string[] // directory names this entry's number collides with
}

export interface Board {
  inFlight: BoardEntry[]
  stale: BoardEntry[]
  recentlyLanded: LandedFeature[]
  landedDirs: string[]
  members: MemberIdentity[]
}
