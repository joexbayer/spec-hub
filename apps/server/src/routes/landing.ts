import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../app-env.ts'
import { requireProjectRole, requireSession } from '../auth/session.ts'
import { db } from '../db/client.ts'
import { endById, loadQueueView, withQueue } from '../services/landing.ts'
import { zv } from '../validate.ts'

const guard = [requireSession, requireProjectRole()] as const
const placeParam = z.object({ slug: z.string(), id: z.coerce.number().int().positive() })

const view = (projectId: string, userId: string) =>
  withQueue(db, projectId, (tx, now) => loadQueueView(tx, projectId, userId, now))

export const landingRoutes = new Hono<AppEnv>()
  .get('/projects/:slug/landing', ...guard, async (c) => {
    const { project, userId } = c.var
    return c.json({ ...(await view(project.id, userId)), defaultBranch: project.defaultBranch })
  })
  .post('/projects/:slug/landing/:id/end', ...guard, zv('param', placeParam), async (c) => {
    const { project, userId } = c.var
    const { id } = c.req.valid('param')
    const result = await endById(db, project.id, id, userId)
    if (!result) return c.json({ error: 'no such place' }, 404)
    return c.json({ ...(await view(project.id, userId)), defaultBranch: project.defaultBranch })
  })
