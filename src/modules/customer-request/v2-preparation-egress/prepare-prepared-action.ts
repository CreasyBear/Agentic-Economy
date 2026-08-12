import { sameCapabilityContractRef } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { uniqueSorted } from '@/modules/common/unique-sorted'
import {
  compilePreparedActionOptions,
  type PreparedActionOptionCandidate,
  type PreparedActionV2,
} from '@/modules/customer-request/prepared-action-v2'

import {
  aggregateIntegrityValid,
  allocationIntegrityValid,
  operationIntegrityValid,
  preparationIntegrityValid,
  preparedActionIntegrityValid,
  recoveryIntegrityValid,
  terminalMaterialDigest,
} from './integrity'
import type { CustomerRequestV2PreparedActionPorts } from './ports'
import type {
  ActionPreparationSnapshot,
  EgressOperationRow,
  PreparePreparedActionArgs,
  PreparePreparedActionResult,
  PreparationMaterialDigestArgs,
  ReadyPreparation,
} from './types'

export async function preparationMaterialDigest(
  args: PreparationMaterialDigestArgs,
  ports: CustomerRequestV2PreparedActionPorts,
): Promise<string> {
  const preparation = await ports.loadActionPreparationByRef(args.preparationRef)
  if (preparation === null || preparation.lineage.principalId !== args.principalId) {
    throw new Error('customer_request_v2_prepared_action_preparation_not_found')
  }
  const operations = await ports.listOperationsByPreparation(args.preparationRef, 65)
  if (operations.length > 64) {
    throw new Error('customer_request_v2_prepared_action_operation_limit_exceeded')
  }
  return terminalMaterialDigest(preparation.preparationDigest, operations)
}

