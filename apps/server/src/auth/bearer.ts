import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../app-env.ts'
import { db, pool } from '../db/client.ts'
import { findMembership, findProjectBySlug } from '../services/membership.ts'
import { auth } from './auth.ts'

type Reason = 'missing' | 'invalid' | 'forbidden' | 'not_member' | 'no_project'

// Codes the api-key plugin uses for a key that is wrong. Any other failure is ours: fail closed with 500.
const KEY_PROBLEMS = new Set([
  'INVALID_API_KEY',
  'KEY_NOT_FOUND',
  'KEY_DISABLED',
  'KEY_EXPIRED',
  'USAGE_EXCEEDED',
  'RATE_LIMIT_EXCEEDED',
])

async function databaseAnswers(): Promise<boolean> {
  try {
    await pool.query('select 1')
    return true
  } catch {
    return false
  }
}

// One structured line per rejection. Never log the key or the Authorization header.
const reject = (
  c: { req: { routePath: string; param: (n: string) => string | undefined } },
  reason: Reason,
  keyStart?: string | null,
) =>
  console.warn(
    JSON.stringify({
      event: 'auth_rejected',
      reason,
      route: c.req.routePath,
      project: c.req.param('slug'),
      keyStart,
    }),
  )

export const requireToken = (permission: 'report' | 'read') =>
  createMiddleware<AppEnv>(async (c, next) => {
    const key = c.req.header('authorization')?.match(/^Bearer (\S{8,200})$/)?.[1]
    if (!key) {
      reject(c, 'missing')
      return c.json({ error: 'missing token' }, 401)
    }
    const r = await auth.api.verifyApiKey({ body: { key, permissions: { hub: [permission] } } })
    if (!r.valid || !r.key) {
      const code = r.error?.code
      // the plugin reports an unexpected error (a database outage) as INVALID_API_KEY too
      if (
        typeof code !== 'string' ||
        !KEY_PROBLEMS.has(code) ||
        (code === 'INVALID_API_KEY' && !(await databaseAnswers()))
      ) {
        console.error(
          JSON.stringify({ event: 'auth_error', reason: 'verify_failed', route: c.req.routePath, code }),
        )
        return c.json({ error: 'internal error' }, 500)
      }
      // with no custom validator, KEY_NOT_FOUND is how the plugin reports a valid key lacking the permission
      if (r.error?.code === 'KEY_NOT_FOUND') {
        reject(c, 'forbidden', r.key?.start)
        return c.json({ error: 'token lacks permission' }, 403)
      }
      reject(c, 'invalid', r.key?.start)
      return c.json({ error: 'invalid token' }, 401)
    }
    c.set('userId', r.key.referenceId)
    await next()
  })

export const requireMember = (role: 'member' | 'admin' = 'member') =>
  createMiddleware<AppEnv>(async (c, next) => {
    const project = await findProjectBySlug(db, c.req.param('slug') ?? '')
    if (!project) {
      reject(c, 'no_project')
      return c.json({ error: 'no such project' }, 404)
    }
    const m = await findMembership(db, project.id, c.var.userId) // checked per request: removal is immediate
    if (!m || (role === 'admin' && m.role !== 'admin')) {
      reject(c, 'not_member')
      return c.json({ error: 'not a member' }, 403)
    }
    c.set('project', project)
    c.set('membership', m)
    await next()
  })
