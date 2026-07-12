import type { GenericDatabaseReader, GenericDatabaseWriter } from 'convex/server'
import { v } from 'convex/values'

import {
  canonicalAuthorityDigest,
  createBindingRoutingEvidenceSnapshot,
  resolveIncidentFactKeyring,
  signIncidentFact,
  verifyIncidentFact,
} from '@/modules/routing-kernel/runtime'
import {
  INCIDENT_ACTION_CLASSES,
  incidentMatchingScopeKeys,
  incidentScopeKey,
  type IncidentActionClass,
  type IncidentScope,
} from '@/modules/routing-kernel/incident-control'

import { internalMutation, internalQuery, mutation } from './_generated/server'
import { internal } from './_generated/api'
import type { DataModel, Doc } from './_generated/dataModel'
import { resolveAdminAuthority } from './authz'

const actionClass = v.union(...INCIDENT_ACTION_CLASSES.map((value) => v.literal(value)))
const MAX_ACTIVE_FREEZES_PER_SCOPE = 64
const scope = {
  networkId: v.optional(v.string()), principalId: v.optional(v.string()), agentId: v.optional(v.string()),
  bindingId: v.optional(v.string()), capabilityContractId: v.optional(v.string()),
}
const evaluation = v.union(
  v.object({ kind: v.literal('allowed'), epochDigest: v.string() }),
  v.object({
    kind: v.literal('frozen'), epochDigest: v.string(), freezeOrderId: v.string(),
    incidentId: v.string(), reason: v.string(),
  }),
)
const freezeResult = v.union(
  v.object({ kind: v.literal('freeze_issued'), epoch: v.number() }),
  v.object({
    kind: v.literal('freeze_refused'),
    reason: v.union(v.literal('authorization_denied'), v.literal('freeze_order_conflict'), v.literal('blocked_actions_required'), v.literal('scope_freeze_capacity_exceeded')),
  }),
)
const resumeResult = v.union(
  v.object({ kind: v.literal('resume_approval_recorded'), approvalCount: v.number(), requiredApprovals: v.literal(2) }),
  v.object({ kind: v.literal('resume_issued'), epoch: v.number() }),
  v.object({
    kind: v.literal('resume_refused'),
    reason: v.union(
      v.literal('authorization_denied'), v.literal('freeze_order_not_found'), v.literal('freeze_order_not_active'),
      v.literal('resume_order_conflict'), v.literal('approval_identity_conflict'),
      v.literal('resume_evidence_required'), v.literal('resume_drain_incomplete'),
      v.literal('resume_reconstruction_invalid'), v.literal('resume_reconstruction_stale'),
      v.literal('resume_reconformance_invalid'), v.literal('resume_canary_run_invalid'), v.literal('scope_control_missing'),
    ),
  }),
)
const recoveryLane = v.union(v.literal('reconcile'), v.literal('canary'))
const canaryPlan = v.object({
  quoteId: v.string(), quoteDigest: v.string(), authorizationRef: v.string(), requestDigest: v.string(),
  bindingId: v.string(), capabilityContractId: v.string(), maximumSpendMinor: v.number(),
  currency: v.string(), allowedDataFields: v.array(v.string()),
})
const recoveryApprovalResult = v.union(
  v.object({ kind: v.literal('recovery_approval_recorded'), approvalCount: v.number(), requiredApprovals: v.literal(2) }),
  v.object({ kind: v.literal('recovery_grant_issued'), maximumUses: v.number() }),
  v.object({ kind: v.literal('recovery_refused'), reason: v.string() }),
)
const recoveryConsumptionResult = v.union(
  v.object({ kind: v.literal('recovery_authorized'), replay: v.boolean() }),
  v.object({ kind: v.literal('recovery_refused'), reason: v.string() }),
)
const quarantineResult = v.union(
  v.object({ kind: v.literal('evidence_quarantined'), quarantineId: v.string() }),
  v.object({ kind: v.literal('quarantine_refused'), reason: v.string() }),
)
const reconstructionResult = v.union(
  v.object({ kind: v.literal('reconstruction_recorded'), projectionMatches: v.boolean() }),
  v.object({ kind: v.literal('reconstruction_refused'), reason: v.string() }),
)
const reconformanceResult = v.union(
  v.object({ kind: v.literal('reconformance_recorded'), reconformanceFactId: v.string() }),
  v.object({ kind: v.literal('reconformance_refused'), reason: v.string() }),
)
const canaryRunResult = v.union(
  v.object({ kind: v.literal('canary_run_recorded'), canaryRunFactId: v.string() }),
  v.object({ kind: v.literal('canary_run_refused'), reason: v.string() }),
)
const refinementResult = v.union(
  v.object({ kind: v.literal('refinement_approval_recorded'), approvalCount: v.number(), requiredApprovals: v.literal(2) }),
  v.object({ kind: v.literal('freeze_refined'), replacementFreezeOrderId: v.string(), epoch: v.number() }),
  v.object({ kind: v.literal('refinement_refused'), reason: v.string() }),
)

export const requireIncidentOperator = mutation({
  args: {},
  returns: v.union(v.object({ kind: v.literal('allowed') }), v.object({ kind: v.literal('denied') })),
  handler: async (ctx) => {
    const authority = await resolveAdminAuthority({ db: ctx.db as never, auth: ctx.auth }, 'control_kernel_incidents')
    return authority.kind === 'allowed' ? { kind: 'allowed' as const } : { kind: 'denied' as const }
  },
})

export const evaluate = internalQuery({
  args: { scope: v.object(scope), action: actionClass },
  returns: evaluation,
  handler: async (ctx, args) => await evaluateIncidentInTransaction(ctx.db, args.scope, args.action),
})

export async function evaluateIncidentInTransaction(
  db: GenericDatabaseReader<DataModel>,
  scope: IncidentScope,
  action: IncidentActionClass,
) {
    const controls = (await Promise.all(incidentMatchingScopeKeys(scope).map(async (scopeKey) =>
      await db.query('routingKernelIncidentScopeControls').withIndex('by_scopeKey', (query) => query.eq('scopeKey', scopeKey)).unique()
    ))).filter((row) => row !== null)
    const epochDigest = canonicalAuthorityDigest({
      incidentEpochs: controls
        .map((row) => ({ scopeKey: row.scopeKey, epoch: row.epoch }))
        .sort((left, right) => left.scopeKey.localeCompare(right.scopeKey)),
    })
    const activeOrders: Array<{
      control: Doc<'routingKernelIncidentScopeControls'>
      order: Doc<'routingKernelIncidentFreezeOrders'>
    }> = []
    for (const control of controls) {
      for (const freezeOrderId of activeFreezeIds(control)) {
        const order = await db.query('routingKernelIncidentFreezeOrders')
          .withIndex('by_freezeOrderId', (query) => query.eq('freezeOrderId', freezeOrderId)).unique()
        if (order === null) throw new Error('incident_scope_projection_invalid')
        if (!verifiedFreezeFact(order)) throw new Error('incident_freeze_fact_signature_invalid')
        if (order.blockedActions.includes(action)) activeOrders.push({ control, order })
      }
    }
    activeOrders
      .sort((left, right) => right.control.specificity - left.control.specificity
        || right.order.epoch - left.order.epoch
        || left.order.freezeOrderId.localeCompare(right.order.freezeOrderId))
    const order = activeOrders[0]?.order
    if (order === undefined) return { kind: 'allowed' as const, epochDigest }
    return {
      kind: 'frozen' as const, epochDigest, freezeOrderId: order.freezeOrderId,
      incidentId: order.incidentId, reason: order.reason,
    }
}

export const issueFreeze = mutation({
  args: {
    freezeOrderId: v.string(), incidentId: v.string(), reason: v.string(),
    scope: v.object(scope), blockedActions: v.array(actionClass),
  },
  returns: freezeResult,
  handler: async (ctx, args) => {
    const authority = await resolveAdminAuthority({ db: ctx.db as never, auth: ctx.auth }, 'control_kernel_incidents')
    if (authority.kind !== 'allowed') return { kind: 'freeze_refused' as const, reason: 'authorization_denied' as const }
    const issuerId = authority.membership.tokenIdentifier ?? authority.membership.clerkUserId
    const issuedAt = Date.now()
    const existing = await ctx.db.query('routingKernelIncidentFreezeOrders')
      .withIndex('by_freezeOrderId', (query) => query.eq('freezeOrderId', args.freezeOrderId)).unique()
    if (existing !== null) {
      return sameFreeze(existing, { ...args, issuerId })
        ? { kind: 'freeze_issued' as const, epoch: existing.epoch }
        : { kind: 'freeze_refused' as const, reason: 'freeze_order_conflict' as const }
    }
    const blockedActions = normalizeActions(args.blockedActions)
    if (blockedActions.length === 0) return { kind: 'freeze_refused' as const, reason: 'blocked_actions_required' as const }
    const normalizedScope = normalizeScope(args.scope)
    const scopeKey = incidentScopeKey(normalizedScope)
    const control = await ctx.db.query('routingKernelIncidentScopeControls')
      .withIndex('by_scopeKey', (query) => query.eq('scopeKey', scopeKey)).unique()
    const activeFreezeOrderIds = control === null ? [] : activeFreezeIds(control)
    if (activeFreezeOrderIds.length >= MAX_ACTIVE_FREEZES_PER_SCOPE) {
      return { kind: 'freeze_refused' as const, reason: 'scope_freeze_capacity_exceeded' as const }
    }
    const epoch = (control?.epoch ?? 0) + 1
    const controlValue = {
      scopeKey, ...normalizedScope, specificity: Object.keys(normalizedScope).length,
      epoch, activeFreezeOrderIds: [...activeFreezeOrderIds, args.freezeOrderId],
      blockedActions: normalizeActions([...(control?.blockedActions ?? []), ...blockedActions]), updatedAt: issuedAt,
    }
    if (control === null) await ctx.db.insert('routingKernelIncidentScopeControls', controlValue)
    else await ctx.db.replace(control._id, controlValue)
    const factMaterial = {
      schemaVersion: 'incident-freeze-order:v1', freezeOrderId: args.freezeOrderId,
      incidentId: args.incidentId, issuerId, reason: args.reason,
      scopeKey, ...normalizedScope, blockedActions, epoch, issuedAt,
    } as const
    const factDigest = canonicalAuthorityDigest(factMaterial)
    await ctx.db.insert('routingKernelIncidentFreezeOrders', {
      ...factMaterial, factDigest, ...signIncidentFact(factDigest, incidentFactKeyring().active),
    })
    await ctx.db.insert('routingKernelIncidentDrainSweeps', {
      freezeOrderId: args.freezeOrderId, scopeKey, freezeIssuedAt: issuedAt,
      status: 'pending', rootsExamined: 0, factsRecorded: 0, updatedAt: issuedAt,
    })
    if ('scheduler' in ctx) {
      await ctx.scheduler.runAfter(0, internal.routingKernelIncidentControl.processIncidentDrainSweep, {
        freezeOrderId: args.freezeOrderId, cursor: null,
      })
    }
    return { kind: 'freeze_issued' as const, epoch }
  },
})

