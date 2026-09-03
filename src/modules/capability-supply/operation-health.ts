export type OperationHealthStatus = 'operational' | 'degraded' | 'unverified'

export type OperationHealthProjection = Readonly<{
  healthStatus: OperationHealthStatus
  lastCheckedAt?: number
  lastHealthyAt?: number
}>

export function projectOperationHealth(
  availability: Readonly<{
    posture: 'setup_required' | 'routeable' | 'unavailable'
    observedAt?: number
    validUntil?: number
    lastHealthyAt?: number
  }>,
  now: number,
): OperationHealthProjection {
  const operational = availability.posture === 'routeable'
    && availability.validUntil !== undefined
    && availability.validUntil > now
  const lastHealthyAt = availability.lastHealthyAt
    ?? (availability.posture === 'routeable' ? availability.observedAt : undefined)
  return {
    healthStatus: operational
      ? 'operational'
      : lastHealthyAt === undefined
        ? 'unverified'
        : 'degraded',
    ...(availability.observedAt === undefined
      ? {}
      : { lastCheckedAt: availability.observedAt }),
    ...(lastHealthyAt === undefined ? {} : { lastHealthyAt }),
  }
}

export type ProviderManagementStatus =
  | 'Validating'
  | 'Live'
  | 'Action needed'
  | 'Degraded'
  | 'Removed'

export function projectProviderManagementStatus(
  publication: Readonly<{
    disposition?: 'current' | 'withdrawn' | 'superseded' | 'incompatible'
    credentialState?: 'unobserved' | 'ready' | 'unavailable'
    healthState?: 'unobserved' | 'healthy' | 'unhealthy'
    readinessObservedAt?: number
    readinessValidUntil?: number
    readinessLastHealthyAt?: number
    ownerActionRequired?: boolean
  }>,
  now: number,
): ProviderManagementStatus {
  if (
    publication.disposition === 'withdrawn'
    || publication.disposition === 'superseded'
    || publication.disposition === 'incompatible'
  ) return 'Removed'
  if (
    publication.ownerActionRequired === true
    || publication.credentialState === 'unavailable'
  ) return 'Action needed'
  if (
    publication.disposition === 'current'
    && publication.credentialState === 'ready'
    && publication.healthState === 'healthy'
    && publication.readinessObservedAt !== undefined
    && publication.readinessValidUntil !== undefined
    && publication.readinessValidUntil > now
  ) return 'Live'
  const wasHealthy = publication.readinessLastHealthyAt !== undefined
    || (publication.healthState === 'healthy' && publication.readinessObservedAt !== undefined)
  return wasHealthy ? 'Degraded' : 'Validating'
}
