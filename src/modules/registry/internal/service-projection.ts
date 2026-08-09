import type { OfferingPrice, BusinessSupplyProjection } from '@/modules/catalog/public'
import type {
  PublicOperationAuthentication,
  PublicOperationParameter,
} from '@/modules/capability-supply/public'

/**
 * Canonical agent-native Service model — ONE Service per business.
 *
 * Mirrors agentic.market's `Service.endpoints[]` shape: a business is
 * represented as a single Service carrying identity + merchandising fields
 * (`ae.offerings[]`) and a FLAT, agent-native `endpoints[]` across every offering.
 *
 * The canonical Service is produced by `projectServiceFromBusinessDto`
 * (src/modules/registry/internal/services-api-projection.ts), which derives it
 * from the public business catalog DTO — the same `BusinessSupplyProjection`
 * the `/api/businesses` view reads. This file owns the canonical TYPES so there
 * is exactly one wire shape and one producer, never a fork.
 *
 * The endpoint `operationRef`, flat `parameters[]`, and decimal `pricing{scheme}`
 * are injected only when the capability-supply projection proves a single
 * operation linkage for the offering. Without that proof, the endpoint remains
 * un-enriched and the fields stay absent rather than being fabricated.
 */

export type ServiceEndpointAuthenticationDto = PublicOperationAuthentication
export type ServiceEndpointExecutionDto = 'answer_tool' | 'request_route' | 'catalog_only'
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
    access: 'open' | 'external'
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
    suburb?: string
    stateTerritory?: string
    postcode?: string
    publicUrl: string
    responseTimeMinutes?: number
    photos: readonly Readonly<{ url: string; alt: string }>[]
    observedAt: number
    disposition: BusinessSupplyProjection['disposition']
    source: 'business_published' | 'ae_sandbox'
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