export const processIncidentDrainSweep = internalMutation({
  args: { freezeOrderId: v.string(), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const sweep = await ctx.db.query('routingKernelIncidentDrainSweeps')
      .withIndex('by_freezeOrderId', (query) => query.eq('freezeOrderId', args.freezeOrderId)).unique()
    if (sweep === null) throw new Error('incident_drain_sweep_missing')
    if (sweep.status === 'complete') return { kind: 'drain_complete' as const, rootsExamined: sweep.rootsExamined, factsRecorded: sweep.factsRecorded }
    if ((sweep.cursor ?? null) !== args.cursor) throw new Error('incident_drain_cursor_conflict')
    const freeze = await ctx.db.query('routingKernelIncidentFreezeOrders')
      .withIndex('by_freezeOrderId', (query) => query.eq('freezeOrderId', args.freezeOrderId)).unique()
    if (freeze === null || !verifiedFreezeFact(freeze)) throw new Error('incident_freeze_fact_signature_invalid')
    const containmentAt = sweep.freezeIssuedAt
    const page = await ctx.db.query('routingKernelRootRuns').paginate({ cursor: args.cursor, numItems: 25 })
    let factsRecorded = 0
    const selector = scopeFromFreeze(freeze)
    for (const root of page.page) {
      if (!rootScopeMatches(selector, { networkId: root.networkId, principalId: root.principalId, agentId: root.agentId })) continue
      const records = await ctx.db.query('routingKernelProtocolRecords')
        .withIndex('by_rootRunId_sequence', (query) => query.eq('rootRunId', root.rootRunId)).collect()
      const admitted = records.find((record) => record.type === 'root_run_admitted')
      if (admitted === undefined || admitted.occurredAt > containmentAt) continue
      const executionActiveAtFreeze = root.completedAt === undefined || root.completedAt > containmentAt
      const leaves = await ctx.db.query('routingKernelLeafRuns')
        .withIndex('by_rootRunId_leafRunId', (query) => query.eq('rootRunId', root.rootRunId)).collect()
      for (const leaf of leaves) {
        if (!scopeSelectorMatches(selector, {
          networkId: root.networkId, principalId: root.principalId, agentId: root.agentId,
          bindingId: leaf.bindingId, capabilityContractId: leaf.capabilityContractId,
        })) continue
        if (executionActiveAtFreeze) {
          const released = records.some((record) => record.type === 'provider_attempt_released'
            && record.leafRunId === leaf.leafRunId && record.occurredAt <= containmentAt)
          const disposition = released ? 'in_flight_indeterminate' as const : 'pre_release_contained' as const
          factsRecorded += await insertDrainFact(ctx.db, {
            freezeOrderId: freeze.freezeOrderId, rootRunId: root.rootRunId, leafRunId: leaf.leafRunId,
            bindingId: leaf.bindingId, egressKind: 'provider_execution', disposition, observedAt: containmentAt,
          })
        }
        const cancellation = await ctx.db.query('routingKernelProviderCancellations')
          .withIndex('by_rootRunId', (query) => query.eq('rootRunId', root.rootRunId)).unique()
        if (cancellation !== null && cancellation.leafRunId === leaf.leafRunId
          && cancellation.requestedAt <= containmentAt
          && (cancellation.resolvedAt === undefined || cancellation.resolvedAt > containmentAt)) {
          factsRecorded += await insertDrainFact(ctx.db, {
            freezeOrderId: freeze.freezeOrderId, rootRunId: root.rootRunId, leafRunId: leaf.leafRunId,
            bindingId: leaf.bindingId, egressKind: 'provider_cancellation',
            disposition: 'cancellation_in_flight_indeterminate', observedAt: containmentAt,
          })
        }
      }
    }
    const nextRootsExamined = sweep.rootsExamined + page.page.length
    const nextFactsRecorded = sweep.factsRecorded + factsRecorded
    if (page.isDone) {
      await ctx.db.patch(sweep._id, { status: 'complete', cursor: undefined, rootsExamined: nextRootsExamined, factsRecorded: nextFactsRecorded, updatedAt: Date.now() })
      return { kind: 'drain_complete' as const, rootsExamined: nextRootsExamined, factsRecorded: nextFactsRecorded }
    }
    await ctx.db.patch(sweep._id, { cursor: page.continueCursor, rootsExamined: nextRootsExamined, factsRecorded: nextFactsRecorded, updatedAt: Date.now() })
    await ctx.scheduler.runAfter(0, internal.routingKernelIncidentControl.processIncidentDrainSweep, {
      freezeOrderId: args.freezeOrderId, cursor: page.continueCursor,
    })
    return { kind: 'drain_pending' as const, rootsExamined: nextRootsExamined, factsRecorded: nextFactsRecorded }
  },
})

export const readIncidentDrainStatus = internalQuery({
  args: { freezeOrderId: v.string() },
  handler: async (ctx, args) => {
    const sweep = await ctx.db.query('routingKernelIncidentDrainSweeps')
      .withIndex('by_freezeOrderId', (query) => query.eq('freezeOrderId', args.freezeOrderId)).unique()
    return sweep === null ? null : {
      status: sweep.status, rootsExamined: sweep.rootsExamined, factsRecorded: sweep.factsRecorded,
    }
  },
})

async function insertDrainFact(
  db: GenericDatabaseWriter<DataModel>,
  input: {
    freezeOrderId: string; rootRunId: string; leafRunId: string; bindingId: string
    egressKind: 'provider_execution' | 'provider_cancellation'
    disposition: 'pre_release_contained' | 'in_flight_indeterminate' | 'cancellation_in_flight_indeterminate'
    observedAt: number
  },
): Promise<number> {
  const drainFactId = `drain:${canonicalAuthorityDigest({
    freezeOrderId: input.freezeOrderId, rootRunId: input.rootRunId,
    leafRunId: input.leafRunId, egressKind: input.egressKind,
  })}`
  const existing = await db.query('routingKernelIncidentDrainFacts')
    .withIndex('by_drainFactId', (query) => query.eq('drainFactId', drainFactId)).unique()
  if (existing !== null) return 0
  const factMaterial = { schemaVersion: 'incident-drain-fact:v1' as const, drainFactId, ...input }
  const factDigest = canonicalAuthorityDigest(factMaterial)
  await db.insert('routingKernelIncidentDrainFacts', {
    ...factMaterial, factDigest, ...signIncidentFact(factDigest, incidentFactKeyring().active),
  })
  return 1
}

export const approveResume = mutation({
  args: {
    resumeOrderId: v.string(), freezeOrderId: v.string(), reconstructionCheckpointId: v.string(),
    reconformanceFactId: v.string(), canaryRunFactId: v.string(),
  },
  returns: resumeResult,
  handler: async (ctx, args) => {
    const authority = await resolveAdminAuthority({ db: ctx.db as never, auth: ctx.auth }, 'control_kernel_incidents')
    if (authority.kind !== 'allowed') return { kind: 'resume_refused' as const, reason: 'authorization_denied' as const }
    const approverId = authority.membership.tokenIdentifier ?? authority.membership.clerkUserId
    const freeze = await ctx.db.query('routingKernelIncidentFreezeOrders')
      .withIndex('by_freezeOrderId', (query) => query.eq('freezeOrderId', args.freezeOrderId)).unique()
    if (freeze === null) return { kind: 'resume_refused' as const, reason: 'freeze_order_not_found' as const }
    const sweep = await ctx.db.query('routingKernelIncidentDrainSweeps')
      .withIndex('by_freezeOrderId', (query) => query.eq('freezeOrderId', args.freezeOrderId)).unique()
    if (sweep?.status !== 'complete') return { kind: 'resume_refused' as const, reason: 'resume_drain_incomplete' as const }
    const reconstruction = await ctx.db.query('routingKernelIncidentReconstructionCheckpoints')
      .withIndex('by_checkpointId', (query) => query.eq('checkpointId', args.reconstructionCheckpointId)).unique()
    if (reconstruction === null || reconstruction.scopeKey !== freeze.scopeKey || !reconstruction.projectionMatches
      || reconstruction.recordedAt < freeze.issuedAt || !reconstruction.activeFreezeOrderIds.includes(freeze.freezeOrderId)
      || !verifiedReconstructionCheckpoint(reconstruction)) {
      return { kind: 'resume_refused' as const, reason: 'resume_reconstruction_invalid' as const }
    }
    const reconformance = await ctx.db.query('routingKernelIncidentReconformanceFacts')
      .withIndex('by_reconformanceFactId', (query) => query.eq('reconformanceFactId', args.reconformanceFactId)).unique()
    if (reconformance === null || reconformance.freezeOrderId !== freeze.freezeOrderId || reconformance.scopeKey !== freeze.scopeKey
      || reconformance.recordedAt < freeze.issuedAt || !verifiedReconformanceFact(reconformance)) {
      return { kind: 'resume_refused' as const, reason: 'resume_reconformance_invalid' as const }
    }
    const canaryRun = await ctx.db.query('routingKernelIncidentCanaryRunFacts')
      .withIndex('by_canaryRunFactId', (query) => query.eq('canaryRunFactId', args.canaryRunFactId)).unique()
    if (canaryRun === null || canaryRun.scopeKey !== freeze.scopeKey || !canaryRun.freezeOrderIds.includes(freeze.freezeOrderId)
      || reconformance.canaryRunFactId !== canaryRun.canaryRunFactId
      || canaryRun.recordedAt < freeze.issuedAt || !verifiedCanaryRunFact(canaryRun)) {
      return { kind: 'resume_refused' as const, reason: 'resume_canary_run_invalid' as const }
    }
    const evidenceRefs = [
      `drain:${freeze.freezeOrderId}`, `reconstruction:${reconstruction.factDigest}`,
      `reconformance:${reconformance.factDigest}`, `routing-evidence:${reconformance.evidenceSnapshotDigest}`,
      `canary-run:${canaryRun.factDigest}`, `root-run:${canaryRun.rootRunId}`,
    ].sort()
    const proposalDigest = canonicalAuthorityDigest({
      resumeOrderId: args.resumeOrderId, freezeOrderId: args.freezeOrderId, evidenceRefs,
    })
    const existing = await ctx.db.query('routingKernelIncidentResumeOrders')
      .withIndex('by_resumeOrderId', (query) => query.eq('resumeOrderId', args.resumeOrderId)).unique()
    if (existing !== null) {
      return existing.freezeOrderId === args.freezeOrderId && canonicalAuthorityDigest({
        resumeOrderId: existing.resumeOrderId, freezeOrderId: existing.freezeOrderId, evidenceRefs: existing.evidenceRefs,
      }) === proposalDigest && verifiedResumeFact(existing)
        ? { kind: 'resume_issued' as const, epoch: existing.epoch }
        : { kind: 'resume_refused' as const, reason: 'resume_order_conflict' as const }
    }
    const approvedAt = Date.now()
    const reconformanceQuarantine = await ctx.db.query('routingKernelIncidentEvidenceQuarantines')
      .withIndex('by_evidenceRef', (query) => query.eq('evidenceRef', reconformance.evidenceSnapshotDigest)).first()
    const reconformanceEvidence = await ctx.db.query('routingKernelBindingEvidenceSnapshots')
      .withIndex('by_snapshotDigest', (query) => query.eq('snapshotDigest', reconformance.evidenceSnapshotDigest)).unique()
    if (reconformance.evidenceExpiresAt <= approvedAt || reconformanceQuarantine !== null || reconformanceEvidence === null
      || reconformanceEvidence.networkId !== reconformance.networkId || reconformanceEvidence.bindingId !== reconformance.bindingId
      || reconformanceEvidence.observedAt !== reconformance.evidenceObservedAt || reconformanceEvidence.expiresAt !== reconformance.evidenceExpiresAt) {
      return { kind: 'resume_refused' as const, reason: 'resume_reconformance_invalid' as const }
    }
    const control = await ctx.db.query('routingKernelIncidentScopeControls')
      .withIndex('by_scopeKey', (query) => query.eq('scopeKey', freeze.scopeKey)).unique()
    if (control === null) return { kind: 'resume_refused' as const, reason: 'scope_control_missing' as const }
    const activeFreezeOrderIds = activeFreezeIds(control)
    if (reconstruction.reconstructedEpoch !== control.epoch
      || canonicalAuthorityDigest(reconstruction.activeFreezeOrderIds) !== canonicalAuthorityDigest(activeFreezeOrderIds)
      || canonicalAuthorityDigest(normalizeActions(reconstruction.blockedActions)) !== canonicalAuthorityDigest(normalizeActions(control.blockedActions))) {
      return { kind: 'resume_refused' as const, reason: 'resume_reconstruction_stale' as const }
    }
    if (!activeFreezeOrderIds.includes(freeze.freezeOrderId)) return { kind: 'resume_refused' as const, reason: 'freeze_order_not_active' as const }
    const existingApproval = await ctx.db.query('routingKernelIncidentResumeApprovals')
      .withIndex('by_resumeOrderId_approverId', (query) => query.eq('resumeOrderId', args.resumeOrderId).eq('approverId', approverId)).unique()
    if (existingApproval !== null && !verifiedResumeApproval(existingApproval)) {
      return { kind: 'resume_refused' as const, reason: 'approval_identity_conflict' as const }
    }
    if (existingApproval !== null && existingApproval.proposalDigest !== proposalDigest) {
      return { kind: 'resume_refused' as const, reason: 'approval_identity_conflict' as const }
    }
    if (existingApproval === null) {
      const approvalMaterial = {
        resumeOrderId: args.resumeOrderId, freezeOrderId: args.freezeOrderId, approverId,
        evidenceRefs, proposalDigest, approvedAt,
      }
      const approvalFactDigest = canonicalAuthorityDigest(approvalMaterial)
      await ctx.db.insert('routingKernelIncidentResumeApprovals', {
        ...approvalMaterial, approvalFactDigest, ...signIncidentFact(approvalFactDigest, incidentFactKeyring().active),
      })
    }
    const approvals = await ctx.db.query('routingKernelIncidentResumeApprovals')
      .withIndex('by_resumeOrderId', (query) => query.eq('resumeOrderId', args.resumeOrderId)).take(3)
    if (approvals.some((approval) => approval.proposalDigest !== proposalDigest || !verifiedResumeApproval(approval))) {
      return { kind: 'resume_refused' as const, reason: 'resume_order_conflict' as const }
    }
    const approverIds = [...new Set(approvals.map((approval) => approval.approverId))].sort()
    if (approverIds.length < 2) return { kind: 'resume_approval_recorded' as const, approvalCount: approverIds.length, requiredApprovals: 2 as const }
    const epoch = control.epoch + 1
    const remainingFreezeOrderIds = activeFreezeOrderIds.filter((freezeOrderId) => freezeOrderId !== freeze.freezeOrderId)
    const remainingOrders = (await Promise.all(remainingFreezeOrderIds.map(async (freezeOrderId) =>
      await ctx.db.query('routingKernelIncidentFreezeOrders')
        .withIndex('by_freezeOrderId', (query) => query.eq('freezeOrderId', freezeOrderId)).unique()
    )))
    if (remainingOrders.some((order) => order === null)) throw new Error('incident_scope_projection_invalid')
    await ctx.db.replace(control._id, {
      scopeKey: control.scopeKey,
      ...(control.networkId === undefined ? {} : { networkId: control.networkId }),
      ...(control.principalId === undefined ? {} : { principalId: control.principalId }),
      ...(control.agentId === undefined ? {} : { agentId: control.agentId }),
      ...(control.bindingId === undefined ? {} : { bindingId: control.bindingId }),
      ...(control.capabilityContractId === undefined ? {} : { capabilityContractId: control.capabilityContractId }),
      specificity: control.specificity, epoch, activeFreezeOrderIds: remainingFreezeOrderIds,
      blockedActions: normalizeActions(remainingOrders.flatMap((order) => order?.blockedActions ?? [])), updatedAt: approvedAt,
    })
    const factMaterial = {
      schemaVersion: 'incident-resume-order:v1', resumeOrderId: args.resumeOrderId,
      freezeOrderId: args.freezeOrderId, approverIds, evidenceRefs, epoch, issuedAt: approvedAt,
    } as const
    const factDigest = canonicalAuthorityDigest(factMaterial)
    await ctx.db.insert('routingKernelIncidentResumeOrders', {
      ...factMaterial, factDigest, ...signIncidentFact(factDigest, incidentFactKeyring().active),
    })
    return { kind: 'resume_issued' as const, epoch }
  },
})

