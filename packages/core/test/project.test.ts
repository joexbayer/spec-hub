import { describe, expect, it } from 'vitest'
import { projectSettings } from '../src/project.ts'

const base = { name: 'Demo', defaultBranch: 'main', numbering: 'sequential' as const }

describe('projectSettings.sharePushedBranches', () => {
  it('accepts a boolean', () => {
    expect(projectSettings.safeParse({ ...base, sharePushedBranches: true }).success).toBe(true)
    expect(projectSettings.safeParse({ ...base, sharePushedBranches: false }).success).toBe(true)
  })

  it('rejects a non-boolean or a missing value', () => {
    expect(projectSettings.safeParse({ ...base, sharePushedBranches: 'yes' }).success).toBe(false)
    expect(projectSettings.safeParse(base).success).toBe(false)
  })
})
