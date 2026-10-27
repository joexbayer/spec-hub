import { describe, expect, it } from 'vitest'
import { noreplyLogin, resolveOwner } from '../src/owner.ts'
import type { DocFacts, MemberIdentity } from '../src/types.ts'

const spec = (ownerHandle: string | null): DocFacts => ({
  title: null,
  ownerHandle,
  dependsOn: [],
  openClarifications: 0,
  tasksDone: 0,
  tasksTotal: 0,
  tooLarge: false,
  unreadable: false,
})
const ann: MemberIdentity = {
  userId: 'u1',
  githubLogin: 'ann',
  name: 'Ann',
  image: null,
  emails: ['ann@work.com'],
}
const bob: MemberIdentity = { userId: 'u2', githubLogin: 'bob', name: 'Bob', image: 'b.png', emails: [] }
const members = [ann, bob]
const member = (m: MemberIdentity) => ({
  kind: 'member',
  userId: m.userId,
  githubLogin: m.githubLogin,
  name: m.name,
  image: m.image,
})

describe('noreplyLogin', () => {
  it('parses both forms, lowercased', () => {
    expect(noreplyLogin('123+Bob@users.noreply.github.com')).toBe('bob')
    expect(noreplyLogin('Bob@users.noreply.github.com')).toBe('bob')
  })
  it('null otherwise', () => {
    expect(noreplyLogin('bob@example.com')).toBeNull()
  })
})

describe('resolveOwner', () => {
  const author = { name: 'Zed', email: 'zed@x.com' }
  it('header naming a member wins over author', () => {
    expect(
      resolveOwner({ spec: spec('bob'), author: { name: 'Ann', email: 'ann@work.com' } }, members),
    ).toEqual(member(bob))
  })
  it('header naming a non-member -> handle', () => {
    expect(resolveOwner({ spec: spec('carol'), author }, members)).toEqual({
      kind: 'handle',
      handle: 'carol',
    })
  })
  it('author email matches case-insensitively', () => {
    expect(resolveOwner({ spec: spec(null), author: { name: 'x', email: 'Ann@Work.com' } }, members)).toEqual(
      member(ann),
    )
  })
  it('noreply email matches login (both forms)', () => {
    expect(
      resolveOwner({ spec: null, author: { name: 'x', email: '9+bob@users.noreply.github.com' } }, members),
    ).toEqual(member(bob))
    expect(
      resolveOwner({ spec: null, author: { name: 'x', email: 'bob@users.noreply.github.com' } }, members),
    ).toEqual(member(bob))
  })
  it('non-member author -> git-name', () => {
    expect(resolveOwner({ spec: spec(null), author }, members)).toEqual({ kind: 'git-name', name: 'Zed' })
  })
  it('nothing -> unknown', () => {
    expect(resolveOwner({ spec: null, author: null }, members)).toEqual({ kind: 'unknown' })
  })
})