export async function preparePreparedAction(
  args: PreparePreparedActionArgs,
  ports: CustomerRequestV2PreparedActionPorts,
): Promise<PreparePreparedActionResult> {
  const replay = await ports.loadPreparedActionCommand(args.commandKey)
  let preparedReplay = null as Awaited<ReturnType<
    CustomerRequestV2PreparedActionPorts['loadPreparedActionCommand']
  >>
  if (replay !== null) {
    if (replay.commandDigest !== args.commandDigest || replay.principalId !== args.principalId
      || replay.preparationRef !== args.preparationRef) {
      return { kind: 'conflict', reason: 'idempotency_key_reused' }
    }
    if (replay.resultKind === 'not_prepared') return await replayResult(ports, replay)
    preparedReplay = replay
  }

  const opened = await openExactPreparation(ports, args.preparationRef, args.principalId)
  if (opened.kind !== 'ready') {
    return await recordRecovery(
      ports,
      args,
      opened.lineage,
      opened.reason,
      opened.operationRefs,
      opened.evidenceRefs,
      preparedReplay === null,
    )
  }
  const { preparation, aggregate, operations, model } = opened
  if (terminalMaterialDigest(preparation.preparationDigest, operations) !== args.preparationMaterialDigest) {
    return { kind: 'conflict', reason: 'prepared_action_material_changed' }
  }
  const existing = await ports.loadPreparedActionByPreparation(args.preparationRef)
  if (existing !== null && existing.preparedAction.expiresAt <= args.now) {
    return await recordRecovery(
      ports,
      args,
      preparation.lineage,
      'provider_assertion_expired',
      operations.map(({ operationRef }) => operationRef),
      operations.flatMap(({ evidenceRef }) => evidenceRef === undefined ? [] : [evidenceRef]),
      preparedReplay === null,
    )
  }

  const candidates: PreparedActionOptionCandidate[] = []
  for (const operation of operations) {
    const candidate = await openCandidate(ports, operation, preparation.lineage, model, args.now)
    if (candidate.kind !== 'ready') {
      return await recordRecovery(
        ports,
        args,
        preparation.lineage,
        candidate.reason,
        operations.map(({ operationRef }) => operationRef),
        candidate.evidenceRefs,
        preparedReplay === null,
      )
    }
    candidates.push(candidate.candidate)
  }
  const preference = aggregate.evaluation.decisionPreference
  const selection = preference?.objective === 'lowest_maximum_price'
    ? {
      kind: 'lowest_maximum_price' as const,
      basis: 'customer_request' as const,
      evidenceRef: preference.evidenceRef,
    }
    : { kind: 'single_option' as const }
  const compiled = compilePreparedActionOptions({
    lineage: preparation.lineage,
    candidates,
    selection,
    now: existing?.preparedAction.preparedAt ?? args.now,
  })
  if (compiled.kind !== 'prepared') {
    return await recordRecovery(
      ports,
      args,
      preparation.lineage,
      compiled.reason,
      operations.map(({ operationRef }) => operationRef),
      operations.flatMap(({ evidenceRef }) => evidenceRef === undefined ? [] : [evidenceRef]),
      preparedReplay === null,
    )
  }
  if (existing !== null) {
    if (existing.preparationRef !== args.preparationRef
      || existing.preparedActionRef !== existing.preparedAction.preparedActionRef
      || existing.preparedActionDigest !== existing.preparedAction.preparedActionDigest
      || !preparedActionIntegrityValid(existing.preparedAction)
      || existing.preparedActionDigest !== compiled.preparedAction.preparedActionDigest) {
      return { kind: 'conflict', reason: 'prepared_action_material_changed' }
    }
    if (preparedReplay === null) {
      await recordCommand(
        ports,
        args,
        'prepared',
        existing.preparedActionRef,
        existing.preparedActionDigest,
      )
    }
    return { kind: 'prepared', preparedAction: existing.preparedAction }
  }
  if (preparedReplay !== null) {
    throw new Error('customer_request_v2_prepared_action_replay_integrity_failure')
  }
  const storedPreparedAction = structuredClone(compiled.preparedAction) as PreparedActionV2
  await ports.insertPreparedAction({
    preparedActionRef: compiled.preparedAction.preparedActionRef,
    preparedActionDigest: compiled.preparedAction.preparedActionDigest,
    preparationRef: preparation.preparationRef,
    requestId: preparation.lineage.requestId,
    requestRevision: preparation.lineage.requestRevision,
    actionId: preparation.lineage.actionId,
    lineage: preparation.lineage,
    preparedAction: storedPreparedAction,
    recordedAt: args.now,
  })
  await recordCommand(
    ports,
    args,
    'prepared',
    compiled.preparedAction.preparedActionRef,
    compiled.preparedAction.preparedActionDigest,
  )
  return { kind: 'prepared', preparedAction: storedPreparedAction }
}

type OpenedPreparation =
  | Readonly<{
    kind: 'ready'
    preparation: ReadyPreparation
    aggregate: NonNullable<
      Awaited<ReturnType<CustomerRequestV2PreparedActionPorts['loadRevisionAggregate']>>
    >
    operations: readonly EgressOperationRow[]
    model: NonNullable<
      Extract<
        Awaited<ReturnType<CustomerRequestV2PreparedActionPorts['loadCapabilityContractModel']>>,
        { kind: 'found' }
      >['model']
    >
  }>
  | Readonly<{
    kind: 'not_ready'
    lineage: ActionPreparationSnapshot['lineage']
    reason:
      | 'options_pending'
      | 'disclosure_not_released'
      | 'disclosure_uncertain'
      | 'capability_authority_changed'
      | 'capability_graph_changed'
    operationRefs: readonly string[]
    evidenceRefs: readonly string[]
  }>

