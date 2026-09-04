import { z } from 'zod'

import { jsonValueSchema } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'
import { exactAmountSchema } from '@/modules/money/public'

import { preparePublicationDraft, type PreparedPublicationDraft } from './internal/publication'
import { sourceRouteRef } from './internal/source-route-identity'
import type { ValidOpenApiDocument } from './internal/openapi-import/validation'
import type {
  CapabilityContractMetadata,
  CapabilityPublicationImport,
  CapabilityPublicationSourceSelector,
  CapabilityTransportAuthority,
} from './public'
import {
  previewSupplySource,
  loadPublicOpenApi,
  supplySourceInputSchema,
  type McpSourceDiscovery,
  type SupplyOperationCandidate,
  type SupplySourcePreviewDependencies,
} from './source-preview'
import type { X402SellerEndpointInspection } from './internal/x402-seller-endpoint-inspector'
import type { ProviderConnectionOwnerProjection } from './provider-connection'

const effectSchema = z.strictObject({
  class: z.enum(['data_release', 'financial_exposure', 'external_state_change']),
  authority: z.enum(['explicit', 'mandate_or_explicit']),
  reversibility: z.enum(['not_applicable', 'reversible', 'conditional', 'irreversible']),
})
const dataUseSchema = z.strictObject({
  inputPointer: z.string().startsWith('/').max(500),
  classification: z.enum(['public', 'personal', 'sensitive', 'credential']),
  phase: z.enum(['preparation', 'execution']),
  purposes: z.array(z.string().trim().min(1).max(200)).min(1).max(16),
})
const evidenceSchema = z.strictObject({
  outputPointer: z.string().max(500),
  purpose: z.enum(['comparison', 'completion', 'recovery']),
})
const fixedAudPricingSchema = z.strictObject({
  kind: z.literal('fixed_aud'),
  amount: exactAmountSchema.superRefine((amount, context) => {
    if (amount.currency !== 'AUD' || amount.exponent !== 6) {
      context.addIssue({ code: 'custom', message: 'fixed_aud_requires_exponent_six_aud' })
    }
  }),
})

export const publishSupplyOperationV2InputSchema = z.strictObject({
  businessRef: z.string().trim().min(1).max(200),
  source: supplySourceInputSchema,
  candidateRef: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  expectedSourceDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  connectionRef: z.string().trim().min(1).max(200).optional(),
  presentation: z.strictObject({
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(1_000),
    category: z.string().trim().min(1).max(120),
    serviceArea: z.string().trim().min(1).max(160).optional(),
    availability: z.string().trim().min(1).max(160).optional(),
  }),
  consequences: z.strictObject({
    effects: z.array(effectSchema).max(64),
    dataUse: z.array(dataUseSchema).max(128),
    evidence: z.array(evidenceSchema).max(64),
  }),
  pricing: z.union([
    z.strictObject({ kind: z.literal('free') }),
    fixedAudPricingSchema,
    z.strictObject({ kind: z.literal('source_x402') }),
  ]),
  validationInput: z.record(z.string(), jsonValueSchema).optional(),
  environment: z.enum(['sandbox', 'production']),
  idempotencyKey: z.string().trim().min(8).max(200),
  attestation: z.strictObject({
    authorisedToPublish: z.literal(true),
    informationAccurate: z.literal(true),
    publishAfterSuccessfulValidation: z.literal(true),
  }),
})
export type PublishSupplyOperationV2Input = z.infer<typeof publishSupplyOperationV2InputSchema>

export type SupplyPublicationV2Preparation =
  | Readonly<{
      kind: 'prepared'
      prepared: PreparedPublicationDraft
      sourceRevision: string
      sourceDigest: string
      candidate: SupplyOperationCandidate
      sourceDescriptorJson: string
      sourceSelectorJson: string
      sourceAuthorityState: 'verified' | 'review_required'
      validationInputJson?: string
    }>
  | Readonly<{
      kind: 'refused'
      reason: string
      requiredAction?: Readonly<{
        title: string
        description: string
        cta: string | null
        ctaLabel: string
      }>
    }>

export type SupplyPublicationV2Dependencies = SupplySourcePreviewDependencies & Readonly<{
  providerAuthority?: Extract<CapabilityTransportAuthority, { kind: 'provider_connection' }>
}>

