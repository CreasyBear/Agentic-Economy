import { expect } from 'vitest'

export function postJsonRequest(path: string, body: unknown): Request {
  return new Request(`https://ae.test${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export type ExpectedProblem = Readonly<{
  status: number
  kind?: string
  code?: string
  detailSubstring?: string
}>

export async function expectProblem(
  response: Response,
  expected: ExpectedProblem,
): Promise<Record<string, unknown>> {
  expect(response.status).toBe(expected.status)
  expect(response.headers.get('content-type')).toContain('application/problem+json')
  const body = (await response.json()) as Record<string, unknown>
  expect(body).toMatchObject({
    status: expected.status,
    ...(expected.kind === undefined ? {} : { kind: expected.kind }),
    ...(expected.code === undefined ? {} : { code: expected.code }),
  })
  expect(typeof body.detail === 'string' && body.detail.length > 0).toBe(true)
  if (expected.detailSubstring !== undefined) {
    expect(body.detail).toContain(expected.detailSubstring)
  }
  return body
}

export async function expectQuarantineWriteFrozen(response: Response, actionId?: string) {
  expect(response.status).toBe(410)
  expect(response.headers.get('content-type')).toBe('application/problem+json')
  const body = await response.json() as Record<string, unknown>
  expect(body).toMatchObject({
    type: 'about:blank',
    status: 410,
    kind: 'NOT_FOUND',
    code: 'quarantine_surface_retired',
    retryable: false,
    ...(actionId === undefined ? {} : { instance: actionId }),
  })
  return body
}
