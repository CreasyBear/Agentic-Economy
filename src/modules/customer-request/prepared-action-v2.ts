import { z } from 'zod'

import {
  isBoundedJsonValue,
  sameCapabilityContractRef,
  type CapabilityDecisionModel,
  type JsonValue,
} from '@/modules/capability-contract/public'
import type {
  CapabilityCancellation,
  CapabilityOfferingRegistration,
} from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { compareExactAmounts, exactAmountSchema, pricingConfigDigest, pricingConfigSchema } from '@/modules/money/public'
import type { ExactAmount, PricingConfig } from '@/modules/money/public'
import { deepFreeze } from '@/modules/common/deep-freeze'
import { readJsonPointer } from '@/modules/common/json-pointer'
import type { StableHashValue } from '@/modules/common/stable-hash'

import type { ActionPreparationLineage } from './action-preparation'

const identifier = z.string().trim().min(1).max(500)
const digest = z.string().regex(/^sha256:[0-9a-f]{64}$/)
const contractRef = z.strictObject({
  capabilityId: identifier,
  version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  contractDigest: digest,
})
const providerOptionEnvelope = z.strictObject({
  format: z.literal('ae.provider-option:v1'),
  operationRef: identifier,
  contractRef,
  offeringId: identifier,
  bindingId: identifier,
  assertionRef: identifier,
  assertedAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  validUntil: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  output: z.unknown(),
})

type OfferingPresentation = CapabilityOfferingRegistration['presentation']

export type PreparedActionOptionCandidate = Readonly<{
  operation: Readonly<{
    operationRef: string
    state: 'released' | 'not_released' | 'uncertain'
    lineage: ActionPreparationLineage
    authorityReference: string
    authorityScopeDigest: string
    responseBodyText?: string
    responseBodyDigest?: string
    responseStatus?: number
    responseContentType?: string
    releaseEvidenceRef?: string
  }>
  model: CapabilityDecisionModel
  pricingConfig: PricingConfig
  priceDigest: string
  business: Readonly<{ businessId: string; name: string }>
  offering: Readonly<{
    offeringId: string
    registrationHash: string
    registrationEvidenceRefs: readonly string[]
    presentation: OfferingPresentation
  }>
  binding: Readonly<{
    bindingId: string
    registrationHash: string
    registrationEvidenceRefs: readonly string[]
    cancellation: CapabilityCancellation
  }>
  disclosure: Readonly<{
    outcome: 'released' | 'not_released' | 'uncertain'
    allocationRefs: readonly string[]
  }>
}>

type PreparedActionEvidence = Readonly<{
  evidenceId: string
  outputPointer: string
  purpose: 'comparison' | 'completion' | 'recovery'
  schemaIdentity: string
  valueDigest: string
}>

type PreparedActionPrice = Readonly<{
  minimum: ExactAmount
  maximum: ExactAmount
  components: readonly Readonly<{
    kind: 'registered_offering'
    label: string
    minimum: ExactAmount
    maximum: ExactAmount
    evidenceRefs: readonly string[]
  }>[]
}>

type PreparedActionDisclosure = Readonly<{
  authorityReference: string
  authorityScopeDigest: string
  operationRef: string
  releaseEvidenceRef: string
  allocationRefs: readonly string[]
}>

