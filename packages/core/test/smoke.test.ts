import { describe, expect, it } from 'vitest'
import * as core from '../src/index.ts'

describe('@spec-hub/core', () => {
  it('loads the package entry point', () => {
    expect(core).toBeTypeOf('object')
  })
})
