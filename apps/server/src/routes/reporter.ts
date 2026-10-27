import { MAX_DOCUMENT_BYTES, MAX_MANIFEST_BYTES, Oid, ReportManifest } from '@spec-hub/core'
import { gitBlobId } from '@spec-hub/core/git-object-id'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { AppEnv } from '../app-env.ts'
import { requireMember, requireToken } from '../auth/bearer.ts'
import { db } from '../db/client.ts'
import { user } from '../db/schema.ts'
import { audit } from '../services/audit.ts'
import { ingestReport, storeDocument } from '../services/ingest.ts'
import { zv } from '../validate.ts'

// Auth runs before any body is read, so unauthenticated callers cannot make the hub buffer bodies.
// bodyLimit also covers requests without Content-Length (chunked / Transfer-Encoding): hono 4
// counts the streamed bytes itself (node_modules/hono/dist/middleware/body-limit/index.js).
export const reporterRoutes = new Hono<AppEnv>()
  .use('/:slug/*', requireToken('report'), requireMember())
  .get('/:slug/config', async (c) => {
    const [u] = await db.select({ login: user.githubLogin }).from(user).where(eq(user.id, c.var.userId))
    return c.json({
      defaultBranch: c.var.project.defaultBranch,
      numbering: c.var.project.numbering,
      maxDocumentBytes: MAX_DOCUMENT_BYTES,
      login: u?.login ?? '',
    })
  })
  .post(
    '/:slug/reports',
    bodyLimit({ maxSize: MAX_MANIFEST_BYTES, onError: (c) => c.json({ error: 'manifest too large' }, 413) }),
    zv('json', ReportManifest),
    async (c) => {
      const r = await ingestReport(db, {
        project: c.var.project,
        userId: c.var.userId,
        manifest: c.req.valid('json'),
      })
      switch (r.kind) {
        case 'missing':
          return c.json({ missing: r.oids }, 409)
        case 'foreign-clone':
          await audit(db, {
            type: 'clone_rejected',
            actorUserId: c.var.userId,
            projectId: c.var.project.id,
            detail: { cloneId: r.cloneId },
          })
          console.warn(
            JSON.stringify({
              event: 'auth_rejected',
              reason: 'foreign_clone',
              route: c.req.routePath,
              project: c.var.project.slug,
              cloneId: r.cloneId,
            }),
          )
          return c.json({ error: 'this clone id is registered to another person or project' }, 403)
        case 'stale':
          return c.json({ accepted: false, reason: 'stale' })
        case 'stored':
          return c.json({ accepted: true })
      }
    },
  )
  .put(
    '/:slug/blobs/:oid',
    bodyLimit({ maxSize: MAX_DOCUMENT_BYTES, onError: (c) => c.json({ error: 'document too large' }, 413) }),
    async (c) => {
      const oid = Oid.parse(c.req.param('oid'))
      const bytes = new Uint8Array(await c.req.arrayBuffer())
      if (gitBlobId(bytes, oid.length === 64 ? 'sha256' : 'sha1') !== oid) {
        return c.json({ error: 'content does not match its id' }, 422)
      }
      await storeDocument(db, c.var.project.id, oid, bytes)
      return c.body(null, 204)
    },
  )
