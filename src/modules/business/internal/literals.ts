export const PublicStatusValues = ['unpublished', 'published', 'suppressed'] as const
export type PublicStatus = (typeof PublicStatusValues)[number]

export const TrustTierValues = ['claimed', 'contact_confirmed', 'listed', 'registry_verified'] as const
export type TrustTier = (typeof TrustTierValues)[number]

export const BusinessContextKindValues = ['local_human', 'programmable_provider'] as const
export type BusinessContextKind = (typeof BusinessContextKindValues)[number]