export type PreparedActionV2 = Readonly<{
  format: 'ae.prepared-action:v2'
  preparedActionRef: string
  preparedActionDigest: string
  lineage: ActionPreparationLineage
  business: Readonly<{ businessId: string; name: string }>
  offering: Readonly<{
    offeringId: string
    registrationHash: string
    registrationEvidenceRefs: readonly string[]
    label: string
    summary: string
  }>
  binding: Readonly<{
    bindingId: string
    registrationHash: string
    registrationEvidenceRefs: readonly string[]
  }>
  providerAssertion: Readonly<{
    assertionRef: string
    operationRef: string
    assertedAt: number
    validUntil: number
    responseDigest: string
    outputDigest: string
    output: JsonValue
    evidence: readonly PreparedActionEvidence[]
  }>
  pricingConfig: PricingConfig
  priceDigest: string
  price: PreparedActionPrice
  materialTerms: OfferingPresentation['materialTerms']
  commercialRelationship: OfferingPresentation['commercialRelationship']
  cancellation: CapabilityCancellation
  disclosure: PreparedActionDisclosure
  comparison: Readonly<
    | {
        kind: 'single_option'
        candidateCount: 1
        selectedAssertionRef: string
      }
    | {
        kind: 'lowest_maximum_price'
        candidateCount: number
        selectedAssertionRef: string
        evidenceRef: string
        commercialInfluence: 'none' | 'disclosed'
        comparedAssertionRefs: readonly string[]
      }
  >
  alternatives: readonly Readonly<{
    assertionRef: string
    operationRef: string
    responseDigest: string
    outputDigest: string
    evidence: readonly PreparedActionEvidence[]
    business: Readonly<{ businessId: string; name: string }>
    offeringId: string
    offeringRegistrationHash: string
    offeringRegistrationEvidenceRefs: readonly string[]
    bindingId: string
    bindingRegistrationHash: string
    bindingRegistrationEvidenceRefs: readonly string[]
    pricingConfig: PricingConfig
    priceDigest: string
    price: PreparedActionPrice
    materialTerms: OfferingPresentation['materialTerms']
    commercialRelationship: OfferingPresentation['commercialRelationship']
    cancellation: CapabilityCancellation
    disclosure: PreparedActionDisclosure
    expiresAt: number
  }>[]
  fallbacks: readonly PreparedActionFallback[]
  preparedAt: number
  expiresAt: number
}>

type PreparedActionFallbackReason =
  | 'disclosure_not_released'
  | 'provider_response_invalid'
  | 'provider_echo_mismatch'
  | 'provider_assertion_expired'
  | 'provider_evidence_invalid'
  | 'commercial_terms_unavailable'

type PreparedActionFallback = Readonly<{
  operationRef: string
  reason: PreparedActionFallbackReason
  business: Readonly<{ businessId: string; name: string }>
  offeringId: string
  offeringRegistrationHash: string
  offeringRegistrationEvidenceRefs: readonly string[]
  bindingId: string
  bindingRegistrationHash: string
  bindingRegistrationEvidenceRefs: readonly string[]
  commercialRelationship: OfferingPresentation['commercialRelationship']
  disclosureOutcome: 'released' | 'not_released' | 'uncertain'
  authorityReference: string
  authorityScopeDigest: string
  allocationRefs: readonly string[]
  evidenceRefs: readonly string[]
  responseDigest?: string
  assertionRef?: string
  validUntil?: number
}>

export type CompilePreparedActionOptionsResult =
  | Readonly<{ kind: 'prepared'; preparedAction: PreparedActionV2 }>
  | Readonly<{
      kind: 'not_prepared'
      reason:
        | 'disclosure_not_released'
        | 'provider_response_invalid'
        | 'provider_echo_mismatch'
        | 'provider_assertion_expired'
        | 'provider_evidence_invalid'
        | 'commercial_terms_unavailable'
        | 'selection_required'
        | 'comparison_unavailable'
        | 'commercial_influence_blocks_selection'
        | 'prepared_action_too_large'
        | 'capability_authority_changed'
    }>
type PreparedActionFailureReason = Extract<CompilePreparedActionOptionsResult, { kind: 'not_prepared' }>['reason']

export function preparedActionV2Digest(action: PreparedActionV2): string {
  const { preparedActionDigest: _digest, ...material } = action
  return canonicalDigest(material as StableHashValue)
}