export const approveCanaryPreparation = mutation({
  args: {
    refinementOrderId: v.string(), sourceFreezeOrderId: v.string(), replacementFreezeOrderId: v.string(),
    reconstructionCheckpointId: v.string(),
  },
  returns: refinementResult,
  handler: async (ctx, args) => {
    const authority = await resolveAdminAuthority({ db: ctx.db as never, auth: ctx.auth }, 'control_kernel_incidents')
    if (authority.kind !== 'allowed') return { kind: 'refinement_refused' as const, reason: 'authorization_denied' }
    const approverId = authority.membership.tokenIdentifier ?? authority.membership.clerkUserId
    const source = await ctx.db.query('routingKernelIncidentFreezeOrders')
      .withIndex('by_freezeOrderId', (query) => query.eq('freezeOrderId', args.sourceFreezeOrderId)).unique()
    if (source === null || !verifiedFreezeFact(source)) return { kind: 'refinement_refused' as const, reason: 'source_freeze_invalid' }
    const retainedActions = normalizeActions(source.blockedActions.filter((action) =>
      action !== 'route' && action !== 'authorize' && action !== 'root_admission'
    ))
    if (!retainedActions.includes('provider_release')) {
      return { kind: 'refinement_refused' as const, reason: 'provider_release_containment_required' }
    }
    const droppedActions = normalizeActions(source.blockedActions.filter((action) => !retainedActions.includes(action)))
    const existingRefinement = await ctx.db.query('routingKernelIncidentRefinementFacts')
      .withIndex('by_refinementOrderId', (query) => query.eq('refinementOrderId', args.refinementOrderId)).unique()
    if (existingRefinement !== null) {
      const replacement = await ctx.db.query('routingKernelIncidentFreezeOrders')
        .withIndex('by_freezeOrderId', (query) => query.eq('freezeOrderId', args.replacementFreezeOrderId)).unique()
      const resume = await ctx.db.query('routingKernelIncidentResumeOrders')
        .withIndex('by_resumeOrderId', (query) => query.eq('resumeOrderId', args.refinementOrderId)).unique()
      const linked = existingRefinement.sourceFreezeOrderId === source.freezeOrderId
        && existingRefinement.replacementFreezeOrderId === args.replacementFreezeOrderId
        && existingRefinement.sourceFreezeFactDigest === source.factDigest
        && canonicalAuthorityDigest(existingRefinement.retainedActions) === canonicalAuthorityDigest(retainedActions)
        && canonicalAuthorityDigest(existingRefinement.droppedActions) === canonicalAuthorityDigest(droppedActions)
        && verifiedRefinementFact(existingRefinement)
        && replacement !== null && verifiedFreezeFact(replacement)
        && replacement.factDigest === existingRefinement.replacementFreezeFactDigest
        && replacement.scopeKey === source.scopeKey && replacement.incidentId === source.incidentId
        && canonicalAuthorityDigest(replacement.blockedActions) === canonicalAuthorityDigest(retainedActions)
        && resume !== null && verifiedResumeFact(resume)
        && resume.factDigest === existingRefinement.sourceResumeFactDigest
        && resume.freezeOrderId === source.freezeOrderId
      return linked
        ? { kind: 'freeze_refined' as const, replacementFreezeOrderId: existingRefinement.replacementFreezeOrderId, epoch: existingRefinement.resumeEpoch }
        : { kind: 'refinement_refused' as const, reason: 'refinement_order_conflict' }
    }
    const sourceSweep = await ctx.db.query('routingKernelIncidentDrainSweeps')
      .withIndex('by_freezeOrderId', (query) => query.eq('freezeOrderId', source.freezeOrderId)).unique()
    if (sourceSweep?.status !== 'complete') return { kind: 'refinement_refused' as const, reason: 'source_drain_incomplete' }
    const reconstruction = await ctx.db.query('routingKernelIncidentReconstructionCheckpoints')
      .withIndex('by_checkpointId', (query) => query.eq('checkpointId', args.reconstructionCheckpointId)).unique()
    if (reconstruction === null || reconstruction.scopeKey !== source.scopeKey || !reconstruction.projectionMatches
      || !reconstruction.activeFreezeOrderIds.includes(source.freezeOrderId) || !verifiedReconstructionCheckpoint(reconstruction)) {
      return { kind: 'refinement_refused' as const, reason: 'refinement_reconstruction_invalid' }
    }
    const control = await ctx.db.query('routingKernelIncidentScopeControls')
      .withIndex('by_scopeKey', (query) => query.eq('scopeKey', source.scopeKey)).unique()
    if (control === null || !control.activeFreezeOrderIds.includes(source.freezeOrderId)) {
      return { kind: 'refinement_refused' as const, reason: 'source_freeze_not_active' }
    }
    const approvedActiveFreezeOrderIds = activeFreezeIds(control)
    if (reconstruction.reconstructedEpoch !== control.epoch
      || canonicalAuthorityDigest(reconstruction.activeFreezeOrderIds) !== canonicalAuthorityDigest(approvedActiveFreezeOrderIds)
      || canonicalAuthorityDigest(normalizeActions(reconstruction.blockedActions)) !== canonicalAuthorityDigest(normalizeActions(control.blockedActions))) {
      return { kind: 'refinement_refused' as const, reason: 'refinement_reconstruction_stale' }
    }
    const proposalDigest = canonicalAuthorityDigest({
      refinementOrderId: args.refinementOrderId, sourceFreezeOrderId: source.freezeOrderId,
      replacementFreezeOrderId: args.replacementFreezeOrderId, sourceFreezeFactDigest: source.factDigest,
      reconstructionFactDigest: reconstruction.factDigest, sourceDrainCompletedAt: sourceSweep.updatedAt,
      retainedActions, droppedActions, approvedControlEpoch: control.epoch, approvedActiveFreezeOrderIds,
    })
    const existingReplacement = await ctx.db.query('routingKernelIncidentFreezeOrders')
      .withIndex('by_freezeOrderId', (query) => query.eq('freezeOrderId', args.replacementFreezeOrderId)).unique()
    if (existingReplacement !== null) return { kind: 'refinement_refused' as const, reason: 'replacement_freeze_conflict' }
    const existingApproval = await ctx.db.query('routingKernelIncidentRefinementApprovals')
      .withIndex('by_refinementOrderId_approverId', (query) => query.eq('refinementOrderId', args.refinementOrderId).eq('approverId', approverId)).unique()
    if (existingApproval !== null && !verifiedRefinementApproval(existingApproval)) {
      return { kind: 'refinement_refused' as const, reason: 'approval_identity_conflict' }
    }
    if (existingApproval !== null && existingApproval.proposalDigest !== proposalDigest) {
      return { kind: 'refinement_refused' as const, reason: 'approval_identity_conflict' }
    }
    const approvedAt = Date.now()
    if (existingApproval === null) {
      const approvalMaterial = { ...args, approverId, proposalDigest, approvedAt }
      const approvalFactDigest = canonicalAuthorityDigest(approvalMaterial)
      await ctx.db.insert('routingKernelIncidentRefinementApprovals', {
        ...approvalMaterial, approvalFactDigest, ...signIncidentFact(approvalFactDigest, incidentFactKeyring().active),
      })
    }
    const approvals = await ctx.db.query('routingKernelIncidentRefinementApprovals')
      .withIndex('by_refinementOrderId', (query) => query.eq('refinementOrderId', args.refinementOrderId)).take(3)
    if (approvals.some((approval) => approval.proposalDigest !== proposalDigest || !verifiedRefinementApproval(approval))) {
      return { kind: 'refinement_refused' as const, reason: 'refinement_order_conflict' }
    }
    const approverIds = [...new Set(approvals.map((approval) => approval.approverId))].sort()
    if (approverIds.length < 2) return { kind: 'refinement_approval_recorded' as const, approvalCount: approverIds.length, requiredApprovals: 2 as const }
    const replacementEpoch = control.epoch + 1
    const replacementMaterial = {
      schemaVersion: 'incident-freeze-order:v1' as const, freezeOrderId: args.replacementFreezeOrderId,
      incidentId: source.incidentId, issuerId: `incident-refinement:${args.refinementOrderId}`,
      reason: `Canary preparation containment derived from ${source.freezeOrderId}.`, scopeKey: source.scopeKey,
      ...scopeFromFreeze(source), blockedActions: retainedActions, epoch: replacementEpoch, issuedAt: approvedAt,
    }
    const replacementDigest = canonicalAuthorityDigest(replacementMaterial)
    const resumeEpoch = replacementEpoch + 1
    const resumeMaterial = {
      schemaVersion: 'incident-resume-order:v1' as const, resumeOrderId: args.refinementOrderId,
      freezeOrderId: source.freezeOrderId, approverIds,
      evidenceRefs: [
        `replacement-freeze:${replacementDigest}`, `reconstruction:${reconstruction.factDigest}`,
        `drain:${source.freezeOrderId}:${sourceSweep.updatedAt}`,
      ].sort(), epoch: resumeEpoch, issuedAt: approvedAt,
    }
    const resumeDigest = canonicalAuthorityDigest(resumeMaterial)
    const refinementMaterial = {
      schemaVersion: 'incident-refinement-fact:v1' as const, refinementOrderId: args.refinementOrderId,
      sourceFreezeOrderId: source.freezeOrderId, replacementFreezeOrderId: args.replacementFreezeOrderId,
      sourceFreezeFactDigest: source.factDigest, replacementFreezeFactDigest: replacementDigest,
      sourceResumeFactDigest: resumeDigest, reconstructionFactDigest: reconstruction.factDigest,
      sourceDrainCompletedAt: sourceSweep.updatedAt, scopeKey: source.scopeKey,
      retainedActions, droppedActions, approvedActiveFreezeOrderIds,
      approvedControlEpoch: control.epoch, replacementEpoch, resumeEpoch, approverIds, recordedAt: approvedAt,
    }
    const refinementDigest = canonicalAuthorityDigest(refinementMaterial)
    const remainingFreezeOrderIds = activeFreezeIds(control).filter((id) => id !== source.freezeOrderId)
    const remainingOrders = (await Promise.all(remainingFreezeOrderIds.map(async (freezeOrderId) =>
      await ctx.db.query('routingKernelIncidentFreezeOrders').withIndex('by_freezeOrderId', (query) => query.eq('freezeOrderId', freezeOrderId)).unique()
    )))
    if (remainingOrders.some((order) => order === null)) throw new Error('incident_scope_projection_invalid')
    await ctx.db.insert('routingKernelIncidentFreezeOrders', {
      ...replacementMaterial, factDigest: replacementDigest,
      ...signIncidentFact(replacementDigest, incidentFactKeyring().active),
    })
    await ctx.db.insert('routingKernelIncidentResumeOrders', {
      ...resumeMaterial, factDigest: resumeDigest, ...signIncidentFact(resumeDigest, incidentFactKeyring().active),
    })
    await ctx.db.insert('routingKernelIncidentRefinementFacts', {
      ...refinementMaterial, factDigest: refinementDigest,
      ...signIncidentFact(refinementDigest, incidentFactKeyring().active),
    })
    await ctx.db.replace(control._id, {
      scopeKey: control.scopeKey, ...scopeFromFreeze(source), specificity: control.specificity, epoch: resumeEpoch,
      activeFreezeOrderIds: [...remainingFreezeOrderIds, args.replacementFreezeOrderId].sort(),
      blockedActions: normalizeActions([
        ...remainingOrders.flatMap((order) => order?.blockedActions ?? []), ...retainedActions,
      ]), updatedAt: approvedAt,
    })
    await ctx.db.insert('routingKernelIncidentDrainSweeps', {
      freezeOrderId: args.replacementFreezeOrderId, scopeKey: source.scopeKey, freezeIssuedAt: sourceSweep.freezeIssuedAt,
      status: 'pending', rootsExamined: 0, factsRecorded: 0, updatedAt: approvedAt,
    })
    if ('scheduler' in ctx) await ctx.scheduler.runAfter(0, internal.routingKernelIncidentControl.processIncidentDrainSweep, {
      freezeOrderId: args.replacementFreezeOrderId, cursor: null,
    })
    return { kind: 'freeze_refined' as const, replacementFreezeOrderId: args.replacementFreezeOrderId, epoch: resumeEpoch }
  },
})

