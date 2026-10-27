import { existsSync, readdirSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { jsonRequest, request } from './helpers.ts'

describe('security headers', () => {
  for (const path of ['/healthz', '/api/auth/get-session', '/api/nope']) {
    it(`sets CSP and hardening headers on ${path}`, async () => {
      const res = await request(path)
      const csp = res.headers.get('content-security-policy') ?? ''
      expect(csp).toContain("default-src 'self'")
      expect(csp).toContain("frame-ancestors 'none'")
      expect(res.headers.get('x-content-type-options')).toBe('nosniff')
      expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
      expect(res.headers.get('x-frame-options')).toBe('DENY')
    })
  }
})

// The static files exist only after `pnpm --filter @spec-hub/web build`.
const publicDir = new URL('../public/', import.meta.url)
const built = existsSync(new URL('index.html', publicDir))
const asset =
  built && existsSync(new URL('assets/', publicDir))
    ? readdirSync(new URL('assets/', publicDir))[0]
    : undefined

describe('static cache headers', () => {
  it.skipIf(!built)('revalidates index.html and the SPA fallback, keeping security headers', async () => {
    for (const path of ['/', '/index.html', '/p/some-project/board']) {
      const res = await request(path)
      expect(res.status).toBe(200)
      expect(res.headers.get('cache-control')).toBe('no-cache')
      expect(res.headers.get('x-frame-options')).toBe('DENY')
    }
  })

  it.skipIf(!asset)('caches content-hashed assets as immutable', async () => {
    const res = await request(`/assets/${asset}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('sends no cache header on API errors', async () => {
    const res = await request('/api/nope')
    expect(res.status).toBe(404)
    expect(res.headers.get('cache-control')).toBeNull()
  })
})

describe('cookie flags', () => {
  it('marks the OAuth state cookie HttpOnly and SameSite=Lax (no Secure on http)', async () => {
    const res = await jsonRequest('/api/auth/sign-in/social', 'POST', {
      provider: 'github',
      callbackURL: '/',
    })
    const cookies = res.headers.getSetCookie()
    expect(cookies.length).toBeGreaterThan(0)
    for (const c of cookies) {
      expect(c).toMatch(/HttpOnly/i)
      expect(c).toMatch(/SameSite=Lax/i)
      // PUBLIC_URL is http://localhost in tests; Secure is expected only under https
      expect(c).not.toMatch(/;\s*Secure/i)
    }
  })
})

describe('OAuth callback failures', () => {
  it('logs the error code Better Auth redirects with, sanitised', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await request('/api/auth/callback/github?code=x&state=not-a-real-state')
    expect(res.status).toBe(302)
    const logged = warn.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('oauth_callback'))
    expect(logged).toHaveLength(1)
    const line = JSON.parse(logged[0] ?? '{}')
    expect(line).toMatchObject({ event: 'auth_error', reason: 'oauth_callback' })
    expect(line.code).toMatch(/^[a-zA-Z0-9_]{1,64}$/)
    vi.restoreAllMocks()
  })
})