export function compilePreparedActionOptions(input: Readonly<{
  lineage: ActionPreparationLineage
  candidates: readonly PreparedActionOptionCandidate[]
  selection: Readonly<
    | { kind: 'single_option' }
    | { kind: 'lowest_maximum_price'; basis: 'customer_request'; evidenceRef: string }
  >
  now: number
}>): CompilePreparedActionOptionsResult {
  if (!Number.isSafeInteger(input.now) || input.now < 0) {
    return { kind: 'not_prepared', reason: 'provider_response_invalid' }
  }
  if (input.candidates.some((candidate) => {
    const relationship = candidate.offering.presentation.commercialRelationship
    return relationship.influencesEligibility || relationship.influencesInclusion || relationship.influencesOrder
  })) {
    return { kind: 'not_prepared', reason: 'commercial_influence_blocks_selection' }
  }
  const prepared: PreparedActionV2[] = []
  const fallbacks: PreparedActionFallback[] = []
  let firstFailure: Extract<CompilePreparedActionOptionsResult, { kind: 'not_prepared' }> | undefined
  for (const candidate of input.candidates) {
    const result = compileSingleOption(input.lineage, candidate, input.now)
    if (result.kind === 'prepared') prepared.push(result.preparedAction)
    else {
      firstFailure ??= result
      if (!isFallbackReason(result.reason)) return result
      fallbacks.push(compileFallback(candidate, result.reason))
    }
  }
  if (prepared.length === 0) return firstFailure ?? { kind: 'not_prepared', reason: 'selection_required' }
  if (prepared.length === 1) {
    const selected = prepared[0]
    return selected === undefined
      ? { kind: 'not_prepared', reason: 'selection_required' }
      : withFallbacks(selected, fallbacks)
  }
  if (input.selection.kind === 'lowest_maximum_price') {
    return compileLowestMaximumPrice(input as Readonly<{
      lineage: ActionPreparationLineage
      candidates: readonly PreparedActionOptionCandidate[]
      selection: Readonly<{ kind: 'lowest_maximum_price'; basis: 'customer_request'; evidenceRef: string }>
      now: number
    }>, prepared, fallbacks)
  }
  return { kind: 'not_prepared', reason: 'selection_required' }
}