export const approveRecoveryGrant = mutation({
  args: {
    recoveryGrantId: v.string(), freezeOrderIds: v.array(v.string()), lane: recoveryLane,
    scope: v.object(scope), maximumUses: v.number(), expiresAt: v.number(),
    evidenceRefs: v.array(v.string()), canaryPlan: v.optional(canaryPlan),
  },
  returns: recoveryApprovalResult,
  handler: async (ctx, args) => {
    const authority = await resolveAdminAuthority({ db: ctx.db as never, auth: ctx.auth }, 'control_kernel_incidents')
    if (authority.kind !== 'allowed') return { kind: 'recovery_refused' as const, reason: 'authorization_denied' }
    const approverId = authority.membership.tokenIdentifier ?? authority.membership.clerkUserId
    const approvedAt = Date.now()
    const freezeOrderIds = [...new Set(args.freezeOrderIds)].sort()
    const evidenceRefs = [...new Set(args.evidenceRefs)].sort()
    const normalizedScope = normalizeScope(args.scope)
    const normalizedCanaryPlan = args.canaryPlan === undefined ? undefined : {
      ...args.canaryPlan, allowedDataFields: [...new Set(args.canaryPlan.allowedDataFields)].sort(),
    }
    const scopeKey = incidentScopeKey(normalizedScope)
    if (freezeOrderIds.length === 0 || freezeOrderIds.length > 16) return { kind: 'recovery_refused' as const, reason: 'active_freeze_required' }
    if (!Number.isSafeInteger(args.maximumUses) || args.maximumUses < 1 || args.maximumUses > 16) return { kind: 'recovery_refused' as const, reason: 'recovery_use_limit_invalid' }
    if (args.lane === 'canary' && args.maximumUses !== 1) return { kind: 'recovery_refused' as const, reason: 'canary_must_be_single_use' }
    if ((args.lane === 'canary') !== (normalizedCanaryPlan !== undefined)) return { kind: 'recovery_refused' as const, reason: 'canary_plan_required' }
    if (normalizedCanaryPlan !== undefined && (
      !Number.isSafeInteger(normalizedCanaryPlan.maximumSpendMinor) || normalizedCanaryPlan.maximumSpendMinor < 0
      || !/^[A-Z]{3}$/.test(normalizedCanaryPlan.currency) || normalizedCanaryPlan.allowedDataFields.length > 128
      || normalizedCanaryPlan.allowedDataFields.some((field) => field.trim().length === 0 || field.length > 200)
      || (normalizedScope.bindingId !== undefined && normalizedScope.bindingId !== normalizedCanaryPlan.bindingId)
      || (normalizedScope.capabilityContractId !== undefined && normalizedScope.capabilityContractId !== normalizedCanaryPlan.capabilityContractId)
    )) return { kind: 'recovery_refused' as const, reason: 'canary_plan_invalid' }
    if (args.expiresAt <= approvedAt) return { kind: 'recovery_refused' as const, reason: 'recovery_expiry_invalid' }
    if (evidenceRefs.length === 0) return { kind: 'recovery_refused' as const, reason: 'recovery_evidence_required' }
    for (const freezeOrderId of freezeOrderIds) {
      const freeze = await ctx.db.query('routingKernelIncidentFreezeOrders')
        .withIndex('by_freezeOrderId', (query) => query.eq('freezeOrderId', freezeOrderId)).unique()
      if (freeze === null || !verifiedFreezeFact(freeze)) return { kind: 'recovery_refused' as const, reason: 'freeze_fact_invalid' }
      const freezeControl = await ctx.db.query('routingKernelIncidentScopeControls')
        .withIndex('by_scopeKey', (query) => query.eq('scopeKey', freeze.scopeKey)).unique()
      if (freezeControl === null || !freezeControl.activeFreezeOrderIds.includes(freeze.freezeOrderId)
        || !scopeSelectorMatches(scopeFromFreeze(freeze), normalizedScope)) {
        return { kind: 'recovery_refused' as const, reason: 'active_freeze_required' }
      }
    }
    const proposalMaterial = {
      recoveryGrantId: args.recoveryGrantId, freezeOrderIds, lane: args.lane, scopeKey,
      ...normalizedScope, maximumUses: args.maximumUses, expiresAt: args.expiresAt, evidenceRefs,
      ...(normalizedCanaryPlan === undefined ? {} : { canaryPlan: normalizedCanaryPlan }),
    }
    const proposalDigest = canonicalAuthorityDigest(proposalMaterial)
    const existingGrant = await ctx.db.query('routingKernelIncidentRecoveryGrants')
      .withIndex('by_recoveryGrantId', (query) => query.eq('recoveryGrantId', args.recoveryGrantId)).unique()
    if (existingGrant !== null) {
      return verifiedRecoveryGrant(existingGrant) && recoveryProposalDigest(existingGrant) === proposalDigest
        ? { kind: 'recovery_grant_issued' as const, maximumUses: existingGrant.maximumUses }
        : { kind: 'recovery_refused' as const, reason: 'recovery_grant_conflict' }
    }
    const existingApproval = await ctx.db.query('routingKernelIncidentRecoveryGrantApprovals')
      .withIndex('by_recoveryGrantId_approverId', (query) => query.eq('recoveryGrantId', args.recoveryGrantId).eq('approverId', approverId)).unique()
    if (existingApproval !== null && !verifiedRecoveryApproval(existingApproval)) {
      return { kind: 'recovery_refused' as const, reason: 'approval_identity_conflict' }
    }
    if (existingApproval !== null && existingApproval.proposalDigest !== proposalDigest) {
      return { kind: 'recovery_refused' as const, reason: 'approval_identity_conflict' }
    }
    if (existingApproval === null) {
      const approvalMaterial = { recoveryGrantId: args.recoveryGrantId, approverId, proposalDigest, approvedAt }
      const approvalFactDigest = canonicalAuthorityDigest(approvalMaterial)
      await ctx.db.insert('routingKernelIncidentRecoveryGrantApprovals', {
        ...approvalMaterial, approvalFactDigest, ...signIncidentFact(approvalFactDigest, incidentFactKeyring().active),
      })
    }
    const approvals = await ctx.db.query('routingKernelIncidentRecoveryGrantApprovals')
      .withIndex('by_recoveryGrantId', (query) => query.eq('recoveryGrantId', args.recoveryGrantId)).take(3)
    if (approvals.some((approval) => approval.proposalDigest !== proposalDigest || !verifiedRecoveryApproval(approval))) return { kind: 'recovery_refused' as const, reason: 'recovery_grant_conflict' }
    const approverIds = [...new Set(approvals.map((approval) => approval.approverId))].sort()
    if (approverIds.length < 2) return { kind: 'recovery_approval_recorded' as const, approvalCount: approverIds.length, requiredApprovals: 2 as const }
    const factMaterial = {
      schemaVersion: 'incident-recovery-grant:v1' as const, ...proposalMaterial,
      approverIds, issuedAt: approvedAt,
    }
    const factDigest = canonicalAuthorityDigest(factMaterial)
    await ctx.db.insert('routingKernelIncidentRecoveryGrants', {
      ...factMaterial, factDigest, ...signIncidentFact(factDigest, incidentFactKeyring().active),
    })
    return { kind: 'recovery_grant_issued' as const, maximumUses: args.maximumUses }
  },
})

