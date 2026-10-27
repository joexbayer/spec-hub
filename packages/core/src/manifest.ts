import { z } from 'zod'

export const MAX_MANIFEST_BYTES = 1024 * 1024
export const MAX_DOCUMENT_BYTES = 512 * 1024

export const Oid = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/)

const Name = z.string().min(1).max(255)
// biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control characters is the point
const DirName = z.string().regex(/^[^/\u0000-\u001f]{1,255}$/)
const Email = z.string().max(320)
const DAY_SECONDS = 24 * 60 * 60
// Bounded by the clock at parse time, so a far-future time cannot pin a clone or the default branch.
const UnixTime = z
  .number()
  .int()
  .nonnegative()
  .refine((t) => t <= Date.now() / 1000 + DAY_SECONDS, 'must not be more than a day in the future')
const UnixTimeMs = z
  .number()
  .int()
  .nonnegative()
  .refine((t) => t <= Date.now() + DAY_SECONDS * 1000, 'must not be more than a day in the future')

export const DocRef = z
  .object({
    oid: Oid,
    size: z
      .number()
      .int()
      .nonnegative()
      .max(2 ** 31 - 1),
  })
  .strict()
  .nullable()
export type DocRef = z.infer<typeof DocRef>

const Feature = z
  .object({
    dir: DirName,
    lastChangeAt: UnixTime,
    author: z.object({ name: Name, email: Email }).strict().nullable(),
    docs: z.object({ spec: DocRef, plan: DocRef, tasks: DocRef }).strict(),
  })
  .strict()

const Branch = z
  .object({
    name: Name,
    tip: Oid,
    tipAt: UnixTime,
    pushed: z.boolean(),
    features: z.array(Feature).max(200),
  })
  .strict()

const DefaultBranch = z
  .object({
    branch: Name,
    tip: Oid,
    tipAt: UnixTime,
    dirs: z.array(DirName).max(5000),
  })
  .strict()
  .nullable()

export const ReportManifest = z
  .object({
    cloneId: z.uuid(),
    generatedAt: UnixTimeMs,
    commitEmail: Email,
    objectFormat: z.enum(['sha1', 'sha256']),
    default: DefaultBranch,
    branches: z.array(Branch).max(500),
  })
  .strict()
  .superRefine((m, ctx) => {
    const len = m.objectFormat === 'sha1' ? 40 : 64
    const check = (oid: string, path: (string | number)[]) => {
      if (oid.length !== len) {
        ctx.addIssue({ code: 'custom', message: `oid must be ${len} hex chars for ${m.objectFormat}`, path })
      }
    }
    if (m.default) check(m.default.tip, ['default', 'tip'])
    const names = new Set<string>()
    m.branches.forEach((b, bi) => {
      check(b.tip, ['branches', bi, 'tip'])
      if (names.has(b.name))
        ctx.addIssue({ code: 'custom', message: 'duplicate branch name', path: ['branches', bi, 'name'] })
      names.add(b.name)
      const dirs = new Set<string>()
      b.features.forEach((f, fi) => {
        if (dirs.has(f.dir)) {
          ctx.addIssue({
            code: 'custom',
            message: 'duplicate feature dir',
            path: ['branches', bi, 'features', fi, 'dir'],
          })
        }
        dirs.add(f.dir)
      })
      b.features.forEach((f, fi) => {
        for (const k of ['spec', 'plan', 'tasks'] as const) {
          const d = f.docs[k]
          if (d) check(d.oid, ['branches', bi, 'features', fi, 'docs', k, 'oid'])
        }
      })
    })
  })
export type ReportManifest = z.infer<typeof ReportManifest>
export type ManifestBranch = ReportManifest['branches'][number]
export type ManifestFeature = ManifestBranch['features'][number]

export function uploadableOids(m: ReportManifest, maxBytes = MAX_DOCUMENT_BYTES): string[] {
  const seen = new Set<string>()
  for (const b of m.branches) {
    for (const f of b.features) {
      for (const d of [f.docs.spec, f.docs.plan, f.docs.tasks]) {
        if (d && d.size <= maxBytes) seen.add(d.oid)
      }
    }
  }
  return [...seen]
}
