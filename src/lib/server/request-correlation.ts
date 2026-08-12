import { isRedirect } from '@tanstack/react-router'
import { getRequest } from '@tanstack/react-start/server'

export const REQUEST_CORRELATION_HEADER = 'X-AE-Request-Id'
const CORRELATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u

export type RequestCorrelation = Readonly<{
  correlationId: string
}>

type RequestCorrelationCallback<T> = (correlation: RequestCorrelation) => T | PromiseLike<T>

const correlationsByRequest = new WeakMap<object, RequestCorrelation>()

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
  const current = correlationsByRequest.get(request)
  if (current !== undefined) return callback(current)
  const correlation = { correlationId: readRequestCorrelationId(request) } satisfies RequestCorrelation
  correlationsByRequest.set(request, correlation)
  return callback(correlation)
}

export function currentRequestCorrelation(): RequestCorrelation | undefined {
  try {
    return correlationsByRequest.get(getRequest())
  } catch {
    return undefined
  }
}

export function currentRequestCorrelationId(): string | undefined {
  return currentRequestCorrelation()?.correlationId
}

export function withRequestCorrelationHeader(
  response: Response,
  correlationId = currentRequestCorrelationId(),
): Response {
  if (correlationId === undefined) return response
  if (isRedirect(response)) {
    response.headers.set(REQUEST_CORRELATION_HEADER, correlationId)
    return response
  }
  const headers = new Headers(response.headers)
  headers.set(REQUEST_CORRELATION_HEADER, correlationId)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
