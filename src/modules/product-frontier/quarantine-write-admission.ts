import type { ProblemInput } from '@/lib/errors'

/**
 * Membership prefixes for `quarantineFamilies` in the product-frontier v2
 * manifest. HTTP/MCP family doors including inspect are 410 except
 * `inquiry.readCustomerRecord`. Server-fns stay 403 freeze. Never `/call`.
 */
export const QUARANTINE_FAMILY_ACTION_PREFIXES = [
  'customerRequest.',
  'inquiry.',
  'study.',
  'workTree.',
] as const

export const QUARANTINE_WRITES_FROZEN_CODE = 'quarantine_writes_frozen' as const
export const QUARANTINE_SURFACE_RETIRED_CODE = 'quarantine_surface_retired' as const
export const QUARANTINE_READ_KEEP_ACTION_ID = 'inquiry.readCustomerRecord' as const

export function isQuarantineFamilyActionId(actionId: string): boolean {
  return QUARANTINE_FAMILY_ACTION_PREFIXES.some((prefix) => actionId.startsWith(prefix))
}

export function isQuarantineWrite(actionId: string, readOnly: boolean): boolean {
  return isQuarantineFamilyActionId(actionId) && !readOnly
}

/** HTTP/MCP tombstone membership. Inquiry customer-record stays. */
export function isQuarantineSurfaceRetired(actionId: string): boolean {
  return isQuarantineFamilyActionId(actionId) && actionId !== QUARANTINE_READ_KEEP_ACTION_ID
}

export function quarantineWriteProblemInput(actionId: string): ProblemInput {
  return {
    kind: 'FAILED_PRECONDITION',
    code: QUARANTINE_WRITES_FROZEN_CODE,
    status: 403,
    title: 'Writes frozen',
    detail:
      'This quarantined surface no longer accepts writes. Use /api/v1/operations/call for paid market work.',
    retryable: false,
    instance: actionId,
  }
}

/** Typed server-fn refusal. Not HTTP 410. Convex mutations stay writable. */
export function quarantineWriteServerError(actionId: string): {
  kind: 'error'
  code: typeof QUARANTINE_WRITES_FROZEN_CODE
  retryable: false
  reason: string
} {
  const problem = quarantineWriteProblemInput(actionId)
  return {
    kind: 'error',
    code: QUARANTINE_WRITES_FROZEN_CODE,
    retryable: false,
    reason: problem.detail ?? problem.title ?? 'Writes frozen',
  }
}

/** HTTP/MCP tombstone. Never `/call`. Never `inquiry.readCustomerRecord`. */
export function quarantineSurfaceRetiredProblemInput(actionId: string): ProblemInput {
  return {
    kind: 'NOT_FOUND',
    code: QUARANTINE_SURFACE_RETIRED_CODE,
    status: 410,
    detail:
      'This quarantined surface is gone. Use /api/v1/operations/call for paid market work.',
    retryable: false,
    instance: actionId,
  }
}

