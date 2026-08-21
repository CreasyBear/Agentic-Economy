import { v } from 'convex/values'

import type { BusinessId, OwnerId, Slug, SourceHash } from '@/modules/common/ids'

export const PublicStatusValues = ['unpublished', 'published', 'suppressed'] as const
export type PublicStatus = (typeof PublicStatusValues)[number]

export const TrustTierValues = ['claimed', 'contact_confirmed', 'listed', 'registry_verified'] as const
export type TrustTier = (typeof TrustTierValues)[number]

export function normalizeTrustTier(value: unknown): TrustTier {
  return value === 'contact_confirmed' || value === 'listed' || value === 'registry_verified'
    ? value
    : 'claimed'
}

export const BusinessContextKindValues = ['local_human', 'programmable_provider'] as const
export type BusinessContextKind = (typeof BusinessContextKindValues)[number]

export type LocalHumanBusinessContext = {
  kind: 'local_human'
  suburb: string
  stateTerritory: string
  postcode?: string
  publishedPhone?: string
}

export type ProgrammableProviderBusinessContext = {
  kind: 'programmable_provider'
  website: string
  providerIdentifier: string
}

export type BusinessContext = LocalHumanBusinessContext | ProgrammableProviderBusinessContext
const localHumanBusinessContext = v.object({
  kind: v.literal('local_human'),
  suburb: v.string(),
  stateTerritory: v.string(),
  postcode: v.optional(v.string()),
  publishedPhone: v.optional(v.string()),
})

const programmableProviderBusinessContext = v.object({
  kind: v.literal('programmable_provider'),
  website: v.string(),
  providerIdentifier: v.string(),
})

export const businessContext = v.union(localHumanBusinessContext, programmableProviderBusinessContext)


export function canonicalProviderWebsite(value: string): string | undefined {
  try {
    const url = new URL(value.trim())
    if (
      url.protocol !== 'https:'
      || url.username !== ''
      || url.password !== ''
      || url.search !== ''
      || url.hash !== ''
      || url.hostname.length === 0
    ) {
      return undefined
    }
    const pathname = url.pathname.replace(/\/+$/, '') || '/'
    return `${url.origin.toLowerCase()}${pathname}`
  } catch {
    return undefined
  }
}

export function canonicalProviderIdentifier(value: string): string | undefined {
  const normalized = value.trim().normalize('NFKC').replace(/\s+/g, ' ')
  return normalized.length === 0 ? undefined : normalized.slice(0, 240)
}

export function isLocalHumanBusinessContext(
  context: BusinessContext,
): context is LocalHumanBusinessContext {
  return context.kind === 'local_human'
}

export function isProgrammableProviderBusinessContext(
  context: BusinessContext,
): context is ProgrammableProviderBusinessContext {
  return context.kind === 'programmable_provider'
}

export { validateOwnerPublishedPhone } from './internal/published-phone'

export const VisibilityTargetTypeValues = ['business', 'service', 'capability'] as const
export type VisibilityTargetType = (typeof VisibilityTargetTypeValues)[number]

export type BusinessIdentity = {
  businessId: BusinessId
  ownerId: OwnerId
  slug: Slug
  name: string
  category: string
  businessContext: BusinessContext
  publicStatus: PublicStatus
  trustTier: TrustTier
  sourceHash: SourceHash
}

export type BusinessOwnerRecord = {
  ownerId: OwnerId
  clerkUserId: string
  displayName?: string
  emailHash?: string
  createdAt: number
  updatedAt: number
}

export type BusinessActor =
  | { kind: 'authenticated_owner'; clerkUserId: string; displayName?: string; emailHash?: string; sessionRef?: string }
  | { kind: 'anonymous'; anonymousBucket: string }

export type BusinessSourceRef = {
  label: string
  evidenceRef: string
  sourceHash: SourceHash
}

export type BusinessContextRecord = {
  businessId: BusinessId
  category: string
  businessContext: BusinessContext
  ownerMessage?: string
  photos?: readonly PublicBusinessPhoto[]
  responseTimeMinutes?: number
  sourceRefs: readonly BusinessSourceRef[]
  sourceHash: SourceHash
  approvedAt: number
}

export type PublicBusinessPhoto = {
  url: string
  alt: string
}

export type BusinessRecord = {
  businessId: BusinessId
  ownerId: OwnerId
  slug: Slug
  name: string
  normalizedName: string
  category: string
  businessContext: BusinessContext
  publicStatus: PublicStatus
  trustTier: TrustTier
  sourceHash: SourceHash
  createdAt: number
  updatedAt: number
  suppressedAt?: number
}

export type BusinessSourceState = {
  owners: BusinessOwnerRecord[]
  businesses: BusinessRecord[]
  businessContexts: BusinessContextRecord[]
}

export { isPubliclyDiscoverable } from './internal/visibility'
