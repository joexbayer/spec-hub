import type { FeatureVersion, MemberIdentity, Owner } from './types.ts'

const NOREPLY = /^(?:\d+\+)?([^@+\s]+)@users\.noreply\.github\.com$/i

export function noreplyLogin(email: string): string | null {
  const m = NOREPLY.exec(email.trim())
  return m?.[1] ? m[1].toLowerCase() : null
}

function asMember(m: MemberIdentity): Owner {
  return { kind: 'member', userId: m.userId, githubLogin: m.githubLogin, name: m.name, image: m.image }
}

// FR-015: spec owner header, else the person who first committed spec.md.
export function resolveOwner(v: Pick<FeatureVersion, 'spec' | 'author'>, members: MemberIdentity[]): Owner {
  const handle = v.spec?.ownerHandle
  if (handle) {
    const m = members.find((x) => x.githubLogin.toLowerCase() === handle.toLowerCase())
    return m ? asMember(m) : { kind: 'handle', handle }
  }
  if (!v.author) return { kind: 'unknown' }
  const email = v.author.email.toLowerCase()
  const byEmail = members.find((x) => x.emails.includes(email))
  if (byEmail) return asMember(byEmail)
  const login = noreplyLogin(email)
  const byLogin = login ? members.find((x) => x.githubLogin.toLowerCase() === login) : undefined
  if (byLogin) return asMember(byLogin)
  return { kind: 'git-name', name: v.author.name }
}
