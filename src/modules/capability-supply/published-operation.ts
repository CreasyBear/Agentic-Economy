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

import {
  admitRegisteredTransport,
  capabilityBindingRegistrationHash,
  capabilityOperationId,
  capabilityOfferingRegistrationHash,
  connectionAuthoritySnapshotIsValid,
  createPublicOperationRef,
  type AdmittedTransportMaterial,
  type CapabilityConnectionAuthoritySnapshot,
  type CapabilityOfferingRegistration,
  type CapabilityTransportBindingRegistration,
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
    transportConfigDigest: string
    endpoint: Readonly<{ method: 'GET' | 'POST'; url: string; path: string; resource: string }>
    payment: Readonly<{ kind: 'none' }> | Readonly<{
      kind: 'x402'
      network: string
      asset: string
      payTo: string
      currency: string
      routeAmountExponent: number
      assetAmountExponent: number
    }>
    paymentRecipient: string
    price: CapabilityOfferingRegistration['presentation']['price']
    materialTerms: CapabilityOfferingRegistration['presentation']['materialTerms']
    evidenceDigest: string
    connectionAuthority?: CapabilityConnectionAuthoritySnapshot
  }>
  contract: CapabilityContract
  offering: CapabilityOfferingRegistration
  binding: CapabilityTransportBindingRegistration
  connectionAuthority?: CapabilityConnectionAuthoritySnapshot
  transport: AdmittedTransportMaterial
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
  binding: CapabilityTransportBindingRegistration
  connectionAuthority?: CapabilityConnectionAuthoritySnapshot
  admittedTransport: AdmittedTransportMaterial
  qualification: SuppliedCandidateQualification
  usageObservation?: PublishedOperationUsageObservation
}>): PublishedOperation {
  const { publication, contract, offering, binding, connectionAuthority, qualification, admittedTransport } = input
  const admittedConfig = parseAdmittedConfig(admittedTransport)
  const authoritativeAdmission = admitRegisteredTransport({
    adapterId: binding.adapter.adapterId,
    endpointUrl: binding.endpointUrl,
    authority: binding.authority,
    continuation: binding.continuation,
    cancellation: binding.cancellation,
    config: binding.adapter.config,
  })
  const offeringDigest = capabilityOfferingRegistrationHash(offering)
  const bindingDigest = capabilityBindingRegistrationHash(binding, admittedTransport)
  const expectedOperationRef = createPublicOperationRef({
    operationId: capabilityOperationId(contract.ref.capabilityId),
    publicationRef: publication.publicationRef,
    publicationRevision: publication.revision,
    contractRef: contract.ref,
  })
  if (!connectionAuthorityIsExact({
    authority: binding.authority,
    adapterId: binding.adapter.adapterId,
    expectedOperationRef,
    snapshot: connectionAuthority,
  })) {
    throw new Error('published_operation_connection_authority_invalid')
  }
  const sources = new Map(qualification.sources.map((source) => [source.kind, source]))
  if (authoritativeAdmission.kind !== 'admitted'
    || authoritativeAdmission.transport.configJson !== admittedTransport.configJson
    || authoritativeAdmission.transport.configDigest !== admittedTransport.configDigest
    || authoritativeAdmission.transport.adapterId !== binding.adapter.adapterId
    || qualification.status !== 'eligible' || qualification.validUntil === undefined
    || publication.readinessObservedAt === undefined || publication.readinessValidUntil === undefined
    || publication.publicationRef !== qualification.candidate.publicationRef
    || publication.revision !== qualification.candidate.revision
    || publication.businessId !== qualification.candidate.businessId
    || offering.businessId !== publication.businessId
    || offering.offeringId !== qualification.candidate.offeringId
    || binding.bindingId !== qualification.candidate.bindingId
    || binding.offeringId !== offering.offeringId
    || contract.ref.capabilityId !== qualification.candidate.contractRef.capabilityId
    || contract.ref.version !== qualification.candidate.contractRef.version
    || contract.ref.contractDigest !== qualification.candidate.contractRef.contractDigest
    || !sameContractRef(offering.contractRef, contract.ref)
    || !sameContractRef(binding.contractRef, contract.ref)
    || binding.networkId !== offering.networkId
    || binding.adapter.adapterId !== admittedTransportAdapter(binding, admittedConfig)
    || sources.get('publication')?.digest !== publication.sourceDigest
    || sources.get('contract')?.digest !== contract.ref.contractDigest
    || sources.get('offering')?.digest !== offeringDigest
    || sources.get('binding')?.digest !== bindingDigest
    || sources.get('readiness') === undefined) {
    throw new Error('published_operation_sources_not_exact')
  }
  const transport = transportIdentity(binding.endpointUrl, admittedConfig)
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
    offeringDigest,
    bindingId: binding.bindingId,
    bindingDigest,
    adapterId: binding.adapter.adapterId,
    transportConfigDigest: admittedTransport.configDigest,
    endpoint: transport,
    payment: paymentIdentity(binding.adapter.adapterId, admittedConfig),
    paymentRecipient: paymentRecipient(binding.adapter.adapterId, admittedConfig),
    price: offering.presentation.price,
    materialTerms: offering.presentation.materialTerms,
    evidenceDigest,
    ...(connectionAuthority === undefined ? {} : { connectionAuthority }),
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
    ...(connectionAuthority === undefined ? {} : { connectionAuthority }),
    transport: admittedTransport,
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

function parseAdmittedConfig(transport: AdmittedTransportMaterial): JsonValue {
  let parsed: unknown
  try {
    parsed = JSON.parse(transport.configJson)
  } catch {
    throw new Error('published_operation_transport_invalid')
  }
  if (canonicalDigest(parsed as StableHashValue) !== transport.configDigest) {
    throw new Error('published_operation_transport_invalid')
  }
  return parsed as JsonValue
}

function admittedTransportAdapter(
  binding: CapabilityTransportBindingRegistration,
  config: JsonValue,
): string | undefined {
  return canonicalDigest(config as StableHashValue)
    === canonicalDigest(binding.adapter.config as StableHashValue)
    ? binding.adapter.adapterId
    : undefined
}

function sameContractRef(
  left: CapabilityTransportBindingRegistration['contractRef'],
  right: CapabilityContract['ref'],
): boolean {
  return left.capabilityId === right.capabilityId
    && left.version === right.version
    && left.contractDigest === right.contractDigest
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

function paymentIdentity(
  adapterId: string,
  config: JsonValue,
): PublishedOperation['identity']['payment'] {
  if (adapterId !== 'x402-fetch:v2') return { kind: 'none' }
  if (config === null || Array.isArray(config) || typeof config !== 'object') {
    throw new Error('published_operation_transport_invalid')
  }
  const value = config as Readonly<Record<string, JsonValue>>
  if (typeof value.network !== 'string' || typeof value.asset !== 'string'
    || typeof value.payTo !== 'string' || typeof value.currency !== 'string'
    || typeof value.routeAmountExponent !== 'number'
    || typeof value.assetAmountExponent !== 'number') {
    throw new Error('published_operation_transport_invalid')
  }
  return {
    kind: 'x402',
    network: value.network,
    asset: value.asset,
    payTo: value.payTo,
    currency: value.currency,
    routeAmountExponent: value.routeAmountExponent,
    assetAmountExponent: value.assetAmountExponent,
  }
}

function paymentRecipient(adapterId: string, config: JsonValue): string {
  const payment = paymentIdentity(adapterId, config)
  return payment.kind === 'x402' ? payment.payTo : 'none'
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
function connectionAuthorityIsExact(input: Readonly<{
  authority: CapabilityTransportBindingRegistration['authority']
  adapterId: string
  expectedOperationRef: string
  snapshot: CapabilityConnectionAuthoritySnapshot | undefined
}>): boolean {
  if (input.authority.kind === 'keyless') return input.snapshot === undefined
  const snapshot = input.snapshot
  return connectionAuthoritySnapshotIsValid(snapshot)
    && snapshot.connectionRef === input.authority.connectionRef
    && snapshot.providerRef === input.authority.providerRef
    && snapshot.adapterId === input.adapterId
    && snapshot.operationRef === input.expectedOperationRef
}
