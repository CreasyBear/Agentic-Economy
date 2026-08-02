import type { CapabilityDecisionModel } from '@/modules/capability-contract/public'
import type { CustomerRequestV2Aggregate } from '@/modules/customer-request/compiler'
import type {
  ActionPreparationLineage,
  DurableActionPreparation,
} from '@/modules/customer-request/action-preparation'
import type {
  PreparedActionOptionCandidate,
  PreparedActionV2,
} from '@/modules/customer-request/prepared-action-v2'

export type TerminalEgressState = 'released' | 'not_released' | 'uncertain'
export type EgressOperationState =
  | 'allocated'
  | 'dispatching'
  | TerminalEgressState

export type ReadyPreparation = Extract<
  DurableActionPreparation,
  { kind: 'ready_for_routing' }
>

export type PlanAction = CustomerRequestV2Aggregate['plan']['actions'][number]

export type ContractRefFields = Readonly<{
  capabilityId: string
  version: number
  contractDigest: string
}>

export type EligibleSupply = Readonly<{
  offering: Readonly<{
    businessId: string
    offeringId: string
    registrationHash: string
    registrationEvidenceRefs: readonly string[]
    presentation: PreparedActionOptionCandidate['offering']['presentation']
    status: 'active' | 'inactive'
  }> & ContractRefFields
  binding: Readonly<{
    bindingId: string
    offeringId: string
    registrationHash: string
    registrationEvidenceRefs: readonly string[]
    cancellation: PreparedActionOptionCandidate['binding']['cancellation']
    adapterId: string
    configDigest: string
    configJson: string
    endpointUrl: string
    credentialRef: string
    admission: string
    conformance: string
  }> & ContractRefFields
}>

export type EgressCommandRow = Readonly<{
  commandKey: string
  commandDigest: string
  principalId: string
  preparationRef: string
  authorityReference: string
  operationRefs: readonly string[]
  committedAt: number
}>

export type EgressOperationRow = Readonly<{
  operationId: string
  operationRef: string
  operationDigest: string
  preparationRef: string
  requestId: string
  principalId: string
  authorityReference: string
  authorityScopeDigest: string
  lineage: ActionPreparationLineage
  businessId: string
  offeringId: string
  bindingId: string
  offeringRegistrationHash: string
  bindingRegistrationHash: string
  adapterId: string
  adapterConfigDigest: string
  adapterConfigJson: string
  endpointUrl: string
  credentialRef: string
  projectedInputDigest: string
  state: EgressOperationState
  allocatedAt: number
  dispatchStartedAt?: number
  dispatchAttemptRef?: string
  dispatchLeaseExpiresAt?: number
  resolvedAt?: number
  evidenceRef?: string
  responseStatus?: number
  responseContentType?: string
  responseBodyDigest?: string
  responseBodyText?: string
  failureCode?: string
}>

export type DisclosureAllocationRow = Readonly<{
  allocationId: string
  allocationRef: string
  allocationDigest: string
  operationRef: string
  preparationRef: string
  authorityReference: string
  authorityScopeDigest: string
  lineage: ActionPreparationLineage
  declarationKey: string
  inputKey: string
  inputPointer: string
  schemaIdentity: string
  classification: ReadyPreparation['authorityScope']['declarations'][number]['classification']
  purpose: ReadyPreparation['authorityScope']['declarations'][number]['purposes'][number]
  effect: ReadyPreparation['authorityScope']['declarations'][number]['effect']
  declaredRecipient: ReadyPreparation['authorityScope']['declarations'][number]['recipient']
  businessId: string
  offeringId: string
  bindingId: string
  offeringRegistrationHash: string
  bindingRegistrationHash: string
  valueDigest: string
  allocatedAt: number
}>

export type EgressConsumptionRow = Readonly<{
  consumptionId: string
  authorityReference: string
  authorityScopeDigest: string
  preparationRef: string
  maximumRecipients: number
  maximumExposures: number
  maximumOperations: number
  consumedRecipients: number
  consumedExposures: number
  consumedOperations: number
  updatedAt: number
}>

