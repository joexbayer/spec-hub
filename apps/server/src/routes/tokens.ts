import { APIError } from 'better-auth/api'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../app-env.ts'
import { auth } from '../auth/auth.ts'
import { isWaiting, requireSession } from '../auth/session.ts'
import { db } from '../db/client.ts'
import { audit } from '../services/audit.ts'
import { zv } from '../validate.ts'

const createBody = z.object({ name: z.string().trim().min(1).max(32) })
const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null)

export const tokenRoutes = new Hono<AppEnv>()
  .get('/tokens', requireSession, async (c) => {
    const { apiKeys } = await auth.api.listApiKeys({ headers: c.req.raw.headers })
    return c.json(
      apiKeys.map((k) => ({
        id: k.id,
        name: k.name ?? '',
        start: k.start ?? null,
        createdAt: new Date(k.createdAt).toISOString(),
        lastRequest: iso(k.lastRequest),
      })),
    )
  })
  .post('/tokens', requireSession, zv('json', createBody), async (c) => {
    const { name } = c.req.valid('json')
    // FR-025: a token is only useful with a project, and a waiting person has none
    if (await isWaiting(c.var.user)) return c.json({ error: 'waiting for access' }, 403)
    const k = await auth.api.createApiKey({
      body: { name, userId: c.var.userId, permissions: { hub: ['report', 'read'] } },
    })
    await audit(db, { type: 'token_created', actorUserId: c.var.userId, detail: { tokenId: k.id, name } })
    return c.json(
      {
        id: k.id,
        name,
        key: k.key,
        start: k.start ?? null,
        createdAt: new Date(k.createdAt).toISOString(),
      },
      201,
    )
  })
  .delete('/tokens/:id', requireSession, async (c) => {
    const id = c.req.param('id')
    try {
      await auth.api.deleteApiKey({ body: { keyId: id }, headers: c.req.raw.headers })
    } catch (err) {
      if (err instanceof APIError && err.status === 'NOT_FOUND') {
        return c.json({ error: 'no such token' }, 404)
      }
      throw err
    }
    await audit(db, { type: 'token_revoked', actorUserId: c.var.userId, detail: { tokenId: id } })
    return c.body(null, 204)
  })
