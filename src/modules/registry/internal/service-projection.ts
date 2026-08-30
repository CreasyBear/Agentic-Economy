import type { OfferingPrice, BusinessSupplyProjection } from '@/modules/catalog/public'
import type { BusinessContext } from '@/modules/business/public'
import type {
  PublicOperationAuthentication,
  PublicOperationParameter,
} from '@/modules/capability-supply/public'
/**
 * Published-business portfolio wire model retained by `/api/v1/services`.
 *
 * One record represents one published business and rolls up its offerings and
 * external endpoint links. It is not an Agent Service: that term is reserved
 * for one admitted Market Operation. `provider` links the business Provider;
 * endpoint provenance describes Publication authority and source mode unless
 * a separately verified Publisher identity exists.
 *
 * The projection is produced by `projectServiceFromBusinessDto`
 * (`services-api-projection.ts`) from the same public business catalog DTO used
 * by `/api/businesses`. Exact Operation links are additive and appear only when
 * capability supply proves a single current linkage.
 */

export type ServiceEndpointAuthenticationDto = PublicOperationAuthentication
export type ServiceEndpointExecutionDto = 'operation_call' | 'request_route' | 'catalog_only'
export type ServiceEndpointAuthorityModeDto =
  | 'provider_owned'
  | 'ae_curated_external'
  | 'third_party_gateway'
  | 'observed_external'
export type ServiceEndpointSourceKindDto = 'ae_envelope' | 'openapi_http' | 'mcp' | 'agent_plugin_mcp' | 'x402'

export type ServiceEndpointPricingDto = Readonly<{
  amount?: string
  currency: string
  network?: string
  scheme: 'exact' | 'upto'
  minAmount?: string
  maxAmount?: string
}>

export type ServiceEndpointDto = Readonly<{
  url: string
  description: string
  method?: string
  pricing?: ServiceEndpointPricingDto
  providerName?: string
  serviceName: string
  tags: readonly string[]
  parameters: readonly PublicOperationParameter[]
  quality: null
  ae: Readonly<{
    operationRef?: string
    offeringRef: string
    provenance: 'business_declared' | 'publicly_observed'
    access: 'external'
    authentication: ServiceEndpointAuthenticationDto
    execution: ServiceEndpointExecutionDto
    authorityMode?: ServiceEndpointAuthorityModeDto
    sourceKind?: ServiceEndpointSourceKindDto
    authenticationSummary?: string
    settlementSupport: 'executable' | 'catalog_only' | 'unpriced'
  }>
}>

export type ServicePriceSummaryDto = Readonly<{
  currency: string
  minAmount: string
  maxAmount: string
  avgCostPerTransaction?: string
  avgCostBasis: 'exact' | 'varies'
}>

export type ServiceDto = Readonly<{
  id: string
  name: string
  description?: string
  domain?: string
  provider?: string
  providerUrl?: string
  category: string
  networks: readonly string[]
  enriched: boolean
  integrationType: '1P' | '3P'
  serviceName: string
  isNew?: boolean
  endpoints: readonly ServiceEndpointDto[]
  priceSummary?: ServicePriceSummaryDto
  tags: readonly string[]
  iconUrl?: string
  ae: Readonly<{
    trustTier: BusinessSupplyProjection['business']['trustTier']
    businessContext: BusinessContext
    publicUrl: string
    responseTimeMinutes?: number
    photos: readonly Readonly<{ url: string; alt: string }>[]
    observedAt: number
    disposition: BusinessSupplyProjection['disposition']
    source: 'business_published'
    offerings: readonly ServiceOfferingDto[]
    links: Readonly<{ business: string; manifest: string }>
  }>
}>

export type ServiceOfferingDto = Readonly<{
  offeringRef: string
  revision: number
  name: string
  category: string
  summary: string
  serviceAreaSummary?: string
  availabilitySummary?: string
  pricingSummary?: string
  price?: OfferingPrice
  support: Readonly<{
    integrated: boolean
    routeable: boolean
    observedAt?: number
    validUntil?: number
  }>
}>