export const consumeRecoveryGrant = internalMutation({
  args: {
    recoveryGrantId: v.string(), lane: recoveryLane, scope: v.object(scope), operationRef: v.string(), usedAt: v.number(),
    canaryExecution: v.optional(canaryPlan),
  },
  returns: recoveryConsumptionResult,
  handler: async (ctx, args) => await consumeRecoveryGrantInTransaction(ctx.db, args),
})

export async function consumeRecoveryGrantInTransaction(
  db: GenericDatabaseWriter<DataModel>,
  args: {
    recoveryGrantId: string; lane: 'reconcile' | 'canary'; scope: IncidentScope
    operationRef: string; usedAt: number
    canaryExecution?: {
      quoteId: string; quoteDigest: string; authorizationRef: string; requestDigest: string
      bindingId: string; capabilityContractId: string; maximumSpendMinor: number
      currency: string; allowedDataFields: string[]
    }
  },
) {
    const grant = await db.query('routingKernelIncidentRecoveryGrants')
      .withIndex('by_recoveryGrantId', (query) => query.eq('recoveryGrantId', args.recoveryGrantId)).unique()
    if (grant === null) return { kind: 'recovery_refused' as const, reason: 'recovery_grant_not_found' }
    if (!verifiedRecoveryGrant(grant)) return { kind: 'recovery_refused' as const, reason: 'recovery_grant_signature_invalid' }
    const grantScope = {
      ...(grant.networkId === undefined ? {} : { networkId: grant.networkId }),
      ...(grant.principalId === undefined ? {} : { principalId: grant.principalId }),
      ...(grant.agentId === undefined ? {} : { agentId: grant.agentId }),
      ...(grant.bindingId === undefined ? {} : { bindingId: grant.bindingId }),
      ...(grant.capabilityContractId === undefined ? {} : { capabilityContractId: grant.capabilityContractId }),
    }
    if (grant.lane !== args.lane || !scopeSelectorMatches(grantScope, normalizeScope(args.scope))) {
      return { kind: 'recovery_refused' as const, reason: 'recovery_scope_mismatch' }
    }
    if (args.lane === 'canary') {
      const execution = args.canaryExecution === undefined ? undefined : {
        ...args.canaryExecution, allowedDataFields: [...new Set(args.canaryExecution.allowedDataFields)].sort(),
      }
      if (grant.canaryPlan === undefined || execution === undefined
        || canonicalAuthorityDigest(grant.canaryPlan) !== canonicalAuthorityDigest(execution)) {
        return { kind: 'recovery_refused' as const, reason: 'canary_plan_mismatch' }
      }
    } else if (args.canaryExecution !== undefined) return { kind: 'recovery_refused' as const, reason: 'canary_plan_mismatch' }
    if (args.usedAt >= grant.expiresAt) return { kind: 'recovery_refused' as const, reason: 'recovery_grant_expired' }
    const replay = await db.query('routingKernelIncidentRecoveryUses')
      .withIndex('by_recoveryGrantId_operationRef', (query) => query.eq('recoveryGrantId', args.recoveryGrantId).eq('operationRef', args.operationRef)).unique()
    if (replay !== null) return { kind: 'recovery_authorized' as const, replay: true }
    for (const freezeOrderId of grant.freezeOrderIds) {
      const freeze = await db.query('routingKernelIncidentFreezeOrders')
        .withIndex('by_freezeOrderId', (query) => query.eq('freezeOrderId', freezeOrderId)).unique()
      if (freeze === null || !verifiedFreezeFact(freeze)) return { kind: 'recovery_refused' as const, reason: 'recovery_freeze_not_active' }
      const control = await db.query('routingKernelIncidentScopeControls')
        .withIndex('by_scopeKey', (query) => query.eq('scopeKey', freeze.scopeKey)).unique()
      if (control === null || !control.activeFreezeOrderIds.includes(freeze.freezeOrderId)) {
        return { kind: 'recovery_refused' as const, reason: 'recovery_freeze_not_active' }
      }
    }
    const requiredActions: IncidentActionClass[] = args.lane === 'canary'
      ? ['provider_release', 'data_release'] : ['reconcile']
    const blockingFreezeOrderIds = await activeBlockingFreezeOrderIds(db, normalizeScope(args.scope), requiredActions)
    if (blockingFreezeOrderIds.length === 0
      || blockingFreezeOrderIds.some((freezeOrderId) => !grant.freezeOrderIds.includes(freezeOrderId))) {
      return { kind: 'recovery_refused' as const, reason: 'recovery_blocking_freeze_not_covered' }
    }
    const uses = await db.query('routingKernelIncidentRecoveryUses')
      .withIndex('by_recoveryGrantId', (query) => query.eq('recoveryGrantId', args.recoveryGrantId)).take(grant.maximumUses + 1)
    if (uses.length >= grant.maximumUses) return { kind: 'recovery_refused' as const, reason: 'recovery_grant_exhausted' }
    await db.insert('routingKernelIncidentRecoveryUses', {
      recoveryGrantId: args.recoveryGrantId, operationRef: args.operationRef, lane: args.lane, usedAt: args.usedAt,
      ...(args.canaryExecution === undefined ? {} : { canaryExecutionDigest: canonicalAuthorityDigest(args.canaryExecution) }),
    })
    return { kind: 'recovery_authorized' as const, replay: false }
}

async function activeBlockingFreezeOrderIds(
  db: GenericDatabaseReader<DataModel>,
  candidateScope: IncidentScope,
  actions: readonly IncidentActionClass[],
): Promise<string[]> {
  const controls = (await Promise.all(incidentMatchingScopeKeys(candidateScope).map(async (scopeKey) =>
    await db.query('routingKernelIncidentScopeControls').withIndex('by_scopeKey', (query) => query.eq('scopeKey', scopeKey)).unique()
  ))).filter((control) => control !== null)
  const ids = new Set<string>()
  for (const control of controls) {
    for (const freezeOrderId of control.activeFreezeOrderIds) {
      const freeze = await db.query('routingKernelIncidentFreezeOrders')
        .withIndex('by_freezeOrderId', (query) => query.eq('freezeOrderId', freezeOrderId)).unique()
      if (freeze === null || !verifiedFreezeFact(freeze)) throw new Error('incident_freeze_fact_signature_invalid')
      if (freeze.blockedActions.some((action) => actions.includes(action))) ids.add(freeze.freezeOrderId)
    }
  }
  return [...ids].sort()
}

export const quarantineEvidence = mutation({
  args: {
    quarantineId: v.string(), freezeOrderId: v.string(), evidenceRef: v.string(), reason: v.string(),
  },
  returns: quarantineResult,
  handler: async (ctx, args) => {
    const authority = await resolveAdminAuthority({ db: ctx.db as never, auth: ctx.auth }, 'control_kernel_incidents')
    if (authority.kind !== 'allowed') return { kind: 'quarantine_refused' as const, reason: 'authorization_denied' }
    const issuedBy = authority.membership.tokenIdentifier ?? authority.membership.clerkUserId
    const issuedAt = Date.now()
    const freeze = await ctx.db.query('routingKernelIncidentFreezeOrders')
      .withIndex('by_freezeOrderId', (query) => query.eq('freezeOrderId', args.freezeOrderId)).unique()
    if (freeze === null || !verifiedFreezeFact(freeze)) return { kind: 'quarantine_refused' as const, reason: 'active_freeze_required' }
    const control = await ctx.db.query('routingKernelIncidentScopeControls')
      .withIndex('by_scopeKey', (query) => query.eq('scopeKey', freeze.scopeKey)).unique()
    if (control === null || !control.activeFreezeOrderIds.includes(freeze.freezeOrderId)) return { kind: 'quarantine_refused' as const, reason: 'active_freeze_required' }
    const evidence = await ctx.db.query('routingKernelBindingEvidenceSnapshots')
      .withIndex('by_snapshotDigest', (query) => query.eq('snapshotDigest', args.evidenceRef)).unique()
    if (evidence === null) return { kind: 'quarantine_refused' as const, reason: 'evidence_not_found' }
    const freezeScope = scopeFromFreeze(freeze)
    if (!scopeSelectorMatches(freezeScope, { networkId: evidence.networkId, bindingId: evidence.bindingId })) {
      return { kind: 'quarantine_refused' as const, reason: 'evidence_scope_mismatch' }
    }
    const factMaterial = {
      schemaVersion: 'incident-evidence-quarantine:v1' as const,
      quarantineId: args.quarantineId, freezeOrderId: args.freezeOrderId, evidenceRef: args.evidenceRef,
      reason: args.reason, scopeKey: freeze.scopeKey, issuedBy, issuedAt,
    }
    const factDigest = canonicalAuthorityDigest(factMaterial)
    const existing = await ctx.db.query('routingKernelIncidentEvidenceQuarantines')
      .withIndex('by_quarantineId', (query) => query.eq('quarantineId', args.quarantineId)).unique()
    if (existing !== null) {
      return existing.factDigest === factDigest && verifiedQuarantineFact(existing)
        ? { kind: 'evidence_quarantined' as const, quarantineId: existing.quarantineId }
        : { kind: 'quarantine_refused' as const, reason: 'quarantine_conflict' }
    }
    await ctx.db.insert('routingKernelIncidentEvidenceQuarantines', {
      ...factMaterial, factDigest, ...signIncidentFact(factDigest, incidentFactKeyring().active),
    })
    return { kind: 'evidence_quarantined' as const, quarantineId: args.quarantineId }
  },
})

export const recordReconstructionCheckpoint = mutation({
  args: { checkpointId: v.string(), scope: v.object(scope) },
  returns: reconstructionResult,
  handler: async (ctx, args) => {
    const authority = await resolveAdminAuthority({ db: ctx.db as never, auth: ctx.auth }, 'control_kernel_incidents')
    if (authority.kind !== 'allowed') return { kind: 'reconstruction_refused' as const, reason: 'authorization_denied' }
    const recordedBy = authority.membership.tokenIdentifier ?? authority.membership.clerkUserId
    const recordedAt = Date.now()
    const scopeKey = incidentScopeKey(normalizeScope(args.scope))
    const reconstruction = await reconstructIncidentScope(ctx.db, scopeKey)
    const factMaterial = {
      schemaVersion: 'incident-reconstruction-checkpoint:v1' as const,
      checkpointId: args.checkpointId, scopeKey, reconstructedEpoch: reconstruction.epoch,
      activeFreezeOrderIds: reconstruction.activeFreezeOrderIds,
      blockedActions: reconstruction.blockedActions,
      sourceFactDigests: reconstruction.sourceFactDigests,
      projectionDigest: reconstruction.projectionDigest,
      projectionMatches: reconstruction.projectionMatches,
      recordedBy, recordedAt,
    }
    const factDigest = canonicalAuthorityDigest(factMaterial)
    const existing = await ctx.db.query('routingKernelIncidentReconstructionCheckpoints')
      .withIndex('by_checkpointId', (query) => query.eq('checkpointId', args.checkpointId)).unique()
    if (existing !== null) {
      return existing.factDigest === factDigest
        ? { kind: 'reconstruction_recorded' as const, projectionMatches: existing.projectionMatches }
        : { kind: 'reconstruction_refused' as const, reason: 'checkpoint_conflict' }
    }
    await ctx.db.insert('routingKernelIncidentReconstructionCheckpoints', {
      ...factMaterial, factDigest, ...signIncidentFact(factDigest, incidentFactKeyring().active),
    })
    return { kind: 'reconstruction_recorded' as const, projectionMatches: reconstruction.projectionMatches }
  },
})

