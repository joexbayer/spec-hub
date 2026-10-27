// Server-only: uses node:crypto. The web app must not import this module.
import { createHash } from 'node:crypto'

export type ObjectFormat = 'sha1' | 'sha256'

/** Git blob object id of `bytes`: hash("blob <len>\0" + bytes). */
export function gitBlobId(bytes: Uint8Array, format: ObjectFormat): string {
  return createHash(format).update(`blob ${bytes.byteLength}\0`).update(bytes).digest('hex')
}