function compileSingleOption(
  lineage: ActionPreparationLineage,
  candidate: PreparedActionOptionCandidate,
  now: number,
): CompilePreparedActionOptionsResult {
  if (!sameLineage(lineage, candidate.operation.lineage)
    || !sameCapabilityContractRef(lineage.contractRef, candidate.model.contractRef)
    || lineage.selectionKey !== candidate.model.selectionKey
    || lineage.semanticDigest !== candidate.model.semanticDigest) {
    return { kind: 'not_prepared', reason: 'capability_authority_changed' }
  }
  if (candidate.operation.state !== 'released' || candidate.disclosure.outcome !== 'released'
    || candidate.operation.releaseEvidenceRef === undefined) {
    return { kind: 'not_prepared', reason: 'disclosure_not_released' }
  }
  const bodyText = candidate.operation.responseBodyText
  const responseDigest = candidate.operation.responseBodyDigest
  if (candidate.operation.responseStatus === undefined || candidate.operation.responseStatus < 200
    || candidate.operation.responseStatus >= 300
    || candidate.operation.responseContentType === undefined
    || !/^application\/(?:[a-z0-9.+-]*\+)?json(?:\s*;|$)/iu.test(candidate.operation.responseContentType)
    || bodyText === undefined || responseDigest === undefined || canonicalDigest(bodyText) !== responseDigest) {
    return { kind: 'not_prepared', reason: 'provider_response_invalid' }
  }
  const envelope = parseProviderOptionEnvelope(bodyText)
  if (envelope === undefined) return { kind: 'not_prepared', reason: 'provider_response_invalid' }
  if (envelope.operationRef !== candidate.operation.operationRef
    || !sameCapabilityContractRef(envelope.contractRef, lineage.contractRef)
    || envelope.offeringId !== candidate.offering.offeringId
    || envelope.bindingId !== candidate.binding.bindingId) {
    return { kind: 'not_prepared', reason: 'provider_echo_mismatch' }
  }
  if (envelope.assertedAt > now || envelope.validUntil <= now
    || envelope.validUntil <= envelope.assertedAt) {
    return { kind: 'not_prepared', reason: 'provider_assertion_expired' }
  }
  const validated = candidate.model.validateOutput(envelope.output)
  if (validated.kind !== 'valid') return { kind: 'not_prepared', reason: 'provider_response_invalid' }
  const evidence = projectEvidence(candidate.model, validated.value)
  if (evidence === undefined) return { kind: 'not_prepared', reason: 'provider_evidence_invalid' }
  const pricingConfigResult = pricingConfigSchema.safeParse(candidate.pricingConfig)
  if (!pricingConfigResult.success || pricingConfigDigest(pricingConfigResult.data) !== candidate.priceDigest) {
    return { kind: 'not_prepared', reason: 'commercial_terms_unavailable' }
  }
  const price = registeredPrice(candidate.offering, pricingConfigResult.data)
  if (price === undefined) return { kind: 'not_prepared', reason: 'commercial_terms_unavailable' }

  const preparedActionRef = `prepared-action:v2:${canonicalDigest({
    lineage,
    assertionRef: envelope.assertionRef,
    offeringRegistrationHash: candidate.offering.registrationHash,
    bindingRegistrationHash: candidate.binding.registrationHash,
  } as StableHashValue)}`
  const material = {
    format: 'ae.prepared-action:v2' as const,
    preparedActionRef,
    lineage: cloneLineage(lineage),
    business: { ...candidate.business },
    offering: {
      offeringId: candidate.offering.offeringId,
      registrationHash: candidate.offering.registrationHash,
      registrationEvidenceRefs: [...candidate.offering.registrationEvidenceRefs],
      label: candidate.offering.presentation.label,
      summary: candidate.offering.presentation.summary,
    },
    binding: {
      bindingId: candidate.binding.bindingId,
      registrationHash: candidate.binding.registrationHash,
      registrationEvidenceRefs: [...candidate.binding.registrationEvidenceRefs],
    },
    providerAssertion: {
      assertionRef: envelope.assertionRef,
      operationRef: envelope.operationRef,
      assertedAt: envelope.assertedAt,
      validUntil: envelope.validUntil,
      responseDigest,
      outputDigest: canonicalDigest(validated.value as StableHashValue),
      output: validated.value,
      evidence,
    },
    pricingConfig: pricingConfigResult.data,
    priceDigest: candidate.priceDigest,
    price,
    materialTerms: candidate.offering.presentation.materialTerms.map((term) => ({ ...term })),
    commercialRelationship: {
      ...candidate.offering.presentation.commercialRelationship,
      evidenceRefs: [...candidate.offering.presentation.commercialRelationship.evidenceRefs],
    },
    cancellation: {
      ...candidate.binding.cancellation,
      evidenceRefs: [...candidate.binding.cancellation.evidenceRefs],
    },
    disclosure: {
      authorityReference: candidate.operation.authorityReference,
      authorityScopeDigest: candidate.operation.authorityScopeDigest,
      operationRef: candidate.operation.operationRef,
      releaseEvidenceRef: candidate.operation.releaseEvidenceRef,
      allocationRefs: [...candidate.disclosure.allocationRefs].sort(),
    },
    comparison: {
      kind: 'single_option' as const,
      candidateCount: 1 as const,
      selectedAssertionRef: envelope.assertionRef,
    },
    alternatives: [],
    fallbacks: [],
    preparedAt: now,
    expiresAt: envelope.validUntil,
  }
  return finalizePreparedAction(material)
}

