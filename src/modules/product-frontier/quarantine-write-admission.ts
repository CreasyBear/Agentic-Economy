import type { ProblemInput } from '@/lib/errors'

/**
 * Membership prefixes for `quarantineFamilies` in the product-frontier v2
 * manifest. Writes are frozen; reads/evidence stay. Not HTTP 410.
 */
export const QUARANTINE_FAMILY_ACTION_PREFIXES = [
  'customerRequest.',
  'inquiry.',
  'study.',
  'workTree.',
] as const

export const QUARANTINE_WRITES_FROZEN_CODE = 'quarantine_writes_frozen' as const

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
