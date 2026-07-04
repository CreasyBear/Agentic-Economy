import type { FirstRequestMode, PublicFirstRequestChannel } from '@/modules/catalog/public'
import type { ServiceId } from '@/modules/common/ids'

export const BusinessCapabilityKindValues = [
  'informational_page',
  'inquiry_intake',
  'business_endpoint',
  'action_card',
] as const
export type BusinessCapabilityKind = (typeof BusinessCapabilityKindValues)[number]

export const CapabilityTrustStateValues = [
  'business_supplied',
  'checked',
  'stale',
  'contradicted',
  'unsupported',
] as const
export type CapabilityTrustState = (typeof CapabilityTrustStateValues)[number]

export const AeEndpointCheckStandardVersion = 'ae-endpoint-check:v1' as const
export type AeEndpointCheckStandardVersion = typeof AeEndpointCheckStandardVersion
export const BusinessCapabilityActionSlugValues = ['provision-paid-intake-endpoint', 'publish-agent-intake-endpoint'] as const
export type BusinessCapabilityActionSlug = (typeof BusinessCapabilityActionSlugValues)[number]

export type InformationalPageCapabilityDescriptor = Readonly<{
  kind: 'informational_page'
  publicUrl: string
}>

export type InquiryIntakeCapabilityDescriptor = Readonly<{
  kind: 'inquiry_intake'
  serviceId?: ServiceId
  firstRequestMode: FirstRequestMode
  publicChannel: PublicFirstRequestChannel
}>

export type BusinessEndpointCapabilityDescriptor = Readonly<{
  kind: 'business_endpoint'
  originUrl: string
  manifestUrl: string
  schemaRef: string
}>

export type ActionCardCapabilityDescriptor = Readonly<{
  kind: 'action_card'
  actionSlug: BusinessCapabilityActionSlug
  cardRef: string
}>

export type CapabilityDescriptor =
  | InformationalPageCapabilityDescriptor
  | InquiryIntakeCapabilityDescriptor
  | BusinessEndpointCapabilityDescriptor
  | ActionCardCapabilityDescriptor

export {
  AeEndpointCheckAllowedMethods,
  AeEndpointCheckBackoffMs,
  AeEndpointCheckMaxBodyBytes,
  AeEndpointCheckTimeoutMs,
  evaluateFreshnessFacet,
  evaluateSchemaFacet,
  type CapabilityCheckFacetResults,
  type ContradictionFacetResult,
  type FreshnessFacetResult,
  type ReachabilityFacetResult,
  type SchemaFacetResult,
} from './internal/check-standard'
export { computeCapabilityTrustState } from './internal/capability-model'
export { evaluateBusinessOriginManifestContradictions, parseBusinessOriginManifest } from './internal/ingest-manifest'
