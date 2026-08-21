import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'

export type PublicOwnerStatusReadback = {
  publicUrl: string
  noindex: true
  catalog: PublicBusinessCatalogApiV2Dto
  projectionMode: 'public_source' | 'local_preview'
  unavailableCapabilities: readonly { label: string; explanation: string }[]
  nextAction: string
}

export type PublicBusinessPageNotFoundReason = 'no_such_business' | 'not_public'

export type PublicBusinessPageReadbackResult =
  | { kind: 'available'; catalog: PublicBusinessCatalogApiV2Dto }
  | { kind: 'not_found'; reason: PublicBusinessPageNotFoundReason }

export function buildPublicOwnerStatusReadback(
  catalog: PublicBusinessCatalogApiV2Dto,
): PublicOwnerStatusReadback {
  return {
    publicUrl: `/${catalog.slug}`,
    noindex: true,
    catalog,
    projectionMode: 'public_source',
    unavailableCapabilities: [],
    nextAction: ownerNextAction(catalog),
  }
}

function ownerNextAction(catalog: PublicBusinessCatalogApiV2Dto): string {
  if (catalog.disposition === 'stale') return 'Review search status before sharing widely.'
  if (catalog.disposition === 'partial') return 'Share the public page while assistant-ready data catches up.'
  return 'Share the public page and keep service facts current.'
}
