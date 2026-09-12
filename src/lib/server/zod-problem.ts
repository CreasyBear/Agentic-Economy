import { ZodError } from 'zod'

import type { ProblemInput } from '@/lib/errors'

/**
 * Structural shape of a zod 4 `ZodError`. Server functions can lose the
 * `ZodError` prototype crossing a serialization boundary (e.g. an RPC/worker
 * hop), so detection prefers this structural check over `instanceof`.
 */
type ZodErrorLike = { issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }> }

function isZodErrorLike(error: unknown): error is ZodErrorLike {
  return typeof error === 'object' && error !== null && Array.isArray((error as { issues?: unknown }).issues)
}

/**
 * Maps every zod issue to an RFC 9457 `invalid-params` entry. Returns
 * `undefined` when `error` is not zod-shaped, so callers can fall through to
 * generic error handling.
 */
export function invalidParamsFromZodError(error: unknown): ReadonlyArray<{ name: string; reason: string }> | undefined {
  if (!(error instanceof ZodError) && !isZodErrorLike(error)) return undefined
  const issues = (error as ZodErrorLike).issues
  return issues.map((issue) => ({
    name: issue.path.length > 0 ? issue.path.map(String).join('.') : 'root',
    reason: issue.message,
  }))
}

/**
 * Builds a 400-class {@link ProblemInput} carrying `invalidParams` from a
 * caught validation error. `fallback` supplies the route's kind/code/detail;
 * only `invalidParams` is added. Returns `undefined` when `error` is not
 * zod-shaped, so callers keep their existing generic error handling.
 */
export function problemFromZodError(
  error: unknown,
  fallback: Omit<ProblemInput, 'invalidParams'>,
): ProblemInput | undefined {
  const invalidParams = invalidParamsFromZodError(error)
  if (invalidParams === undefined) return undefined
  return { ...fallback, invalidParams }
}
