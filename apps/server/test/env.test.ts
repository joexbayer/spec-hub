import { describe, expect, it } from 'vitest'
import { parseEnv } from '../src/env-schema.ts'

const valid = {
  DATABASE_URL: 'postgres://localhost/hub',
  PUBLIC_URL: 'http://localhost:5173/',
  BETTER_AUTH_SECRET: 'a'.repeat(32),
  GITHUB_CLIENT_ID: 'id',
  GITHUB_CLIENT_SECRET: 'secret',
  SPEC_HUB_ADMINS: '583231, 1001 ,',
}

describe('parseEnv', () => {
  it('parses a valid localhost config', () => {
    const env = parseEnv(valid)
    expect(env.PUBLIC_URL).toBe('http://localhost:5173')
    expect(env.SPEC_HUB_ADMINS).toEqual(['583231', '1001'])
    expect(env.PORT).toBe(3000)
    expect(env.GITHUB_API_URL).toBe('https://api.github.com')
    expect(parseEnv({ ...valid, GITHUB_API_URL: 'http://github.test/' }).GITHUB_API_URL).toBe(
      'http://github.test',
    )
  })

  it('rejects a 31-char secret without leaking it', () => {
    const secret = 'sekrit'.padEnd(31, 'x')
    expect(() => parseEnv({ ...valid, BETTER_AUTH_SECRET: secret })).toThrow(
      /BETTER_AUTH_SECRET: must be at least 32 characters/,
    )
    try {
      parseEnv({ ...valid, BETTER_AUTH_SECRET: secret })
    } catch (err) {
      expect((err as Error).message).not.toContain(secret)
    }
  })

  it('rejects http for a non-local host, accepts https', () => {
    expect(() => parseEnv({ ...valid, PUBLIC_URL: 'http://hub.example.com' })).toThrow(
      /PUBLIC_URL: must be https unless localhost/,
    )
    expect(parseEnv({ ...valid, PUBLIC_URL: 'https://hub.example.com' }).PUBLIC_URL).toBe(
      'https://hub.example.com',
    )
  })

  it('takes hub admins as numeric GitHub account ids, not logins', () => {
    expect(parseEnv({ ...valid, SPEC_HUB_ADMINS: '' }).SPEC_HUB_ADMINS).toEqual([])
    for (const bad of ['octocat', '583231,alice', '-1', '0012']) {
      expect(() => parseEnv({ ...valid, SPEC_HUB_ADMINS: bad })).toThrow(/SPEC_HUB_ADMINS: must be numeric/)
    }
  })

  it('names a missing variable', () => {
    const { GITHUB_CLIENT_ID: _omit, ...rest } = valid
    expect(() => parseEnv(rest)).toThrow(/GITHUB_CLIENT_ID/)
  })

  it('reads an optional TRUSTED_IP_HEADER as a lowercase header name', () => {
    expect(parseEnv(valid).TRUSTED_IP_HEADER).toBeUndefined()
    expect(parseEnv({ ...valid, TRUSTED_IP_HEADER: '' }).TRUSTED_IP_HEADER).toBeUndefined()
    expect(parseEnv({ ...valid, TRUSTED_IP_HEADER: ' X-Real-IP ' }).TRUSTED_IP_HEADER).toBe('x-real-ip')
    expect(() => parseEnv({ ...valid, TRUSTED_IP_HEADER: 'x real ip' })).toThrow(/TRUSTED_IP_HEADER/)
  })
})
