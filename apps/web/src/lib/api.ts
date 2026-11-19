export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new ApiError(res.status, body?.error ?? res.statusText)
  }
  return (await res.json()) as T
}

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
  return err instanceof Error ? err.message : 'Something went wrong'
}
