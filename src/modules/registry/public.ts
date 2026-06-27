import type { BusinessId, ServiceId, SourceHash } from '@/modules/common/ids'

export const IndexStatusValues = ['not_queued', 'queued', 'indexed', 'failed', 'stale'] as const
export type IndexStatus = (typeof IndexStatusValues)[number]

export const RegistryProjectionStatusValues = ['queued', 'succeeded', 'failed', 'stale'] as const
export type RegistryProjectionStatus = (typeof RegistryProjectionStatusValues)[number]

export const RegistryProjectionKindValues = ['business_catalog', 'service_catalog'] as const
export type RegistryProjectionKind = (typeof RegistryProjectionKindValues)[number]

export const IndexTargetTypeValues = ['business', 'service', 'capability'] as const
export type IndexTargetType = (typeof IndexTargetTypeValues)[number]

export type RegistryProjectionAttemptContract = {
  businessId: BusinessId
  serviceId?: ServiceId
  logicalKey: string
  projectionKind: RegistryProjectionKind
  sourceHash: SourceHash
  status: RegistryProjectionStatus
  retryCount: number
  retryAfter?: number
  lastErrorCode?: string
  lastErrorRedacted?: string
  startedAt: number
  finishedAt?: number
}
