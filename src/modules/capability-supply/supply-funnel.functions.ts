import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { callSourceAction, callSourceMutation, callSourceQuery, sourceAction, sourceMutation, sourceQuery } from '@/lib/server/convex-source'
import { describeActionForAgent, listMcpActions, type AgentToolDescriptor } from '@/modules/actions'
import type { BusinessOfferingStatus } from '@/modules/catalog/public'
import type { PublicServicesApiPage } from '@/modules/registry/public'
import { registryServicesListAction } from '@/modules/registry/registry.actions'
import type { PricingConfig } from '@/modules/money/public'
import type { PricingConfigPort, PricingPreview, SupplyPricingRefusal } from './internal/supply-funnel/pricing-port'
import { realPricingConfigPort } from './internal/supply-funnel/pricing-port'
import { admitPublicationDraft, type AdmitPublicationDraftRefusal } from './internal/publication/draft'
import type { CapabilityPublicationImport, CapabilityPublicationImportResult } from './internal/publication-importers'
import { normalizeCapabilityPublication } from './public'

export type SupplyLandingReadback = Readonly<{
  tools: readonly AgentToolDescriptor[]
  services: PublicServicesApiPage
  evidence: 'source' | 'labelled_local_dev'
}>

export async function loadSupplyLandingReadback(): Promise<SupplyLandingReadback> {
  const tools = listMcpActions().map(describeActionForAgent).slice(0, 32)
  const services = await registryServicesListAction.run({
    data: registryServicesListAction.schema.parse({ limit: 10 }),
    context: { caller: 'ui' },
  })
  return { tools, services, evidence: 'source' }
}

export type SupplyFunnelStep = 'describe' | 'endpoint' | 'readiness' | 'pricing' | 'test' | 'publish'
export type SupplyFunnelStepState = 'not_started' | 'in_progress' | 'completed' | 'refused' | 'stale'
export type SupplyFunnelRefusal =
  | 'invalid_offering' | 'invalid_access_path' | 'revision_conflict' | 'authorization_denied' | 'source_unavailable'
  | 'source_invalid' | 'source_too_large' | 'source_too_deep' | 'source_version_unsupported' | 'selector_invalid'
  | 'operation_not_found' | 'schema_missing' | 'schema_profile_unsupported' | 'transport_unsupported'
  | 'commercial_metadata_inconsistent' | 'payment_execution_unsupported' | 'adapter_not_registered' | 'adapter_config_invalid'
  | 'adapter_config_too_large' | 'credential_rejected' | 'target_not_public' | 'transport_unreachable' | 'http_redirect'
  | 'http_4xx' | 'http_5xx' | 'response_content_type_invalid' | 'response_too_large' | 'response_invalid'
  | 'credential_unavailable' | 'target_changed' | 'revision_changed' | 'price_unavailable' | 'pricing_config_invalid'
  | 'currency_mismatch' | 'input_invalid' | 'outcome_unknown' | 'registration_context_invalid' | 'contract_identity_conflict'
  | 'offering_identity_conflict' | 'operation_key_conflict' | 'offering_integrity_failure' | 'binding_integrity_failure'
  | 'catalog_offering_origin_changed' | 'readiness_stale'

export type SupplyFunnelStepCompletion = Readonly<{
  step: SupplyFunnelStep
  state: SupplyFunnelStepState
  offeringRef?: string
  revision?: number
  sourceHash?: string
  refusal?: SupplyFunnelRefusal
  message?: string
}>

export type SupplyFunnelDraft = Readonly<{
  version: 'supply-funnel:v1'
  businessId: string
  offeringRef?: string
  revision?: number
  source?: Readonly<Record<string, unknown>>
  config?: Readonly<Record<string, unknown>>
  probe?: Readonly<{ targetDigest: string; outcome: string; validUntil: number; evidenceRefs: readonly string[] }>
  pricing?: PricingConfig
  testReceipt?: Readonly<{ outputDigest: string; summary: string; observedAt: number; evidenceRefs: readonly string[] }>
  completedSteps: readonly SupplyFunnelStep[]
  states: Readonly<Record<SupplyFunnelStep, SupplyFunnelStepState>>
}>

export type OwnerSupplyFunnelReadback = Readonly<{
  kind: 'available'
  businessId: string
  business: Readonly<{ name: string; slug: string }>
  offerings: readonly Readonly<{
    offeringRef: string
    revision: number
    name: string
    summary: string
    status: BusinessOfferingStatus
    sourceHash?: string
    publicationRef?: string
    documentationUrl?: string
    endpointUrl?: string
    readiness?: Readonly<{
      outcome: 'unobserved' | 'healthy' | 'unhealthy'
      validUntil?: number
      evidenceRefs: readonly string[]
    }>
  }>[]
  callLog: readonly SupplyCallLogRow[]
  liquidity: SupplyLiquiditySummary
} | { kind: 'not_found' } | { kind: 'error'; code: 'unauthenticated' | 'source_unavailable'; reason?: string }>

export type SupplyCallLogRow = Readonly<{
  eventRef: string
  offeringRef: string
  publicationRef?: string
  observedAt: number
  outcome: 'filled' | 'zero'
  zeroReason?: string
  durationMs?: number
  evidenceRefs: readonly string[]
  environment: 'local' | 'development' | 'sandbox' | 'production'
}>