async function openExactPreparation(
  ports: CustomerRequestV2PreparedActionPorts,
  preparationRef: string,
  principalId: string,
): Promise<OpenedPreparation> {
  const row = await ports.loadActionPreparationByRef(preparationRef)
  if (row === null || row.lineage.principalId !== principalId) {
    throw new Error('customer_request_v2_prepared_action_preparation_not_found')
  }
  const empty = { lineage: row.lineage, operationRefs: [] as string[], evidenceRefs: [] as string[] }
  if (row.preparation.kind !== 'ready_for_routing' || !preparationIntegrityValid(row.preparation)
    || row.preparationDigest !== row.preparation.preparationDigest) {
    return { kind: 'not_ready', reason: 'capability_authority_changed', ...empty }
  }
  if (!await ports.verifyPreparationAuthority(row.preparation)) {
    return { kind: 'not_ready', reason: 'capability_authority_changed', ...empty }
  }
  const head = await ports.loadRequestHead(row.lineage.requestId)
  const aggregate = head === null
    ? null
    : await ports.loadRevisionAggregate({
      requestId: row.lineage.requestId,
      requestRevision: row.lineage.requestRevision,
    })
  if (head === null || aggregate === null || head.currentRevision !== row.lineage.requestRevision
    || head.currentAggregateDigest !== aggregate.aggregateDigest
    || !aggregateIntegrityValid(aggregate)
    || aggregate.plan.planDigest !== row.lineage.planDigest) {
    return { kind: 'not_ready', reason: 'capability_graph_changed', ...empty }
  }
  const action = aggregate.plan.actions.find(({ actionId }) => actionId === row.lineage.actionId)
  if (action === undefined || !sameCapabilityContractRef(action.contractRef, row.lineage.contractRef)
    || action.selectionKey !== row.lineage.selectionKey
    || action.semanticDigest !== row.lineage.semanticDigest) {
    return { kind: 'not_ready', reason: 'capability_graph_changed', ...empty }
  }
  const operations = await ports.listOperationsByPreparation(preparationRef, 65)
  if (operations.length > 64) {
    throw new Error('customer_request_v2_prepared_action_operation_limit_exceeded')
  }
  const operationRefs = operations.map(({ operationRef }) => operationRef).sort()
  const evidenceRefs = operations.flatMap(({ evidenceRef }) => (
    evidenceRef === undefined ? [] : [evidenceRef]
  )).sort()
  if (operations.some((operation) => !operationIntegrityValid(operation)
    || operation.preparationRef !== preparationRef
    || canonicalDigest(operation.lineage as StableHashValue)
      !== canonicalDigest(row.lineage as StableHashValue))) {
    throw new Error('customer_request_v2_prepared_action_operation_integrity_failure')
  }
  if (operations.length === 0 || operations.some(({ state }) => state === 'allocated' || state === 'dispatching')) {
    return { kind: 'not_ready', reason: 'options_pending', lineage: row.lineage, operationRefs, evidenceRefs }
  }
  if (operations.some(({ state }) => state === 'uncertain')) {
    return {
      kind: 'not_ready',
      reason: 'disclosure_uncertain',
      lineage: row.lineage,
      operationRefs,
      evidenceRefs,
    }
  }
  const stored = await ports.loadCapabilityContractModel(row.lineage.contractRef)
  if (stored.kind !== 'found') {
    return {
      kind: 'not_ready',
      reason: 'capability_authority_changed',
      lineage: row.lineage,
      operationRefs,
      evidenceRefs,
    }
  }
  const { model } = stored
  if (!sameCapabilityContractRef(model.contractRef, row.lineage.contractRef)
    || model.selectionKey !== row.lineage.selectionKey
    || model.semanticDigest !== row.lineage.semanticDigest) {
    return {
      kind: 'not_ready',
      reason: 'capability_authority_changed',
      lineage: row.lineage,
      operationRefs,
      evidenceRefs,
    }
  }
  return {
    kind: 'ready',
    preparation: row.preparation,
    aggregate,
    operations,
    model,
  }
}

type CandidateResult =
  | Readonly<{ kind: 'ready'; candidate: PreparedActionOptionCandidate }>
  | Readonly<{
    kind: 'not_ready'
    reason: 'capability_graph_changed'
    evidenceRefs: readonly string[]
  }>

