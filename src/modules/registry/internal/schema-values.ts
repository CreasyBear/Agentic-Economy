export const IndexStatusValues = ['not_queued', 'queued', 'indexed', 'failed', 'stale'] as const
export type IndexStatus = (typeof IndexStatusValues)[number]

export const RegistryProjectionStatusValues = ['queued', 'succeeded', 'failed', 'stale'] as const
export type RegistryProjectionStatus = (typeof RegistryProjectionStatusValues)[number]

export const RegistryProjectionKindValues = ['business_catalog', 'offering_catalog'] as const
export type RegistryProjectionKind = (typeof RegistryProjectionKindValues)[number]

export const IndexTargetTypeValues = ['business', 'offering'] as const
export type IndexTargetType = (typeof IndexTargetTypeValues)[number]

export const RegistryProjectionSourceVersion = 'public-catalog:v1' as const
export type RegistryProjectionSourceVersion = typeof RegistryProjectionSourceVersion

export const RegistryRepairActionValues = ['retry_projection', 'rebuild_projection', 'no_repair'] as const
export type RegistryRepairAction = (typeof RegistryRepairActionValues)[number]

export const RegistryRepairResultValues = ['not_run', 'succeeded', 'failed'] as const
export type RegistryRepairResult = (typeof RegistryRepairResultValues)[number]

export const RegistrySearchDocumentSourceVersion = 'registry-search-document:v1' as const
export type RegistrySearchDocumentSourceVersion = typeof RegistrySearchDocumentSourceVersion