export type SupplyLiquiditySummary = Readonly<{
  fillCount: number
  zeroCount: number
  firstSuccessP50Ms?: number
  firstSuccessP95Ms?: number
  depthSamples: number
  environment: 'local' | 'development' | 'sandbox' | 'production'
}>

const readOwnerSupplyQuery = sourceQuery<Record<string, never>, OwnerSupplyFunnelReadback>('capabilitySupply:readOwnerSupplyFunnel')
const supplyStepMutation = sourceMutation<Record<string, unknown>, SupplyFunnelStepCompletion>('capabilitySupply:advanceOwnerSupplyStep')
const probeAction = sourceAction<Record<string, unknown>, SupplyFunnelStepCompletion>('capabilitySupplyOwnerSupply:runOwnerSupplyReadiness')
const testAction = sourceAction<Record<string, unknown>, SupplyFunnelStepCompletion>('capabilitySupplyOwnerSupply:runOwnerSupplyTest')
const publishMutation = sourceMutation<Record<string, unknown>, SupplyFunnelStepCompletion>('capabilitySupply:publishOwnerCapability')

export const readOwnerSupplyFunnelServer = createServerFn().handler(async (): Promise<OwnerSupplyFunnelReadback> => {
  try {
    return await callSourceQuery(readOwnerSupplyQuery, {})
  } catch (error) {
    return { kind: 'error', code: 'source_unavailable', reason: error instanceof Error ? error.message : 'Supply source is unavailable.' }
  }
})

const stepInputSchema = z.object({
  businessId: z.string().min(1), offeringRef: z.string().min(1), revision: z.number().int().positive(), operationKey: z.string().min(8).max(200), value: z.record(z.string(), z.unknown()),
})

export const advanceOwnerSupplyStepServer = createServerFn({ method: 'POST' })
  .validator((data) => stepInputSchema.parse(data))
  .handler(async ({ data }) => callSourceMutation(supplyStepMutation, data))
export const runOwnerSupplyReadinessServer = createServerFn({ method: 'POST' })
  .validator((data) => stepInputSchema.parse(data))
  .handler(async ({ data }) => callSourceAction(probeAction, data))
export const runOwnerSupplyTestServer = createServerFn({ method: 'POST' })
  .validator((data) => stepInputSchema.parse(data))
  .handler(async ({ data }) => callSourceAction(testAction, data))
export const publishOwnerCapabilityServer = createServerFn({ method: 'POST' })
  .validator((data) => stepInputSchema.parse(data))
  .handler(async ({ data }) => callSourceMutation(publishMutation, data))

export type PricingStepResult = Readonly<{ kind: 'ready'; config: PricingConfig; preview: PricingPreview } | { kind: 'refused'; reason: SupplyPricingRefusal }>

export function resolveSupplyPricing(config: unknown, options?: Readonly<{ freeCallsUsed?: number; priceDigest?: string }>): PricingStepResult {
  const resolved = realPricingConfigPort.normalize(config)
  if (resolved.kind === 'refused') return resolved
  return realPricingConfigPort.resolve({ config: resolved.config, freeCallsUsed: options?.freeCallsUsed ?? 0, ...(options?.priceDigest === undefined ? {} : { priceDigest: options.priceDigest }) })
}

export type PricingPort = PricingConfigPort

export type SupplyPublicationAdmission = Readonly<
  | { kind: 'admitted'; offeringId: string; bindingId: string; sourceDigest: string; contractDigest: string; configDigest: string }
  | { kind: 'refused'; reason: SupplyFunnelRefusal }
>
export function admitSupplyPublicationDraft(input: Readonly<{ businessId: string; offeringRef: string; revision: number; source: CapabilityPublicationImport; evidenceRefs: readonly string[] }>): SupplyPublicationAdmission {
  let normalized: CapabilityPublicationImportResult
  try { normalized = normalizeCapabilityPublication(input.source) } catch { return { kind: 'refused', reason: 'source_invalid' } }
  if (normalized.kind === 'refused') return normalized
  const offeringId = `capability-offering:${input.businessId}:${input.offeringRef}:${input.revision}`
  const bindingId = `capability-binding:${input.businessId}:${input.offeringRef}:${input.revision}`
  const admitted = admitPublicationDraft({
    source: { kind: 'ae_envelope', documentJson: normalized.draft.documentJson, offering: { ...normalized.draft.offering, offeringId }, binding: { ...normalized.draft.binding, bindingId }, evidenceRefs: input.evidenceRefs },
    businessId: input.businessId,
    evidenceRefs: input.evidenceRefs,
  })
  if (admitted.kind === 'refused') return { kind: 'refused', reason: mapAdmissionRefusal(admitted.reason) }
  return { kind: 'admitted', offeringId: admitted.offering.offeringId, bindingId: admitted.binding.bindingId, sourceDigest: normalized.draft.source.descriptorDigest, contractDigest: admitted.encoded.contract.ref.contractDigest, configDigest: admitted.admittedTransport.transport.configDigest }
}

function mapAdmissionRefusal(reason: AdmitPublicationDraftRefusal): SupplyFunnelRefusal {
  switch (reason) {
    case 'contract_too_large': case 'contract_invalid': return 'source_invalid'
    case 'offering_invalid': return 'invalid_offering'
    case 'binding_invalid': return 'adapter_config_invalid'
    case 'source_invalid': return 'source_invalid'
    case 'adapter_not_registered': case 'adapter_config_invalid': case 'adapter_config_too_large': return reason
  }
}
