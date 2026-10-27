import { and, asc, countDistinct, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import type { AppEnv } from '../app-env.ts'
import { isHubAdmin, requireProjectRole, requireSession } from '../auth/session.ts'
import { db } from '../db/client.ts'
import { clone, cloneFeature, membership, project } from '../db/schema.ts'
import { env } from '../env.ts'

export const meRoutes = new Hono<AppEnv>()
  .get('/me', requireSession, async (c) => {
    const u = c.var.user
    const projects = await db
      .select({ slug: project.slug, name: project.name, role: membership.role })
      .from(membership)
      .innerJoin(project, eq(project.id, membership.projectId))
      .where(eq(membership.userId, u.id))
      .orderBy(asc(project.name))
    const hubAdmin = isHubAdmin(u)
    return c.json({
      user: { id: u.id, githubLogin: u.githubLogin, name: u.name, image: u.image ?? null },
      isHubAdmin: hubAdmin,
      // FR-025: no project and not a hub admin -> the web shows only the waiting page
      waiting: !hubAdmin && projects.length === 0,
      projects,
    })
  })
  .get('/projects/:slug/connect', requireSession, requireProjectRole(), async (c) => {
    const slug = c.var.project.slug
    const hubUrl = env.PUBLIC_URL
    const clones = await db
      .select({
        id: clone.id,
        reportedAt: clone.reportedAt,
        features: countDistinct(cloneFeature.dir),
      })
      .from(clone)
      .leftJoin(cloneFeature, eq(cloneFeature.cloneId, clone.id))
      .where(and(eq(clone.projectId, c.var.project.id), eq(clone.userId, c.var.userId)))
      .groupBy(clone.id, clone.reportedAt)
      .orderBy(asc(clone.reportedAt))
    return c.json({
      hubUrl,
      slug,
      mcpUrl: `${hubUrl}/mcp/${slug}`,
      installCommand: `specify extension add spec-hub --from ${hubUrl}/extension/spec-hub.zip`,
      configSnippet: `hub_url: ${hubUrl}\nproject: ${slug}\n`,
      clones: clones.map((r) => ({
        id: r.id,
        reportedAt: r.reportedAt.toISOString(),
        features: Number(r.features),
      })),
    })
  })
