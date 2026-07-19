import {
  openCapabilityDecisionModel,
  type CapabilityContract,
  type JsonValue,
} from '@/modules/capability-contract/public'
import type {
  ActionAuthorityRequirement,
  ActionConsequenceClass,
  ActionRetryClass,
} from '@/modules/common/action'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import type {
  CapabilityOfferingRegistration,
  CapabilityTransportBindingRegistration,
} from './public'
import type { SuppliedCandidateQualification } from './server'

export type PublishedOperationUsageObservation = Readonly<{
  window: Readonly<{ kind: 'rolling'; days: number }>
  calls: number
  distinctPayers: number
  observedAt: number
  source: string
  evidenceRefs: readonly string[]
}>

export type PublishedOperation = Readonly<{
  kind: 'published_operation'
  environment: 'SOURCE-OWNED DEVELOPMENT EVIDENCE'
  operationId: string
  materialDigest: string
  identity: Readonly<{
    businessId: string
    publicationRef: string
    publicationRevision: number
    publicationDigest: string
    contractId: string
    contractVersion: number
    contractDigest: string
    offeringId: string
    offeringDigest: string
    bindingId: string
    bindingDigest: string
    adapterId: string
    endpoint: Readonly<{ method: 'GET' | 'POST'; url: string; path: string; resource: string }>
    price: CapabilityOfferingRegistration['presentation']['price']
    materialTerms: CapabilityOfferingRegistration['presentation']['materialTerms']
    evidenceDigest: string
  }>
  contract: CapabilityContract
  offering: CapabilityOfferingRegistration
  binding: CapabilityTransportBindingRegistration
  readiness: Readonly<{
    observedAt: number
    validUntil: number
    qualificationDigest: string
    evidenceRefs: readonly string[]
  }>
  usageObservation?: PublishedOperationUsageObservation
}>

export type RuntimePublishedOperationDescriptor = Readonly<{
  id: string
  version: string
  name: string
  summary: string
  inputSchema: CapabilityContract['inputSchema']
  outputSchema: CapabilityContract['outputSchema']
  consequenceClass: ActionConsequenceClass
  authorityRequirement: ActionAuthorityRequirement
  retryClass: ActionRetryClass
  materialInputPointers: readonly string[]
  dataUse: CapabilityContract['dataUse']
  effects: CapabilityContract['effects']
  evidence: CapabilityContract['evidence']
  safeContinuations: readonly string[]
  price: CapabilityOfferingRegistration['presentation']['price']
  target: PublishedOperation['identity']
  validateInput(value: unknown): boolean
  validateOutput(value: unknown): boolean
}>

export function materializePublishedOperation(input: Readonly<{
  publication: Readonly<{
    publicationRef: string
    revision: number
    businessId: string
    sourceDigest: string
    readinessObservedAt?: number
    readinessValidUntil?: number
    readinessEvidenceRefs: readonly string[]
  }>
  contract: CapabilityContract
  offering: CapabilityOfferingRegistration
  offeringDigest: string
  binding: CapabilityTransportBindingRegistration
  bindingDigest: string
  admittedConfig: JsonValue
  qualification: SuppliedCandidateQualification
  usageObservation?: PublishedOperationUsageObservation
}>): PublishedOperation {
  const { publication, contract, offering, binding, qualification } = input
  if (qualification.status !== 'eligible' || qualification.validUntil === undefined
    || publication.readinessObservedAt === undefined || publication.readinessValidUntil === undefined
    || publication.publicationRef !== qualification.candidate.publicationRef
    || publication.revision !== qualification.candidate.revision
    || publication.businessId !== qualification.candidate.businessId
    || offering.businessId !== publication.businessId
    || offering.offeringId !== qualification.candidate.offeringId
    || binding.bindingId !== qualification.candidate.bindingId
    || binding.offeringId !== offering.offeringId
    || contract.ref.contractDigest !== qualification.candidate.contractRef.contractDigest) {
    throw new Error('published_operation_sources_not_exact')
  }
  const transport = transportIdentity(binding.endpointUrl, input.admittedConfig)
  if (transport === undefined) throw new Error('published_operation_transport_invalid')
  validateUsage(input.usageObservation)
  const evidenceDigest = canonicalDigest({
    qualification: qualification.sources,
    readinessEvidenceRefs: [...publication.readinessEvidenceRefs].sort(),
  } as StableHashValue)
  const identity = {
    businessId: publication.businessId,
    publicationRef: publication.publicationRef,
    publicationRevision: publication.revision,
    publicationDigest: publication.sourceDigest,
    contractId: contract.ref.capabilityId,
    contractVersion: contract.ref.version,
    contractDigest: contract.ref.contractDigest,
    offeringId: offering.offeringId,
    offeringDigest: input.offeringDigest,
    bindingId: binding.bindingId,
    bindingDigest: input.bindingDigest,
    adapterId: binding.adapter.adapterId,
    endpoint: transport,
    price: offering.presentation.price,
    materialTerms: offering.presentation.materialTerms,
    evidenceDigest,
  } as const
  const materialDigest = canonicalDigest(identity as StableHashValue)
  return {
    kind: 'published_operation',
    environment: 'SOURCE-OWNED DEVELOPMENT EVIDENCE',
    operationId: `published:${publication.businessId}:${contract.ref.capabilityId}:v${contract.ref.version}:${materialDigest.slice(-16)}`,
    materialDigest,
    identity,
    contract,
    offering,
    binding,
    readiness: {
      observedAt: publication.readinessObservedAt,
      validUntil: publication.readinessValidUntil,
      qualificationDigest: qualification.qualificationDigest,
      evidenceRefs: [...publication.readinessEvidenceRefs].sort(),
    },
    ...(input.usageObservation === undefined ? {} : { usageObservation: input.usageObservation }),
  }
}

