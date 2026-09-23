import type { TrustTier } from '@/modules/business/public'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'
import type { AeStatus } from './status-presentation'

export function dispositionToAeStatus(disposition: PublicBusinessCatalogApiV2Dto['disposition']): AeStatus {
  if (disposition === 'stale') {
    return 'stale'
  }

  if (disposition === 'partial') {
    return 'degraded'
  }

  return 'available'
}

export function trustTierToAeStatus(trustTier: TrustTier): AeStatus {
  if (trustTier === 'registry_verified') {
    return 'registry_verified'
  }

  if (trustTier === 'contact_confirmed') {
    return 'contact_confirmed'
  }

  if (trustTier === 'listed') {
    return 'listed'
  }

  return 'claimed'
}

export function offeringSupportToAeStatus(
  support: PublicBusinessCatalogApiV2Dto['offerings'][number]['support'],
): AeStatus {
  if (support.aeSupportedAction) {
    return 'available'
  }

  return support.integrated ? 'guarded' : 'not_live'
}

export function offeringAccessToAeStatus(
  accessPaths: PublicBusinessCatalogApiV2Dto['offerings'][number]['accessPaths'],
): AeStatus {
  return accessPaths.length > 0 ? 'listed' : 'not_queued'
}
