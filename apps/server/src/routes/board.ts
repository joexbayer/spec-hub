import { and, eq, isNull, max } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../app-env.ts'
import { requireProjectRole, requireSession } from '../auth/session.ts'
import { db } from '../db/client.ts'
import { clone, membership } from '../db/schema.ts'
import { loadBoard, loadFeature, loadFinished } from '../services/board-query.ts'
import { hideBranch, showBranch } from '../services/hide.ts'
import { zv } from '../validate.ts'

const guard = [requireSession, requireProjectRole()] as const
// biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control characters in a directory name is the point
const featureParam = z.object({ slug: z.string(), dir: z.string().regex(/^[^/\u0000-\u001f]{1,255}$/) })
const featureQuery = z.object({ branch: z.string().min(1).max(255).optional() })
const branchName = z
  .string()
  .min(1)
  .max(255)
  // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control characters in a branch name is the point
  .regex(/^[^\u0000-\u001f]+$/)

export const boardRoutes = new Hono<AppEnv>()
  .get('/projects/:slug/board', ...guard, async (c) => {
    const projectId = c.var.project.id
    const [board, reports, pendingRows] = await Promise.all([
      loadBoard(db, projectId),
      db
        .select({ userId: clone.userId, at: max(clone.reportedAt) })
        .from(clone)
        .innerJoin(
          membership,
          and(eq(membership.projectId, clone.projectId), eq(membership.userId, clone.userId)),
        )
        .where(eq(clone.projectId, projectId))
        .groupBy(clone.userId),
      // added by an admin but never signed in: not on the board's member list, so named here
      db
        .select({ login: membership.assignedLogin })
        .from(membership)
        .where(and(eq(membership.projectId, projectId), isNull(membership.userId)))
        .orderBy(membership.assignedLogin),
    ])
    const lastReportAt: Record<string, number> = {}
    for (const r of reports) if (r.at) lastReportAt[r.userId] = r.at.getTime()
    return c.json({
      board,
      lastReportAt,
      pending: pendingRows.map((r) => r.login),
      defaultBranch: c.var.project.defaultBranch,
    })
  })
  .get('/projects/:slug/finished', ...guard, async (c) => c.json(await loadFinished(db, c.var.project.id)))
  .get(
    '/projects/:slug/features/:dir',
    ...guard,
    zv('param', featureParam),
    zv('query', featureQuery),
    async (c) => {
      const { dir } = c.req.valid('param')
      const { branch } = c.req.valid('query')
      const feature = await loadFeature(db, c.var.project.id, dir, branch)
      if (!feature) return c.json({ error: 'no such feature' }, 404)
      return c.json(feature)
    },
  )
  .post(
    '/projects/:slug/hidden-branches',
    ...guard,
    zv('json', z.object({ branch: branchName })),
    async (c) => {
      const { branch } = c.req.valid('json')
      // the default branch is where features land, never a leftover (spec 006 edge cases)
      if (branch === c.var.project.defaultBranch)
        return c.json({ error: 'the default branch cannot be hidden' }, 400)
      const hidden = await hideBranch(db, c.var.project.id, branch, c.var.userId)
      return hidden ? c.json(hidden) : c.json({ error: 'no such branch' }, 404)
    },
  )
  .delete(
    '/projects/:slug/hidden-branches',
    ...guard,
    zv('query', z.object({ branch: branchName })),
    async (c) => {
      await showBranch(db, c.var.project.id, c.req.valid('query').branch)
      return c.body(null, 204)
    },
  )