export type AuthorityReservationSnapshot = Readonly<{
  reservationRef: string
  reservationDigest: string
  reservation: NonNullable<ReadyPreparation['authorityReservation']>
}>

export type ApprovalEvidenceSnapshot = Readonly<{
  approvalRef: string
  approvalDigest: string
  reviewDigest: string
  authorityScopeDigest: string
  principalId: string
  ownerId: string
  credentialId: string
  lineage: ActionPreparationLineage
  approval: Readonly<Record<string, unknown>>
}>

export type ActionPreparationSnapshot = Readonly<{
  preparationRef: string
  preparationDigest: string
  lineage: ActionPreparationLineage
  preparation: DurableActionPreparation
}>

export type RequestHeadSnapshot = Readonly<{
  requestId: string
  currentRevision: number
  currentAggregateDigest: string
}>

export type AllocateEgressArgs = Readonly<{
  commandKey: string
  commandDigest: string
  principalId: string
  preparationRef: string
  now: number
}>

export type AllocateEgressResult =
  | Readonly<{ kind: 'allocated'; operationRefs: string[] }>
  | Readonly<{ kind: 'replayed'; operationRefs: string[] }>
  | Readonly<{ kind: 'conflict'; reason: 'idempotency_key_reused' }>
  | Readonly<{
    kind: 'needs_attention'
    reason:
      | 'preparation_not_ready'
      | 'capability_graph_changed'
      | 'authority_changed'
      | 'capacity_exceeded'
      | 'allocation_limit_exceeded'
      | 'unsupported_recipient'
      | 'no_eligible_bindings'
  }>

export type BeginDispatchArgs = Readonly<{
  operationRef: string
  principalId: string
  now: number
}>

export type BeginDispatchResult =
  | Readonly<{
    kind: 'dispatch'
    endpointUrl: string
    credentialRef: string
    adapterId: string
    configJson: string
    bodyText: string
    dispatchAttemptRef: string
  }>
  | Readonly<{ kind: 'in_flight' }>
  | Readonly<{ kind: 'terminal'; state: TerminalEgressState }>
  | Readonly<{ kind: 'needs_attention' }>

export type ResolveDispatchArgs = Readonly<{
  operationRef: string
  state: TerminalEgressState
  evidenceRef: string
  now: number
  dispatchAttemptRef: string
  responseStatus?: number
  responseContentType?: string
  responseBodyDigest?: string
  responseBodyText?: string
  failureCode?: string
}>

export type ReconcileUncertainArgs = Readonly<{
  operationRef: string
  disposition: TerminalEgressState
  providerEvidenceRef: string
  responseDigest: string
  evidenceDigest: string
  observedAt: number
}>

export type StatusArgs = Readonly<{
  preparationRef: string
  principalId: string
}>

export type StatusResult = Readonly<{
  operationCount: number
  states: ReadonlyArray<{
    operationRef: string
    state: EgressOperationState
  }>
}>

export type UnresolvedForRequestArgs = Readonly<{
  requestId: string
  principalId: string
}>

export type UnresolvedOperation = Readonly<{
  operationRef: string
  requestRevision: number
}>

export type OpenReconciliationArgs = Readonly<{
  operationRef: string
  principalId: string
}>

export type OpenReconciliationResult =
  | Readonly<{
    kind: 'available'
    endpointUrl: string
    credentialRef: string
    adapterId: string
    configJson: string
  }>
  | Readonly<{ kind: 'unavailable' }>

export type DispatchPayload = Readonly<{
  endpointUrl: string
  credentialRef: string
  adapterId: string
  configJson: string
  bodyText: string
}>

export type DispatchResult = Readonly<{
  state: TerminalEgressState
  evidenceRef: string
  responseStatus?: number
  responseContentType?: string
  responseBodyDigest?: string
  responseBodyText?: string
  failureCode?: string
}>

