import type { BusinessId, Slug, SourceHash } from '@/modules/common/ids'

type BusinessContext =
  | Readonly<{
      kind: 'local_human'
      suburb: string
      stateTerritory: string
      postcode?: string
      publishedPhone?: string
    }>
  | Readonly<{
      kind: 'programmable_provider'
      website: string
      providerIdentifier: string
    }>

export type BusinessRecord = {
  businessId: BusinessId
  slug: Slug
  name: string
  normalizedName: string
  category: string
  businessContext: BusinessContext
  publicStatus: 'unpublished' | 'published' | 'suppressed'
  trustTier: 'claimed' | 'contact_confirmed' | 'listed' | 'registry_verified'
  sourceHash: SourceHash
  createdAt: number
  updatedAt: number
  suppressedAt?: number
}
