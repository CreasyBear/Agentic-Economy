export const DiscoveryStatusValues = ['unavailable', 'degraded', 'available', 'stale'] as const
export type DiscoveryStatus = (typeof DiscoveryStatusValues)[number]