export function selectSupplyProviderAuthority(
  businessRef: string,
  connectionRef: string,
  connections: readonly Pick<
    ProviderConnectionOwnerProjection,
    'connectionRef' | 'businessId' | 'providerRef' | 'lifecycle' | 'available'
  >[],
): Extract<CapabilityTransportAuthority, { kind: 'provider_connection' }> | undefined {
  const connection = connections.find((candidate) =>
    candidate.connectionRef === connectionRef
    && candidate.businessId === businessRef
    && candidate.lifecycle === 'active'
    && candidate.available)
  return connection === undefined
    ? undefined
    : {
        kind: 'provider_connection',
        connectionRef: connection.connectionRef,
        providerRef: connection.providerRef,
      }
}

export async function prepareSupplyPublicationV2(
  input: PublishSupplyOperationV2Input,
  dependencies: SupplyPublicationV2Dependencies = {},
): Promise<SupplyPublicationV2Preparation> {
  if (input.source.environment !== input.environment) return refused('environment_mismatch')

  let openApiDocument: ValidOpenApiDocument | undefined
  let x402Inspection: X402SellerEndpointInspection | undefined
  const mcpDiscoveries: McpSourceDiscovery[] = []
  const loadOpenApi = dependencies.loadOpenApi ?? loadPublicOpenApi
  const discoverMcp = dependencies.discoverMcp
    ?? (await import('./internal/mcp-source-discovery')).discoverMcpSource
  const inspectX402 = dependencies.inspectX402
    ?? (await import('./internal/x402-seller-endpoint-inspector')).inspectX402SellerEndpoint
  const previewDependencies: SupplySourcePreviewDependencies = {
    loadOpenApi: async (url) => {
      const document = await loadOpenApi(url)
      openApiDocument = document
      return document
    },
    discoverMcp: async (request) => {
      const discovery = await discoverMcp(request)
      mcpDiscoveries.push(discovery)
      return discovery
    },
    inspectX402: async (request) => {
      x402Inspection = await inspectX402(request)
      return x402Inspection
    },
  }
  const preview = await previewSupplySource(input.source, previewDependencies)
  if (preview.kind === 'action_required') {
    return {
      kind: 'refused',
      reason: 'source_action_required',
      requiredAction: {
        title: preview.requiredAction.title,
        description: preview.requiredAction.description,
        cta: preview.requiredAction.cta,
        ctaLabel: preview.requiredAction.ctaLabel,
      },
    }
  }
  if (preview.kind === 'remote_selection_required') {
    return {
      kind: 'refused',
      reason: 'source_action_required',
      requiredAction: {
        title: 'Select MCP server',
        description: 'Select one exact remote MCP server from the current source metadata, then submit again.',
        cta: null,
        ctaLabel: 'Select server',
      },
    }
  }
  if (preview.sourceDigest !== input.expectedSourceDigest) return refused('source_changed')
  const candidate = preview.candidates.find(({ candidateRef }) => candidateRef === input.candidateRef)
  if (candidate === undefined) return refused('candidate_changed')
  if (candidate.disposition.kind === 'unsupported') return refused(candidate.disposition.reason)
  if (candidate.inputSchema === undefined || candidate.outputSchema === undefined) return refused('schema_missing')

  const requiresConnection = candidate.authentication.kind !== 'public'
  if (requiresConnection && (input.connectionRef === undefined || dependencies.providerAuthority === undefined)) {
    return refused('connection_required')
  }
  if (!requiresConnection && input.connectionRef !== undefined) return refused('connection_not_required')
  if (dependencies.providerAuthority !== undefined
    && dependencies.providerAuthority.connectionRef !== input.connectionRef) {
    return refused('connection_changed')
  }

  const authority: CapabilityTransportAuthority = dependencies.providerAuthority ?? { kind: 'public_upstream' }
  const contract = contractMetadata(input, candidate)
  if (contract === undefined) return refused('consequences_invalid')
  const source = publicationImport({
    input,
    candidate,
    contract,
    authority,
    openApiDocument,
    x402Inspection,
    mcpDiscoveries,
  })
  if (source === undefined) return refused('source_changed')
  const pricingConfig = pricingConfigFor(input, candidate)
  if (pricingConfig === undefined) return refused('pricing_invalid')
  const offering = offeringFor(input, candidate)
  const prepared = await preparePublicationDraft({
    source,
    sourceRevision: preview.sourceRevision,
    pricingConfig,
    evidenceRefs: [preview.sourceDigest, candidate.candidateRef],
    offering,
    derefSchema: (await import('./internal/schema-deref')).dereferenceOpenApiSchema,
  })
  if (prepared.kind === 'refused') return refused(prepared.reason)
  return {
    kind: 'prepared',
    prepared,
    sourceRevision: preview.sourceRevision,
    sourceDigest: preview.sourceDigest,
    candidate,
    sourceDescriptorJson: stableStringify(input.source as StableHashValue),
    sourceSelectorJson: stableStringify(candidate.sourceSelector as StableHashValue),
    sourceAuthorityState: dependencies.providerAuthority !== undefined
      || preview.provenance.authority === 'verified_registry'
      ? 'verified'
      : 'review_required',
    ...(input.validationInput === undefined
      ? {}
      : { validationInputJson: stableStringify(input.validationInput as StableHashValue) }),
  }
}

