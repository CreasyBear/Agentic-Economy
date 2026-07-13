import { v, type Infer } from 'convex/values'

import { isBoundedJsonValue, type JsonValue } from '@/modules/capability-contract/public'
import { canonicalDigest, isCanonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import {
  actionAttemptResolutionV2Digest,
  providerOutcomeV2Digest,
  reconcileProviderOutcomeV2,
  reconciliationObservationV2Digest,
  type ActionAttemptResolutionV2,
  type ProviderReconciliationObservationV2,
} from '@/modules/customer-request/public'
import {
  actionAttemptResolutionV2Value,
  providerReconciliationObservationV2Value,
} from '@/modules/customer-request/runtime'

import type { Doc } from './_generated/dataModel'
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from './_generated/server'
import { openExactProviderOutcomeForReconciliation } from './customerRequestV2ProviderExecution'

const reconciliationResultValue = v.union(
  v.object({
    kind: v.literal('observed'), observation: providerReconciliationObservationV2Value,
    resolution: actionAttemptResolutionV2Value,
  }),
  v.object({
    kind: v.literal('conflict'),
    reason: v.union(
      v.literal('idempotency_key_reused'), v.literal('terminal_outcome_already_recorded'),
      v.literal('evidence_already_observed'),
    ),
  }),
  v.object({
    kind: v.literal('refused'),
    reason: v.union(
      v.literal('unknown_outcome_not_found'), v.literal('reconciliation_integrity_failure'),
      v.literal('report_invalid'),
    ),
  }),
)
type ReconciliationResult = Infer<typeof reconciliationResultValue>
type ReconciliationCommand = Readonly<{
  commandKey: string
  commandDigest: string
  actionAttemptRef: string
  report: JsonValue
  now: number
}>

const actionStatusValue = v.union(
  v.object({ kind: v.literal('none') }),
  v.object({ kind: v.literal('integrity_failure') }),
  v.object({
    kind: v.literal('unknown'), actionAttemptRef: v.string(),
    reason: v.union(
      v.literal('provider_response_invalid'), v.literal('provider_pending'),
      v.literal('provider_echo_mismatch'), v.literal('provider_output_invalid'),
      v.literal('evidence_invalid'), v.literal('provider_identity_mismatch'),
      v.literal('terminal_evidence_missing'),
    ),
    observedAt: v.number(), automaticRetry: v.literal(false),
  }),
  v.object({
    kind: v.literal('completed'), actionAttemptRef: v.string(),
    resolution: v.union(v.literal('provider_result'), v.literal('reconciled')),
    result: v.any(), // runtime-validated JsonValue boundary
    evidenceRef: v.string(), resolvedAt: v.number(), automaticRetry: v.literal(false),
  }),
  v.object({
    kind: v.literal('failed'), actionAttemptRef: v.string(), resolution: v.literal('reconciled'),
    result: v.any(), // runtime-validated JsonValue boundary
    evidenceRef: v.string(), resolvedAt: v.number(), automaticRetry: v.literal(false),
  }),
)
export type CustomerActionStatusV2 = Infer<typeof actionStatusValue>

export const reconcile = internalMutation({
  args: {
    commandKey: v.string(), commandDigest: v.string(), actionAttemptRef: v.string(),
    report: v.any(), // runtime-validated JsonValue boundary
    now: v.number(),
  },
  returns: reconciliationResultValue,
  handler: async (ctx, args): Promise<ReconciliationResult> => await reconcileProviderOutcomeTransaction(ctx.db, args),
})

export const getActionStatus = internalQuery({
  args: {
    requestId: v.string(), requestRevision: v.number(), actionId: v.string(), principalId: v.string(),
  },
  returns: actionStatusValue,
  handler: async (ctx, args): Promise<CustomerActionStatusV2> => await getCustomerActionStatus(ctx.db, args),
})

export async function getCustomerActionStatus(
  db: QueryCtx['db'],
  args: Readonly<{ requestId: string; requestRevision: number; actionId: string; principalId: string }>,
): Promise<CustomerActionStatusV2> {
    const attempt = await db.query('customerRequestV2ActionAttempts')
      .withIndex('by_requestId_and_requestRevision_and_actionId', (query) => query
        .eq('requestId', args.requestId).eq('requestRevision', args.requestRevision).eq('actionId', args.actionId))
      .unique()
    if (attempt === null) return { kind: 'none' }
    if (attempt.principalId !== args.principalId
      || attempt.actionAttemptRef !== attempt.actionAttempt.actionAttemptRef
      || attempt.actionAttemptDigest !== attempt.actionAttempt.actionAttemptDigest) return { kind: 'integrity_failure' }
    const outcome = await db.query('customerRequestV2ProviderOutcomes')
      .withIndex('by_actionAttemptRef', (query) => query.eq('actionAttemptRef', attempt.actionAttemptRef)).unique()
    if (outcome === null) return { kind: 'none' }
    if (!providerOutcomeRowValid(outcome, attempt)) return { kind: 'integrity_failure' }
    const material = await openExactProviderOutcomeForReconciliation(db, attempt.actionAttemptRef)
    if (material.kind !== 'ready' || !sameValue(material.outcome, outcome.outcome)) {
      return { kind: 'integrity_failure' }
    }
    const exactOutcome = material.outcome
    if (exactOutcome.state === 'succeeded') return {
      kind: 'completed', actionAttemptRef: attempt.actionAttemptRef, resolution: 'provider_result',
      result: structuredClone(exactOutcome.output), evidenceRef: exactOutcome.outcomeRef,
      resolvedAt: exactOutcome.observedAt, automaticRetry: false,
    }
    const resolution = await db.query('customerRequestV2ActionAttemptResolutions')
      .withIndex('by_actionAttemptRef', (query) => query.eq('actionAttemptRef', attempt.actionAttemptRef)).unique()
    if (resolution === null) return {
      kind: 'unknown', actionAttemptRef: attempt.actionAttemptRef,
      reason: exactOutcome.reason, observedAt: exactOutcome.observedAt, automaticRetry: false,
    }
    if (!resolutionRowValid(resolution, outcome, attempt)) return { kind: 'integrity_failure' }
    const observation = await db.query('customerRequestV2ProviderReconciliationObservations')
      .withIndex('by_observationRef', (query) => query
        .eq('observationRef', resolution.resolution.latestObservationRef)).unique()
    if (observation === null || !observationRowValid(observation, resolution, outcome)) {
      return { kind: 'integrity_failure' }
    }
    const rederived = reconcileProviderOutcomeV2({
      unknownOutcome: exactOutcome, envelope: material.envelope, contract: material.contract,
      report: observation.observation.report, observedAt: observation.observation.observedAt,
    })
    if (rederived.kind !== 'observed'
      || !sameValue(rederived.observation, observation.observation)
      || !sameValue(rederived.resolution, resolution.resolution)) {
      return { kind: 'integrity_failure' }
    }
    if (resolution.resolution.state === 'unknown_external_state') {
      if (observation.observation.reason === undefined) return { kind: 'integrity_failure' }
      return {
        kind: 'unknown', actionAttemptRef: attempt.actionAttemptRef,
        reason: observation.observation.reason, observedAt: observation.observation.observedAt,
        automaticRetry: false,
      }
    }
    const terminal = resolution.resolution.terminal
    if (terminal === undefined) return { kind: 'integrity_failure' }
    return {
      kind: resolution.resolution.state === 'succeeded' ? 'completed' : 'failed',
      actionAttemptRef: attempt.actionAttemptRef, resolution: 'reconciled',
      result: structuredClone(terminal.output), evidenceRef: resolution.resolution.latestObservationRef,
      resolvedAt: resolution.resolution.updatedAt, automaticRetry: false,
    }
}

export async function reconcileProviderOutcomeTransaction(
  db: MutationCtx['db'], args: ReconciliationCommand,
): Promise<ReconciliationResult> {
  if (!validCommand(args)) return { kind: 'refused', reason: 'report_invalid' }
  const replay = await db.query('customerRequestV2ProviderReconciliationCommands')
    .withIndex('by_commandKey', (query) => query.eq('commandKey', args.commandKey)).unique()
  const material = await openExactProviderOutcomeForReconciliation(db, args.actionAttemptRef)
  if (material.kind !== 'ready') return {
    kind: 'refused',
    reason: material.reason === 'outcome_not_found' ? 'unknown_outcome_not_found' : 'reconciliation_integrity_failure',
  }
  if (material.outcome.state !== 'unknown_external_state') {
    return { kind: 'refused', reason: 'unknown_outcome_not_found' }
  }
  if (replay !== null) return await replayReconciliation(db, args, replay, material)
  const existingResolution = await db.query('customerRequestV2ActionAttemptResolutions')
    .withIndex('by_actionAttemptRef', (query) => query.eq('actionAttemptRef', args.actionAttemptRef)).unique()
  if (existingResolution !== null
    && !resolutionMaterialValid(existingResolution, {
      outcomeRef: material.outcome.outcomeRef,
      outcomeDigest: material.outcome.outcomeDigest,
      authorityLineageDigest: material.outcome.lineageDigest,
    }, material.envelope.lineage)) {
    return { kind: 'refused', reason: 'reconciliation_integrity_failure' }
  }
  if (existingResolution !== null && args.now < existingResolution.resolution.updatedAt) {
    return { kind: 'refused', reason: 'report_invalid' }
  }
  if (existingResolution !== null && existingResolution.resolution.state !== 'unknown_external_state') {
    return { kind: 'conflict', reason: 'terminal_outcome_already_recorded' }
  }
  const reconciled = reconcileProviderOutcomeV2({
    unknownOutcome: material.outcome, envelope: material.envelope, contract: material.contract,
    report: args.report, observedAt: args.now,
  })
  if (reconciled.kind !== 'observed') return { kind: 'refused', reason: 'reconciliation_integrity_failure' }
  const [duplicateObservation, duplicateEvidence] = await Promise.all([
    db.query('customerRequestV2ProviderReconciliationObservations')
      .withIndex('by_observationRef', (query) => query.eq(
        'observationRef', reconciled.observation.observationRef,
      )).unique(),
    reconciled.observation.providerEvidenceIdentityDigest === undefined
      ? Promise.resolve(null)
      : db.query('customerRequestV2ProviderReconciliationObservations')
          .withIndex('by_providerEvidenceIdentityDigest', (query) => query
            .eq('providerEvidenceIdentityDigest', reconciled.observation.providerEvidenceIdentityDigest)).unique(),
  ])
  if (duplicateObservation !== null || duplicateEvidence !== null) {
    return { kind: 'conflict', reason: 'evidence_already_observed' }
  }
  await persistReconciliation(db, args, reconciled.observation, reconciled.resolution, existingResolution)
  return {
    kind: 'observed', observation: structuredClone(reconciled.observation),
    resolution: structuredClone(reconciled.resolution),
  }
}

async function persistReconciliation(
  db: MutationCtx['db'], args: ReconciliationCommand,
  observation: ProviderReconciliationObservationV2,
  resolution: ActionAttemptResolutionV2,
  existingResolution: Doc<'customerRequestV2ActionAttemptResolutions'> | null,
): Promise<void> {
  await db.insert('customerRequestV2ProviderReconciliationObservations', {
    observationRef: observation.observationRef, observationDigest: observation.observationDigest,
    actionAttemptRef: observation.lineage.actionAttemptRef,
    originOutcomeRef: observation.originOutcomeRef,
    ...(observation.providerEvidenceRef === undefined
      ? {} : { providerEvidenceRef: observation.providerEvidenceRef }),
    ...(observation.providerEvidenceIdentityDigest === undefined
      ? {} : { providerEvidenceIdentityDigest: observation.providerEvidenceIdentityDigest }),
    authorityLineageDigest: observation.lineageDigest,
    observation: structuredClone(observation), recordedAt: args.now,
  })
  const resolutionRow = {
    resolutionRef: resolution.resolutionRef, resolutionDigest: resolution.resolutionDigest,
    actionAttemptRef: resolution.actionAttemptRef,
    requestId: resolution.lineage.requestId, requestRevision: resolution.lineage.requestRevision,
    actionId: resolution.lineage.actionId, principalId: resolution.lineage.principalId,
    state: resolution.state, authorityLineageDigest: resolution.lineageDigest,
    resolution: structuredClone(resolution), updatedAt: args.now,
  }
  if (existingResolution === null) await db.insert('customerRequestV2ActionAttemptResolutions', resolutionRow)
  else await db.replace(existingResolution._id, resolutionRow)
  await db.insert('customerRequestV2ProviderReconciliationCommands', {
    commandKey: args.commandKey, commandDigest: args.commandDigest,
    actionAttemptRef: args.actionAttemptRef, reportDigest: observation.reportDigest,
    observationRef: observation.observationRef, observationDigest: observation.observationDigest,
    resolutionRef: resolution.resolutionRef, resolutionDigest: resolution.resolutionDigest,
    committedAt: args.now,
  })
}

async function replayReconciliation(
  db: MutationCtx['db'], args: ReconciliationCommand,
  command: Doc<'customerRequestV2ProviderReconciliationCommands'>,
  material: Extract<Awaited<ReturnType<typeof openExactProviderOutcomeForReconciliation>>, { kind: 'ready' }>,
): Promise<ReconciliationResult> {
  if (command.commandDigest !== args.commandDigest || command.actionAttemptRef !== args.actionAttemptRef
    || command.reportDigest !== canonicalDigest(args.report as StableHashValue)) {
    return { kind: 'conflict', reason: 'idempotency_key_reused' }
  }
  const [observation, resolution] = await Promise.all([
    db.query('customerRequestV2ProviderReconciliationObservations')
      .withIndex('by_observationRef', (query) => query.eq('observationRef', command.observationRef)).unique(),
    db.query('customerRequestV2ActionAttemptResolutions')
      .withIndex('by_resolutionRef', (query) => query.eq('resolutionRef', command.resolutionRef)).unique(),
  ])
  if (observation === null) throw replayIntegrityFailure('observation_missing')
  if (resolution === null) throw replayIntegrityFailure('resolution_missing')
  const resolutionProblem = resolutionMaterialProblem(resolution, {
    outcomeRef: material.outcome.outcomeRef,
    outcomeDigest: material.outcome.outcomeDigest,
    authorityLineageDigest: material.outcome.lineageDigest,
  }, material.envelope.lineage)
  if (resolutionProblem !== undefined) throw replayIntegrityFailure(`resolution_invalid:${resolutionProblem}`)
  const expected = reconcileProviderOutcomeV2({
    unknownOutcome: material.outcome, envelope: material.envelope, contract: material.contract,
    report: args.report, observedAt: observation.observation.observedAt,
  })
  if (expected.kind !== 'observed'
    || !sameValue(observation.observation, expected.observation)
    || command.observationDigest !== observation.observationDigest
    || reconciliationObservationV2Digest(observation.observation) !== observation.observationDigest
    || command.resolutionDigest !== expected.resolution.resolutionDigest
    || actionAttemptResolutionV2Digest(expected.resolution) !== expected.resolution.resolutionDigest) {
    throw replayIntegrityFailure('material_changed')
  }
  return {
    kind: 'observed', observation: observation.observation,
    resolution: expected.resolution,
  }
}

function providerOutcomeRowValid(
  outcome: Doc<'customerRequestV2ProviderOutcomes'>,
  attempt: Doc<'customerRequestV2ActionAttempts'>,
): boolean {
  return outcome.actionAttemptRef === attempt.actionAttemptRef
    && outcome.outcome.lineage.requestId === attempt.requestId
    && outcome.outcome.lineage.requestRevision === attempt.requestRevision
    && outcome.outcome.lineage.actionId === attempt.actionId
    && outcome.outcome.lineage.principalId === attempt.principalId
    && outcome.outcome.lineage.actionAttemptDigest === attempt.actionAttemptDigest
    && outcome.outcomeRef === outcome.outcome.outcomeRef
    && outcome.outcomeDigest === outcome.outcome.outcomeDigest
    && providerOutcomeV2Digest(outcome.outcome) === outcome.outcomeDigest
}

function resolutionRowValid(
  row: Doc<'customerRequestV2ActionAttemptResolutions'>,
  outcome: Doc<'customerRequestV2ProviderOutcomes'>,
  attempt: Doc<'customerRequestV2ActionAttempts'>,
): boolean {
  return resolutionMaterialValid(row, outcome, {
    actionAttemptRef: attempt.actionAttemptRef,
    actionAttemptDigest: attempt.actionAttemptDigest,
    requestId: attempt.requestId,
    requestRevision: attempt.requestRevision,
    actionId: attempt.actionId,
    principalId: attempt.principalId,
  })
}

type ResolutionLineageIdentity = Readonly<{
  actionAttemptRef: string
  actionAttemptDigest: string
  requestId: string
  requestRevision: number
  actionId: string
  principalId: string
}>
type OutcomeAuthorityIdentity = Readonly<{
  outcomeRef: string
  outcomeDigest: string
  authorityLineageDigest: string
}>

function resolutionMaterialValid(
  row: Doc<'customerRequestV2ActionAttemptResolutions'>,
  outcome: OutcomeAuthorityIdentity,
  lineage: ResolutionLineageIdentity,
): boolean {
  return resolutionMaterialProblem(row, outcome, lineage) === undefined
}

function resolutionMaterialProblem(
  row: Doc<'customerRequestV2ActionAttemptResolutions'>,
  outcome: OutcomeAuthorityIdentity,
  lineage: ResolutionLineageIdentity,
): string | undefined {
  const resolution = row.resolution
  const checks: readonly Readonly<{ valid: boolean; reason: string }>[] = [
    { valid: row.resolutionRef === resolution.resolutionRef, reason: 'resolution_ref' },
    { valid: row.resolutionDigest === resolution.resolutionDigest, reason: 'resolution_digest_row' },
    { valid: actionAttemptResolutionV2Digest(resolution) === resolution.resolutionDigest, reason: 'resolution_digest' },
    { valid: row.actionAttemptRef === lineage.actionAttemptRef, reason: 'attempt_ref_row' },
    { valid: resolution.actionAttemptRef === lineage.actionAttemptRef, reason: 'attempt_ref' },
    { valid: resolution.actionAttemptDigest === lineage.actionAttemptDigest, reason: 'attempt_digest' },
    { valid: resolution.originOutcomeRef === outcome.outcomeRef, reason: 'outcome_ref' },
    { valid: resolution.originOutcomeDigest === outcome.outcomeDigest, reason: 'outcome_digest' },
    { valid: row.requestId === lineage.requestId, reason: 'request_id' },
    { valid: row.requestRevision === lineage.requestRevision, reason: 'request_revision' },
    { valid: row.actionId === lineage.actionId, reason: 'action_id' },
    { valid: row.principalId === lineage.principalId, reason: 'principal_id' },
    { valid: row.authorityLineageDigest === outcome.authorityLineageDigest, reason: 'authority_row' },
    { valid: resolution.lineageDigest === outcome.authorityLineageDigest, reason: 'authority_resolution' },
    { valid: row.state === resolution.state, reason: 'state' },
  ]
  return checks.find((check) => !check.valid)?.reason
}

function observationRowValid(
  row: Doc<'customerRequestV2ProviderReconciliationObservations'>,
  resolution: Doc<'customerRequestV2ActionAttemptResolutions'>,
  outcome: Doc<'customerRequestV2ProviderOutcomes'>,
): boolean {
  const observation = row.observation
  return row.observationRef === observation.observationRef
    && row.observationDigest === observation.observationDigest
    && reconciliationObservationV2Digest(observation) === observation.observationDigest
    && row.actionAttemptRef === resolution.actionAttemptRef
    && row.originOutcomeRef === outcome.outcomeRef
    && row.providerEvidenceRef === observation.providerEvidenceRef
    && row.providerEvidenceIdentityDigest === observation.providerEvidenceIdentityDigest
    && row.recordedAt === observation.observedAt
    && row.authorityLineageDigest === outcome.authorityLineageDigest
    && resolution.resolution.latestObservationRef === observation.observationRef
    && resolution.resolution.latestObservationDigest === observation.observationDigest
    && resolution.resolution.state === observation.state
    && sameOptionalValue(resolution.resolution.terminal, observation.terminal)
}

function validCommand(args: ReconciliationCommand): boolean {
  return args.commandKey.trim().length > 0 && args.commandKey.length <= 500
    && isCanonicalDigest(args.commandDigest)
    && args.actionAttemptRef.startsWith('action-attempt:v2:') && args.actionAttemptRef.length <= 500
    && isBoundedJsonValue(args.report)
    && Number.isSafeInteger(args.now) && args.now >= 0
}

function sameValue(left: unknown, right: unknown): boolean {
  return canonicalDigest(left as StableHashValue) === canonicalDigest(right as StableHashValue)
}

function sameOptionalValue(left: unknown, right: unknown): boolean {
  if (left === undefined || right === undefined) return left === right
  return sameValue(left, right)
}

function replayIntegrityFailure(reason: string): Error {
  return new Error(`customer_request_v2_provider_reconciliation_replay_integrity_failure:${reason}`)
}
