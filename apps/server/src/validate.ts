import { zValidator } from '@hono/zod-validator'
import type { ValidationTargets } from 'hono'
import type { ZodType } from 'zod'

// Validation failures are thrown so app.onError maps the ZodError to 422 (zValidator answers 400 itself).
export const zv = <T extends keyof ValidationTargets, S extends ZodType>(target: T, schema: S) =>
  zValidator(target, schema, (r) => {
    if (!r.success) throw r.error
  })
