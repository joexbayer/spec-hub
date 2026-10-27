import { eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../app-env.ts'
import { requireHubAdmin, requireProjectRole, requireSession } from '../auth/session.ts'
import { db } from '../db/client.ts'
import { clone, cloneFeature, membership, project } from '../db/schema.ts'
import { audit } from '../services/audit.ts'
import { zv } from '../validate.ts'

const refName = z
  .string()
  .min(1)
  .max(255)
  .refine(
    (s) =>
      !/[\s~^:?*[\\]|\.\.|^-|\/$|\.lock$|^@$/.test(s) &&
      ![...s].some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127),
    'invalid ref name',
  )
const numbering = z.enum(['sequential', 'timestamp'])

const createBody = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
  name: z.string().min(1).max(100),
  defaultBranch: refName.default('main'),
  numbering: numbering.default('sequential'),
})
const patchBody = z
  .object({ name: z.string().min(1).max(100), defaultBranch: refName, numbering })
  .partial()
  .refine((b) => Object.keys(b).length > 0, 'at least one field is required')

const isUniqueViolation = (e: unknown) => (e as { cause?: { code?: string } })?.cause?.code === '23505'

export const projectRoutes = new Hono<AppEnv>()
  .post('/projects', requireSession, requireHubAdmin, zv('json', createBody), async (c) => {
    const body = c.req.valid('json')
    const u = c.var.user
    try {
      const created = await db.transaction(async (tx) => {
        const [row] = await tx.insert(project).values(body).returning()
        if (!row) throw new Error('project insert returned no row')
        await tx.insert(membership).values({
          projectId: row.id,
          githubId: u.githubId,
          assignedLogin: u.githubLogin,
          userId: u.id,
          role: 'admin',
          invitedBy: u.id,
        })
        await audit(tx, {
          type: 'project_created',
          actorUserId: u.id,
          projectId: row.id,
          detail: { slug: row.slug },
        })
        return row
      })
      return c.json(created, 201)
    } catch (e) {
      if (isUniqueViolation(e)) return c.json({ error: 'slug taken' }, 409)
      throw e
    }
  })
  .get('/projects/:slug', requireSession, requireProjectRole(), (c) => {
    const { slug, name, defaultBranch, numbering, createdAt } = c.var.project
    return c.json({ slug, name, defaultBranch, numbering, createdAt })
  })
  .patch('/projects/:slug', requireSession, requireProjectRole('admin'), zv('json', patchBody), async (c) => {
    const body = c.req.valid('json')
    const p = c.var.project
    // a new default branch starts its landed history over: the old tip belongs to another branch
    const retarget =
      body.defaultBranch !== undefined && body.defaultBranch !== p.defaultBranch
        ? { defaultTip: null, defaultTipAt: null }
        : {}
    const row = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(project)
        .set({ ...body, ...retarget })
        .where(eq(project.id, p.id))
        .returning()
      await audit(tx, {
        type: 'project_updated',
        actorUserId: c.var.userId,
        projectId: p.id,
        detail: { fields: Object.keys(body) },
      })
      return updated
    })
    return c.json(row)
  })
  .get('/projects', requireSession, requireHubAdmin, async (c) => {
    const rows = await db
      .select({
        slug: project.slug,
        name: project.name,
        defaultBranch: project.defaultBranch,
        numbering: project.numbering,
        createdAt: project.createdAt,
        // Drizzle leaves columns unqualified in a single-table select, so a bare ${project.id} here
        // would bind to the subquery's own "id"; the outer project is named explicitly.
        memberCount: sql<number>`(select count(*)::int from ${membership} where ${membership.projectId} = "project"."id")`,
        featureCount: sql<number>`(select count(distinct ${cloneFeature.dir})::int from ${cloneFeature} join ${clone} on ${clone.id} = ${cloneFeature.cloneId} where ${clone.projectId} = "project"."id")`,
      })
      .from(project)
      .orderBy(project.name)
    return c.json(rows)
  })
