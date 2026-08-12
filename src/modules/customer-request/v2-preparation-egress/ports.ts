import type { CustomerRequestV2Aggregate } from '@/modules/customer-request/compiler'
import type {
  ActionPreparationLineage,
  DurableActionPreparation,
} from '@/modules/customer-request/action-preparation'
import type { PreparedActionV2 } from '@/modules/customer-request/prepared-action-v2'

import type {
  ActionPreparationSnapshot,
  ApprovalEvidenceSnapshot,
  AuthorityReservationSnapshot,
  CapabilityContractLoad,
  DisclosureAllocationRow,
  DispatchPayload,
  DispatchResult,
  EgressCommandRow,
  EgressConsumptionRow,
  EgressOperationRow,
  EgressOperationState,
  EligibleSupply,
  PreparedActionCommandRow,
  PreparedActionRecoveryRow,
  PreparedActionRow,
  ReconciliationEvidence,
  RequestHeadSnapshot,
  SupplyGraphRow,
  TerminalEgressState,
} from './types'

/** Wave 46 persistence ports for egress-state (+ shared reads). */
export type CustomerRequestV2PreparationEgressPorts = Readonly<{
  loadEgressCommand: (commandKey: string) => Promise<EgressCommandRow | null>

  insertEgressCommand: (input: Readonly<{
    commandKey: string
    commandDigest: string
    principalId: string
    preparationRef: string
    authorityReference: string
    operationRefs: readonly string[]
    committedAt: number
  }>) => Promise<void>

  loadActionPreparationByRef: (
    preparationRef: string,
  ) => Promise<ActionPreparationSnapshot | null>

  verifyPreparationAuthority: (
    preparation: Extract<DurableActionPreparation, { kind: 'ready_for_routing' }>,
  ) => Promise<boolean>

  loadRequestHead: (requestId: string) => Promise<RequestHeadSnapshot | null>

  loadRevisionAggregate: (input: Readonly<{
    requestId: string
    requestRevision: number
  }>) => Promise<CustomerRequestV2Aggregate | null>

  listRouteableSupplies: (input: Readonly<{
    networkId: string
    limit: number
    now: number
  }>) => Promise<readonly EligibleSupply[] | null>

  loadAuthorityReservation: (
    reservationRef: string,
  ) => Promise<AuthorityReservationSnapshot | null>

  listOperationsByPreparation: (
    preparationRef: string,
    limit: number,
  ) => Promise<readonly EgressOperationRow[]>

  listOperationsByRequest: (input: Readonly<{
    requestId: string
    principalId: string
    limit: number
  }>) => Promise<readonly EgressOperationRow[]>

  loadOperationByRef: (operationRef: string) => Promise<EgressOperationRow | null>

  insertOperation: (input: Readonly<{
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
    connectionAuthority?: EgressOperationRow['connectionAuthority']
    credentialRef: string
    projectedInputDigest: string
    canonicalClaimMaterial: EgressOperationRow['canonicalClaimMaterial']
    state: 'allocated'
    allocatedAt: number
  }>) => Promise<void>

  patchOperation: (input: Readonly<{
    operationId: string
    patch: Readonly<Record<string, unknown>>
  }>) => Promise<void>

  loadConsumption: (authorityReference: string) => Promise<EgressConsumptionRow | null>

  insertConsumption: (input: Omit<EgressConsumptionRow, 'consumptionId'>) => Promise<void>

  replaceConsumption: (input: Readonly<{
    consumptionId: string
    row: Omit<EgressConsumptionRow, 'consumptionId'>
  }>) => Promise<void>

  insertDisclosureAllocation: (input: Omit<DisclosureAllocationRow, 'allocationId'>) => Promise<void>

  listAllocationsByOperation: (
    operationRef: string,
    limit: number,
  ) => Promise<readonly DisclosureAllocationRow[]>

  loadReconciliationObservation: (
    observationRef: string,
  ) => Promise<Readonly<{ observationRef: string; observationDigest: string }> | null>

  insertReconciliationObservation: (input: Readonly<{
    observationRef: string
    observationDigest: string
    operationRef: string
    disposition: TerminalEgressState
    providerEvidenceRef: string
    responseDigest: string
    businessId: string
    offeringId: string
    bindingId: string
    offeringRegistrationHash: string
    bindingRegistrationHash: string
    observedAt: number
  }>) => Promise<void>
}>

/**
 * Action-host orchestration seam: runMutation/runQuery to egress-state exports
 * plus guarded HTTP. Constructed only from ActionCtx ("use node" adapter).
 */
