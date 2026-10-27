import { Hono } from 'hono'
import { afterEach, describe, expect, it, vi } from 'vitest'

const verifyApiKey = vi.fn()
vi.mock('../src/auth/auth.ts', () => ({ auth: { api: { verifyApiKey } } }))

const dbQuery = vi.fn(async () => ({}))
vi.mock('../src/db/client.ts', () => ({ db: {}, pool: { query: dbQuery } }))

const { requireToken } = await import('../src/auth/bearer.ts')

const FAKE = 'sh_THISISAFAKEKEYVALUE123'
const app = new Hono().get('/p/:slug/x', requireToken('report'), (c) => c.json({ ok: true }))

afterEach(() => {
  vi.restoreAllMocks()
  dbQuery.mockReset()
  dbQuery.mockImplementation(async () => ({}))
})

describe('bearer rejection logging', () => {
  it('logs a missing token as auth_rejected/missing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const res = await app.request('/p/demo/x')
    expect(res.status).toBe(401)
    expect(warn).toHaveBeenCalledOnce()
    expect(JSON.parse(String(warn.mock.calls[0]?.[0]))).toMatchObject({
      event: 'auth_rejected',
      reason: 'missing',
      route: '/p/:slug/x',
      project: 'demo',
    })
  })

  it('logs an invalid key without the key value', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    verifyApiKey.mockResolvedValue({ valid: false, error: { code: 'INVALID_API_KEY' }, key: null })
    const res = await app.request('/p/demo/x', { headers: { authorization: `Bearer ${FAKE}` } })
    expect(res.status).toBe(401)
    expect(JSON.parse(String(warn.mock.calls[0]?.[0])).reason).toBe('invalid')
    for (const call of warn.mock.calls) expect(JSON.stringify(call)).not.toContain(FAKE)
  })

  it('fails closed with 500 when verification fails for a reason other than the key', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    verifyApiKey.mockResolvedValue({ valid: false, error: { code: 'INTERNAL_SERVER_ERROR' }, key: null })
    const res = await app.request('/p/demo/x', { headers: { authorization: `Bearer ${FAKE}` } })
    expect(res.status).toBe(500)
    expect(JSON.parse(String(error.mock.calls[0]?.[0]))).toMatchObject({
      event: 'auth_error',
      code: 'INTERNAL_SERVER_ERROR',
    })
    for (const call of error.mock.calls) expect(JSON.stringify(call)).not.toContain(FAKE)
  })

  it('answers 500, not 401, when the database is down (the plugin reports that as INVALID_API_KEY)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    verifyApiKey.mockResolvedValue({ valid: false, error: { code: 'INVALID_API_KEY' }, key: null })
    dbQuery.mockRejectedValue(new Error('connection refused'))
    const res = await app.request('/p/demo/x', { headers: { authorization: `Bearer ${FAKE}` } })
    expect(res.status).toBe(500)
  })
})