export type ReconciliationEvidence = Readonly<{
  disposition: TerminalEgressState
  providerEvidenceRef: string
  responseDigest: string
}>

export type RunEgressArgs = Readonly<{
  commandKey: string
  commandDigest: string
  principalId: string
  preparationRef: string
  now: number
}>

export type RunEgressResult =
  | Readonly<{
    kind: 'completed'
    states: ReadonlyArray<{
      operationRef: string
      state: TerminalEgressState | 'in_flight'
    }>
  }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'needs_attention' }>

export type ResumeEgressArgs = Readonly<{
  preparationRef: string
  principalId: string
}>

export type ResumeEgressResult =
  | Readonly<{
    kind: 'completed'
    states: ReadonlyArray<{
      operationRef: string
      state: TerminalEgressState | 'in_flight'
    }>
  }>
  | Readonly<{ kind: 'needs_attention' }>

export type ResumeRequestEgressArgs = Readonly<{
  requestId: string
  principalId: string
}>

export type ResumeRequestEgressResult =
  | Readonly<{
    kind: 'completed'
    states: ReadonlyArray<{
      operationRef: string
      requestRevision: number
      state: TerminalEgressState | 'in_flight'
    }>
  }>
  | Readonly<{
    kind: 'needs_attention'
    operations: ReadonlyArray<{ operationRef: string; requestRevision: number }>
  }>

export type ReconcileEgressArgs = Readonly<{
  operationRef: string
  principalId: string
}>

export type ReconcileEgressResult =
  | Readonly<{ kind: 'reconciled'; state: TerminalEgressState }>
  | Readonly<{ kind: 'unavailable' }>

export type OpenedReadyPreparation = Readonly<{
  kind: 'ready'
  preparation: ReadyPreparation
  aggregate: CustomerRequestV2Aggregate
  action: PlanAction
  supplies: readonly EligibleSupply[]
}>

export type OpenedPreparationNeedsAttention = Readonly<{
  kind: 'needs_attention'
  reason:
    | 'preparation_not_ready'
    | 'capability_graph_changed'
    | 'authority_changed'
    | 'no_eligible_bindings'
}>

export type OpenedPreparation = OpenedReadyPreparation | OpenedPreparationNeedsAttention

export type CapabilityContractLoad =
  | Readonly<{ kind: 'found'; model: CapabilityDecisionModel }>
  | Readonly<{ kind: 'missing' }>

export type SupplyGraphRow = Readonly<{
  offering: EligibleSupply['offering']
  binding: EligibleSupply['binding']
  business: Readonly<{
    businessId: string
    name: string
    publicStatus: string
    claimStatus: string
  }> | null
}>

export type PreparedActionCommandRow = Readonly<{
  commandKey: string
  commandDigest: string
  principalId: string
  preparationRef: string
  resultKind: 'prepared' | 'not_prepared'
  resultRef: string
  resultDigest: string
  committedAt: number
}>

export type PreparedActionRow = Readonly<{
  preparedActionRef: string
  preparedActionDigest: string
  preparationRef: string
  preparedAction: PreparedActionV2
}>

export type PreparedActionRecoveryRow = Readonly<{
  recoveryRef: string
  recoveryDigest: string
  preparationRef: string
  lineage: ActionPreparationLineage
  reason: string
  operationRefs: readonly string[]
  evidenceRefs: readonly string[]
}>

export type PreparePreparedActionArgs = Readonly<{
  commandKey: string
  commandDigest: string
  principalId: string
  preparationRef: string
  preparationMaterialDigest: string
  now: number
}>

export type PreparePreparedActionResult =
  | Readonly<{ kind: 'prepared'; preparedAction: PreparedActionV2 }>
  | Readonly<{
    kind: 'not_prepared'
    reason: string
    recoveryRef: string
  }>
  | Readonly<{
    kind: 'conflict'
    reason: 'idempotency_key_reused' | 'prepared_action_material_changed'
  }>

export type PreparationMaterialDigestArgs = Readonly<{
  preparationRef: string
  principalId: string
}>
