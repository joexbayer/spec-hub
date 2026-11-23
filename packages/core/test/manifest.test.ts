import { describe, expect, it } from 'vitest'
import { MAX_DOCUMENT_BYTES, ReportManifest, uploadableOids } from '../src/manifest.ts'

const h = (c: string, n = 40) => c.repeat(n)

function fixture(): ReportManifest {
  return {
    cloneId: '0b6f2f0e-5b1a-4c3e-8f4a-0d9d3c7a1b2c',
    generatedAt: 1793001234567,
    commitEmail: 'joe@example.com',
    objectFormat: 'sha1',
    default: { branch: 'main', tip: h('5'), tipAt: 1792990000, dirs: ['001-foo', '002-bar'] },
    branches: [
      {
        name: '112-team-board',
        tip: h('9'),
        tipAt: 1793001200,
        pushed: false,
        features: [
          {
            dir: '112-team-board',
            lastChangeAt: 1793001200,
            author: { name: 'Joe', email: 'joe@example.com' },
            docs: { spec: { oid: h('a'), size: 14211 }, plan: null, tasks: null },
          },
        ],
      },
    ],
  }
}

const ok = (m: unknown) => ReportManifest.safeParse(m).success

describe('ReportManifest', () => {
  it('accepts a valid manifest and a null default', () => {
    expect(ok(fixture())).toBe(true)
    expect(ok({ ...fixture(), default: null })).toBe(true)
  })

  it('accepts remote: true on a branch, rejects remote: false, accepts it absent', () => {
    const m = fixture()
    const b = m.branches[0]
    if (!b) throw new Error('fixture')
    expect(ok({ ...m, branches: [{ ...b, remote: true }] })).toBe(true)
    expect(ok({ ...m, branches: [{ ...b, remote: false }] })).toBe(false)
    expect(ok(m)).toBe(true)
  })

  it('rejects over-limit collections', () => {
    const m = fixture()
    const b = m.branches[0]
    if (!b) throw new Error('fixture')
    expect(ok({ ...m, branches: Array.from({ length: 501 }, () => b) })).toBe(false)
    expect(
      ok({ ...m, branches: [{ ...b, features: Array.from({ length: 201 }, () => b.features[0]) }] }),
    ).toBe(false)
    expect(ok({ ...m, default: { ...m.default, dirs: Array.from({ length: 5001 }, () => 'd') } })).toBe(false)
  })

  it('rejects over-long strings', () => {
    const m = fixture()
    const b = m.branches[0]
    if (!b) throw new Error('fixture')
    expect(ok({ ...m, branches: [{ ...b, name: 'x'.repeat(256) }] })).toBe(false)
    expect(ok({ ...m, commitEmail: 'e'.repeat(321) })).toBe(false)
    expect(ok({ ...m, commitEmail: 'e'.repeat(320) })).toBe(true)
  })

  it('rejects bad oids', () => {
    const m = fixture()
    const b = m.branches[0]
    if (!b) throw new Error('fixture')
    expect(ok({ ...m, branches: [{ ...b, tip: h('A') }] })).toBe(false)
    expect(ok({ ...m, branches: [{ ...b, tip: h('a', 39) }] })).toBe(false)
    expect(ok({ ...m, branches: [{ ...b, tip: h('a', 64) }] })).toBe(false)
    expect(ok({ ...m, objectFormat: 'sha256' })).toBe(false)
  })

  it('rejects times more than a day in the future, accepts up to a day', () => {
    const m = fixture()
    const b = m.branches[0]
    const f = b?.features[0]
    if (!b || !f) throw new Error('fixture')
    const nowS = Math.floor(Date.now() / 1000)
    const DAY = 24 * 60 * 60
    expect(ok({ ...m, generatedAt: Date.now() + DAY * 1000 - 60_000 })).toBe(true)
    expect(ok({ ...m, generatedAt: Date.now() + DAY * 1000 + 60_000 })).toBe(false)
    expect(ok({ ...m, branches: [{ ...b, tipAt: nowS + DAY - 60 }] })).toBe(true)
    expect(ok({ ...m, branches: [{ ...b, tipAt: nowS + DAY + 60 }] })).toBe(false)
    expect(ok({ ...m, branches: [{ ...b, features: [{ ...f, lastChangeAt: nowS + DAY + 60 }] }] })).toBe(
      false,
    )
    expect(ok({ ...m, default: { ...m.default, tipAt: nowS + DAY + 60 } })).toBe(false)
  })

  it('caps document sizes at 2^31-1', () => {
    const m = fixture()
    const b = m.branches[0]
    const f = b?.features[0]
    if (!b || !f) throw new Error('fixture')
    const withSize = (size: number) => ({
      ...m,
      branches: [{ ...b, features: [{ ...f, docs: { ...f.docs, spec: { oid: h('a'), size } } }] }],
    })
    expect(ok(withSize(2 ** 31 - 1))).toBe(true)
    expect(ok(withSize(2 ** 31))).toBe(false)
  })

  it('rejects duplicate branch names and duplicate dirs within a branch', () => {
    const m = fixture()
    const b = m.branches[0]
    const f = b?.features[0]
    if (!b || !f) throw new Error('fixture')
    expect(ok({ ...m, branches: [b, { ...b }] })).toBe(false)
    expect(ok({ ...m, branches: [b, { ...b, name: 'other' }] })).toBe(true)
    expect(ok({ ...m, branches: [{ ...b, features: [f, { ...f }] }] })).toBe(false)
  })

  it('rejects dir names with a slash and unknown keys', () => {
    const m = fixture()
    expect(ok({ ...m, default: { ...m.default, dirs: ['a/b'] } })).toBe(false)
    expect(ok({ ...m, extra: 1 })).toBe(false)
  })
})

