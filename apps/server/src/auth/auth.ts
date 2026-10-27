import { apiKey } from '@better-auth/api-key'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import * as authSchema from '../db/auth-schema.ts'
import { db } from '../db/client.ts'
import { env } from '../env.ts'
import { audit } from '../services/audit.ts'
import { bindMemberships } from '../services/membership.ts'

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg', schema: authSchema }),
  baseURL: env.PUBLIC_URL,
  secret: env.BETTER_AUTH_SECRET,
  user: {
    // githubLogin is for display and owner headers, refreshed on every sign-in; access keys on githubId.
    // Both come only from GitHub (mapProfileToUser). They must be input fields because Better Auth
    // drops non-input fields from the mapped profile; no route lets a user set them, since
    // /update-user is closed in app.ts and there is no other sign-up.
    additionalFields: {
      githubLogin: { type: 'string', required: true },
      githubId: { type: 'string', required: true },
    },
  },
  // Anyone with a GitHub account can sign in; until assigned to a project they only see "waiting
  // for access" (FR-025): every project route checks membership, and token creation checks access.
  socialProviders: {
    github: {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
      overrideUserInfoOnSignIn: true,
      mapProfileToUser: (p) => ({ githubLogin: p.login.toLowerCase(), githubId: String(p.id) }),
    },
  },
  // Per-IP limits need the client address from the proxy; without it every caller would share one
  // bucket, so one client could lock everyone out of sign-in. Sign-in is GitHub-only (no passwords).
  rateLimit: { enabled: env.TRUSTED_IP_HEADER !== undefined },
  ...(env.TRUSTED_IP_HEADER
    ? { advanced: { ipAddress: { ipAddressHeaders: [env.TRUSTED_IP_HEADER] } } }
    : {}),
  // We never use the GitHub access token; encrypted at rest it is useless from a database dump.
  // No linking: by default Better Auth would join a *different* GitHub account that shows the same
  // verified email to the existing user (and then overwrite its githubId), so whoever controls a
  // member's old address would take over their account. One user is exactly one GitHub account.
  account: { encryptOAuthTokens: true, accountLinking: { enabled: false } },
  // messages only: the extra arguments can be error objects carrying query parameters (session tokens)
  logger: {
    log: (level, message) => {
      const line = `[better-auth] ${level}: ${message}`
      if (level === 'error') console.error(line)
      else if (level === 'warn') console.warn(line)
      else console.log(line)
    },
  },
  // the plugin default rate limit (10 a day) would cut off the reporter
  plugins: [apiKey({ defaultPrefix: 'sh_', rateLimit: { enabled: false } })],
  databaseHooks: {
    // a membership assigned by username before this account signed in is bound by account id
    user: { create: { after: async (user) => bindMemberships(db, user.id, String(user.githubId)) } },
    session: {
      create: {
        after: async (session) => audit(db, { type: 'sign_in', actorUserId: session.userId }),
      },
    },
  },
})
