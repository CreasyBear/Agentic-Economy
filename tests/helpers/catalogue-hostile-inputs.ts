import { expect } from 'vitest'

/**
 * Shared hostile-input fixtures for the catalogue read routes
 * (`/api/v1/registry`, `/api/v1/market-tools/list`, `/api/v1/market-tools/search`,
 * `/api/businesses`). Kept as plain data + a shared problem-body assertion so
 * each route's test file can apply the same table against its own request
 * shape (query string vs JSON body) without duplicating the assertion logic.
 */

/** Limit values that must never be accepted as a valid page size. */
export const INVALID_LIMIT_STRINGS = [
  '0',
  '-5',
  '1.5',
  'NaN',
  'Infinity',
  '-Infinity',
  'not-a-number',
] as const

/** Cursor a route never issued; well-formed as a string, garbage as a cursor. */
export const MALFORMED_CURSOR = 'not-a-valid-cursor'

/** One character past the shared 512-byte cursor ceiling used by these routes. */
export const OVERSIZED_CURSOR = 'x'.repeat(513)

/**
 * 300 UTF-16 code units of emoji (150 astral code points, each a surrogate
 * pair). Exercises multi-byte truncation/boundary handling, not just ASCII
 * length limits.
 */
export const EMOJI_QUERY_300 = '\u{1F600}'.repeat(150)

export type ExpectedProblem = Readonly<{
  status: number
  kind?: string
  code?: string
}>

/**
 * Assert a response is an RFC 9457 `application/problem+json` body carrying
 * `status`, `kind`, `code`, and a non-empty `detail`. Returns the parsed body
 * so callers can additionally record/inspect the exact code observed.
 */
export async function expectProblemJson(
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
  return body
}