export function materializeRuntimePublishedOperation(
  operation: PublishedOperation,
): RuntimePublishedOperationDescriptor {
  const decision = openCapabilityDecisionModel(operation.contract)
  const consequenceClass: ActionConsequenceClass = operation.contract.effects.length === 0
    ? 'read_only'
    : operation.contract.effects.some(({ class: effectClass }) => effectClass === 'external_state_change')
      ? 'external_effect'
      : 'communication'
  const authorityRequirement: ActionAuthorityRequirement = operation.contract.effects.length === 0
    ? 'none'
    : 'principal'
  const retryClass: ActionRetryClass = operation.contract.lifecycle.recovery === 'reconcile_required'
    ? 'reconcile_before_retry'
    : operation.contract.lifecycle.idempotency === 'required'
      ? 'attributable_retry'
      : 'replayable'
  return {
    id: operation.operationId,
    version: `published:v1:${operation.materialDigest}`,
    name: operation.contract.name,
    summary: operation.contract.description,
    inputSchema: operation.contract.inputSchema,
    outputSchema: operation.contract.outputSchema,
    consequenceClass,
    authorityRequirement,
    retryClass,
    materialInputPointers: decision.inputs.map(({ inputPointer }) => inputPointer).sort(),
    dataUse: operation.contract.dataUse,
    effects: operation.contract.effects,
    evidence: operation.contract.evidence,
    safeContinuations: retryClass === 'reconcile_before_retry'
      ? ['inspect', 'reconcile']
      : ['inspect'],
    price: operation.identity.price,
    target: operation.identity,
    validateInput: (value) => decision.validateInput(value).kind === 'valid',
    validateOutput: (value) => decision.validateOutput(value).kind === 'valid',
  }
}

function transportIdentity(
  endpointUrl: string,
  config: JsonValue,
): PublishedOperation['identity']['endpoint'] | undefined {
  if (config === null || Array.isArray(config) || typeof config !== 'object') return undefined
  const record = config as Readonly<Record<string, JsonValue>>
  const method = record.method
  if (method !== 'GET' && method !== 'POST') return undefined
  const url = new URL(endpointUrl)
  return { method, url: url.href, path: url.pathname, resource: `${method} ${url.pathname}` }
}

function validateUsage(observation: PublishedOperationUsageObservation | undefined): void {
  if (observation === undefined) return
  if (observation.window.kind !== 'rolling' || !Number.isSafeInteger(observation.window.days)
    || observation.window.days < 1 || observation.window.days > 366
    || !Number.isSafeInteger(observation.calls) || observation.calls < 0
    || !Number.isSafeInteger(observation.distinctPayers) || observation.distinctPayers < 0
    || observation.distinctPayers > observation.calls
    || !Number.isSafeInteger(observation.observedAt)
    || observation.source.trim().length === 0 || observation.evidenceRefs.length < 1) {
    throw new Error('published_operation_usage_observation_invalid')
  }
}