export type CustomerRequestV2PreparationEgressActionPorts = Readonly<{
  allocateEgress: (args: Readonly<{
    commandKey: string
    commandDigest: string
    principalId: string
    preparationRef: string
    now: number
  }>) => Promise<{
    kind: 'allocated' | 'replayed' | 'conflict' | 'needs_attention'
    operationRefs?: string[]
  }>

  beginDispatch: (args: Readonly<{
    operationRef: string
    principalId: string
    now: number
  }>) => Promise<{
    kind: 'dispatch' | 'in_flight' | 'terminal' | 'needs_attention'
    state?: TerminalEgressState
    endpointUrl?: string
    credentialRef?: string
    connectionAuthority?: DispatchPayload['connectionAuthority']
    adapterId?: string
    configJson?: string
    bodyText?: string
    dispatchAttemptRef?: string
    canonicalClaimMaterial?: DispatchPayload['canonicalClaimMaterial']
  }>

  resolveDispatch: (args: Readonly<{
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
  }>) => Promise<TerminalEgressState>

  queryStatus: (args: Readonly<{
    preparationRef: string
    principalId: string
  }>) => Promise<{
    states: ReadonlyArray<{ operationRef: string; state: EgressOperationState }>
  }>

  queryUnresolvedForRequest: (args: Readonly<{
    requestId: string
    principalId: string
  }>) => Promise<ReadonlyArray<{ operationRef: string; requestRevision: number }>>

  openReconciliation: (args: Readonly<{
    operationRef: string
    principalId: string
  }>) => Promise<{
    kind: 'available' | 'unavailable'
    endpointUrl?: string
    credentialRef?: string
    connectionAuthority?: DispatchPayload['connectionAuthority']
    adapterId?: string
    configJson?: string
    canonicalClaimMaterial?: DispatchPayload['canonicalClaimMaterial']
  }>

  reconcileUncertain: (args: Readonly<{
    operationRef: string
    disposition: TerminalEgressState
    providerEvidenceRef: string
    responseDigest: string
    evidenceDigest: string
    observedAt: number
  }>) => Promise<TerminalEgressState>

  dispatchRegisteredAdapter: (
    dispatch: DispatchPayload,
    operationRef: string,
  ) => Promise<DispatchResult>

  reconcileRegisteredAdapter: (
    dispatch: DispatchPayload,
    operationRef: string,
  ) => Promise<ReconciliationEvidence | undefined>

  now: () => number
}>

/** Prepared-action host ports (ADR-016 adapter split under ceiling). */
export type CustomerRequestV2PreparedActionPorts = Readonly<{
  loadPreparedActionCommand: (
    commandKey: string,
  ) => Promise<PreparedActionCommandRow | null>

  loadActionPreparationByRef: (
    preparationRef: string,
  ) => Promise<ActionPreparationSnapshot | null>

  verifyPreparationAuthority: (
    preparation: Extract<DurableActionPreparation, { kind: 'ready_for_routing' }>,
  ) => Promise<boolean>

  loadRequestHead: (requestId: string) => Promise<RequestHeadSnapshot | null>

  loadRevisionAggregate: (input: Readonly<{
    requestId: string
    requestRevision: number
  }>) => Promise<CustomerRequestV2Aggregate | null>

  listOperationsByPreparation: (
    preparationRef: string,
    limit: number,
  ) => Promise<readonly EgressOperationRow[]>

  loadCapabilityContractModel: (input: Readonly<{
    capabilityId: string
    version: number
    contractDigest: string
  }>) => Promise<CapabilityContractLoad>

  loadPreparedActionByPreparation: (
    preparationRef: string,
  ) => Promise<PreparedActionRow | null>

  loadPreparedActionByRef: (
    preparedActionRef: string,
  ) => Promise<PreparedActionRow | null>

  loadRecoveryByRef: (
    recoveryRef: string,
  ) => Promise<PreparedActionRecoveryRow | null>

  insertPreparedAction: (input: Readonly<{
    preparedActionRef: string
    preparedActionDigest: string
    preparationRef: string
    requestId: string
    requestRevision: number
    actionId: string
    lineage: ActionPreparationLineage
    preparedAction: PreparedActionV2
    recordedAt: number
  }>) => Promise<void>

  insertPreparedActionCommand: (input: Readonly<{
    commandKey: string
    commandDigest: string
    principalId: string
    preparationRef: string
    resultKind: 'prepared' | 'not_prepared'
    resultRef: string
    resultDigest: string
    committedAt: number
  }>) => Promise<void>

  insertRecovery: (input: Readonly<{
    recoveryRef: string
    recoveryDigest: string
    preparationRef: string
    lineage: ActionPreparationLineage
    reason: string
    operationRefs: readonly string[]
    evidenceRefs: readonly string[]
    observedAt: number
  }>) => Promise<void>

  listAllocationsByOperation: (
    operationRef: string,
    limit: number,
  ) => Promise<readonly DisclosureAllocationRow[]>

  loadSupplyGraphForOperation: (input: Readonly<{
    expectedTargetDigest: string
    operationMaterial: Readonly<{
      adapterId: string
      adapterConfigDigest: string
      adapterConfigJson: string
      endpointUrl: string
    }>
    offeringId: string
    bindingId: string
    businessId: string
    now: number
  }>) => Promise<SupplyGraphRow | null>

  loadApprovalEvidence: (
    approvalRef: string,
  ) => Promise<ApprovalEvidenceSnapshot | null>

  loadAuthorityReservation: (
    reservationRef: string,
  ) => Promise<AuthorityReservationSnapshot | null>
}>
