import type { CallToolResult, ServerContext } from '@modelcontextprotocol/server'
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import type { Numbering } from '@spec-hub/core'
import { featureNumber } from '@spec-hub/core'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../app-env.ts'
import { requireMember, requireToken } from '../auth/bearer.ts'
import { db } from '../db/client.ts'
import { loadBoard, loadFeature } from '../services/board-query.ts'
import { ask, loadQueueView, poll, unlock, withQueue } from '../services/landing.ts'
import {
  formatBoard,
  formatDocument,
  formatFeature,
  formatLanding,
  formatLock,
  formatUnlock,
  noticePrefix,
  oneLine,
} from './format.ts'

type Caller = {
  projectId: string
  projectSlug: string
  defaultBranch: string
  numbering: Numbering
  userId: string
}

const text = (t: string): CallToolResult => ({ content: [{ type: 'text', text: t }] })
const failure = (t: string): CallToolResult => ({ content: [{ type: 'text', text: t }], isError: true })

// A failing tool answers with a fixed text; the log line has the tool and the first message line,
// never params (a failed query's params can hold secrets).
export function guarded<A extends unknown[]>(tool: string, fn: (...args: A) => Promise<CallToolResult>) {
  return async (...args: A): Promise<CallToolResult> => {
    try {
      return await fn(...args)
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err))
      console.error(
        JSON.stringify({
          event: 'mcp_tool_error',
          tool,
          error: e.name,
          message: e.message.split('\n', 1)[0],
        }),
      )
      return failure('internal error')
    }
  }
}

// The lock tools change only landing-queue state; nothing here can approve or object (constitution Art. 4.1).
const mcp = createMcpHandler(({ authInfo }) => {
  const caller = authInfo?.extra as Caller
  const server = new McpServer({ name: 'spec-hub', version: '0.1.0' })

  server.registerTool(
    'board',
    {
      description: 'What the team is working on: one line per in-flight feature, newest change first.',
      annotations: { readOnlyHint: true },
    },
    guarded('board', async () =>
      text(formatBoard(caller.projectSlug, await loadBoard(db, caller.projectId))),
    ),
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
    guarded('feature', async ({ id, document }: { id: string; document?: 'spec' | 'plan' | 'tasks' }) => {
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
    }),
  )

  const landCaller = {
    project: { id: caller.projectId, defaultBranch: caller.defaultBranch },
    userId: caller.userId,
  }

  server.registerTool(
    'land_lock',
    {
      description:
        "Ask for this project's landing lock before you rebase, run the pre-land gate and land. If you hold it, go ahead and call land_unlock when done. If not, call land_lock again until you hold it; each call waits up to 25 seconds. The lock opens by itself 60 minutes after your last call.",
    },
    guarded('land_lock', async (ctx: ServerContext) =>
      text(
        formatLock(await ask(db, landCaller, undefined, undefined, ctx.mcpReq.signal), caller.defaultBranch),
      ),
    ),
  )

  server.registerTool(
    'landing',
    {
      description:
        "Who holds this project's landing lock and who is waiting, with estimates. Read-only; use land_lock to ask for the lock.",
      annotations: { readOnlyHint: true },
    },
    // Any call is a check-in for a caller with a live place; this one never joins.
    guarded('landing', async () => {
      const s = await poll(db, landCaller, false)
      const view = await withQueue(db, caller.projectId, (tx, now) =>
        loadQueueView(tx, caller.projectId, caller.userId, now),
      )
      return text(`${noticePrefix(s.notice)}${formatLanding(view, caller.defaultBranch)}`)
    }),
  )

  server.registerTool(
    'land_unlock',
    {
      description:
        'Open the landing lock when you have landed (landed: true) or given up (landed: false). Also leaves the queue if you are still waiting.',
      annotations: { destructiveHint: false },
      inputSchema: z.object({
        landed: z
          .boolean()
          .describe(
            'true if your change landed; false if you gave up. Only landed turns count for wait estimates.',
          ),
      }),
    },
    guarded('land_unlock', async ({ landed }: { landed: boolean }) =>
      text(formatUnlock(await unlock(db, landCaller, landed))),
    ),
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
        defaultBranch: c.var.project.defaultBranch,
        numbering: c.var.project.numbering,
        userId: c.var.userId,
      } satisfies Caller,
    },
  }),
)
