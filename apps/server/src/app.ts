import { relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono, type MiddlewareHandler } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { HTTPException } from 'hono/http-exception'
import { secureHeaders } from 'hono/secure-headers'
import { ZodError } from 'zod'
import type { AppEnv } from './app-env.ts'
import { auth } from './auth/auth.ts'
import { pool } from './db/client.ts'
import { env } from './env.ts'
import { mcpRoutes } from './mcp/handler.ts'
import { boardRoutes } from './routes/board.ts'
import { landingRoutes } from './routes/landing.ts'
import { meRoutes } from './routes/me.ts'
import { memberRoutes } from './routes/members.ts'
import { peopleRoutes } from './routes/people.ts'
import { projectRoutes } from './routes/projects.ts'
import { reporterRoutes } from './routes/reporter.ts'
import { tokenRoutes } from './routes/tokens.ts'

// serveStatic resolves `root` against the working directory, not this file
const publicRoot = relative(process.cwd(), fileURLToPath(new URL('../public', import.meta.url)))
const spaIndex = serveStatic<AppEnv>({ root: publicRoot, path: 'index.html' })
const notSpa = /^\/(?:api|mcp|extension|healthz)(?:\/|$)/
const jsonOnly = /^\/(?:api|mcp)(?:\/|$)/

const hashedAsset = /^\/assets\//

// Vite content-hashes /assets/*, so those never change; everything else static (index.html and the
// SPA fallback included) must be revalidated or browsers keep an old shell after an upgrade.
const staticCache: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next()
  if (c.res.status !== 200 || notSpa.test(c.req.path)) return
  c.res.headers.set(
    'Cache-Control',
    hashedAsset.test(c.req.path) ? 'public, max-age=31536000, immutable' : 'no-cache',
  )
}

const publicOrigin = new URL(env.PUBLIC_URL).origin
const mutating = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
// bearer-token reporter routes carry no cookie; Better Auth checks origins itself
const originExempt = /^\/api\/(?:r|auth)(?:\/|$)/
// The reporter routes set their own (larger) limits after token auth; everything else is small JSON.
const reporterPath = /^\/api\/r(?:\/|$)/
const smallBody = bodyLimit({
  maxSize: 64 * 1024,
  onError: (c) => c.json({ error: 'request body too large' }, 413),
})

// Never the error object or its params: a failed query's params can hold a session token.
function logError(method: string, path: string, err: Error) {
  const code = (err.cause as { code?: unknown } | undefined)?.code
  const message = String(err.message).split('\n', 1)[0]
  console.error(
    `${method} ${path} failed: ${err.name}: ${message}${typeof code === 'string' ? ` (${code})` : ''}`,
  )
}

export const app = new Hono<AppEnv>()
  .use(
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https://avatars.githubusercontent.com'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
      xContentTypeOptions: 'nosniff',
      referrerPolicy: 'strict-origin-when-cross-origin',
      xFrameOptions: 'DENY',
    }),
  )
  // method, path (no query string: OAuth callbacks carry codes there), status, duration; never headers
  .use(async (c, next) => {
    const start = Date.now()
    await next()
    console.log(`${c.req.method} ${c.req.path} ${c.res.status} ${Date.now() - start}ms`)
  })
  .get('/healthz', async (c) => {
    try {
      await pool.query('select 1')
    } catch {
      return c.text('unavailable', 503)
    }
    return c.text('ok')
  })
  .use('/api/*', (c, next) => (reporterPath.test(c.req.path) ? next() : smallBody(c, next)))
  .use('/mcp/*', smallBody)
  // the plugin's own key routes would bypass the audit log; tokens go through our audited routes
  .all('/api/auth/api-key/*', (c) => c.json({ error: 'not found' }, 404))
  // githubId and githubLogin are user input fields (see auth.ts); only GitHub may set them
  .all('/api/auth/update-user', (c) => c.json({ error: 'not found' }, 404))
  .on(['GET', 'POST'], '/api/auth/*', async (c) => {
    const res = await auth.handler(c.req.raw)
    // Better Auth sends several OAuth failures (a refused code, an error from GitHub) to the error
    // page without logging them; log the code so a failed sign-in can be diagnosed.
    const location = res.headers.get('location')
    if (location && c.req.path.startsWith('/api/auth/callback/')) {
      const code = new URL(location, env.PUBLIC_URL).searchParams.get('error')
      if (code) {
        const reason = code.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 64)
        console.warn(JSON.stringify({ event: 'auth_error', reason: 'oauth_callback', code: reason }))
      }
    }
    return res
  })
  // hono's csrf() only checks form content types; our API takes JSON, so check Origin on every mutation
  .use('/api/*', async (c, next) => {
    if (
      mutating.has(c.req.method) &&
      !originExempt.test(c.req.path) &&
      c.req.header('origin') !== publicOrigin
    ) {
      return c.json({ error: 'cross-origin request refused' }, 403)
    }
    await next()
  })
  .route('/api/r', reporterRoutes)
  .route('/api', boardRoutes)
  .route('/api', landingRoutes)
  .route('/mcp', mcpRoutes)
  .route('/api', meRoutes)
  .route('/api', projectRoutes)
  .route('/api', memberRoutes)
  .route('/api', peopleRoutes)
  .route('/api', tokenRoutes)
  .use('*', staticCache)
  .use('*', serveStatic<AppEnv>({ root: publicRoot }))
  .get('*', (c, next) => (notSpa.test(c.req.path) ? next() : spaIndex(c, next)))

app.notFound((c) =>
  jsonOnly.test(c.req.path) ? c.json({ error: 'not found' }, 404) : c.text('not found', 404),
)

app.onError((err, c) => {
  if (err instanceof ZodError) {
    const issues = err.issues.map((i) => ({
      path: i.path.map((p) => (typeof p === 'symbol' ? String(p) : p)),
      message: i.message,
    }))
    return c.json({ error: 'invalid input', issues }, 422)
  }
  if (err instanceof HTTPException) return err.getResponse()
  logError(c.req.method, c.req.path, err)
  return c.json({ error: 'internal error' }, 500)
})
