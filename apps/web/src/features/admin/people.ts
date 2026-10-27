import { getJson } from './http'

// GET /api/people: everyone who has signed in (hub admins and project admins only)
export type Person = {
  id: string
  githubLogin: string
  name: string
  image: string | null
  waiting: boolean
  lastSignInAt: string | null
}

export const peopleQuery = {
  queryKey: ['admin', 'people'],
  queryFn: () => getJson<Person[]>('/api/people'),
}

// Suggestions for the username field: signed in, not already a member. Pending members have no
// hub user yet, so they are matched by login as well.
export function assignable(
  people: Person[],
  members: { userId: string | null; githubLogin: string }[],
): Person[] {
  const ids = new Set(members.map((m) => m.userId))
  const logins = new Set(members.map((m) => m.githubLogin.toLowerCase()))
  return people.filter((p) => !ids.has(p.id) && !logins.has(p.githubLogin.toLowerCase()))
}