describe('uploadableOids', () => {
  it('de-duplicates and skips oversize docs', () => {
    const m = fixture()
    const f = m.branches[0]?.features[0]
    if (!f) throw new Error('fixture')
    f.docs.plan = { oid: h('a'), size: 1 }
    f.docs.tasks = { oid: h('b'), size: MAX_DOCUMENT_BYTES + 1 }
    m.branches.push({
      ...m.branches[0],
      name: 'other',
      features: [
        { ...f, docs: { spec: { oid: h('c'), size: MAX_DOCUMENT_BYTES }, plan: null, tasks: null } },
      ],
    } as never)
    expect(uploadableOids(m)).toEqual([h('a'), h('c')])
  })
})

describe('default.features', () => {
  const feature = (dir: string, over: Record<string, unknown> = {}) => ({
    dir,
    addedAt: 1792000000,
    lastChangeAt: 1792990000,
    author: { name: 'Joe', email: 'joe@example.com' },
    docs: { spec: { oid: h('b'), size: 10 }, plan: null, tasks: null },
    ...over,
  })
  const withFeatures = (features: unknown[]) => {
    const m = fixture()
    if (m.default) (m.default as { features?: unknown[] }).features = features
    return m
  }

  it('parses without and with features', () => {
    expect(ok(fixture())).toBe(true)
    expect(ok(withFeatures([feature('001-foo'), feature('002-bar')]))).toBe(true)
  })

  it('rejects a duplicate dir', () => {
    expect(ok(withFeatures([feature('001-foo'), feature('001-foo')]))).toBe(false)
  })

  it('rejects more than 2000 entries', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => feature(`f${i}`))
    expect(ok(withFeatures(many(2000)))).toBe(true)
    expect(ok(withFeatures(many(2001)))).toBe(false)
  })

  it('rejects a wrong-length oid in a default doc', () => {
    expect(
      ok(
        withFeatures([
          feature('001-foo', { docs: { spec: { oid: h('b', 64), size: 1 }, plan: null, tasks: null } }),
        ]),
      ),
    ).toBe(false)
  })

  it('rejects addedAt more than a day in the future', () => {
    expect(
      ok(withFeatures([feature('001-foo', { addedAt: Math.floor(Date.now() / 1000) + 2 * 86400 })])),
    ).toBe(false)
  })

  it('uploadableOids includes default docs, dedupes against branch docs, skips oversize', () => {
    const doc = (c: string, size: number) => ({ oid: h(c), size })
    const m = withFeatures([
      feature('001-foo', {
        docs: { spec: doc('a', 14211), plan: doc('c', 5), tasks: doc('d', MAX_DOCUMENT_BYTES + 1) },
      }),
    ])
    expect(uploadableOids(m).sort()).toEqual([h('a'), h('c')])
  })
})

describe('extra documents', () => {
  const extra = (name: string, oid = h('e'), size = 10) => ({ name, oid, size })
  const branchWith = (extras: unknown[]) => {
    const m = fixture()
    const f = m.branches[0]?.features[0]
    if (!f) throw new Error('fixture')
    ;(f as { extra?: unknown[] }).extra = extras
    return m
  }
  const defaultWith = (extras: unknown[]) => {
    const m = fixture()
    if (m.default) {
      ;(m.default as { features?: unknown[] }).features = [
        {
          dir: '001-foo',
          addedAt: 1792000000,
          lastChangeAt: 1792990000,
          author: null,
          docs: { spec: null, plan: null, tasks: null },
          extra: extras,
        },
      ]
    }
    return m
  }

  it('parses on branch and default features; absent still parses', () => {
    expect(ok(branchWith([extra('preview.md')]))).toBe(true)
    expect(ok(defaultWith([extra('preview.md')]))).toBe(true)
    expect(ok(fixture())).toBe(true)
  })

  it('rejects more than 5 entries', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => extra(`d${i}.md`))
    expect(ok(branchWith(many(5)))).toBe(true)
    expect(ok(branchWith(many(6)))).toBe(false)
    expect(ok(defaultWith(many(6)))).toBe(false)
  })

  it('rejects duplicate names', () => {
    expect(ok(branchWith([extra('a.md'), extra('a.md', h('f'))]))).toBe(false)
    expect(ok(defaultWith([extra('a.md'), extra('a.md', h('f'))]))).toBe(false)
  })

  it('rejects reserved and malformed names', () => {
    for (const n of ['spec.md', 'plan.md', 'tasks.md', '../x.md', 'a/b.md', '.hidden.md', 'x.txt']) {
      expect(ok(branchWith([extra(n)]))).toBe(false)
    }
  })

  it('rejects a wrong-length oid', () => {
    expect(ok(branchWith([extra('a.md', h('e', 64))]))).toBe(false)
    expect(ok(defaultWith([extra('a.md', h('e', 64))]))).toBe(false)
  })

  it('uploadableOids includes extras', () => {
    expect(uploadableOids(branchWith([extra('a.md', h('e'))]))).toContain(h('e'))
    expect(uploadableOids(defaultWith([extra('a.md', h('d'))]))).toContain(h('d'))
  })
})
