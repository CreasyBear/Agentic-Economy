import { z } from 'zod'

import { jsonValueSchema, validateJsonSchema } from '@/modules/capability-contract/public'
import { idempotencyKeySchema } from '@/modules/common/action'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'
import { preparePublicationDraft, type PreparedPublicationDraft } from './internal/publication'
import { sourceRouteRef } from './internal/source-route-identity'
import { dereferenceOpenApiSchema } from './internal/schema-deref'
import type {
  CapabilityContractMetadata,
  CapabilityPublicationImport,
  CapabilityPublicationSourceSelector,
} from './internal/publication-importer-types'
import type { CapabilityTransportAuthority } from './internal/transport-terms-schema'
import {
  previewSupplySource,
  supplySourceInputSchema,
  type SupplyToolCandidate,
  type SupplySourcePreviewDependencies,
} from './source-preview'
import type { X402SellerEndpointInspection } from './internal/x402-seller-endpoint-inspector'
import type { ProviderConnectionOwnerProjection } from './provider-connection'
import type { CapabilityPublicationQualityNext } from './internal/publication/input-quality'

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
export const publishSupplyToolV2InputSchema = z.strictObject({
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
  pricing: z.strictObject({ kind: z.literal('source_x402') }),
  validationInput: z.record(z.string(), jsonValueSchema).optional(),
  environment: z.enum(['sandbox', 'production']),
  idempotencyKey: idempotencyKeySchema,
  attestation: z.strictObject({
    authorisedToPublish: z.boolean(),
    informationAccurate: z.literal(true),
    publishAfterSuccessfulValidation: z.literal(true),
  }),
})
export type PublishSupplyToolV2Input = z.infer<typeof publishSupplyToolV2InputSchema>

export type SupplyPublicationV2Preparation =
  | Readonly<{
      kind: 'prepared'
      prepared: PreparedPublicationDraft
      sourceRevision: string
      sourceDigest: string
      candidate: SupplyToolCandidate
      sourceDescriptorJson: string
      sourceSelectorJson: string
      sourceAuthorityState: 'verified' | 'review_required'
      validationInputJson?: string
    }>
  | Readonly<{
      kind: 'refused'
      reason: string
      next?: readonly CapabilityPublicationQualityNext[]
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
  input: PublishSupplyToolV2Input,
  dependencies: SupplyPublicationV2Dependencies = {},
): Promise<SupplyPublicationV2Preparation> {
  if (input.pricing.kind !== 'source_x402') return refused('pricing_invalid')
  let x402Inspection: X402SellerEndpointInspection | undefined
  const inspectX402 = dependencies.inspectX402
    ?? (await import('./internal/x402-seller-endpoint-inspector')).inspectX402SellerEndpoint
  const previewDependencies: SupplySourcePreviewDependencies = {
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
  if (preview.sourceDigest !== input.expectedSourceDigest) return refused('source_changed')
  const publicationAuthorityEstablished = dependencies.providerAuthority !== undefined
  if (publicationAuthorityEstablished && input.attestation.authorisedToPublish !== true) {
    return refused('attestation_required')
  }
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
  if (candidate.x402?.environment !== input.environment) return refused('environment_mismatch')
  if (input.source.environment !== undefined && input.source.environment !== candidate.x402.environment) {
    return refused('environment_mismatch')
  }
  if (input.source.method !== undefined && input.source.method !== candidate.sourceSelector.method) {
    return refused('source_changed')
  }
  const validationInput = input.validationInput
  const contract = contractMetadata({ ...input, ...(validationInput === undefined ? {} : { validationInput }) }, candidate)
  if (contract === undefined) return refused('consequences_invalid')
  const source = publicationImport({
    input,
    candidate,
    contract,
    authority,
    x402Inspection,
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
  if (prepared.kind === 'refused') return prepared
  return {
    kind: 'prepared',
    prepared,
    sourceRevision: preview.sourceRevision,
    sourceDigest: preview.sourceDigest,
    candidate,
    sourceDescriptorJson: stableStringify(input.source as StableHashValue),
    sourceSelectorJson: stableStringify(candidate.sourceSelector as StableHashValue),
    sourceAuthorityState: dependencies.providerAuthority !== undefined
      ? 'verified'
      : 'review_required',
    ...(validationInput === undefined
      ? {}
      : { validationInputJson: stableStringify(validationInput as StableHashValue) }),
  }
}

function contractMetadata(
  input: PublishSupplyToolV2Input,
  candidate: SupplyToolCandidate,
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

function offeringFor(input: PublishSupplyToolV2Input, candidate: SupplyToolCandidate) {
  const suffix = sourceRouteIdentity(input, candidate).slice(7, 31)
  return {
    offeringId: `offering:provider:${suffix}`,
    networkId: 'ae:public',
    presentation: {
      label: input.presentation.name,
      summary: input.presentation.description,
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
  input: PublishSupplyToolV2Input,
  candidate: SupplyToolCandidate,
  authority: CapabilityTransportAuthority,
) {
  const suffix = sourceRouteIdentity(input, candidate).slice(7, 31)
  return {
    offering: offeringFor(input, candidate),
    bindingId: `binding:provider:${suffix}`,
    authority,
    registrationEvidenceRefs: [input.expectedSourceDigest, input.candidateRef],
    requestTimeoutMs: 10_000,
  }
}

function sourceRouteIdentity(
  input: PublishSupplyToolV2Input,
  candidate: SupplyToolCandidate,
): string {
  return sourceRouteRef({
    sourceKind: 'x402',
    sourceSelector: { resourceUrl: candidate.sourceSelector.resourceUrl },
    sourceDescriptorJson: stableStringify(input.source as StableHashValue),
    endpointUrl: candidate.sourceSelector.resourceUrl,
  }) ?? canonicalDigest({
    version: 'provider-source-route-fallback:v1',
    sourceKind: 'x402',
    sourceSelector: candidate.sourceSelector as StableHashValue,
  })
}

function publicationImport(args: Readonly<{
  input: PublishSupplyToolV2Input
  candidate: SupplyToolCandidate
  contract: CapabilityContractMetadata
  authority: CapabilityTransportAuthority
  x402Inspection: X402SellerEndpointInspection | undefined
}>): CapabilityPublicationImport | undefined {
  const { input, candidate, contract, authority } = args
  const commercial = commercialFor(input, candidate, authority)
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

function pricingConfigFor(_input: PublishSupplyToolV2Input, candidate: SupplyToolCandidate): unknown | undefined {
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