function contractMetadata(
  input: PublishSupplyOperationV2Input,
  candidate: SupplyOperationCandidate,
): CapabilityContractMetadata | undefined {
  const dataReleaseEffect = input.consequences.effects.find(({ class: effectClass }) => effectClass === 'data_release')
  if (input.consequences.dataUse.length > 0 && dataReleaseEffect === undefined) return undefined
  const effects = input.consequences.effects.map((effect, index) => ({
    effectId: `effect-${index + 1}`,
    ...effect,
  }))
  const dataEffectId = dataReleaseEffect === undefined
    ? undefined
    : `effect-${input.consequences.effects.indexOf(dataReleaseEffect) + 1}`
  if (input.consequences.dataUse.length > 0 && dataEffectId === undefined) return undefined
  const confirmedDataEffectId = dataEffectId ?? 'effect-data-release'
  const evidence = input.consequences.evidence.map((requirement, index) => ({
    evidenceId: `evidence-${index + 1}`,
    ...requirement,
  }))
  const customerAnnotations = evidence.map((requirement, index) => ({
    annotationId: `evidence-${index + 1}`,
    document: 'output' as const,
    pointer: requirement.outputPointer,
    label: requirement.purpose === 'completion' ? 'Result' : `Evidence ${index + 1}`,
    role: requirement.purpose === 'completion' ? 'completion_evidence' as const : requirement.purpose,
  }))
  return {
    capabilityId: `provider.operation.${canonicalDigest({ candidateRef: candidate.candidateRef }).slice(7, 31)}`,
    version: 1,
    name: input.presentation.name,
    description: input.presentation.description,
    customerAnnotations,
    dataUse: input.consequences.dataUse.map((use) => ({
      effectId: confirmedDataEffectId,
      ...use,
      recipient: { kind: 'selected_binding' as const },
    })),
    effects,
    evidence,
    lifecycle: { idempotency: 'required', recovery: 'reconcile_required' },
    ...(input.validationInput === undefined
      ? {}
      : { inputExamples: [{ label: 'Validation input', input: input.validationInput }] }),
  }
}

function offeringFor(input: PublishSupplyOperationV2Input, candidate: SupplyOperationCandidate) {
  const suffix = sourceRouteIdentity(input, candidate).slice(7, 31)
  return {
    offeringId: `offering:provider:${suffix}`,
    networkId: 'ae:public',
    presentation: {
      label: input.presentation.name,
      summary: input.presentation.description,
      price: input.pricing.kind === 'source_x402'
        ? { kind: 'on_request' as const }
        : { kind: 'fixed' as const, amount: input.pricing.kind === 'free'
            ? { currency: 'AUD', units: '0', exponent: 6 }
            : input.pricing.amount },
      materialTerms: [
        { termId: 'category', label: 'Category', value: input.presentation.category },
        ...(input.presentation.serviceArea === undefined ? [] : [{ termId: 'service-area', label: 'Service area', value: input.presentation.serviceArea }]),
        ...(input.presentation.availability === undefined ? [] : [{ termId: 'availability', label: 'Availability', value: input.presentation.availability }]),
      ],
      commercialRelationship: {
        kind: 'none' as const,
        summary: 'No commercial influence on eligibility, inclusion, or order.',
        influencesEligibility: false,
        influencesInclusion: false,
        influencesOrder: false,
        evidenceRefs: ['provider-declared:no-commercial-influence'],
      },
    },
    searchTerms: [...new Set([
      input.presentation.name,
      input.presentation.category,
      ...(input.presentation.serviceArea === undefined ? [] : [input.presentation.serviceArea]),
    ])],
    registrationEvidenceRefs: [input.expectedSourceDigest, input.candidateRef],
  }
}