export const recordCanaryReconformance = mutation({
  args: { reconformanceFactId: v.string(), freezeOrderId: v.string(), canaryRunFactId: v.string() },
  returns: v.union(
    v.object({ kind: v.literal('reconformance_recorded'), reconformanceFactId: v.string(), evidenceSnapshotDigest: v.string() }),
    v.object({ kind: v.literal('reconformance_refused'), reason: v.string() }),
  ),
  handler: async (ctx, args) => {
    const authority = await resolveAdminAuthority({ db: ctx.db as never, auth: ctx.auth }, 'control_kernel_incidents')
    if (authority.kind !== 'allowed') return { kind: 'reconformance_refused' as const, reason: 'authorization_denied' }
    const existing = await ctx.db.query('routingKernelIncidentReconformanceFacts')
      .withIndex('by_reconformanceFactId', (query) => query.eq('reconformanceFactId', args.reconformanceFactId)).unique()
    if (existing !== null) return existing.freezeOrderId === args.freezeOrderId
      && existing.canaryRunFactId === args.canaryRunFactId && verifiedReconformanceFact(existing)
      ? { kind: 'reconformance_recorded' as const, reconformanceFactId: existing.reconformanceFactId, evidenceSnapshotDigest: existing.evidenceSnapshotDigest }
      : { kind: 'reconformance_refused' as const, reason: 'reconformance_conflict' }
    const recordedBy = authority.membership.tokenIdentifier ?? authority.membership.clerkUserId
    const recordedAt = Date.now()
    const freeze = await ctx.db.query('routingKernelIncidentFreezeOrders')
      .withIndex('by_freezeOrderId', (query) => query.eq('freezeOrderId', args.freezeOrderId)).unique()
    const canaryRun = await ctx.db.query('routingKernelIncidentCanaryRunFacts')
      .withIndex('by_canaryRunFactId', (query) => query.eq('canaryRunFactId', args.canaryRunFactId)).unique()
    if (freeze === null || !verifiedFreezeFact(freeze) || freeze.bindingId === undefined
      || freeze.principalId !== undefined || freeze.agentId !== undefined
      || canaryRun === null || !verifiedCanaryRunFact(canaryRun)
      || !canaryRun.freezeOrderIds.includes(freeze.freezeOrderId) || canaryRun.scopeKey !== freeze.scopeKey
      || canaryRun.bindingId !== freeze.bindingId) {
      return { kind: 'reconformance_refused' as const, reason: 'canary_reconformance_invalid' }
    }
    const bindingId = freeze.bindingId
    const control = await ctx.db.query('routingKernelIncidentScopeControls')
      .withIndex('by_scopeKey', (query) => query.eq('scopeKey', freeze.scopeKey)).unique()
    const binding = await ctx.db.query('routingKernelBindings')
      .withIndex('by_bindingId', (query) => query.eq('bindingId', bindingId)).unique()
    if (control === null || !control.activeFreezeOrderIds.includes(freeze.freezeOrderId)
      || binding === null || binding.admission !== 'admitted' || binding.conformance !== 'conformant'
      || (freeze.networkId !== undefined && freeze.networkId !== binding.networkId)
      || (freeze.capabilityContractId !== undefined && freeze.capabilityContractId !== binding.capabilityContractId)) {
      return { kind: 'reconformance_refused' as const, reason: 'canary_reconformance_invalid' }
    }
    const latest = await ctx.db.query('routingKernelBindingEvidenceSnapshots')
      .withIndex('by_bindingId_observedAt', (query) => query.eq('bindingId', binding.bindingId)).order('desc').first()
    if (latest !== null && latest.observedAt >= recordedAt) {
      return { kind: 'reconformance_refused' as const, reason: 'evidence_chronology_conflict' }
    }
    let environment: string
    try { environment = new URL(binding.endpointUrl).origin } catch {
      return { kind: 'reconformance_refused' as const, reason: 'binding_environment_invalid' }
    }
    const evidence = createBindingRoutingEvidenceSnapshot({
      contractVersion: 'routing-evidence:v1', networkId: binding.networkId, bindingId: binding.bindingId,
      bindingRegistrationHash: binding.registrationHash, environment,
      networkPolicyVersion: 'network-policy:binding-evidence:v2', estimatorVersion: 'execution-reliability-lcb:v1',
      sourceCommitment: canonicalAuthorityDigest({ rootRunId: canaryRun.rootRunId, canaryRunFactId: canaryRun.canaryRunFactId }),
      observedAt: recordedAt, expiresAt: recordedAt + 60 * 60_000,
      health: { state: 'healthy', evidenceStanding: 'eligible_run_bound' },
      incident: { routingEffect: 'none', activeIncidentIds: [freeze.incidentId], evidenceStanding: 'eligible_run_bound' },
      standing: { evidenceStanding: 'eligible_run_bound', executionReliability: { status: 'insufficient_evidence', sampleSize: 1 } },
    })
    const factMaterial = {
      schemaVersion: 'incident-reconformance-fact:v1' as const, reconformanceFactId: args.reconformanceFactId,
      freezeOrderId: freeze.freezeOrderId, canaryRunFactId: canaryRun.canaryRunFactId, scopeKey: freeze.scopeKey,
      evidenceSnapshotDigest: evidence.snapshotDigest, networkId: evidence.networkId, bindingId: evidence.bindingId,
      evidenceObservedAt: evidence.observedAt, evidenceExpiresAt: evidence.expiresAt, recordedBy, recordedAt,
    }
    const factDigest = canonicalAuthorityDigest(factMaterial)
    await ctx.db.insert('routingKernelBindingEvidenceSnapshots', {
      ...evidence, incident: { ...evidence.incident, activeIncidentIds: [...evidence.incident.activeIncidentIds] }, admittedAt: recordedAt,
    })
    await ctx.db.insert('routingKernelIncidentReconformanceFacts', {
      ...factMaterial, factDigest, ...signIncidentFact(factDigest, incidentFactKeyring().active),
    })
    return { kind: 'reconformance_recorded' as const, reconformanceFactId: args.reconformanceFactId, evidenceSnapshotDigest: evidence.snapshotDigest }
  },
})

export const recordReconformanceEvidence = mutation({
  args: {
    reconformanceFactId: v.string(), freezeOrderId: v.string(), canaryRunFactId: v.string(), evidenceSnapshotDigest: v.string(),
  },
  returns: reconformanceResult,
  handler: async (ctx, args) => {
    const authority = await resolveAdminAuthority({ db: ctx.db as never, auth: ctx.auth }, 'control_kernel_incidents')
    if (authority.kind !== 'allowed') return { kind: 'reconformance_refused' as const, reason: 'authorization_denied' }
    const recordedBy = authority.membership.tokenIdentifier ?? authority.membership.clerkUserId
    const recordedAt = Date.now()
    const freeze = await ctx.db.query('routingKernelIncidentFreezeOrders')
      .withIndex('by_freezeOrderId', (query) => query.eq('freezeOrderId', args.freezeOrderId)).unique()
    if (freeze === null || !verifiedFreezeFact(freeze)) return { kind: 'reconformance_refused' as const, reason: 'active_freeze_required' }
    const control = await ctx.db.query('routingKernelIncidentScopeControls')
      .withIndex('by_scopeKey', (query) => query.eq('scopeKey', freeze.scopeKey)).unique()
    if (control === null || !control.activeFreezeOrderIds.includes(freeze.freezeOrderId)) {
      return { kind: 'reconformance_refused' as const, reason: 'active_freeze_required' }
    }
    const evidence = await ctx.db.query('routingKernelBindingEvidenceSnapshots')
      .withIndex('by_snapshotDigest', (query) => query.eq('snapshotDigest', args.evidenceSnapshotDigest)).unique()
    const canaryRun = await ctx.db.query('routingKernelIncidentCanaryRunFacts')
      .withIndex('by_canaryRunFactId', (query) => query.eq('canaryRunFactId', args.canaryRunFactId)).unique()
    const quarantine = evidence === null ? null : await ctx.db.query('routingKernelIncidentEvidenceQuarantines')
      .withIndex('by_evidenceRef', (query) => query.eq('evidenceRef', evidence.snapshotDigest)).first()
    const eligibleStanding = new Set(['eligible_observed', 'eligible_run_bound', 'eligible_corroborated'])
    const binding = evidence === null ? null : await ctx.db.query('routingKernelBindings')
      .withIndex('by_bindingId', (query) => query.eq('bindingId', evidence.bindingId)).unique()
    const latestEvidence = evidence === null ? null : await ctx.db.query('routingKernelBindingEvidenceSnapshots')
      .withIndex('by_bindingId_observedAt', (query) => query.eq('bindingId', evidence.bindingId)).order('desc').first()
    if (evidence === null || quarantine !== null || canaryRun === null || !verifiedCanaryRunFact(canaryRun)
      || !canaryRun.freezeOrderIds.includes(freeze.freezeOrderId) || canaryRun.scopeKey !== freeze.scopeKey
      || canaryRun.bindingId !== evidence.bindingId
      || evidence.sourceCommitment !== canonicalAuthorityDigest({ rootRunId: canaryRun.rootRunId, canaryRunFactId: canaryRun.canaryRunFactId })
      || freeze.bindingId === undefined
      || freeze.principalId !== undefined || freeze.agentId !== undefined
      || freeze.bindingId !== evidence.bindingId
      || (freeze.networkId !== undefined && freeze.networkId !== evidence.networkId)
      || (freeze.capabilityContractId !== undefined && freeze.capabilityContractId !== binding?.capabilityContractId)
      || binding === null || binding.networkId !== evidence.networkId || binding.registrationHash !== evidence.bindingRegistrationHash
      || binding.admission !== 'admitted' || binding.conformance !== 'conformant'
      || latestEvidence?.snapshotDigest !== evidence.snapshotDigest || !verifiedRoutingEvidenceSnapshot(evidence)
      || evidence.observedAt < freeze.issuedAt || evidence.admittedAt < freeze.issuedAt
      || evidence.observedAt > recordedAt || evidence.expiresAt <= recordedAt
      || evidence.health.state !== 'healthy' || !eligibleStanding.has(evidence.health.evidenceStanding)
      || evidence.incident.routingEffect !== 'none' || !evidence.incident.activeIncidentIds.includes(freeze.incidentId)
      || !eligibleStanding.has(evidence.incident.evidenceStanding)
      || !eligibleStanding.has(evidence.standing.evidenceStanding)) {
      return { kind: 'reconformance_refused' as const, reason: 'reconformance_evidence_invalid' }
    }
    const factMaterial = {
      schemaVersion: 'incident-reconformance-fact:v1' as const, reconformanceFactId: args.reconformanceFactId,
      freezeOrderId: freeze.freezeOrderId, canaryRunFactId: canaryRun.canaryRunFactId, scopeKey: freeze.scopeKey,
      evidenceSnapshotDigest: evidence.snapshotDigest, networkId: evidence.networkId, bindingId: evidence.bindingId,
      evidenceObservedAt: evidence.observedAt, evidenceExpiresAt: evidence.expiresAt, recordedBy, recordedAt,
    }
    const factDigest = canonicalAuthorityDigest(factMaterial)
    const existing = await ctx.db.query('routingKernelIncidentReconformanceFacts')
      .withIndex('by_reconformanceFactId', (query) => query.eq('reconformanceFactId', args.reconformanceFactId)).unique()
    if (existing !== null) {
      return existing.factDigest === factDigest && verifiedReconformanceFact(existing)
        ? { kind: 'reconformance_recorded' as const, reconformanceFactId: existing.reconformanceFactId }
        : { kind: 'reconformance_refused' as const, reason: 'reconformance_conflict' }
    }
    await ctx.db.insert('routingKernelIncidentReconformanceFacts', {
      ...factMaterial, factDigest, ...signIncidentFact(factDigest, incidentFactKeyring().active),
    })
    return { kind: 'reconformance_recorded' as const, reconformanceFactId: args.reconformanceFactId }
  },
})

