import type { CallToolResult } from '@modelcontextprotocol/server'
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import type { Numbering } from '@spec-hub/core'
import { featureNumber } from '@spec-hub/core'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../app-env.ts'
import { requireMember, requireToken } from '../auth/bearer.ts'
import { db } from '../db/client.ts'
import { loadBoard, loadFeature } from '../services/board-query.ts'
import { formatBoard, formatDocument, formatFeature, oneLine } from './format.ts'

type Caller = { projectId: string; projectSlug: string; numbering: Numbering; userId: string }

const text = (t: string): CallToolResult => ({ content: [{ type: 'text', text: t }] })
const failure = (t: string): CallToolResult => ({ content: [{ type: 'text', text: t }], isError: true })

// Read-only tools only: nothing here can approve or object (constitution Art. 4.1).
const mcp = createMcpHandler(({ authInfo }) => {
  const caller = authInfo?.extra as Caller
  const server = new McpServer({ name: 'spec-hub', version: '0.1.0' })

  server.registerTool(
    'board',
    {
      description: 'What the team is working on: one line per in-flight feature, newest change first.',
      annotations: { readOnlyHint: true },
    },
    async () => text(formatBoard(caller.projectSlug, await loadBoard(db, caller.projectId))),
  )

  server.registerTool(
    'feature',
    {
      description: "One feature: phase, progress, owner, branches, dependencies; or a document's full text.",
      annotations: { readOnlyHint: true },
      inputSchema: z.object({
        id: z
          .string()
          .min(1)
          .max(255)
          .describe('Feature number ("104") or directory name ("104-ledger-settlement")'),
        document: z
          .enum(['spec', 'plan', 'tasks'])
          .optional()
          .describe('Return the full text of this document'),
      }),
    },
    async ({ id, document }) => {
      const board = await loadBoard(db, caller.projectId)
      const all = [...board.inFlight, ...board.stale].map((e) => e.dir).concat(board.landedDirs)
      const known = [...new Set(all)]
      const matches = known.includes(id)
        ? [id]
        : known.filter((d) => featureNumber(d, caller.numbering) === id).sort()
      if (matches.length > 1) {
        return failure(
          `ambiguous: ${matches.map((d) => oneLine(d)).join(', ')}; ask again with the directory name`,
        )
      }
      const dir = matches[0]
      const detail = dir ? await loadFeature(db, caller.projectId, dir) : null
      if (!detail) return failure(`no feature ${oneLine(id)} in flight or recently landed`)
      return text(document ? formatDocument(detail, document) : formatFeature(detail, board))
    },
  )
  return server
})

// Auth (401/403/404) runs before any MCP processing: the SDK verifies nothing itself.
export const mcpRoutes = new Hono<AppEnv>().all('/:slug', requireToken('read'), requireMember(), (c) =>
  mcp.fetch(c.req.raw, {
    authInfo: {
      token: '',
      clientId: c.var.userId,
      scopes: ['hub:read'],
      extra: {
        projectId: c.var.project.id,
        projectSlug: c.var.project.slug,
        numbering: c.var.project.numbering,
        userId: c.var.userId,
      } satisfies Caller,
    },
  }),
)