function commercialFor(
  input: PublishSupplyOperationV2Input,
  candidate: SupplyOperationCandidate,
  authority: CapabilityTransportAuthority,
) {
  const suffix = sourceRouteIdentity(input, candidate).slice(7, 31)
  const sourceAmount = candidate.x402 === undefined
    ? undefined
    : { currency: 'USD', units: candidate.x402.amount, exponent: 6 }
  return {
    offering: {
      ...offeringFor(input, candidate),
      presentation: {
        ...offeringFor(input, candidate).presentation,
        ...(sourceAmount === undefined ? {} : { price: { kind: 'fixed' as const, amount: sourceAmount } }),
      },
    },
    bindingId: `binding:provider:${suffix}`,
    authority,
    registrationEvidenceRefs: [input.expectedSourceDigest, input.candidateRef],
    requestTimeoutMs: 10_000,
  }
}

function sourceRouteIdentity(
  input: PublishSupplyOperationV2Input,
  candidate: SupplyOperationCandidate,
): string {
  const sourceKind = input.source.kind === 'openapi'
    ? 'openapi_http'
    : input.source.kind === 'agent_plugin'
      ? 'agent_plugin_mcp'
      : input.source.kind
  const endpointUrl = 'serverUrl' in candidate.sourceSelector
    ? candidate.sourceSelector.serverUrl
    : 'resourceUrl' in candidate.sourceSelector
      ? candidate.sourceSelector.resourceUrl
      : input.source.kind === 'openapi'
        ? input.source.definitionUrl
        : ''
  return sourceRouteRef({
    sourceKind,
    sourceSelector: canonicalSourceSelector(input, candidate),
    sourceDescriptorJson: stableStringify(input.source as StableHashValue),
    endpointUrl,
  }) ?? canonicalDigest({
    version: 'provider-source-route-fallback:v1',
    sourceKind,
    sourceSelector: candidate.sourceSelector as StableHashValue,
  })
}

function canonicalSourceSelector(
  input: PublishSupplyOperationV2Input,
  candidate: SupplyOperationCandidate,
): CapabilityPublicationSourceSelector {
  const selector = candidate.sourceSelector
  if (input.source.kind === 'openapi' && 'path' in selector) {
    const method = selector.method.toLowerCase()
    return { path: selector.path, method: method === 'get' ? 'get' : 'post' }
  }
  if (input.source.kind === 'agent_plugin' && 'serverName' in selector) {
    return { serverName: selector.serverName, toolName: selector.toolName, protocolVersion: selector.protocolVersion }
  }
  if (input.source.kind === 'mcp' && 'toolName' in selector) {
    return { toolName: selector.toolName, protocolVersion: selector.protocolVersion }
  }
  if (input.source.kind === 'x402' && 'resourceUrl' in selector) {
    return { resourceUrl: selector.resourceUrl }
  }
  return {}
}

