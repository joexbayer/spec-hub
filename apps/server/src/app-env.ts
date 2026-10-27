import type { membership, project } from './db/schema.ts'

export type Project = typeof project.$inferSelect
export type Membership = typeof membership.$inferSelect
export type SessionUser = {
  id: string
  githubLogin: string
  githubId: string
  name: string
  email: string
  image?: string | null
}

export type AppEnv = {
  Variables: { userId: string; project: Project; membership: Membership; user: SessionUser }
}
