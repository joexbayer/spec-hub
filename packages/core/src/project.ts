import { z } from 'zod'

// The project fields as the API accepts them; the server validates with these and the web
// forms check with the same schema, so a value the form allows is a value the hub takes.

export const projectSlug = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{1,62}$/, 'Use 2-63 lowercase letters, digits or dashes')

export const projectName = z.string().min(1, 'Required').max(100, 'At most 100 characters')

/** A branch name git accepts (the check-ref-format rules a project's default branch can hit). */
export const refName = z
  .string()
  .min(1, 'Required')
  .max(255, 'At most 255 characters')
  .refine(
    (s) =>
      !/[\s~^:?*[\\]|\.\.|^-|\/$|\.lock$|^@$/.test(s) &&
      ![...s].some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127),
    'Not a valid branch name',
  )

export const numbering = z.enum(['sequential', 'timestamp'])

export const projectFields = z.object({
  slug: projectSlug,
  name: projectName,
  defaultBranch: refName,
  numbering,
  sharePushedBranches: z.boolean(),
})
export type ProjectFields = z.infer<typeof projectFields>

export const projectSettings = projectFields.omit({ slug: true })
export type ProjectSettings = z.infer<typeof projectSettings>