async function openCandidate(
  ports: CustomerRequestV2PreparedActionPorts,
  operation: EgressOperationRow,
  lineage: ActionPreparationSnapshot['lineage'],
  model: NonNullable<
    Extract<
      Awaited<ReturnType<CustomerRequestV2PreparedActionPorts['loadCapabilityContractModel']>>,
      { kind: 'found' }
    >['model']
  >,
  now: number,
): Promise<CandidateResult> {
  const evidenceRefs = operation.evidenceRef === undefined ? [] : [operation.evidenceRef]
  const graph = await ports.loadSupplyGraphForOperation({
    expectedTargetDigest: operation.canonicalClaimMaterial.authority.targetDigest,
    operationMaterial: {
      adapterId: operation.adapterId,
      adapterConfigDigest: operation.adapterConfigDigest,
      adapterConfigJson: operation.adapterConfigJson,
      endpointUrl: operation.endpointUrl,
    },
    offeringId: operation.offeringId,
    bindingId: operation.bindingId,
    businessId: operation.businessId,
    now,
  })
  if (graph === null || graph.business === null
    || graph.business.publicStatus !== 'published'
    || graph.business.claimStatus !== 'published'
    || graph.offering.status !== 'active'
    || graph.binding.admission !== 'admitted'
    || graph.binding.conformance !== 'conformant'
    || String(graph.offering.businessId) !== String(operation.businessId)
    || graph.binding.offeringId !== graph.offering.offeringId
    || graph.offering.registrationHash !== operation.offeringRegistrationHash
    || graph.binding.registrationHash !== operation.bindingRegistrationHash
    || !sameCapabilityContractRef({
      capabilityId: graph.offering.capabilityId,
      version: graph.offering.version,
      contractDigest: graph.offering.contractDigest,
    }, lineage.contractRef)
    || !sameCapabilityContractRef({
      capabilityId: graph.binding.capabilityId,
      version: graph.binding.version,
      contractDigest: graph.binding.contractDigest,
    }, lineage.contractRef)) {
    return { kind: 'not_ready', reason: 'capability_graph_changed', evidenceRefs }
  }
  const allocations = await ports.listAllocationsByOperation(operation.operationRef, 257)
  if (allocations.length > 256 || allocations.some((allocation) => !allocationIntegrityValid(allocation)
    || allocation.preparationRef !== operation.preparationRef
    || allocation.offeringRegistrationHash !== operation.offeringRegistrationHash
    || allocation.bindingRegistrationHash !== operation.bindingRegistrationHash)) {
    throw new Error('customer_request_v2_prepared_action_allocation_integrity_failure')
  }
  return {
    kind: 'ready',
    candidate: {
      operation: {
        operationRef: operation.operationRef,
        state: operation.state === 'released'
          ? 'released'
          : operation.state === 'uncertain' ? 'uncertain' : 'not_released',
        lineage: operation.lineage,
        authorityReference: operation.authorityReference,
        authorityScopeDigest: operation.authorityScopeDigest,
        ...(operation.responseStatus === undefined ? {} : { responseStatus: operation.responseStatus }),
        ...(operation.responseContentType === undefined
          ? {}
          : { responseContentType: operation.responseContentType }),
        ...(operation.responseBodyText === undefined ? {} : { responseBodyText: operation.responseBodyText }),
        ...(operation.responseBodyDigest === undefined
          ? {}
          : { responseBodyDigest: operation.responseBodyDigest }),
        ...(operation.evidenceRef === undefined ? {} : { releaseEvidenceRef: operation.evidenceRef }),
      },
      model,
      pricingConfig: graph.publication.pricingConfig,
      priceDigest: graph.publication.priceDigest,
      business: { businessId: String(operation.businessId), name: graph.business.name },
      offering: {
        offeringId: graph.offering.offeringId,
        registrationHash: graph.offering.registrationHash,
        registrationEvidenceRefs: graph.offering.registrationEvidenceRefs,
        presentation: graph.offering.presentation,
      },
      binding: {
        bindingId: graph.binding.bindingId,
        registrationHash: graph.binding.registrationHash,
        registrationEvidenceRefs: graph.binding.registrationEvidenceRefs,
        cancellation: graph.binding.cancellation,
      },
      disclosure: {
        outcome: operation.state === 'released'
          ? 'released'
          : operation.state === 'uncertain' ? 'uncertain' : 'not_released',
        allocationRefs: allocations.map(({ allocationRef }) => allocationRef).sort(),
      },
    },
  }
}