function compileLowestMaximumPrice(input: Readonly<{
  lineage: ActionPreparationLineage
  candidates: readonly PreparedActionOptionCandidate[]
  selection: Readonly<{ kind: 'lowest_maximum_price'; basis: 'customer_request'; evidenceRef: string }>
  now: number
}>, prepared: readonly PreparedActionV2[], fallbacks: readonly PreparedActionFallback[]): CompilePreparedActionOptionsResult {
  if (input.candidates.length < 2 || input.candidates.length > 64
    || input.selection.evidenceRef.trim().length === 0 || input.selection.evidenceRef.length > 500) {
    return { kind: 'not_prepared', reason: 'comparison_unavailable' }
  }
  if (prepared.some((option) => {
    const relationship = option.commercialRelationship
    return relationship.influencesEligibility || relationship.influencesInclusion || relationship.influencesOrder
  })) {
    return { kind: 'not_prepared', reason: 'commercial_influence_blocks_selection' }
  }
  const firstMaximum = prepared[0]?.price.maximum
  if (firstMaximum === undefined || prepared.some((option) => compareExactAmounts(option.price.maximum, firstMaximum) === undefined)) {
    return { kind: 'not_prepared', reason: 'comparison_unavailable' }
  }
  const ordered = prepared.toSorted((left, right) => (
    (compareExactAmounts(left.price.maximum, right.price.maximum) ?? 0)
      || left.providerAssertion.assertionRef.localeCompare(right.providerAssertion.assertionRef)
  ))
  const selected = ordered[0]
  const next = ordered[1]
  if (selected === undefined || (next !== undefined
    && compareExactAmounts(selected.price.maximum, next.price.maximum) === 0)) {
    return { kind: 'not_prepared', reason: 'comparison_unavailable' }
  }
  const comparedAssertionRefs = prepared.map(({ providerAssertion }) => providerAssertion.assertionRef).sort()
  if (new Set(comparedAssertionRefs).size !== prepared.length) {
    return { kind: 'not_prepared', reason: 'provider_evidence_invalid' }
  }
  const comparison = {
    kind: 'lowest_maximum_price' as const,
    candidateCount: prepared.length,
    selectedAssertionRef: selected.providerAssertion.assertionRef,
    evidenceRef: input.selection.evidenceRef,
    commercialInfluence: prepared.some(({ commercialRelationship }) => commercialRelationship.kind !== 'none')
      ? 'disclosed' as const
      : 'none' as const,
    comparedAssertionRefs,
  }
  const alternatives = ordered.slice(1).map((option) => ({
    assertionRef: option.providerAssertion.assertionRef,
    operationRef: option.providerAssertion.operationRef,
    responseDigest: option.providerAssertion.responseDigest,
    outputDigest: option.providerAssertion.outputDigest,
    evidence: option.providerAssertion.evidence.map((evidence) => ({ ...evidence })),
    pricingConfig: option.pricingConfig,
    priceDigest: option.priceDigest,
    price: option.price,
    business: { ...option.business },
    offeringId: option.offering.offeringId,
    offeringRegistrationHash: option.offering.registrationHash,
    offeringRegistrationEvidenceRefs: [...option.offering.registrationEvidenceRefs],
    bindingId: option.binding.bindingId,
    bindingRegistrationHash: option.binding.registrationHash,
    bindingRegistrationEvidenceRefs: [...option.binding.registrationEvidenceRefs],
    materialTerms: option.materialTerms.map((term) => ({ ...term })),
    commercialRelationship: {
      ...option.commercialRelationship,
      evidenceRefs: [...option.commercialRelationship.evidenceRefs],
    },
    cancellation: { ...option.cancellation, evidenceRefs: [...option.cancellation.evidenceRefs] },
    disclosure: { ...option.disclosure, allocationRefs: [...option.disclosure.allocationRefs] },
    expiresAt: option.expiresAt,
  }))
  const { preparedActionDigest: _priorDigest, comparison: _priorComparison,
    alternatives: _priorAlternatives, ...selectedBase } = selected
  const material = { ...selectedBase, comparison, alternatives, fallbacks }
  return finalizePreparedAction(material)
}

function withFallbacks(
  action: PreparedActionV2, fallbacks: readonly PreparedActionFallback[],
): CompilePreparedActionOptionsResult {
  const { preparedActionDigest: _digest, ...base } = action
  return finalizePreparedAction({ ...base, fallbacks })
}

function finalizePreparedAction(
  material: Omit<PreparedActionV2, 'preparedActionDigest'>,
): CompilePreparedActionOptionsResult {
  const preparedAction = { ...material, preparedActionDigest: canonicalDigest(material as StableHashValue) }
  if (new TextEncoder().encode(JSON.stringify(preparedAction)).byteLength > 512 * 1024) {
    return { kind: 'not_prepared', reason: 'prepared_action_too_large' }
  }
  return deepFreeze({ kind: 'prepared', preparedAction }) as CompilePreparedActionOptionsResult
}

function isFallbackReason(reason: PreparedActionFailureReason): reason is PreparedActionFallbackReason {
  return reason === 'disclosure_not_released' || reason === 'provider_response_invalid'
    || reason === 'provider_echo_mismatch' || reason === 'provider_assertion_expired'
    || reason === 'provider_evidence_invalid' || reason === 'commercial_terms_unavailable'
}

