import type { BusinessId, ServiceId, Slug, SourceHash } from '@/modules/common/ids'
import type { DiscoveryStatus } from '@/modules/discovery/public'
import type { PublicStatus, TrustTier } from '@/modules/business/public'
import type { IndexStatus } from '@/modules/registry/public'

export const FirstRequestModeValues = ['inquiry_available', 'quote_request_available', 'not_available_yet'] as const
export type FirstRequestMode = (typeof FirstRequestModeValues)[number]

export const PublicFirstRequestChannelValues = [
  'public_business_contact',
  'ae_status_only',
  'not_available',
] as const
export type PublicFirstRequestChannel = (typeof PublicFirstRequestChannelValues)[number]

export const ServiceCapabilityStatusValues = ['available', 'degraded', 'unavailable', 'stale'] as const
export type ServiceCapabilityStatus = (typeof ServiceCapabilityStatusValues)[number]

export const CapabilityKindValues = [
  'phone_inquiry',
  'quote_request',
  'emergency_callout_interest',
  'ae_hosted_discovery',
] as const
export type CapabilityKind = (typeof CapabilityKindValues)[number]

export const BusinessServiceStatusValues = ['draft', 'published', 'suppressed'] as const
export type BusinessServiceStatus = (typeof BusinessServiceStatusValues)[number]

export type PublicFirstRequestDisclosure = {
  mode: FirstRequestMode
  publicDisclosure: string
  publicChannel: PublicFirstRequestChannel
  noContactReason?: string
  rawContactExcluded: true
}

export type ServiceCapabilityContract = {
  serviceId: ServiceId
  kind: CapabilityKind
  status: ServiceCapabilityStatus
  firstRequest: PublicFirstRequestDisclosure
  callable: false
  paymentRequired: false
  reason?: string
  sourceHash: SourceHash
}

export type PublicServiceContract = {
  serviceId: ServiceId
  serviceSlug: Slug
  businessId: BusinessId
  name: string
  category: string
  serviceArea: string
  hoursOrUnknown: string
  status: BusinessServiceStatus
  capabilities: readonly ServiceCapabilityContract[]
}

export type PublicCatalogContract = {
  businessId: BusinessId
  slug: Slug
  name: string
  category: string
  suburb: string
  publicStatus: Extract<PublicStatus, 'published'>
  trustTier: TrustTier
  indexStatus: IndexStatus
  discoveryStatus: DiscoveryStatus
  services: readonly PublicServiceContract[]
  sourceHash: SourceHash
}
