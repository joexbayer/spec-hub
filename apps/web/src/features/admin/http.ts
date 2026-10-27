import { ApiError, json } from '@/lib/api'

// Same-origin JSON request; the browser adds Origin, which the hub checks on mutations.
export function send(method: string, url: string, body?: unknown): Promise<Response> {
  return fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export async function getJson<T>(url: string): Promise<T> {
  return json<T>(await fetch(url, { credentials: 'same-origin' }))
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message
  return err instanceof Error ? err.message : 'Something went wrong'
}
