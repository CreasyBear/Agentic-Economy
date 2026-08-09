import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'

import {
  createDevelopmentDurablePort,
  createDevelopmentDurableState,
  createDurableActionInvocationTracer,
  readCompletedResultIdentity,
  type ActionInvocationView,
  type PreparedInvocation,
} from '../../src/modules/action-invocation'
import {
  evaluateAdr009Transfer,
  type TransferBoundaryEvent,
} from '../../src/modules/action-invocation/transfer-evaluator'
import { resolveActionContract } from '../../src/modules/common/action'
import { canonicalDigest } from '../../src/modules/common/canonical-digest'
import { projectReferenceComposition } from '../../src/modules/customer-request/application/public'
import type { CustomerRequestV2Aggregate } from '../../src/modules/customer-request/compiler'
import { registryDetailAction } from '../../src/modules/registry/registry.actions'
import { registeredDescriptor } from '../../src/modules/capability-supply/development-evidence-continuity'
import {
  developmentEvidenceActor,
  developmentEvidenceNow,
} from '../../src/modules/capability-supply/development-evidence-fixture'
import {
  collectSuppliedCandidateQuoteAction,
  type SuppliedCandidateQuoteInput,
  type SuppliedCandidateQuoteResult,
} from '../../src/modules/capability-supply/server'
import {
  executeDevelopmentProviderOperationAction,
  type DevelopmentProviderOperationInput,
  type DevelopmentProviderOperationResult,
} from './fixtures/provider-operation/development-provider-operation.actions'
import { materialDigest } from '../../src/modules/action-invocation/preparation'
import {
  validateReconciliationEvidence,
  type ReconciliationEvidence,
} from '../../src/modules/action-invocation/reconciliation-evidence'
import type { EvidenceProvenanceV1 } from './evidence-provenance'
import type { runDevelopmentProviderOperationEvidence } from './fixtures/provider-operation/development-provider-operation-evidence'

type ProviderOperationPacket = Awaited<ReturnType<typeof runDevelopmentProviderOperationEvidence>>

export type EvidenceEnvelope = Readonly<{
  schema: 'ae.action-invocation-development-evidence:v2'
  checksum: string
  provenance?: EvidenceProvenanceV1
  packet: Record<string, unknown>
}>

function checksum(packet: Record<string, unknown>) {
  return createHash('sha256').update(JSON.stringify(packet)).digest('hex')
}

