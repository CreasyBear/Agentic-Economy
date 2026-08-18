import type { ProblemInput } from '@/lib/errors'

/**
 * Membership prefixes for `quarantineFamilies` in the product-frontier v2
 * manifest. HTTP/MCP mutating doors are 410; server-fns stay 403 freeze;
 * reads/evidence stay readable. Never `/call`.
 */
export const QUARANTINE_FAMILY_ACTION_PREFIXES = [
  'customerRequest.',
  'inquiry.',
  'study.',
  'workTree.',
] as const

export const QUARANTINE_WRITES_FROZEN_CODE = 'quarantine_writes_frozen' as const
export const QUARANTINE_SURFACE_RETIRED_CODE = 'quarantine_surface_retired' as const

export function isQuarantineFamilyActionId(actionId: string): boolean {
  return QUARANTINE_FAMILY_ACTION_PREFIXES.some((prefix) => actionId.startsWith(prefix))
}

export function isQuarantineWrite(actionId: string, readOnly: boolean): boolean {
  return isQuarantineFamilyActionId(actionId) && !readOnly
}

export function quarantineWriteProblemInput(actionId: string): ProblemInput {
  return {
    kind: 'FAILED_PRECONDITION',
    code: QUARANTINE_WRITES_FROZEN_CODE,
    status: 403,
    title: 'Writes frozen',
    detail:
      'This quarantined surface no longer accepts writes. Evidence remains readable. Use /api/v1/operations/call for paid market work.',
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
    reason: problem.detail ?? problem.title,
  }
}

/** HTTP/MCP tombstone for mutating quarantined doors. Never `/call`. */
export function quarantineSurfaceRetiredProblemInput(actionId: string): ProblemInput {
  return {
    kind: 'NOT_FOUND',
    code: QUARANTINE_SURFACE_RETIRED_CODE,
    status: 410,
    detail:
      'This quarantined surface is gone. Evidence remains readable. Use /api/v1/operations/call for paid market work.',
    retryable: false,
    instance: actionId,
  }
}