async function recordRecovery(
  ports: CustomerRequestV2PreparedActionPorts,
  args: PreparePreparedActionArgs,
  lineage: ActionPreparationSnapshot['lineage'],
  reason: string,
  operationRefs: readonly string[],
  evidenceRefs: readonly string[],
  persistCommand = true,
): Promise<PreparePreparedActionResult> {
  const material = {
    preparationRef: args.preparationRef,
    lineage,
    reason,
    operationRefs: [...operationRefs].sort(),
    evidenceRefs: uniqueSorted(evidenceRefs),
  }
  const recoveryDigest = canonicalDigest(material as StableHashValue)
  const recoveryRef = `prepared-action-recovery:${recoveryDigest}`
  const existing = await ports.loadRecoveryByRef(recoveryRef)
  if (existing === null) {
    await ports.insertRecovery({
      recoveryRef,
      recoveryDigest,
      ...material,
      observedAt: args.now,
    })
  } else if (existing.recoveryDigest !== recoveryDigest || !recoveryIntegrityValid(existing)) {
    throw new Error('customer_request_v2_recovery_integrity_failure')
  }
  if (persistCommand) await recordCommand(ports, args, 'not_prepared', recoveryRef, recoveryDigest)
  return { kind: 'not_prepared', reason, recoveryRef }
}

async function recordCommand(
  ports: CustomerRequestV2PreparedActionPorts,
  args: PreparePreparedActionArgs,
  resultKind: 'prepared' | 'not_prepared',
  resultRef: string,
  resultDigest: string,
): Promise<void> {
  await ports.insertPreparedActionCommand({
    commandKey: args.commandKey,
    commandDigest: args.commandDigest,
    principalId: args.principalId,
    preparationRef: args.preparationRef,
    resultKind,
    resultRef,
    resultDigest,
    committedAt: args.now,
  })
}

async function replayResult(
  ports: CustomerRequestV2PreparedActionPorts,
  command: NonNullable<
    Awaited<ReturnType<CustomerRequestV2PreparedActionPorts['loadPreparedActionCommand']>>
  >,
): Promise<PreparePreparedActionResult> {
  if (command.resultKind === 'prepared') {
    const row = await ports.loadPreparedActionByRef(command.resultRef)
    if (row === null || row.preparationRef !== command.preparationRef
      || row.preparedActionRef !== row.preparedAction.preparedActionRef
      || row.preparedActionDigest !== row.preparedAction.preparedActionDigest
      || row.preparedActionDigest !== command.resultDigest
      || !preparedActionIntegrityValid(row.preparedAction)) {
      throw new Error('customer_request_v2_prepared_action_replay_integrity_failure')
    }
    return { kind: 'prepared', preparedAction: row.preparedAction }
  }
  const recovery = await ports.loadRecoveryByRef(command.resultRef)
  if (recovery === null || recovery.preparationRef !== command.preparationRef
    || recovery.recoveryDigest !== command.resultDigest
    || !recoveryIntegrityValid(recovery)) {
    throw new Error('customer_request_v2_prepared_action_replay_integrity_failure')
  }
  return {
    kind: 'not_prepared',
    reason: recovery.reason,
    recoveryRef: recovery.recoveryRef,
  }
}
