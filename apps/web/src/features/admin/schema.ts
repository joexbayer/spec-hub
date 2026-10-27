import { z } from 'zod'

// Mirrors apps/server/src/routes/projects.ts
export const projectFormSchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/, 'Use 2-63 lowercase letters, digits or dashes'),
  name: z.string().min(1, 'Required').max(100, 'At most 100 characters'),
  defaultBranch: z.string().min(1, 'Required').max(255, 'At most 255 characters'),
  numbering: z.enum(['sequential', 'timestamp']),
})
export type ProjectForm = z.infer<typeof projectFormSchema>

export const settingsSchema = projectFormSchema.omit({ slug: true })
export type SettingsForm = z.infer<typeof settingsSchema>
