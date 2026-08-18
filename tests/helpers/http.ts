import { expect } from 'vitest'

export function postJsonRequest(path: string, body: unknown): Request {
  return new Request(`https://ae.test${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function expectQuarantineWriteFrozen(response: Response, actionId?: string) {
  expect(response.status).toBe(403)
  expect(response.status).not.toBe(410)
  expect(response.headers.get('content-type')).toBe('application/problem+json')
  const body = await response.json() as Record<string, unknown>
  expect(body).toMatchObject({
    type: 'about:blank',
    status: 403,
    kind: 'FAILED_PRECONDITION',
    code: 'quarantine_writes_frozen',
    retryable: false,
    ...(actionId === undefined ? {} : { instance: actionId }),
  })
  return body
}
