import type { BusinessId, SourceHash } from '@/modules/common/ids'

export const DiscoveryStatusValues = ['unavailable', 'degraded', 'available', 'stale'] as const
export type DiscoveryStatus = (typeof DiscoveryStatusValues)[number]

export const DiscoveryPathKindValues = ['ae_hosted_fallback', 'business_origin_standard'] as const
export type DiscoveryPathKind = (typeof DiscoveryPathKindValues)[number]

export const DiscoveryAttemptStatusValues = ['queued', 'succeeded', 'failed', 'stale'] as const
export type DiscoveryAttemptStatus = (typeof DiscoveryAttemptStatusValues)[number]

export type DiscoveryManifestContract = {
  businessId: BusinessId
  ucpVersion: string
  pathKind: Extract<DiscoveryPathKind, 'ae_hosted_fallback'>
  status: DiscoveryStatus
  sourceHash: SourceHash
  generatedHash: string
  generatedAt: number
  degradedReason?: string
  suppressedAt?: number
}

export type DiscoveryManifestAttemptContract = {
  attemptId: string
  businessId: BusinessId
  ucpVersion: string
  pathKind: Extract<DiscoveryPathKind, 'ae_hosted_fallback'>
  status: DiscoveryAttemptStatus
  failureCode?: string
  failureMessageRedacted?: string
  startedAt: number
  finishedAt?: number
}
