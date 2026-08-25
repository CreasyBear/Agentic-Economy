export type OwnerStatusCatalog = Readonly<{
  businessId: string
  slug: string
  disposition: 'current' | 'partial' | 'stale'
}>

export type PublicOwnerStatusReadback<Catalog extends OwnerStatusCatalog> = {
  publicUrl: string
  noindex: true
  catalog: Catalog
  projectionMode: 'public_source' | 'local_preview'
  unavailableCapabilities: readonly { label: string; explanation: string }[]
  nextAction: string
}

export type PublicBusinessPageNotFoundReason = 'no_such_business' | 'not_public'

export type PublicBusinessPageReadbackResult<Catalog extends OwnerStatusCatalog> =
  | { kind: 'available'; catalog: Catalog }
  | { kind: 'not_found'; reason: PublicBusinessPageNotFoundReason }

export function buildPublicOwnerStatusReadback<Catalog extends OwnerStatusCatalog>(
  catalog: Catalog,
): PublicOwnerStatusReadback<Catalog> {
  return {
    publicUrl: `/${catalog.slug}`,
    noindex: true,
    catalog,
    projectionMode: 'public_source',
    unavailableCapabilities: [],
    nextAction: ownerNextAction(catalog),
  }
}

function ownerNextAction(catalog: OwnerStatusCatalog): string {
  if (catalog.disposition === 'stale') return 'Review search status before sharing widely.'
  if (catalog.disposition === 'partial') return 'Share the public page while assistant-ready data catches up.'
  return 'Share the public page and keep service facts current.'
}
