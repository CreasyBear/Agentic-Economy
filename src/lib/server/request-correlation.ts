import { AsyncLocalStorage } from 'node:async_hooks'

export const REQUEST_CORRELATION_HEADER = 'X-AE-Request-Id'
const CORRELATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u

export type RequestCorrelation = Readonly<{
  correlationId: string
}>

type RequestCorrelationCallback<T> = (correlation: RequestCorrelation) => T | PromiseLike<T>

const correlationStorage = new AsyncLocalStorage<RequestCorrelation>()

export function readRequestCorrelationId(request: Pick<Request, 'headers'>): string {
  const incoming = request.headers.get('x-ae-request-id')?.trim()
  return incoming !== undefined && CORRELATION_ID_PATTERN.test(incoming)
    ? incoming
    : globalThis.crypto.randomUUID()
}

export function runWithRequestCorrelation<T>(
  request: Pick<Request, 'headers'>,
  callback: RequestCorrelationCallback<T>,
): T | PromiseLike<T> {
  const current = correlationStorage.getStore()
  if (current !== undefined) return callback(current)
  const correlation = { correlationId: readRequestCorrelationId(request) } satisfies RequestCorrelation
  return correlationStorage.run(correlation, () => callback(correlation))
}

export function currentRequestCorrelation(): RequestCorrelation | undefined {
  return correlationStorage.getStore()
}

export function currentRequestCorrelationId(): string | undefined {
  return correlationStorage.getStore()?.correlationId
}

export function withRequestCorrelationHeader(
  response: Response,
  correlationId = currentRequestCorrelationId(),
): Response {
  if (correlationId === undefined) return response
  const headers = new Headers(response.headers)
  headers.set(REQUEST_CORRELATION_HEADER, correlationId)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
