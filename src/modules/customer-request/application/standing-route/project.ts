import { canonicalDigest } from '@/modules/common/canonical-digest'

import type { ProjectableStandingPolicy, RepeatPermissionReceipt } from './types'

export function repeatPermissionRef(policyRef: string): string {
  return `repeat-permission:${canonicalDigest({ policyRef })}`
}

export function projectRepeatPermission(
  requestRef: string,
  revision: number,
  routeRef: string,
  policy: Readonly<{
    policyRef: string
    delegatedCredentialId: string
    limits: ProjectableStandingPolicy['limits']
    validFrom: number
    validUntil: number
    revokedAt?: number
  }>,
): RepeatPermissionReceipt {
  return {
    kind: 'repeat_permission',
    status: policy.revokedAt === undefined ? 'active' : 'withdrawn',
    permissionRef: repeatPermissionRef(policy.policyRef),
    requestRef,
    revision,
    routeRef,
    delegatedCredentialId: policy.delegatedCredentialId,
    limits: {
      perUseSpend: { ...policy.limits.perUseSpend },
      cumulativeSpend: { ...policy.limits.cumulativeSpend },
      perUseDataAllocations: policy.limits.perUseDataAllocations,
      cumulativeDataAllocations: policy.limits.cumulativeDataAllocations,
      occurrences: policy.limits.occurrences,
    },
    fallback: 'ask_for_confirmation',
    validFrom: policy.validFrom,
    validUntil: policy.validUntil,
    ...(policy.revokedAt === undefined ? {} : { withdrawnAt: policy.revokedAt }),
  }
}
