export const DiscoveryStatusValues = ['unavailable', 'degraded', 'available', 'stale'] as const
export type DiscoveryStatus = (typeof DiscoveryStatusValues)[number]

export const DiscoveryPathKindValues = ['ae_hosted_fallback', 'business_origin_standard'] as const
export type DiscoveryPathKind = (typeof DiscoveryPathKindValues)[number]

export const DiscoveryAttemptStatusValues = ['queued', 'succeeded', 'failed', 'stale'] as const
export type DiscoveryAttemptStatus = (typeof DiscoveryAttemptStatusValues)[number]

export const DiscoveryRepairActionValues = ['regenerate_manifest', 'invalidate_manifest', 'no_repair'] as const
export type DiscoveryRepairAction = (typeof DiscoveryRepairActionValues)[number]

export const DiscoveryRepairResultValues = ['not_run', 'succeeded', 'failed'] as const
export type DiscoveryRepairResult = (typeof DiscoveryRepairResultValues)[number]

export const DiscoveryManifestSchemaVersion = 'ae-ucp-fallback:v1' as const
export type DiscoveryManifestSchemaVersion = typeof DiscoveryManifestSchemaVersion

export const DiscoveryManifestSourceVersion = 'public-catalog:v1' as const
export type DiscoveryManifestSourceVersion = typeof DiscoveryManifestSourceVersion

export const DiscoveryManifestRouteKindValues = ['business_page', 'ucp_manifest', 'api_detail'] as const
export type DiscoveryManifestRouteKind = (typeof DiscoveryManifestRouteKindValues)[number]