export const recordCanaryRun = mutation({
  args: { canaryRunFactId: v.string(), recoveryGrantId: v.string(), rootRunId: v.string() },
  returns: canaryRunResult,
  handler: async (ctx, args) => {
    const authority = await resolveAdminAuthority({ db: ctx.db as never, auth: ctx.auth }, 'control_kernel_incidents')
    if (authority.kind !== 'allowed') return { kind: 'canary_run_refused' as const, reason: 'authorization_denied' }
    const recordedBy = authority.membership.tokenIdentifier ?? authority.membership.clerkUserId
    const existingFact = await ctx.db.query('routingKernelIncidentCanaryRunFacts')
      .withIndex('by_canaryRunFactId', (query) => query.eq('canaryRunFactId', args.canaryRunFactId)).unique()
    if (existingFact !== null) return existingFact.recoveryGrantId === args.recoveryGrantId
      && existingFact.rootRunId === args.rootRunId && verifiedCanaryRunFact(existingFact)
      ? { kind: 'canary_run_recorded' as const, canaryRunFactId: existingFact.canaryRunFactId }
      : { kind: 'canary_run_refused' as const, reason: 'canary_run_fact_conflict' }
    const recordedAt = Date.now()
    const grant = await ctx.db.query('routingKernelIncidentRecoveryGrants')
      .withIndex('by_recoveryGrantId', (query) => query.eq('recoveryGrantId', args.recoveryGrantId)).unique()
    if (grant === null || grant.lane !== 'canary' || grant.canaryPlan === undefined || !verifiedRecoveryGrant(grant)) {
      return { kind: 'canary_run_refused' as const, reason: 'canary_recovery_grant_invalid' }
    }
    const root = await ctx.db.query('routingKernelRootRuns')
      .withIndex('by_rootRunId', (query) => query.eq('rootRunId', args.rootRunId)).unique()
    const claim = await ctx.db.query('routingKernelExecutionClaims')
      .withIndex('by_rootRunId', (query) => query.eq('rootRunId', args.rootRunId)).unique()
    const leaves = await ctx.db.query('routingKernelLeafRuns')
      .withIndex('by_rootRunId_leafRunId', (query) => query.eq('rootRunId', args.rootRunId)).collect()
    const records = await ctx.db.query('routingKernelProtocolRecords')
      .withIndex('by_rootRunId_sequence', (query) => query.eq('rootRunId', args.rootRunId)).collect()
    const leaf = leaves.find((candidate) => candidate.bindingId === grant.canaryPlan?.bindingId
      && candidate.capabilityContractId === grant.canaryPlan?.capabilityContractId)
    const use = leaf === undefined ? null : await ctx.db.query('routingKernelIncidentRecoveryUses')
      .withIndex('by_recoveryGrantId_operationRef', (query) => query.eq('recoveryGrantId', grant.recoveryGrantId).eq('operationRef', leaf.stepGrantId)).unique()
    const recordSet = records
      .map(({ _id, _creationTime, ...record }) => record)
      .sort((left, right) => left.sequence - right.sequence || left.recordId.localeCompare(right.recordId))
    if (root === null || root.incidentContract !== 'epoch_v1' || root.state !== 'completed' || root.effectState !== 'committed'
      || root.quoteId !== grant.canaryPlan.quoteId || root.quoteDigest !== grant.canaryPlan.quoteDigest
      || root.authorizedCurrency !== grant.canaryPlan.currency || root.authorizedAmountMinor !== grant.canaryPlan.maximumSpendMinor
      || claim === null || claim.state !== 'completed' || claim.authorizationRef !== grant.canaryPlan.authorizationRef
      || claim.requestDigest !== grant.canaryPlan.requestDigest || leaf === undefined || leaf.state !== 'completed'
      || use === null || use.lane !== 'canary'
      || use.canaryExecutionDigest !== canonicalAuthorityDigest(grant.canaryPlan)
      || use.usedAt < grant.issuedAt || use.usedAt >= grant.expiresAt
      || !records.some((record) => record.type === 'incident_canary_recovery_consumed'
        && record.recoveryGrantId === grant.recoveryGrantId && record.leafRunId === leaf.leafRunId
        && record.bindingId === leaf.bindingId)
      || !records.some((record) => record.type === 'provider_outcome_reported' && record.leafRunId === leaf.leafRunId)
      || !records.some((record) => record.type === 'root_run_completed')
      || records.some((record) => record.type === 'provider_outcome_unknown' || record.type === 'root_run_outcome_unknown')) {
      return { kind: 'canary_run_refused' as const, reason: 'canary_run_not_successful' }
    }
    const factMaterial = {
      schemaVersion: 'incident-canary-run-fact:v1' as const,
      canaryRunFactId: args.canaryRunFactId, recoveryGrantId: grant.recoveryGrantId,
      freezeOrderIds: [...grant.freezeOrderIds].sort(), scopeKey: grant.scopeKey,
      rootRunId: root.rootRunId, quoteId: root.quoteId, quoteDigest: root.quoteDigest,
      authorizationRef: claim.authorizationRef, requestDigest: claim.requestDigest,
      bindingId: leaf.bindingId, capabilityContractId: leaf.capabilityContractId,
      terminalState: 'completed' as const, effectState: 'committed' as const,
      recordSetDigest: canonicalAuthorityDigest(recordSet),
      outcomeDigest: canonicalAuthorityDigest({
        ...(leaf.providerReference === undefined ? {} : { providerReference: leaf.providerReference }),
        ...(leaf.outcome === undefined ? {} : { outcome: leaf.outcome }),
      }),
      recordedBy, recordedAt,
    }
    const factDigest = canonicalAuthorityDigest(factMaterial)
    await ctx.db.insert('routingKernelIncidentCanaryRunFacts', {
      ...factMaterial, factDigest, ...signIncidentFact(factDigest, incidentFactKeyring().active),
    })
    return { kind: 'canary_run_recorded' as const, canaryRunFactId: args.canaryRunFactId }
  },
})

function activeFreezeIds(control: { activeFreezeOrderIds: string[] }): string[] {
  return [...new Set(control.activeFreezeOrderIds)].sort()
}

function incidentFactKeyring() {
  return resolveIncidentFactKeyring(process.env)
}

function verifiedFreezeFact(fact: {
  schemaVersion: 'incident-freeze-order:v1'
  freezeOrderId: string
  incidentId: string
  issuerId: string
  reason: string
  scopeKey: string
  networkId?: string
  principalId?: string
  agentId?: string
  bindingId?: string
  capabilityContractId?: string
  blockedActions: IncidentActionClass[]
  epoch: number
  issuedAt: number
  factDigest: string
  signingKeyId?: string
  signingPublicKey?: string
  factSignature?: string
}): boolean {
  if (fact.signingKeyId === undefined || fact.signingPublicKey === undefined || fact.factSignature === undefined) return false
  const expectedDigest = canonicalAuthorityDigest({
    schemaVersion: fact.schemaVersion, freezeOrderId: fact.freezeOrderId, incidentId: fact.incidentId,
    issuerId: fact.issuerId, reason: fact.reason, scopeKey: fact.scopeKey,
    ...(fact.networkId === undefined ? {} : { networkId: fact.networkId }),
    ...(fact.principalId === undefined ? {} : { principalId: fact.principalId }),
    ...(fact.agentId === undefined ? {} : { agentId: fact.agentId }),
    ...(fact.bindingId === undefined ? {} : { bindingId: fact.bindingId }),
    ...(fact.capabilityContractId === undefined ? {} : { capabilityContractId: fact.capabilityContractId }),
    blockedActions: fact.blockedActions, epoch: fact.epoch, issuedAt: fact.issuedAt,
  })
  if (expectedDigest !== fact.factDigest) return false
  return verifyIncidentFact(fact.factDigest, {
    signingKeyId: fact.signingKeyId, signingPublicKey: fact.signingPublicKey, factSignature: fact.factSignature,
  }, incidentFactKeyring().trusted)
}

function recoveryProposalDigest(grant: Doc<'routingKernelIncidentRecoveryGrants'>): string {
  return canonicalAuthorityDigest({
    recoveryGrantId: grant.recoveryGrantId, freezeOrderIds: grant.freezeOrderIds, lane: grant.lane,
    scopeKey: grant.scopeKey,
    ...(grant.networkId === undefined ? {} : { networkId: grant.networkId }),
    ...(grant.principalId === undefined ? {} : { principalId: grant.principalId }),
    ...(grant.agentId === undefined ? {} : { agentId: grant.agentId }),
    ...(grant.bindingId === undefined ? {} : { bindingId: grant.bindingId }),
    ...(grant.capabilityContractId === undefined ? {} : { capabilityContractId: grant.capabilityContractId }),
    maximumUses: grant.maximumUses, expiresAt: grant.expiresAt, evidenceRefs: grant.evidenceRefs,
    ...(grant.canaryPlan === undefined ? {} : { canaryPlan: grant.canaryPlan }),
  })
}

function verifiedRecoveryGrant(grant: Doc<'routingKernelIncidentRecoveryGrants'>): boolean {
  const expectedDigest = canonicalAuthorityDigest({
    schemaVersion: grant.schemaVersion, recoveryGrantId: grant.recoveryGrantId,
    freezeOrderIds: grant.freezeOrderIds, lane: grant.lane, scopeKey: grant.scopeKey,
    ...(grant.networkId === undefined ? {} : { networkId: grant.networkId }),
    ...(grant.principalId === undefined ? {} : { principalId: grant.principalId }),
    ...(grant.agentId === undefined ? {} : { agentId: grant.agentId }),
    ...(grant.bindingId === undefined ? {} : { bindingId: grant.bindingId }),
    ...(grant.capabilityContractId === undefined ? {} : { capabilityContractId: grant.capabilityContractId }),
    maximumUses: grant.maximumUses, expiresAt: grant.expiresAt, evidenceRefs: grant.evidenceRefs,
    ...(grant.canaryPlan === undefined ? {} : { canaryPlan: grant.canaryPlan }),
    approverIds: grant.approverIds, issuedAt: grant.issuedAt,
  })
  return expectedDigest === grant.factDigest && verifyIncidentFact(grant.factDigest, {
    signingKeyId: grant.signingKeyId, signingPublicKey: grant.signingPublicKey, factSignature: grant.factSignature,
  }, incidentFactKeyring().trusted)
}

function scopeFromFreeze(freeze: Doc<'routingKernelIncidentFreezeOrders'>): IncidentScope {
  return {
    ...(freeze.networkId === undefined ? {} : { networkId: freeze.networkId }),
    ...(freeze.principalId === undefined ? {} : { principalId: freeze.principalId }),
    ...(freeze.agentId === undefined ? {} : { agentId: freeze.agentId }),
    ...(freeze.bindingId === undefined ? {} : { bindingId: freeze.bindingId }),
    ...(freeze.capabilityContractId === undefined ? {} : { capabilityContractId: freeze.capabilityContractId }),
  }
}

function scopeSelectorMatches(selector: IncidentScope, candidate: IncidentScope): boolean {
  return Object.entries(selector).every(([field, value]) => Reflect.get(candidate, field) === value)
}

function rootScopeMatches(
  selector: IncidentScope,
  candidate: Required<Pick<IncidentScope, 'networkId' | 'principalId' | 'agentId'>>,
): boolean {
  return (selector.networkId === undefined || selector.networkId === candidate.networkId)
    && (selector.principalId === undefined || selector.principalId === candidate.principalId)
    && (selector.agentId === undefined || selector.agentId === candidate.agentId)
}

function verifiedQuarantineFact(fact: Doc<'routingKernelIncidentEvidenceQuarantines'>): boolean {
  const expectedDigest = canonicalAuthorityDigest({
    schemaVersion: fact.schemaVersion, quarantineId: fact.quarantineId, freezeOrderId: fact.freezeOrderId,
    evidenceRef: fact.evidenceRef, reason: fact.reason, scopeKey: fact.scopeKey,
    issuedBy: fact.issuedBy, issuedAt: fact.issuedAt,
  })
  return expectedDigest === fact.factDigest && verifyIncidentFact(fact.factDigest, {
    signingKeyId: fact.signingKeyId, signingPublicKey: fact.signingPublicKey, factSignature: fact.factSignature,
  }, incidentFactKeyring().trusted)
}

