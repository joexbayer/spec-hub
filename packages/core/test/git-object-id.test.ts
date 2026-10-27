import { describe, expect, test } from 'vitest'
import { gitBlobId } from '../src/git-object-id.ts'

// Expected ids come from real git: `printf <input> | git hash-object --stdin`
// (sha1: `git init`; sha256: `git init --object-format=sha256`, run inside that repo).
const enc = new TextEncoder()
const cases: { name: string; bytes: Uint8Array; sha1: string; sha256: string }[] = [
  {
    name: "printf ''",
    bytes: new Uint8Array(),
    sha1: 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391',
    sha256: '473a0f4c3be8a93681a267e3b1e9a7dcda1185436fe141f7749120a303721813',
  },
  {
    name: "printf 'hello\\n'",
    bytes: enc.encode('hello\n'),
    sha1: 'ce013625030ba8dba906f756967f9e9ca394464a',
    sha256: '2cf8d83d9ee29543b34a87727421fdecb7e3f3a183d337639025de576db9ebb4',
  },
  {
    name: "printf 'blåbærsyltetøy — 日本\\n'",
    bytes: enc.encode('blåbærsyltetøy — 日本\n'),
    sha1: 'eb26bfcadd065e2750bf3d8e8e85e1b41bb205c8',
    sha256: '50b7c8b53f2acd54bb4639b166cb12710c27a0c6c6a423705740f8e45d64dc59',
  },
  {
    name: "printf '\\x00\\xff\\x10\\x80'",
    bytes: new Uint8Array([0x00, 0xff, 0x10, 0x80]),
    sha1: 'ce689bca859014f7d170628ed5202c1b513904d5',
    sha256: '625bb40ecfd836a636824cc21ca3da05940370546fe242eb4f29b90fc9b5a04b',
  },
]

describe('gitBlobId', () => {
  test.each(cases)('matches git for $name', ({ bytes, sha1, sha256 }) => {
    expect(gitBlobId(bytes, 'sha1')).toBe(sha1)
    expect(gitBlobId(bytes, 'sha256')).toBe(sha256)
  })
})
