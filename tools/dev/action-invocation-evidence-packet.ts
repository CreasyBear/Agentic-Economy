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

export type EvidenceEnvelope = Readonly<{
  schema: 'ae.action-invocation-development-evidence:v1'
  checksum: string
  packet: Record<string, unknown>
}>

function checksum(packet: Record<string, unknown>) {
  return createHash('sha256').update(JSON.stringify(packet)).digest('hex')
}

export async function writeEvidencePacket(path: string, packet: Record<string, unknown>) {
  const envelope: EvidenceEnvelope = {
    schema: 'ae.action-invocation-development-evidence:v1',
    checksum: `sha256:${checksum(packet)}`,
    packet,
  }
  await writeFile(path, `${JSON.stringify(envelope, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  return envelope
}

export async function readAndVerifyEvidencePacket(path: string, expectedRevision: string) {
  const envelope = JSON.parse(await readFile(path, 'utf8')) as EvidenceEnvelope
  if (envelope.schema !== 'ae.action-invocation-development-evidence:v1') throw new Error('packet_schema_refused')
  if (envelope.checksum !== `sha256:${checksum(envelope.packet)}`) throw new Error('packet_checksum_refused')
  if (envelope.packet.environment !== 'MOCK/DEVELOPMENT ONLY') throw new Error('packet_environment_refused')
  if (envelope.packet.gitRevision !== expectedRevision) throw new Error('packet_revision_refused')
  const action = envelope.packet.action as { id?: string; version?: string }
  if (action.id !== 'supply.collectDevelopmentQuote' || action.version !== 'supply.collectDevelopmentQuote:v1') {
    throw new Error('packet_action_identity_refused')
  }
  const reconstructed = reconstructPacketMeaning(envelope.packet)
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

function reconstructPacketMeaning(packet: Record<string, unknown>) {
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
  }, invocationRef)
  const view = tracer.inspect(invocationRef)
  if (
    view?.observedResolution.state !== 'returned'
    || view.observedResolution.businessOutcome !== 'completed'
    || view.action.id !== collectSuppliedCandidateQuoteAction.id
    || view.action.contractVersion !== resolveActionContract(collectSuppliedCandidateQuoteAction).version
  ) throw new Error('packet_control_reconstruction_refused')
  const identity = readCompletedResultIdentity(
    port,
    invocationRef,
    developmentEvidenceActor,
    () => ({
      sourceResultRef: durable.source.sourceResultRef,
      result: durable.source.result,
    }),
  )
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
