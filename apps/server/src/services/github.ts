import { z } from 'zod'
import { env } from '../env.ts'

export type GithubAccount = { id: string; login: string }

export class GithubUnavailable extends Error {}

const GithubUser = z.object({ id: z.number().int().positive(), login: z.string().min(1), type: z.string() })

// Resolves a username to its GitHub account (public API, no token). null: GitHub has no such user.
// Anything else that is not an answer (network, timeout, 5xx, rate limit) throws GithubUnavailable.
export async function lookupGithubUser(login: string): Promise<GithubAccount | null> {
  let res: Response
  try {
    res = await fetch(`${env.GITHUB_API_URL}/users/${encodeURIComponent(login)}`, {
      headers: { 'User-Agent': 'spec-hub', Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(5000),
    })
  } catch (err) {
    throw new GithubUnavailable(`GitHub user lookup failed: ${(err as Error).name}`)
  }
  if (res.status === 404) return null
  if (!res.ok) throw new GithubUnavailable(`GitHub user lookup answered ${res.status}`)
  const parsed = GithubUser.safeParse(await res.json().catch(() => null))
  if (!parsed.success) throw new GithubUnavailable('GitHub user lookup returned an unexpected body')
  // /users/<name> also answers for organisations, which can never sign in
  if (parsed.data.type !== 'User') return null
  return { id: String(parsed.data.id), login: parsed.data.login.toLowerCase() }
}