function publicationImport(args: Readonly<{
  input: PublishSupplyOperationV2Input
  candidate: SupplyOperationCandidate
  contract: CapabilityContractMetadata
  authority: CapabilityTransportAuthority
  openApiDocument: unknown
  x402Inspection: X402SellerEndpointInspection | undefined
  mcpDiscoveries: readonly McpSourceDiscovery[]
}>): CapabilityPublicationImport | undefined {
  const { input, candidate, contract, authority } = args
  const commercial = commercialFor(input, candidate, authority)
  if (input.source.kind === 'openapi') {
    if (!isRecord(args.openApiDocument) || !('path' in candidate.sourceSelector) || !('method' in candidate.sourceSelector)) return undefined
    const method = candidate.sourceSelector.method.toLowerCase()
    if (method !== 'get' && method !== 'post') return undefined
    return {
      kind: 'openapi_http',
      document: args.openApiDocument,
      operation: { path: candidate.sourceSelector.path, method },
      contract,
      commercial,
      evidenceRefs: [input.expectedSourceDigest, input.candidateRef],
    }
  }
  if (input.source.kind === 'mcp') {
    if (!('toolName' in candidate.sourceSelector) || !('serverUrl' in candidate.sourceSelector)) return undefined
    return {
      kind: 'mcp',
      serverUrl: candidate.sourceSelector.serverUrl,
      protocolVersion: candidate.sourceSelector.protocolVersion,
      tool: {
        name: candidate.sourceSelector.toolName,
        title: candidate.title,
        description: candidate.description,
        inputSchema: candidate.inputSchema,
        outputSchema: candidate.outputSchema,
      },
      contract,
      commercial,
      evidenceRefs: [input.expectedSourceDigest, input.candidateRef],
    }
  }
  if (input.source.kind === 'agent_plugin') {
    if (!('serverName' in candidate.sourceSelector)) return undefined
    return {
      kind: 'agent_plugin_mcp',
      pluginJson: input.source.pluginJson,
      mcpJson: input.source.mcpJson,
      serverName: candidate.sourceSelector.serverName,
      protocolVersion: candidate.sourceSelector.protocolVersion,
      tool: {
        name: candidate.sourceSelector.toolName,
        title: candidate.title,
        description: candidate.description,
        inputSchema: candidate.inputSchema,
        outputSchema: candidate.outputSchema,
      },
      contract,
      commercial,
      evidenceRefs: [input.expectedSourceDigest, input.candidateRef],
    }
  }
  const observation = args.x402Inspection
  if (observation?.kind !== 'observed' || candidate.x402 === undefined || observation.discovery.kind !== 'admitted') return undefined
  const selected = observation.payment.accepts.find(({ alternativeId }) => (
    observation.payment.selection.kind === 'selected'
    && alternativeId === observation.payment.selection.alternativeId
  ))
  if (selected === undefined) return undefined
  return {
    kind: 'x402',
    resource: {
      resourceUrl: observation.endpoint.url,
      method: observation.discovery.method,
      inputSchema: observation.discovery.inputSchema,
      outputSchema: observation.discovery.outputSchema,
      ...(observation.discovery.query === undefined ? {} : { query: observation.discovery.query }),
      price: { currency: 'USD', units: selected.amount, exponent: 6 },
      scheme: selected.scheme,
      network: selected.network,
      asset: selected.asset,
      payTo: selected.payTo,
      routeAmountExponent: 6,
      assetAmountExponent: 6,
      paymentRequired: {
        x402Version: 2,
        resource: { url: observation.endpoint.url },
        accepts: [{
          scheme: selected.scheme,
          network: selected.network,
          amount: selected.amount,
          asset: selected.asset,
          payTo: selected.payTo,
          maxTimeoutSeconds: selected.maxTimeoutSeconds,
          extra: selected.extra,
        }],
      },
    },
    contract,
    commercial,
    evidenceRefs: [input.expectedSourceDigest, input.candidateRef],
  }
}

function pricingConfigFor(input: PublishSupplyOperationV2Input, candidate: SupplyOperationCandidate): unknown | undefined {
  if (input.pricing.kind === 'free') {
    return candidate.x402 === undefined
      ? { version: 'pricing:v3', kind: 'fixed_aud', currency: 'AUD', exponent: 6, amountUnits: '0' }
      : undefined
  }
  if (input.pricing.kind === 'fixed_aud') {
    return candidate.x402 === undefined
      ? { version: 'pricing:v3', kind: 'fixed_aud', currency: 'AUD', exponent: 6, amountUnits: input.pricing.amount.units }
      : undefined
  }
  if (candidate.x402 === undefined) return undefined
  return {
    version: 'pricing:v3',
    kind: 'managed_x402',
    effectTiming: 'payment_required_before_effect',
    sourceRequirement: {
      network: candidate.x402.network,
      asset: candidate.x402.asset,
      atomicUnits: candidate.x402.amount,
    },
    pricingPolicyRef: 'pricing-policy:managed-x402:v1',
    publicDisplay: 'on_request',
  }
}

function refused(reason: string): Extract<SupplyPublicationV2Preparation, { kind: 'refused' }> {
  return { kind: 'refused', reason }
}
