import { z } from 'zod'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

const Env = z.object({
  DATABASE_URL: z.string().min(1),
  // Origin the browser uses (http://localhost:5173 in dev, through the Vite proxy). Trailing slash stripped.
  PUBLIC_URL: z
    .url()
    .refine(
      (u) => {
        const { protocol, hostname } = new URL(u)
        return protocol === 'https:' || LOCAL_HOSTS.has(hostname)
      },
      { message: 'must be https unless localhost' },
    )
    .transform((u) => u.replace(/\/+$/, '')),
  BETTER_AUTH_SECRET: z.string().min(32, 'must be at least 32 characters'),
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  // Comma list of GitHub account ids (numeric, `gh api users/<login> --jq .id`) of the hub admins.
  // Ids, not logins: a login can be renamed and then taken by someone else.
  SPEC_HUB_ADMINS: z
    .string()
    .default('')
    .transform((s) =>
      s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
    )
    .refine((ids) => ids.every((id) => /^[1-9][0-9]{0,19}$/.test(id)), {
      message: 'must be numeric GitHub account ids (gh api users/<login> --jq .id)',
    }),
  // GitHub's REST API, used to resolve a username to its account id when assigning members.
  // Overridable so tests (and GitHub Enterprise) never call github.com. Trailing slash stripped.
  GITHUB_API_URL: z
    .url()
    .default('https://api.github.com')
    .transform((u) => u.replace(/\/+$/, '')),
  PORT: z.coerce.number().int().positive().default(3000),
  // Header the TLS proxy in front of the hub sets to the client address (one value, e.g. x-real-ip).
  // Unset: Better Auth's per-IP rate limiter is off (it would put everyone in one bucket).
  TRUSTED_IP_HEADER: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]*$/, 'must be a header name')
    .optional()
    .transform((s) => s || undefined),
})

export type Env = z.infer<typeof Env>

// Pure: validates a source map. The error message names failing variables and rules, never their values.
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = Env.safeParse(source)
  if (!result.success) {
    const problems = result.error.issues.map((i) => {
      const name = i.path.map(String).join('.') || '(root)'
      return `${name}: ${i.message}`
    })
    throw new Error(`Invalid environment variables: ${[...new Set(problems)].join('; ')}`)
  }
  return result.data
}