function compileFallback(
  candidate: PreparedActionOptionCandidate, reason: PreparedActionFallbackReason,
): PreparedActionFallback {
  const envelope = candidate.operation.responseBodyText === undefined
    ? undefined
    : parseProviderOptionEnvelope(candidate.operation.responseBodyText)
  const evidenceRefs = new Set([
    ...candidate.offering.registrationEvidenceRefs,
    ...candidate.binding.registrationEvidenceRefs,
    ...(candidate.operation.releaseEvidenceRef === undefined ? [] : [candidate.operation.releaseEvidenceRef]),
  ])
  return {
    operationRef: candidate.operation.operationRef,
    reason,
    business: { ...candidate.business },
    offeringId: candidate.offering.offeringId,
    offeringRegistrationHash: candidate.offering.registrationHash,
    offeringRegistrationEvidenceRefs: [...candidate.offering.registrationEvidenceRefs],
    bindingId: candidate.binding.bindingId,
    bindingRegistrationHash: candidate.binding.registrationHash,
    bindingRegistrationEvidenceRefs: [...candidate.binding.registrationEvidenceRefs],
    commercialRelationship: {
      ...candidate.offering.presentation.commercialRelationship,
      evidenceRefs: [...candidate.offering.presentation.commercialRelationship.evidenceRefs],
    },
    disclosureOutcome: candidate.disclosure.outcome,
    authorityReference: candidate.operation.authorityReference,
    authorityScopeDigest: candidate.operation.authorityScopeDigest,
    allocationRefs: [...candidate.disclosure.allocationRefs].sort(),
    evidenceRefs: [...evidenceRefs].sort(),
    ...(candidate.operation.responseBodyDigest === undefined
      ? {} : { responseDigest: candidate.operation.responseBodyDigest }),
    ...(envelope === undefined ? {} : { assertionRef: envelope.assertionRef, validUntil: envelope.validUntil }),
  }
}

function parseProviderOptionEnvelope(bodyText: string): z.infer<typeof providerOptionEnvelope> | undefined {
  try {
    const parsed = providerOptionEnvelope.safeParse(JSON.parse(bodyText))
    return parsed.success && isBoundedJsonValue(parsed.data.output) ? parsed.data : undefined
  } catch {
    return undefined
  }
}

function projectEvidence(
  model: CapabilityDecisionModel,
  output: JsonValue,
): readonly PreparedActionEvidence[] | undefined {
  const projected: PreparedActionEvidence[] = []
  for (const semantic of model.evidence) {
    const pointed = readJsonPointer(output, semantic.outputPointer)
    if (pointed === undefined || !isBoundedJsonValue(pointed)) {
      if (semantic.guaranteed || semantic.purpose === 'comparison') return undefined
      continue
    }
    projected.push({
      evidenceId: semantic.evidenceId,
      outputPointer: semantic.outputPointer,
      purpose: semantic.purpose,
      schemaIdentity: semantic.schemaIdentity,
      valueDigest: canonicalDigest(pointed as StableHashValue),
    })
  }
  return deepFreeze(projected.sort((left, right) => left.outputPointer.localeCompare(right.outputPointer)))
}

function registeredPrice(
  candidate: PreparedActionOptionCandidate['offering'],
  pricingConfig: PricingConfig,
): PreparedActionPrice | undefined {
  const price = candidate.presentation.price
  if (price.kind !== 'fixed'
    || compareExactAmounts(price.amount, pricingConfig.paidAmount) !== 0
    || !exactAmountSchema.safeParse(price.amount).success) return undefined
  const minimum = price.amount
  const maximum = price.amount
  return deepFreeze({
    minimum,
    maximum,
    components: [{
      kind: 'registered_offering' as const,
      label: candidate.presentation.label,
      minimum,
      maximum,
      evidenceRefs: [...candidate.registrationEvidenceRefs],
    }],
  })
}


function sameLineage(left: ActionPreparationLineage, right: ActionPreparationLineage): boolean {
  return canonicalDigest(left as StableHashValue) === canonicalDigest(right as StableHashValue)
}

function cloneLineage(lineage: ActionPreparationLineage): ActionPreparationLineage {
  return { ...lineage, contractRef: { ...lineage.contractRef } }
}