export async function writeEvidencePacket(
  path: string,
  packet: Record<string, unknown>,
  provenance?: EvidenceProvenanceV1,
) {
  const envelope: EvidenceEnvelope = {
    schema: 'ae.action-invocation-development-evidence:v2',
    checksum: `sha256:${checksum(packet)}`,
    ...(provenance === undefined ? {} : { provenance }),
    packet,
  }
  await writeFile(path, `${JSON.stringify(envelope, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  return envelope
}

export async function readAndVerifyEvidencePacket(path: string, expectedRevision: string) {
  const envelope = JSON.parse(await readFile(path, 'utf8')) as EvidenceEnvelope
  if (envelope.schema !== 'ae.action-invocation-development-evidence:v2') throw new Error('packet_schema_refused')
  if (envelope.checksum !== `sha256:${checksum(envelope.packet)}`) throw new Error('packet_checksum_refused')
  if (envelope.packet.environment !== 'MOCK/DEVELOPMENT ONLY') throw new Error('packet_environment_refused')
  if (envelope.packet.gitRevision !== expectedRevision) throw new Error('packet_revision_refused')
  const action = envelope.packet.action as { id?: string; version?: string }
  if (action.id !== 'supply.collectDevelopmentQuote' || action.version !== 'supply.collectDevelopmentQuote:v1') {
    throw new Error('packet_action_identity_refused')
  }
  const reconstructed = await reconstructPacketMeaning(envelope.packet)
  return {
    environment: envelope.packet.environment,
    gitRevision: expectedRevision,
    checksum: envelope.checksum,
    sourceIdentityDigest: canonicalDigest({
      action: envelope.packet.action,
      completedReference: envelope.packet.completedReference,
    } as never),
    reconstructed,
    claimCeiling: envelope.packet.claimCeiling,
  }
}

export async function readAndVerifyDevelopmentPacket(
  path: string,
  expectedRevision: string,
  expectedAction: Readonly<{ id: string; version: string }>,
) {
  const envelope = JSON.parse(await readFile(path, 'utf8')) as EvidenceEnvelope
  if (envelope.schema !== 'ae.action-invocation-development-evidence:v2') throw new Error('packet_schema_refused')
  if (envelope.checksum !== `sha256:${checksum(envelope.packet)}`) throw new Error('packet_checksum_refused')
  if (envelope.packet.environment !== 'MOCK/DEVELOPMENT ONLY') throw new Error('packet_environment_refused')
  if (envelope.packet.gitRevision !== expectedRevision) throw new Error('packet_revision_refused')
  const action = envelope.packet.action as { id?: string; version?: string }
  if (action.id !== expectedAction.id || action.version !== expectedAction.version) {
    throw new Error('packet_action_identity_refused')
  }
  return {
    environment: envelope.packet.environment,
    gitRevision: expectedRevision,
    checksum: envelope.checksum,
    action,
    claimCeiling: envelope.packet.claimCeiling,
  }
}

export async function readAndVerifyProviderOperationPacket(path: string, expectedRevision: string) {
  const basic = await readAndVerifyDevelopmentPacket(path, expectedRevision, {
    id: executeDevelopmentProviderOperationAction.id,
    version: 'v1',
  })
  const envelope = JSON.parse(await readFile(path, 'utf8')) as EvidenceEnvelope
  const durable = envelope.packet.durable as {
    terminal: PacketDurable
    uncertain: PacketDurable & { source: {
      input: DevelopmentProviderOperationInput
      prepared: PreparedInvocation
      before: ActionInvocationView<DevelopmentProviderOperationResult>
      after: ActionInvocationView<DevelopmentProviderOperationResult>
    } }
  }
  const terminal = await reconstructProviderOperationRows(durable.terminal, true)
  const uncertain = await reconstructProviderOperationRows(durable.uncertain, false)
  validateProviderOperationLinkage(durable.terminal, true)
  validateProviderOperationLinkage(durable.uncertain, false)
  if (
    durable.uncertain.source.before.control.state !== 'reconciliation_required'
    || durable.uncertain.source.before.attempts[0]?.release.state !== 'possibly_released'
    || uncertain.control.state !== 'terminal'
  ) throw new Error('packet_provider_operation_reconciliation_refused')
  if (
    terminal.observedResolution.state !== 'returned'
    || terminal.observedResolution.result.kind !== 'effect_confirmed'
  ) throw new Error('packet_provider_operation_terminal_refused')
  validateProviderOperationAdvertisedChecks(envelope.packet, terminal)
  return {
    ...basic,
    reconstructed: {
      terminalControl: terminal.control,
      uncertainBefore: durable.uncertain.source.before.control,
      reconciledControl: uncertain.control,
      terminalHistoryRecords: durable.terminal.history.length,
      reconciliationHistoryRecords: durable.uncertain.history.length,
    },
  }
}

function validateProviderOperationAdvertisedChecks(
  packet: Record<string, unknown>,
  terminal: Awaited<ReturnType<typeof reconstructProviderOperationRows>>,
) {
  const input = packet as unknown as ProviderOperationPacket
  const eventOrder = input.eventOrder
  const authorityIndex = eventOrder.findIndex(({ kind }) => kind === 'authority_decision')
  const releaseIndex = eventOrder.findIndex(({ kind }) => kind === 'provider_release')
  const first = input.idempotency.first.observedResolution
  const replay = input.idempotency.replay.observedResolution
  const conflict = input.idempotency.conflict.observedResolution
  const confirmed = input.cancellation.confirmed.observedResolution
  const recomputed = {
    authorityBeforeRelease: authorityIndex >= 0 && releaseIndex > authorityIndex,
    dedupeThroughActionPlane:
      first.state === 'returned'
      && replay.state === 'returned'
      && first.result?.kind === 'effect_confirmed'
      && replay.result?.kind === 'effect_confirmed'
      && first.result.effectRef === replay.result.effectRef
      && input.idempotency.effectsAfterFirst === input.idempotency.effectsAfterReplay
      && input.idempotency.effectsAfterFirst === input.idempotency.effectsBeforeDedupe + 1,
    conflictWithoutEffect:
      conflict.state === 'returned'
      && conflict.result?.kind === 'effect_refused'
      && input.idempotency.effectsAfterConflict === input.idempotency.effectsAfterReplay,
    providerCancellation:
      confirmed.state === 'returned'
      && confirmed.result?.kind === 'effect_cancellation_confirmed'
      && input.cancellation.cancellationEffects === 1,
  }
  const principalRefusal = input.principalRefusal
  const expiryRefusal = input.expiryRefusal
  const cancellation = input.cancellation
  const reconciliation = input.reconciliation
  const advertisedDispositions = {
    principalRefusal:
      principalRefusal.observedResolution.state === 'returned'
      && principalRefusal.observedResolution.execution === 'pre_release_refused'
      && principalRefusal.observedResolution.businessOutcome === 'refused'
      && principalRefusal.attempts.every(({ release }) => release.state === 'not_released'),
    expiryRefusal:
      expiryRefusal.observedResolution.state === 'returned'
      && expiryRefusal.observedResolution.execution === 'pre_release_refused'
      && expiryRefusal.observedResolution.businessOutcome === 'refused'
      && expiryRefusal.attempts.every(({ release }) => release.state === 'not_released'),
    cancellationBeforeRelease:
      cancellation.beforeRelease.control.state === 'cancelled'
      && cancellation.beforeRelease.control.effect === 'not_released',
    cancellationReplay:
      canonicalDigest(cancellation.replay.observedResolution as never)
      === canonicalDigest(cancellation.confirmed.observedResolution as never),
    cancellationConflict:
      cancellation.conflict.observedResolution.state === 'returned'
      && cancellation.conflict.observedResolution.result.kind === 'effect_cancellation_refused'
      && cancellation.conflict.observedResolution.result.code === 'operation_key_conflict',
    cancellationPrincipalRefusal:
      cancellation.principalRefusal.observedResolution.state === 'returned'
      && cancellation.principalRefusal.observedResolution.execution === 'pre_release_refused'
      && cancellation.principalRefusal.observedResolution.result.kind === 'effect_cancellation_refused'
      && cancellation.principalRefusal.observedResolution.result.code === 'principal_mismatch'
      && cancellation.principalRefusal.attempts.every(({ release }) => release.state === 'not_released'),
    originalEffectPreserved:
      cancellation.originalEffect.state === 'returned'
      && cancellation.providerEffectRecord !== undefined
      && canonicalDigest(cancellation.providerEffectRecord.result as never)
        === canonicalDigest(cancellation.originalEffect.result as never),
    attributableReconciliation:
      reconciliation.before.control.state === 'reconciliation_required'
      && reconciliation.before.attempts[0]?.release.state === 'possibly_released'
      && reconciliation.after.control.state === 'terminal'
      && reconciliation.evidence.invocationRef === reconciliation.before.invocationRef
      && reconciliation.evidence.attemptRef === reconciliation.before.attempts[0]?.attemptRef
      && reconciliation.evidence.effectGeneration === reconciliation.before.attempts[0]?.effectGeneration,
  }
  const transfer = evaluateAdr009Transfer({
    events: {
      direct_read: [],
      direct_consequential: [
        { kind: 'direct_runner_started', actionId: executeDevelopmentProviderOperationAction.id },
        { kind: 'provider_release', actionId: executeDevelopmentProviderOperationAction.id },
        {
          kind: 'direct_runner_returned',
          actionId: executeDevelopmentProviderOperationAction.id,
          outcome: 'effect_confirmed',
        },
      ],
      controlled: [
        ...eventOrder,
        {
          kind: 'attempt',
          invocationRef: terminal.invocationRef,
          attemptRef: terminal.attempts[0]!.attemptRef,
        },
      ] as TransferBoundaryEvent[],
    },
    requiredContinuations: { direct_read: 0, direct_consequential: 1, controlled: 1 },
    controlledReadback: {
      invocationVersion: terminal.invocationVersion,
      controlRecords: 1,
      attributableAttempts: terminal.attempts.length,
      durableHistoryRecords: input.durable.terminal.history.length,
      terminalResultReconstructed: terminal.control.state === 'terminal',
      exactAuthorityBeforeRelease: recomputed.authorityBeforeRelease,
      retryClass: executeDevelopmentProviderOperationAction.invocationContract!.retryClass,
    },
    referenceReuse: {
      completedReferences: 1,
      completedNodes: 1,
      currentNodes: 0,
      effectsBeforeReuse: 1,
      effectsAfterReuse: 1,
      copiedLifecycleOrResultFields: 0,
      persistedRoutePlansOrBundles: 0,
    },
  })
  if (
    canonicalDigest(recomputed as never) !== canonicalDigest(input.executableChecks as never)
    || !Object.values(recomputed).every(Boolean)
    || !Object.values(advertisedDispositions).every(Boolean)
    || canonicalDigest(transfer as never) !== canonicalDigest(input.proportionality as never)
    || transfer.failedFalsifiers.length !== 0
    || input.gate7 !== 'passes_for_declared_development_class'
  ) throw new Error('packet_provider_operation_gate7_reconstruction_refused')
}

function validateProviderOperationLinkage(durable: PacketDurable, terminal: boolean) {
  const control = durable.controls[0]!
  const source = durable.source as unknown as {
    input: DevelopmentProviderOperationInput
    prepared: PreparedInvocation
    result?: DevelopmentProviderOperationResult
    resultIdentity?: { sourceResultRef: string; resultDigest: string }
    reconciliationEvidence?: ReconciliationEvidence
  }
  const invocationRef = String(control.invocationRef)
  const controlProjection = control.control as {
    origin?: unknown
    action?: { id?: string; contractVersion?: string }
  }
  if (
    durable.controls.length !== 1
    || typeof control.sourceRef !== 'string'
    || control.sourceRef.length === 0
    || controlProjection.action?.id !== executeDevelopmentProviderOperationAction.id
    || controlProjection.action.contractVersion !== 'v1'
    || canonicalDigest(controlProjection.origin as never)
      !== canonicalDigest((control.authorityBinding as { origin?: unknown })?.origin as never)
    || control.preparedMaterialDigest !== source.prepared.materialInputDigest
    || control.preparedMaterialDigest
      !== materialDigest(source.input, executeDevelopmentProviderOperationAction.invocationContract!.materialInputPaths)
  ) throw new Error('packet_provider_operation_control_linkage_refused')
  const attemptRefs = new Set<string>()
  for (const attempt of durable.attempts) {
    const attemptRef = String(attempt.attemptRef)
    attemptRefs.add(attemptRef)
    if (
      attempt.invocationRef !== invocationRef
      || (attempt.idempotency as { materialInputDigest?: string })?.materialInputDigest
        !== control.preparedMaterialDigest
      || !Number.isInteger(attempt.effectGeneration)
    ) throw new Error('packet_provider_operation_attempt_linkage_refused')
  }
  let priorVersion = 0
  for (const row of durable.history) {
    if (
      row.invocationRef !== invocationRef
      || typeof row.invocationVersion !== 'number'
      || row.invocationVersion <= priorVersion
      || row.invocationVersion > Number(control.invocationVersion)
      || (
        row.effectGeneration !== undefined
        && !durable.attempts.some((attempt) => attempt.effectGeneration === row.effectGeneration)
      )
      || (
        row.attemptTransition !== undefined
        && !attemptRefs.has(String((row.attemptTransition as { attemptRef?: string }).attemptRef))
      )
    ) throw new Error('packet_provider_operation_history_linkage_refused')
    priorVersion = row.invocationVersion
  }
  if (terminal) {
    if (
      source.result === undefined
      || source.resultIdentity === undefined
      || control.sourceResultRef !== source.resultIdentity.sourceResultRef
      || control.sourceResultDigest !== source.resultIdentity.resultDigest
      || source.resultIdentity.resultDigest !== canonicalDigest(source.result)
    ) throw new Error('packet_provider_operation_result_identity_refused')
  } else {
    const evidence = source.reconciliationEvidence
    const attempt = durable.attempts[0]
    if (
      evidence === undefined
      || attempt === undefined
      || evidence.source !== executeDevelopmentProviderOperationAction.invocationContract!.reconciliationEvidenceSource
      || evidence.invocationRef !== invocationRef
      || evidence.attemptRef !== attempt.attemptRef
      || evidence.effectGeneration !== attempt.effectGeneration
      || !durable.history.some((row) => row.sourceEvidenceRef === evidence.evidenceRef)
    ) throw new Error('packet_provider_operation_reconciliation_linkage_refused')
    const evidenceError = validateReconciliationEvidence({
      evidence,
      source: executeDevelopmentProviderOperationAction.invocationContract!.reconciliationEvidenceSource,
      invocationRef,
      attemptRef: String(attempt.attemptRef),
      effectGeneration: Number(attempt.effectGeneration),
      notBefore: String(attempt.recordedAt),
      now: String(control.updatedAt),
      verifySourceEvidence: (candidate) =>
        canonicalDigest(candidate) === canonicalDigest(evidence),
    })
    if (evidenceError !== undefined) {
      throw new Error(`packet_provider_operation_reconciliation_evidence_refused:${evidenceError}`)
    }
    if (
      evidence.resolution !== 'released'
      || (attempt.outcome as { state?: string }).state !== 'reconciled_released'
      || (attempt.outcome as { externalOutcome?: string }).externalOutcome !== 'unknown'
    ) throw new Error('packet_provider_operation_reconciliation_disposition_refused')
  }
}

async function reconstructProviderOperationRows(durable: PacketDurable, terminal: boolean) {
  if (!durable.controls?.length || !durable.history?.length) {
    throw new Error('packet_provider_operation_durable_rows_refused')
  }
  const state = createDevelopmentDurableState<DevelopmentProviderOperationResult>()
  for (const row of durable.controls) state.controls.set(String(row.invocationRef), row as never)
  const invocationRef = String(durable.controls[0]!.invocationRef)
  const attempts = new Map()
  for (const row of durable.attempts) attempts.set(String(row.attemptRef), row as never)
  state.attempts.set(invocationRef, attempts)
  state.history.set(invocationRef, durable.history as never)
  const source = durable.source as unknown as {
    input: DevelopmentProviderOperationInput
    prepared: PreparedInvocation
    result?: DevelopmentProviderOperationResult
  }
  const result = source.result
  const tracer = createDurableActionInvocationTracer({
    action: executeDevelopmentProviderOperationAction,
    port: createDevelopmentDurablePort(state),
    now: developmentEvidenceNow,
    nextInvocationRef: () => 'verify:unused',
    nextAuthorityRef: () => 'verify:unused',
    nextAttemptRef: () => 'verify:unused',
    resolveSourceState: () => ({
      input: source.input,
      context: {},
      prepared: source.prepared,
      observedResolution: result === undefined
        ? { state: 'pending' }
        : {
            state: 'returned',
            execution: 'runner_returned',
            result,
            businessOutcome: 'completed',
            resultReferenceable: true,
          },
      ...(result === undefined ? {} : {
        resultIdentity: {
          sourceResultRef: result.kind === 'effect_confirmed' ? result.effectRef : 'refused',
          resultDigest: canonicalDigest(result),
        },
      }),
    }),
  })
  const resumed = await tracer.coldResume(invocationRef)
  const view = resumed.inspect(invocationRef)
  if (view === undefined || (terminal && view.control.state !== 'terminal')) {
    throw new Error('packet_provider_operation_control_reconstruction_refused')
  }
  return view
}

type PacketDurable = Readonly<{
  controls: readonly Record<string, unknown>[]
  attempts: readonly Record<string, unknown>[]
  history: readonly Record<string, unknown>[]
  source: Readonly<{
    input: SuppliedCandidateQuoteInput
    prepared: PreparedInvocation
    sourceResultRef: string
    result: SuppliedCandidateQuoteResult
  }>
}>

async function reconstructPacketMeaning(packet: Record<string, unknown>) {
  const durable = packet.durable as PacketDurable
  if (!durable.controls?.length || !durable.attempts?.length || !durable.history?.length) {
    throw new Error('packet_durable_meaning_refused')
  }
  const resultDigest = canonicalDigest(durable.source.result)
  const control = durable.controls[0]!
  const invocationRef = String(control.invocationRef)
  if (
    control.sourceResultRef !== durable.source.sourceResultRef
    || control.sourceResultDigest !== resultDigest
    || control.sourceRef === undefined
  ) throw new Error('packet_source_identity_refused')
  if (durable.attempts.some((row) => row.invocationRef !== invocationRef)) {
    throw new Error('packet_attempt_linkage_refused')
  }
  if (durable.history.some((row) => row.invocationRef !== invocationRef)) {
    throw new Error('packet_history_linkage_refused')
  }
  const state = createDevelopmentDurableState<SuppliedCandidateQuoteResult>()
  for (const row of durable.controls) state.controls.set(String(row.invocationRef), row as never)
  const attempts = new Map()
  for (const row of durable.attempts) attempts.set(String(row.attemptRef), row as never)
  state.attempts.set(invocationRef, attempts)
  state.history.set(invocationRef, durable.history as never)
  const port = createDevelopmentDurablePort(state)
  const tracer = createDurableActionInvocationTracer({
    action: collectSuppliedCandidateQuoteAction,
    port,
    now: developmentEvidenceNow,
    nextInvocationRef: () => 'verify:unused',
    nextAuthorityRef: () => 'verify:unused',
    nextAttemptRef: () => 'verify:unused',
    resolveSourceState: () => ({
      input: durable.source.input,
      context: {},
      prepared: durable.source.prepared,
      observedResolution: {
        state: 'returned',
        execution: 'runner_returned',
        result: durable.source.result,
        businessOutcome: 'completed',
        resultReferenceable: true,
      },
      resultIdentity: {
        sourceResultRef: durable.source.sourceResultRef,
        resultDigest,
      },
    }),
  })
  const resumed = await tracer.coldResume(invocationRef)
  const view = resumed.inspect(invocationRef)
  if (
    view?.observedResolution.state !== 'returned'
    || view.observedResolution.businessOutcome !== 'completed'
    || view.action.id !== collectSuppliedCandidateQuoteAction.id
    || view.action.contractVersion !== resolveActionContract(collectSuppliedCandidateQuoteAction).version
  ) throw new Error('packet_control_reconstruction_refused')
  const identity = await readCompletedResultIdentity(port,
  invocationRef,
  developmentEvidenceActor,
  () => ({
    sourceResultRef: durable.source.sourceResultRef,
    result: durable.source.result,
  }),)
  if (identity.kind === 'refused') throw new Error(`packet_result_identity_refused:${identity.code}`)
  const reference = packet.completedReference as Record<string, unknown>
  if (
    reference.invocationRef !== identity.invocationRef
    || reference.sourceResultRef !== identity.sourceResultRef
    || reference.resultDigest !== identity.resultDigest
    || reference.actionId !== identity.actionId
    || reference.actionVersion !== identity.actionVersion
  ) throw new Error('packet_completion_reference_refused')
  const aggregate = packet.requestAggregate as CustomerRequestV2Aggregate
  const nodes = packet.compositionNodes as Parameters<typeof projectReferenceComposition>[0]['nodes']
  const projected = projectReferenceComposition({
    requestRef: aggregate.snapshot.requestId,
    revision: aggregate.snapshot.revision,
    aggregate,
    nodes,
  }, {
    resolveRegisteredAction: registeredDescriptor,
    resolveCompletedResult: (ref) => ref === reference.referenceRef ? reference as never : undefined,
    resolveInvocation: () => undefined,
  })
  if (
    projected.kind !== 'projected'
    || canonicalDigest(projected.projection as never) !== canonicalDigest(packet.composition as never)
  ) throw new Error('packet_composition_refused')
  verifyRecovery(packet.recovery)
  verifyTransfer(packet, durable, view, projected.projection)
  return {
    durableControlRecords: state.controls.size,
    attributableAttempts: state.attempts.get(invocationRef)?.size ?? 0,
    durableHistoryRecords: state.history.get(invocationRef)?.length ?? 0,
    compositionNodes: projected.projection.nodes.length,
    resultReference: identity,
    recovery: packet.recovery,
    transfer: packet.transfer,
  }
}

function verifyTransfer(
  packet: Record<string, unknown>,
  durable: PacketDurable,
  view: ActionInvocationView<SuppliedCandidateQuoteResult>,
  projection: { nodes: readonly { state: string }[] },
) {
  const directRead = packet.directControl as {
    events?: TransferBoundaryEvent[]
    lifecycleEmissions?: {
      actionInvocationEmissions?: number
      controlEmissions?: number
      attemptEmissions?: number
      historyEmissions?: number
    }
  }
  const directConsequential = packet.directConsequential as {
    events?: TransferBoundaryEvent[]
    effectCalls?: number
  }
  if (
    !directRead.events?.some(({ kind }) => kind === 'direct_runner_started')
    || !directRead.events.some(({ kind }) => kind === 'direct_runner_returned')
    || directRead.lifecycleEmissions?.actionInvocationEmissions !== 0
    || directRead.lifecycleEmissions.controlEmissions !== 0
    || directRead.lifecycleEmissions.attemptEmissions !== 0
    || directRead.lifecycleEmissions.historyEmissions !== 0
    || !directConsequential.events?.some(({ kind }) => kind === 'effect_call')
  ) throw new Error('packet_direct_control_refused')
  const controlled: TransferBoundaryEvent[] = [
    { kind: 'approval_policy', policy: 'prompt', reason: 'exact invocation authority' },
    { kind: 'authority_decision', invocationRef: view.invocationRef },
    { kind: 'user_or_supervisor_decision', invocationRef: view.invocationRef },
    { kind: 'direct_runner_started', actionId: collectSuppliedCandidateQuoteAction.id },
    { kind: 'effect_call', actionId: collectSuppliedCandidateQuoteAction.id },
    { kind: 'direct_runner_returned', actionId: collectSuppliedCandidateQuoteAction.id, outcome: 'quote_returned' },
    { kind: 'action_invocation', invocationRef: view.invocationRef },
    ...durable.controls.map((row) => ({
      kind: 'control' as const,
      invocationRef: String(row.invocationRef),
    })),
    ...durable.attempts.map((row) => ({
      kind: 'attempt' as const,
      invocationRef: String(row.invocationRef),
      attemptRef: String(row.attemptRef),
    })),
    ...durable.history.map((row) => ({
      kind: 'history' as const,
      invocationRef: String(row.invocationRef),
      commandId: String(row.commandId),
    })),
  ]
  const serialized = JSON.stringify({
    reference: packet.completedReference,
    projection,
  })
  const evaluated = evaluateAdr009Transfer({
    events: {
      direct_read: directRead.events,
      direct_consequential: directConsequential.events,
      controlled,
    },
    requiredContinuations: {
      direct_read: resolveActionContract(registryDetailAction).safeContinuations.length,
      direct_consequential:
        resolveActionContract(collectSuppliedCandidateQuoteAction).safeContinuations.length,
      controlled:
        resolveActionContract(collectSuppliedCandidateQuoteAction).safeContinuations.length,
    },
    controlledReadback: {
      invocationVersion: view.invocationVersion,
      controlRecords: durable.controls.length,
      attributableAttempts: durable.attempts.length,
      durableHistoryRecords: durable.history.length,
      terminalResultReconstructed: view.observedResolution.state === 'returned',
      exactAuthorityBeforeRelease:
        durable.history.findIndex((row) => row.kind === 'decide')
        < durable.history.findIndex((row) => row.kind === 'begin_release'),
      retryClass: resolveActionContract(collectSuppliedCandidateQuoteAction).retryClass,
    },
    referenceReuse: {
      completedReferences: 1,
      completedNodes: projection.nodes.filter(({ state }) => state === 'completed').length,
      currentNodes: projection.nodes.filter(({ state }) => state === 'current').length,
      effectsBeforeReuse: durable.attempts.length,
      effectsAfterReuse: durable.attempts.length,
      copiedLifecycleOrResultFields:
        serialized.match(/authority|attempt|control|quoteRef|price|terms|evidenceRefs/u)?.length ?? 0,
      persistedRoutePlansOrBundles:
        (packet.requestAggregate as CustomerRequestV2Aggregate).plan.actions.length,
    },
  })
  if (canonicalDigest(evaluated as never) !== canonicalDigest(packet.transfer as never)) {
    throw new Error('packet_transfer_refused')
  }
}

function verifyRecovery(value: unknown) {
  const recovery = value as {
    before?: { state?: string }
    release?: { state?: string }
    coldContinuation?: { state?: string }
    evidence?: { source?: string; resolution?: string }
    after?: { state?: string }
  }
  if (
    recovery.before?.state !== 'reconciliation_required'
    || recovery.release?.state !== 'possibly_released'
    || recovery.coldContinuation?.state !== 'reconciliation_required'
    || recovery.evidence?.source !== resolveActionContract(
      collectSuppliedCandidateQuoteAction,
    ).reconciliationEvidenceSource
    || recovery.evidence?.resolution !== 'released'
    || recovery.after?.state !== 'terminal'
  ) throw new Error('packet_recovery_refused')
}