async function reconstructIncidentScope(db: GenericDatabaseReader<DataModel>, scopeKey: string) {
  const freezes = await db.query('routingKernelIncidentFreezeOrders')
    .withIndex('by_scopeKey', (query) => query.eq('scopeKey', scopeKey)).take(101)
  if (freezes.length > 100) throw new Error('incident_reconstruction_fact_limit_exceeded')
  const active: Doc<'routingKernelIncidentFreezeOrders'>[] = []
  const sourceFacts: Array<{ epoch: number; digest: string }> = []
  for (const freeze of freezes) {
    if (!verifiedFreezeFact(freeze)) throw new Error('incident_freeze_fact_signature_invalid')
    sourceFacts.push({ epoch: freeze.epoch, digest: freeze.factDigest })
    const resumes = await db.query('routingKernelIncidentResumeOrders')
      .withIndex('by_freezeOrderId', (query) => query.eq('freezeOrderId', freeze.freezeOrderId)).take(2)
    if (resumes.length > 1) throw new Error('incident_resume_fact_conflict')
    const resume = resumes[0]
    if (resume === undefined) active.push(freeze)
    else {
      if (!verifiedResumeFact(resume)) throw new Error('incident_resume_fact_signature_invalid')
      sourceFacts.push({ epoch: resume.epoch, digest: resume.factDigest })
    }
  }
  const epoch = sourceFacts.reduce((maximum, fact) => Math.max(maximum, fact.epoch), 0)
  const activeFreezeOrderIds = active.map((freeze) => freeze.freezeOrderId).sort()
  const blockedActions = normalizeActions(active.flatMap((freeze) => freeze.blockedActions))
  const sourceFactDigests = sourceFacts.sort((left, right) => left.epoch - right.epoch || left.digest.localeCompare(right.digest)).map((fact) => fact.digest)
  const projectionDigest = canonicalAuthorityDigest({ scopeKey, epoch, activeFreezeOrderIds, blockedActions, sourceFactDigests })
  const control = await db.query('routingKernelIncidentScopeControls')
    .withIndex('by_scopeKey', (query) => query.eq('scopeKey', scopeKey)).unique()
  const projectionMatches = control !== null && control.epoch === epoch
    && canonicalAuthorityDigest([...control.activeFreezeOrderIds].sort()) === canonicalAuthorityDigest(activeFreezeOrderIds)
    && canonicalAuthorityDigest(normalizeActions(control.blockedActions)) === canonicalAuthorityDigest(blockedActions)
  return { epoch, activeFreezeOrderIds, blockedActions, sourceFactDigests, projectionDigest, projectionMatches }
}

function verifiedResumeFact(fact: Doc<'routingKernelIncidentResumeOrders'>): boolean {
  const expectedDigest = canonicalAuthorityDigest({
    schemaVersion: fact.schemaVersion, resumeOrderId: fact.resumeOrderId, freezeOrderId: fact.freezeOrderId,
    approverIds: fact.approverIds, evidenceRefs: fact.evidenceRefs, epoch: fact.epoch, issuedAt: fact.issuedAt,
  })
  return expectedDigest === fact.factDigest && verifyIncidentFact(fact.factDigest, {
    signingKeyId: fact.signingKeyId, signingPublicKey: fact.signingPublicKey, factSignature: fact.factSignature,
  }, incidentFactKeyring().trusted)
}

function verifiedReconstructionCheckpoint(fact: Doc<'routingKernelIncidentReconstructionCheckpoints'>): boolean {
  const expectedDigest = canonicalAuthorityDigest({
    schemaVersion: fact.schemaVersion, checkpointId: fact.checkpointId, scopeKey: fact.scopeKey,
    reconstructedEpoch: fact.reconstructedEpoch, activeFreezeOrderIds: fact.activeFreezeOrderIds,
    blockedActions: fact.blockedActions, sourceFactDigests: fact.sourceFactDigests,
    projectionDigest: fact.projectionDigest, projectionMatches: fact.projectionMatches,
    recordedBy: fact.recordedBy, recordedAt: fact.recordedAt,
  })
  return expectedDigest === fact.factDigest && verifyIncidentFact(fact.factDigest, {
    signingKeyId: fact.signingKeyId, signingPublicKey: fact.signingPublicKey, factSignature: fact.factSignature,
  }, incidentFactKeyring().trusted)
}

function verifiedReconformanceFact(fact: Doc<'routingKernelIncidentReconformanceFacts'>): boolean {
  if (fact.canaryRunFactId === undefined) return false
  const expectedDigest = canonicalAuthorityDigest({
    schemaVersion: fact.schemaVersion, reconformanceFactId: fact.reconformanceFactId, freezeOrderId: fact.freezeOrderId,
    canaryRunFactId: fact.canaryRunFactId, scopeKey: fact.scopeKey, evidenceSnapshotDigest: fact.evidenceSnapshotDigest,
    networkId: fact.networkId, bindingId: fact.bindingId,
    evidenceObservedAt: fact.evidenceObservedAt, evidenceExpiresAt: fact.evidenceExpiresAt,
    recordedBy: fact.recordedBy, recordedAt: fact.recordedAt,
  })
  return expectedDigest === fact.factDigest && verifyIncidentFact(fact.factDigest, {
    signingKeyId: fact.signingKeyId, signingPublicKey: fact.signingPublicKey, factSignature: fact.factSignature,
  }, incidentFactKeyring().trusted)
}

function verifiedCanaryRunFact(fact: Doc<'routingKernelIncidentCanaryRunFacts'>): boolean {
  const expectedDigest = canonicalAuthorityDigest({
    schemaVersion: fact.schemaVersion, canaryRunFactId: fact.canaryRunFactId,
    recoveryGrantId: fact.recoveryGrantId, freezeOrderIds: fact.freezeOrderIds, scopeKey: fact.scopeKey,
    rootRunId: fact.rootRunId, quoteId: fact.quoteId, quoteDigest: fact.quoteDigest,
    authorizationRef: fact.authorizationRef, requestDigest: fact.requestDigest,
    bindingId: fact.bindingId, capabilityContractId: fact.capabilityContractId,
    terminalState: fact.terminalState, effectState: fact.effectState,
    recordSetDigest: fact.recordSetDigest, outcomeDigest: fact.outcomeDigest,
    recordedBy: fact.recordedBy, recordedAt: fact.recordedAt,
  })
  return expectedDigest === fact.factDigest && verifyIncidentFact(fact.factDigest, {
    signingKeyId: fact.signingKeyId, signingPublicKey: fact.signingPublicKey, factSignature: fact.factSignature,
  }, incidentFactKeyring().trusted)
}

function verifiedRefinementFact(fact: Doc<'routingKernelIncidentRefinementFacts'>): boolean {
  const expectedDigest = canonicalAuthorityDigest({
    schemaVersion: fact.schemaVersion, refinementOrderId: fact.refinementOrderId,
    sourceFreezeOrderId: fact.sourceFreezeOrderId, replacementFreezeOrderId: fact.replacementFreezeOrderId,
    sourceFreezeFactDigest: fact.sourceFreezeFactDigest, replacementFreezeFactDigest: fact.replacementFreezeFactDigest,
    sourceResumeFactDigest: fact.sourceResumeFactDigest, reconstructionFactDigest: fact.reconstructionFactDigest,
    sourceDrainCompletedAt: fact.sourceDrainCompletedAt, scopeKey: fact.scopeKey,
    retainedActions: fact.retainedActions, droppedActions: fact.droppedActions,
    approvedActiveFreezeOrderIds: fact.approvedActiveFreezeOrderIds,
    approvedControlEpoch: fact.approvedControlEpoch, replacementEpoch: fact.replacementEpoch,
    resumeEpoch: fact.resumeEpoch, approverIds: fact.approverIds, recordedAt: fact.recordedAt,
  })
  return expectedDigest === fact.factDigest && verifyIncidentFact(fact.factDigest, {
    signingKeyId: fact.signingKeyId, signingPublicKey: fact.signingPublicKey, factSignature: fact.factSignature,
  }, incidentFactKeyring().trusted)
}

function verifiedResumeApproval(fact: Doc<'routingKernelIncidentResumeApprovals'>): boolean {
  return verifiedApprovalDigest(fact, canonicalAuthorityDigest({
    resumeOrderId: fact.resumeOrderId, freezeOrderId: fact.freezeOrderId, approverId: fact.approverId,
    evidenceRefs: fact.evidenceRefs, proposalDigest: fact.proposalDigest, approvedAt: fact.approvedAt,
  }))
}

function verifiedRecoveryApproval(fact: Doc<'routingKernelIncidentRecoveryGrantApprovals'>): boolean {
  return verifiedApprovalDigest(fact, canonicalAuthorityDigest({
    recoveryGrantId: fact.recoveryGrantId, approverId: fact.approverId,
    proposalDigest: fact.proposalDigest, approvedAt: fact.approvedAt,
  }))
}

function verifiedRefinementApproval(fact: Doc<'routingKernelIncidentRefinementApprovals'>): boolean {
  return verifiedApprovalDigest(fact, canonicalAuthorityDigest({
    refinementOrderId: fact.refinementOrderId, sourceFreezeOrderId: fact.sourceFreezeOrderId,
    replacementFreezeOrderId: fact.replacementFreezeOrderId,
    reconstructionCheckpointId: fact.reconstructionCheckpointId,
    approverId: fact.approverId, proposalDigest: fact.proposalDigest, approvedAt: fact.approvedAt,
  }))
}

function verifiedApprovalDigest(
  fact: { approvalFactDigest: string; signingKeyId: string; signingPublicKey: string; factSignature: string },
  expectedDigest: string,
): boolean {
  return fact.approvalFactDigest === expectedDigest && verifyIncidentFact(fact.approvalFactDigest, {
    signingKeyId: fact.signingKeyId, signingPublicKey: fact.signingPublicKey, factSignature: fact.factSignature,
  }, incidentFactKeyring().trusted)
}

function verifiedRoutingEvidenceSnapshot(evidence: Doc<'routingKernelBindingEvidenceSnapshots'>): boolean {
  const { _id, _creationTime, admittedAt: _admittedAt, snapshotDigest, ...material } = evidence
  return canonicalAuthorityDigest({
    ...material,
    incident: { ...material.incident, activeIncidentIds: [...new Set(material.incident.activeIncidentIds)].sort() },
  }) === snapshotDigest
}

function normalizeScope(input: IncidentScope): IncidentScope {
  return Object.freeze(Object.fromEntries(Object.entries(input).filter((entry) => entry[1] !== undefined)))
}

function normalizeActions(input: readonly IncidentActionClass[]): IncidentActionClass[] {
  return [...new Set(input)].sort()
}

function sameFreeze(existing: {
  freezeOrderId: string; incidentId: string; issuerId: string; reason: string; scopeKey: string
  blockedActions: IncidentActionClass[]; issuedAt: number
}, input: {
  freezeOrderId: string; incidentId: string; issuerId: string; reason: string; scope: IncidentScope
  blockedActions: IncidentActionClass[]
}): boolean {
  return canonicalAuthorityDigest({
    freezeOrderId: existing.freezeOrderId, incidentId: existing.incidentId, issuerId: existing.issuerId,
    reason: existing.reason, scopeKey: existing.scopeKey, blockedActions: [...existing.blockedActions].sort(),
  }) === canonicalAuthorityDigest({
    freezeOrderId: input.freezeOrderId, incidentId: input.incidentId, issuerId: input.issuerId,
    reason: input.reason, scopeKey: incidentScopeKey(normalizeScope(input.scope)),
    blockedActions: normalizeActions(input.blockedActions),
  })
}
