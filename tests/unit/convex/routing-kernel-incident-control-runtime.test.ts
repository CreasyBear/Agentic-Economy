import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { canonicalAuthorityDigest, createBindingRoutingEvidenceSnapshot } from '@/modules/routing-kernel/public'
import { signIncidentFact } from '@/modules/routing-kernel/internal/incident-fact-signing'

import {
  evaluate,
  issueFreeze,
  approveResume,
  approveCanaryPreparation,
  approveRecoveryGrant,
  consumeRecoveryGrant,
  quarantineEvidence,
  recordReconstructionCheckpoint,
  recordReconformanceEvidence,
  recordCanaryRun,
  processIncidentDrainSweep,
} from '../../../convex/routingKernelIncidentControl'

type Row = Record<string, unknown> & { _id: string }
type Context = { db: FakeDb; auth: FakeAuth }
type Handler = (ctx: Context, args: Record<string, unknown>) => Promise<unknown>

const evaluateHandler = (evaluate as unknown as { _handler: Handler })._handler
const freezeHandler = (issueFreeze as unknown as { _handler: Handler })._handler
const resumeHandler = (approveResume as unknown as { _handler: Handler })._handler
const refinementHandler = (approveCanaryPreparation as unknown as { _handler: Handler })._handler
const approveRecoveryHandler = (approveRecoveryGrant as unknown as { _handler: Handler })._handler
const consumeRecoveryHandler = (consumeRecoveryGrant as unknown as { _handler: Handler })._handler
const quarantineHandler = (quarantineEvidence as unknown as { _handler: Handler })._handler
const reconstructHandler = (recordReconstructionCheckpoint as unknown as { _handler: Handler })._handler
const reconformanceHandler = (recordReconformanceEvidence as unknown as { _handler: Handler })._handler
const canaryRunHandler = (recordCanaryRun as unknown as { _handler: Handler })._handler
const drainHandler = (processIncidentDrainSweep as unknown as { _handler: Handler })._handler

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(1_000)
  vi.stubEnv('ROUTING_KERNEL_FACT_SIGNING_KEY', `incident-facts:test:${'1f'.repeat(32)}`)
  vi.stubEnv('ROUTING_KERNEL_FACT_PREVIOUS_PUBLIC_KEYS', '')
})

afterEach(() => vi.useRealTimers())

describe('routing-kernel durable incident control', () => {
  it('atomically advances a scoped epoch, freezes matching release, and resumes without reviving the prior epoch', async () => {
    const db = new FakeDb()
    const ctx = { db, auth: new FakeAuth(ownerIdentity()) }
    const scope = { networkId: 'network:au', bindingId: 'binding:parcel:v1' }

    await expect(evaluateHandler(ctx, { scope, action: 'provider_release' })).resolves.toMatchObject({ kind: 'allowed' })
    const before = await evaluateHandler(ctx, { scope, action: 'provider_release' }) as { epochDigest: string }

    await expect(freezeHandler(ctx, {
      freezeOrderId: 'freeze:1', incidentId: 'incident:1',
      reason: 'Credential compromise.', scope, blockedActions: ['provider_release', 'data_release'], issuedAt: 1_000,
    })).resolves.toEqual({ kind: 'freeze_issued', epoch: 1 })
    await expect(evaluateHandler(ctx, { scope, action: 'provider_release' })).resolves.toMatchObject({
      kind: 'frozen', freezeOrderId: 'freeze:1', incidentId: 'incident:1',
    })
    await expect(evaluateHandler(ctx, {
      scope: { networkId: 'network:au', bindingId: 'binding:other' }, action: 'provider_release',
    })).resolves.toMatchObject({ kind: 'allowed' })

    await drainHandler(ctx, { freezeOrderId: 'freeze:1', cursor: null })
    await reconstructHandler(ctx, { checkpointId: 'checkpoint:freeze:1', scope, recordedAt: 1_050 })

    await expect(resumeHandler(ctx, {
      resumeOrderId: 'resume:without-reconformance', freezeOrderId: 'freeze:1',
      reconstructionCheckpointId: 'checkpoint:freeze:1', reconformanceFactId: 'reconformance:missing',
    })).resolves.toEqual({ kind: 'resume_refused', reason: 'resume_reconformance_invalid' })
    await recordHealthyReconformance(ctx, {
      reconformanceFactId: 'reconformance:freeze:1', freezeOrderId: 'freeze:1', canaryRunFactId: 'canary-run:freeze:1', scope, observedAt: 1_060,
    })

    await expect(resumeHandler(ctx, {
      resumeOrderId: 'resume:2', freezeOrderId: 'freeze:1',
      reconstructionCheckpointId: 'checkpoint:freeze:1', reconformanceFactId: 'reconformance:freeze:1', canaryRunFactId: 'canary-run:freeze:1',
    })).resolves.toEqual({ kind: 'resume_approval_recorded', approvalCount: 1, requiredApprovals: 2 })
    await expect(resumeHandler({ db, auth: new FakeAuth(secondOwnerIdentity()) }, {
      resumeOrderId: 'resume:2', freezeOrderId: 'freeze:1',
      reconstructionCheckpointId: 'checkpoint:freeze:1', reconformanceFactId: 'reconformance:freeze:1', canaryRunFactId: 'canary-run:freeze:1',
    })).resolves.toEqual({ kind: 'resume_issued', epoch: 2 })

    const after = await evaluateHandler(ctx, { scope, action: 'provider_release' }) as { kind: string; epochDigest: string }
    expect(after.kind).toBe('allowed')
    expect(after.epochDigest).not.toBe(before.epochDigest)
    expect(db.rows('routingKernelIncidentFreezeOrders')).toEqual([
      expect.objectContaining({ freezeOrderId: 'freeze:1', factDigest: expect.any(String) }),
    ])
    expect(db.rows('routingKernelIncidentResumeOrders')).toEqual([
      expect.objectContaining({ resumeOrderId: 'resume:2', epoch: 2 }),
    ])
  })

  it('derives freeze authority from authenticated owner-admin membership', async () => {
    const args = {
      freezeOrderId: 'freeze:auth', incidentId: 'incident:auth', reason: 'Containment.',
      scope: { networkId: 'network:au' }, blockedActions: ['route'], issuedAt: 1_000,
    }
    await expect(freezeHandler({ db: new FakeDb(), auth: new FakeAuth(null) }, args)).resolves.toEqual({
      kind: 'freeze_refused', reason: 'authorization_denied',
    })
    await expect(freezeHandler({ db: new FakeDb('support'), auth: new FakeAuth(ownerIdentity()) }, args)).resolves.toEqual({
      kind: 'freeze_refused', reason: 'authorization_denied',
    })
    const db = new FakeDb()
    await expect(freezeHandler({ db, auth: new FakeAuth(ownerIdentity()) }, args)).resolves.toEqual({
      kind: 'freeze_issued', epoch: 1,
    })
    expect(db.rows('routingKernelIncidentFreezeOrders')).toEqual([
      expect.objectContaining({ issuerId: 'token:owner-admin' }),
    ])
  })

  it('keeps independent same-scope incidents active when one freeze is resumed', async () => {
    const db = new FakeDb()
    const owner = { db, auth: new FakeAuth(ownerIdentity()) }
    const secondOwner = { db, auth: new FakeAuth(secondOwnerIdentity()) }
    const scope = { networkId: 'network:au', bindingId: 'binding:parcel:v1' }

    await expect(freezeHandler(owner, {
      freezeOrderId: 'freeze:credentials', incidentId: 'incident:credentials', reason: 'Credential containment.',
      scope, blockedActions: ['provider_release'], issuedAt: 1_000,
    })).resolves.toEqual({ kind: 'freeze_issued', epoch: 1 })
    await expect(freezeHandler(owner, {
      freezeOrderId: 'freeze:data', incidentId: 'incident:data', reason: 'Data containment.',
      scope, blockedActions: ['data_release'], issuedAt: 1_010,
    })).resolves.toEqual({ kind: 'freeze_issued', epoch: 2 })

    await drainHandler(owner, { freezeOrderId: 'freeze:credentials', cursor: null })
    await reconstructHandler(owner, { checkpointId: 'checkpoint:credentials', scope, recordedAt: 1_050 })
    await recordHealthyReconformance(owner, {
      reconformanceFactId: 'reconformance:credentials', freezeOrderId: 'freeze:credentials', canaryRunFactId: 'canary-run:credentials', scope, observedAt: 1_060,
    })

    await resumeHandler(owner, {
      resumeOrderId: 'resume:credentials', freezeOrderId: 'freeze:credentials',
      reconstructionCheckpointId: 'checkpoint:credentials', reconformanceFactId: 'reconformance:credentials', canaryRunFactId: 'canary-run:credentials',
    })
    await expect(resumeHandler(secondOwner, {
      resumeOrderId: 'resume:credentials', freezeOrderId: 'freeze:credentials',
      reconstructionCheckpointId: 'checkpoint:credentials', reconformanceFactId: 'reconformance:credentials', canaryRunFactId: 'canary-run:credentials',
    })).resolves.toEqual({ kind: 'resume_issued', epoch: 3 })

    await expect(evaluateHandler(owner, { scope, action: 'provider_release' })).resolves.toMatchObject({ kind: 'allowed' })
    await expect(evaluateHandler(owner, { scope, action: 'data_release' })).resolves.toMatchObject({
      kind: 'frozen', freezeOrderId: 'freeze:data', incidentId: 'incident:data',
    })
  })

  it('refines a comprehensive freeze into effect containment before canary preparation', async () => {
    const db = new FakeDb()
    const owner = { db, auth: new FakeAuth(ownerIdentity()) }
    const secondOwner = { db, auth: new FakeAuth(secondOwnerIdentity()) }
    const scope = { networkId: 'network:au', bindingId: 'binding:parcel:v1' }
    await freezeHandler(owner, {
      freezeOrderId: 'freeze:comprehensive', incidentId: 'incident:comprehensive',
      reason: 'Stop every pathway.', scope,
      blockedActions: ['route', 'authorize', 'root_admission', 'provider_release', 'data_release'],
    })
    await drainHandler(owner, { freezeOrderId: 'freeze:comprehensive', cursor: null })
    await reconstructHandler(owner, { checkpointId: 'checkpoint:comprehensive', scope })
    const refinement = {
      refinementOrderId: 'refinement:canary-preparation', sourceFreezeOrderId: 'freeze:comprehensive',
      replacementFreezeOrderId: 'freeze:canary-egress', reconstructionCheckpointId: 'checkpoint:comprehensive',
    }
    await expect(refinementHandler(owner, refinement)).resolves.toEqual({
      kind: 'refinement_approval_recorded', approvalCount: 1, requiredApprovals: 2,
    })
    await expect(refinementHandler(secondOwner, refinement)).resolves.toEqual({
      kind: 'freeze_refined', replacementFreezeOrderId: 'freeze:canary-egress', epoch: 3,
    })
    vi.setSystemTime(1_500)
    await expect(refinementHandler(owner, refinement)).resolves.toEqual({
      kind: 'freeze_refined', replacementFreezeOrderId: 'freeze:canary-egress', epoch: 3,
    })
    await expect(evaluateHandler(owner, { scope, action: 'route' })).resolves.toMatchObject({ kind: 'allowed' })
    await expect(evaluateHandler(owner, { scope, action: 'authorize' })).resolves.toMatchObject({ kind: 'allowed' })
    await expect(evaluateHandler(owner, { scope, action: 'root_admission' })).resolves.toMatchObject({ kind: 'allowed' })
    await expect(evaluateHandler(owner, { scope, action: 'provider_release' })).resolves.toMatchObject({
      kind: 'frozen', freezeOrderId: 'freeze:canary-egress',
    })
    expect(db.rows('routingKernelIncidentResumeOrders')).toEqual([
      expect.objectContaining({ resumeOrderId: refinement.refinementOrderId, freezeOrderId: refinement.sourceFreezeOrderId }),
    ])
    expect(db.rows('routingKernelIncidentFreezeOrders')).toEqual(expect.arrayContaining([
      expect.objectContaining({ freezeOrderId: refinement.replacementFreezeOrderId, blockedActions: ['data_release', 'provider_release'] }),
    ]))
    expect(db.rows('routingKernelIncidentRefinementFacts')).toEqual([
      expect.objectContaining({
        refinementOrderId: refinement.refinementOrderId, sourceFreezeOrderId: refinement.sourceFreezeOrderId,
        replacementFreezeOrderId: refinement.replacementFreezeOrderId, factSignature: expect.stringMatching(/^ed25519:/),
      }),
    ])
  })

  it('refuses canary preparation before source drain completion or after approved projection changes', async () => {
    const db = new FakeDb()
    const owner = { db, auth: new FakeAuth(ownerIdentity()) }
    const secondOwner = { db, auth: new FakeAuth(secondOwnerIdentity()) }
    const scope = { networkId: 'network:au', bindingId: 'binding:parcel:v1' }
    await freezeHandler(owner, {
      freezeOrderId: 'freeze:refinement-stale', incidentId: 'incident:refinement-stale',
      reason: 'Comprehensive containment.', scope,
      blockedActions: ['route', 'authorize', 'root_admission', 'provider_release'],
    })
    const refinement = {
      refinementOrderId: 'refinement:stale', sourceFreezeOrderId: 'freeze:refinement-stale',
      replacementFreezeOrderId: 'freeze:refinement-stale:replacement', reconstructionCheckpointId: 'checkpoint:refinement-stale',
    }
    await expect(refinementHandler(owner, refinement)).resolves.toEqual({
      kind: 'refinement_refused', reason: 'source_drain_incomplete',
    })
    await drainHandler(owner, { freezeOrderId: 'freeze:refinement-stale', cursor: null })
    await reconstructHandler(owner, { checkpointId: 'checkpoint:refinement-stale', scope })
    await expect(refinementHandler(owner, refinement)).resolves.toEqual({
      kind: 'refinement_approval_recorded', approvalCount: 1, requiredApprovals: 2,
    })
    await freezeHandler(owner, {
      freezeOrderId: 'freeze:projection-change', incidentId: 'incident:projection-change',
      reason: 'New independent containment.', scope, blockedActions: ['data_release'],
    })
    await expect(refinementHandler(secondOwner, refinement)).resolves.toEqual({
      kind: 'refinement_refused', reason: 'refinement_reconstruction_stale',
    })
  })

  it('refuses the second approval when the incident projection changed after reconstruction', async () => {
    const db = new FakeDb()
    const owner = { db, auth: new FakeAuth(ownerIdentity()) }
    const secondOwner = { db, auth: new FakeAuth(secondOwnerIdentity()) }
    const scope = { networkId: 'network:au', bindingId: 'binding:parcel:v1' }
    await freezeHandler(owner, {
      freezeOrderId: 'freeze:stale', incidentId: 'incident:stale', reason: 'Initial containment.',
      scope, blockedActions: ['provider_release'], issuedAt: 1_000,
    })
    await drainHandler(owner, { freezeOrderId: 'freeze:stale', cursor: null })
    await reconstructHandler(owner, { checkpointId: 'checkpoint:stale', scope, recordedAt: 1_010 })
    await recordHealthyReconformance(owner, {
      reconformanceFactId: 'reconformance:stale', freezeOrderId: 'freeze:stale', canaryRunFactId: 'canary-run:stale', scope, observedAt: 1_020,
    })
    await expect(resumeHandler(owner, {
      resumeOrderId: 'resume:stale', freezeOrderId: 'freeze:stale',
      reconstructionCheckpointId: 'checkpoint:stale', reconformanceFactId: 'reconformance:stale', canaryRunFactId: 'canary-run:stale',
    })).resolves.toEqual({ kind: 'resume_approval_recorded', approvalCount: 1, requiredApprovals: 2 })
    await freezeHandler(owner, {
      freezeOrderId: 'freeze:new', incidentId: 'incident:new', reason: 'New containment fact.',
      scope, blockedActions: ['data_release'], issuedAt: 1_030,
    })
    await expect(resumeHandler(secondOwner, {
      resumeOrderId: 'resume:stale', freezeOrderId: 'freeze:stale',
      reconstructionCheckpointId: 'checkpoint:stale', reconformanceFactId: 'reconformance:stale', canaryRunFactId: 'canary-run:stale',
    })).resolves.toEqual({ kind: 'resume_refused', reason: 'resume_reconstruction_stale' })
  })

  it('fails closed when a signed active Freeze Fact is mutated after issuance', async () => {
    const db = new FakeDb()
    const ctx = { db, auth: new FakeAuth(ownerIdentity()) }
    const scope = { networkId: 'network:au', bindingId: 'binding:parcel:v1' }
    await freezeHandler(ctx, {
      freezeOrderId: 'freeze:tamper', incidentId: 'incident:tamper', reason: 'Original reason.',
      scope, blockedActions: ['provider_release'], issuedAt: 1_000,
    })
    const fact = db.rows('routingKernelIncidentFreezeOrders')[0]
    if (fact === undefined) throw new Error('freeze_fact_missing')
    await db.patch(fact._id, { reason: 'Mutated reason.' })

    await expect(evaluateHandler(ctx, { scope, action: 'provider_release' }))
      .rejects.toThrow('incident_freeze_fact_signature_invalid')
  })

  it('admits one idempotent reconciliation use only through a signed two-person recovery grant', async () => {
    const db = new FakeDb()
    const owner = { db, auth: new FakeAuth(ownerIdentity()) }
    const secondOwner = { db, auth: new FakeAuth(secondOwnerIdentity()) }
    const scope = { networkId: 'network:au', bindingId: 'binding:parcel:v1' }
    await freezeHandler(owner, {
      freezeOrderId: 'freeze:recovery', incidentId: 'incident:recovery', reason: 'Reconciliation containment.',
      scope, blockedActions: ['reconcile'], issuedAt: 1_000,
    })
    const proposal = {
      recoveryGrantId: 'recovery-grant:1', freezeOrderIds: ['freeze:recovery'], lane: 'reconcile',
      scope, maximumUses: 1, expiresAt: 2_000, evidenceRefs: ['evidence:bounded-recovery'], approvedAt: 1_100,
    }
    await expect(approveRecoveryHandler(owner, proposal)).resolves.toEqual({
      kind: 'recovery_approval_recorded', approvalCount: 1, requiredApprovals: 2,
    })
    await expect(approveRecoveryHandler(secondOwner, { ...proposal, approvedAt: 1_110 })).resolves.toEqual({
      kind: 'recovery_grant_issued', maximumUses: 1,
    })

    const use = { recoveryGrantId: 'recovery-grant:1', lane: 'reconcile', scope, operationRef: 'root-run:1', usedAt: 1_200 }
    await expect(consumeRecoveryHandler({ db, auth: new FakeAuth(null) }, use)).resolves.toEqual({ kind: 'recovery_authorized', replay: false })
    await expect(consumeRecoveryHandler({ db, auth: new FakeAuth(null) }, use)).resolves.toEqual({ kind: 'recovery_authorized', replay: true })
    await expect(consumeRecoveryHandler({ db, auth: new FakeAuth(null) }, { ...use, operationRef: 'root-run:2' })).resolves.toEqual({
      kind: 'recovery_refused', reason: 'recovery_grant_exhausted',
    })
  })

  it('uses server time for recovery expiry even when a caller supplies a backdated field', async () => {
    const db = new FakeDb()
    const owner = { db, auth: new FakeAuth(ownerIdentity()) }
    await freezeHandler(owner, {
      freezeOrderId: 'freeze:expired-recovery', incidentId: 'incident:expired-recovery',
      reason: 'Recovery expiry.', scope: { networkId: 'network:au' }, blockedActions: ['reconcile'],
    })
    vi.setSystemTime(3_000)
    await expect(approveRecoveryHandler(owner, {
      recoveryGrantId: 'recovery-grant:expired', freezeOrderIds: ['freeze:expired-recovery'], lane: 'reconcile',
      scope: { networkId: 'network:au' }, maximumUses: 1, expiresAt: 2_000,
      evidenceRefs: ['evidence:expired'], approvedAt: 1_100,
    })).resolves.toEqual({ kind: 'recovery_refused', reason: 'recovery_expiry_invalid' })
  })

  it('issues a payload-bound single-use canary recovery grant without widening reconciliation authority', async () => {
    const db = new FakeDb()
    const owner = { db, auth: new FakeAuth(ownerIdentity()) }
    const secondOwner = { db, auth: new FakeAuth(secondOwnerIdentity()) }
    const scope = { networkId: 'network:au', bindingId: 'binding:parcel:v1' }
    await freezeHandler(owner, {
      freezeOrderId: 'freeze:canary-lane', incidentId: 'incident:canary-lane',
      reason: 'Bounded canary.', scope, blockedActions: ['provider_release'],
    })
    const proposal = {
      recoveryGrantId: 'recovery-grant:canary', freezeOrderIds: ['freeze:canary-lane'], lane: 'canary',
      scope, maximumUses: 1, expiresAt: 2_000, evidenceRefs: ['evidence:approved-canary-plan'],
      canaryPlan: testCanaryPlan(),
    }
    await approveRecoveryHandler(owner, proposal)
    await expect(approveRecoveryHandler(secondOwner, proposal)).resolves.toEqual({
      kind: 'recovery_grant_issued', maximumUses: 1,
    })
    const canaryUse = {
      recoveryGrantId: 'recovery-grant:canary', lane: 'canary', scope,
      operationRef: 'root-run:canary:1', usedAt: 1_100, canaryExecution: testCanaryPlan(),
    }
    await expect(consumeRecoveryHandler(owner, {
      ...canaryUse, canaryExecution: { ...testCanaryPlan(), maximumSpendMinor: 251 },
    })).resolves.toEqual({ kind: 'recovery_refused', reason: 'canary_plan_mismatch' })
    expect(db.rows('routingKernelIncidentRecoveryUses')).toEqual([])
    await expect(consumeRecoveryHandler(owner, canaryUse)).resolves.toEqual({ kind: 'recovery_authorized', replay: false })
    await expect(consumeRecoveryHandler(owner, { ...canaryUse, lane: 'reconcile' })).resolves.toEqual({
      kind: 'recovery_refused', reason: 'recovery_scope_mismatch',
    })
    await expect(consumeRecoveryHandler(owner, { ...canaryUse, operationRef: 'root-run:canary:2' })).resolves.toEqual({
      kind: 'recovery_refused', reason: 'recovery_grant_exhausted',
    })
  })

  it('refuses a canary grant that does not name every overlapping active release freeze', async () => {
    const db = new FakeDb()
    const owner = { db, auth: new FakeAuth(ownerIdentity()) }
    const secondOwner = { db, auth: new FakeAuth(secondOwnerIdentity()) }
    await freezeHandler(owner, {
      freezeOrderId: 'freeze:network', incidentId: 'incident:network', reason: 'Network containment.',
      scope: { networkId: 'network:au' }, blockedActions: ['provider_release'],
    })
    await freezeHandler(owner, {
      freezeOrderId: 'freeze:binding', incidentId: 'incident:binding', reason: 'Binding containment.',
      scope: { networkId: 'network:au', bindingId: 'binding:parcel:v1' }, blockedActions: ['provider_release'],
    })
    const proposal = {
      recoveryGrantId: 'recovery-grant:incomplete-freeze-set', freezeOrderIds: ['freeze:network'], lane: 'canary',
      scope: { networkId: 'network:au' }, maximumUses: 1, expiresAt: 2_000,
      evidenceRefs: ['evidence:incomplete-canary-plan'], canaryPlan: testCanaryPlan(),
    }
    await approveRecoveryHandler(owner, proposal)
    await approveRecoveryHandler(secondOwner, proposal)
    await expect(consumeRecoveryHandler(owner, {
      recoveryGrantId: proposal.recoveryGrantId, lane: 'canary',
      scope: { networkId: 'network:au', bindingId: 'binding:parcel:v1' },
      operationRef: 'step-grant:overlap', usedAt: 1_100, canaryExecution: testCanaryPlan(),
    })).resolves.toEqual({ kind: 'recovery_refused', reason: 'recovery_blocking_freeze_not_covered' })

    const completeProposal = {
      recoveryGrantId: 'recovery-grant:complete-freeze-set',
      freezeOrderIds: ['freeze:network', 'freeze:binding'], lane: 'canary',
      scope: { networkId: 'network:au', bindingId: 'binding:parcel:v1' }, maximumUses: 1, expiresAt: 2_000,
      evidenceRefs: ['evidence:complete-canary-plan'], canaryPlan: testCanaryPlan(),
    }
    await approveRecoveryHandler(owner, completeProposal)
    await expect(approveRecoveryHandler(secondOwner, completeProposal)).resolves.toEqual({
      kind: 'recovery_grant_issued', maximumUses: 1,
    })
    await expect(consumeRecoveryHandler(owner, {
      recoveryGrantId: completeProposal.recoveryGrantId, lane: 'canary',
      scope: { networkId: 'network:au', bindingId: 'binding:parcel:v1' },
      operationRef: 'step-grant:complete-overlap', usedAt: 1_100, canaryExecution: testCanaryPlan(),
    })).resolves.toEqual({ kind: 'recovery_authorized', replay: false })
  })

  it('rejects multi-use canary recovery grants at approval', async () => {
    const db = new FakeDb()
    const owner = { db, auth: new FakeAuth(ownerIdentity()) }
    await freezeHandler(owner, {
      freezeOrderId: 'freeze:multi-canary', incidentId: 'incident:multi-canary', reason: 'Single-use only.',
      scope: { networkId: 'network:au' }, blockedActions: ['provider_release'],
    })
    await expect(approveRecoveryHandler(owner, {
      recoveryGrantId: 'recovery-grant:multi-canary', freezeOrderIds: ['freeze:multi-canary'], lane: 'canary',
      scope: { networkId: 'network:au' }, maximumUses: 2, expiresAt: 2_000,
      evidenceRefs: ['evidence:invalid-canary-plan'],
    })).resolves.toEqual({ kind: 'recovery_refused', reason: 'canary_must_be_single_use' })
  })

  it('refuses to manufacture canary-run evidence without a signed recovery grant and completed root', async () => {
    await expect(canaryRunHandler({ db: new FakeDb(), auth: new FakeAuth(ownerIdentity()) }, {
      canaryRunFactId: 'canary-run:missing', recoveryGrantId: 'recovery:missing', rootRunId: 'root:missing',
    })).resolves.toEqual({ kind: 'canary_run_refused', reason: 'canary_recovery_grant_invalid' })
  })

  it('signs canary-run evidence only from the completed plan-bound root and durable recovery use', async () => {
    const db = new FakeDb()
    const owner = { db, auth: new FakeAuth(ownerIdentity()) }
    const secondOwner = { db, auth: new FakeAuth(secondOwnerIdentity()) }
    const scope = { networkId: 'network:au', bindingId: 'binding:parcel:v1' }
    await freezeHandler(owner, {
      freezeOrderId: 'freeze:canary-proof', incidentId: 'incident:canary-proof',
      reason: 'Prove repaired pathway.', scope, blockedActions: ['provider_release'],
    })
    const plan = testCanaryPlan()
    const proposal = {
      recoveryGrantId: 'recovery:canary-proof', freezeOrderIds: ['freeze:canary-proof'], lane: 'canary',
      scope, maximumUses: 1, expiresAt: 2_000, evidenceRefs: ['evidence:canary-proof-plan'], canaryPlan: plan,
    }
    await approveRecoveryHandler(owner, proposal)
    await approveRecoveryHandler(secondOwner, proposal)
    await db.insert('routingKernelRootRuns', {
      incidentContract: 'epoch_v1', rootRunId: 'root:canary-proof', quoteId: plan.quoteId,
      quoteDigest: plan.quoteDigest, state: 'completed', effectState: 'committed',
      authorizedCurrency: plan.currency, authorizedAmountMinor: plan.maximumSpendMinor,
    })
    await db.insert('routingKernelExecutionClaims', {
      rootRunId: 'root:canary-proof', state: 'completed', authorizationRef: plan.authorizationRef,
      requestDigest: plan.requestDigest,
    })
    await db.insert('routingKernelLeafRuns', {
      rootRunId: 'root:canary-proof', leafRunId: 'leaf:canary-proof', stepGrantId: 'step:canary-proof',
      bindingId: plan.bindingId, capabilityContractId: plan.capabilityContractId,
      state: 'completed', providerReference: 'provider:canary-proof', outcome: { status: 'ok' },
    })
    await db.insert('routingKernelIncidentRecoveryUses', {
      recoveryGrantId: proposal.recoveryGrantId, operationRef: 'step:canary-proof', lane: 'canary', usedAt: 1_100,
      canaryExecutionDigest: canonicalAuthorityDigest(plan),
    })
    for (const [sequence, type] of ['incident_canary_recovery_consumed', 'provider_outcome_reported', 'root_run_completed'].entries()) {
      await db.insert('routingKernelProtocolRecords', {
        rootRunId: 'root:canary-proof', recordId: `record:canary-proof:${sequence}`, sequence, type,
        leafRunId: 'leaf:canary-proof', bindingId: plan.bindingId,
        recoveryGrantId: proposal.recoveryGrantId, occurredAt: 1_100 + sequence,
      })
    }
    await expect(canaryRunHandler(owner, {
      canaryRunFactId: 'canary-run:proof', recoveryGrantId: proposal.recoveryGrantId, rootRunId: 'root:canary-proof',
    })).resolves.toEqual({ kind: 'canary_run_recorded', canaryRunFactId: 'canary-run:proof' })
    vi.setSystemTime(1_500)
    await expect(canaryRunHandler(owner, {
      canaryRunFactId: 'canary-run:proof', recoveryGrantId: proposal.recoveryGrantId, rootRunId: 'root:canary-proof',
    })).resolves.toEqual({ kind: 'canary_run_recorded', canaryRunFactId: 'canary-run:proof' })
    expect(db.rows('routingKernelIncidentCanaryRunFacts')).toEqual([
      expect.objectContaining({ rootRunId: 'root:canary-proof', terminalState: 'completed', factSignature: expect.stringMatching(/^ed25519:/) }),
    ])
  })

  it('issues a signed evidence quarantine only for evidence inside an active freeze scope', async () => {
    const db = new FakeDb()
    const owner = { db, auth: new FakeAuth(ownerIdentity()) }
    const scope = { networkId: 'network:au', bindingId: 'binding:parcel:v1' }
    await db.insert('routingKernelBindingEvidenceSnapshots', {
      snapshotDigest: 'sha256:evidence', networkId: scope.networkId, bindingId: scope.bindingId,
    })
    await freezeHandler(owner, {
      freezeOrderId: 'freeze:evidence', incidentId: 'incident:evidence', reason: 'Evidence integrity incident.',
      scope, blockedActions: ['route'], issuedAt: 1_000,
    })
    await expect(quarantineHandler(owner, {
      quarantineId: 'quarantine:evidence', freezeOrderId: 'freeze:evidence', evidenceRef: 'sha256:evidence',
      reason: 'Hold compromised observation.', issuedAt: 1_010,
    })).resolves.toEqual({ kind: 'evidence_quarantined', quarantineId: 'quarantine:evidence' })
    expect(db.rows('routingKernelIncidentEvidenceQuarantines')).toEqual([
      expect.objectContaining({ factDigest: expect.any(String), factSignature: expect.stringMatching(/^ed25519:/) }),
    ])
  })

  it('records whether the scope projection deterministically matches signed Freeze and Resume Facts', async () => {
    const db = new FakeDb()
    const owner = { db, auth: new FakeAuth(ownerIdentity()) }
    const scope = { networkId: 'network:au', bindingId: 'binding:parcel:v1' }
    await freezeHandler(owner, {
      freezeOrderId: 'freeze:reconstruct', incidentId: 'incident:reconstruct', reason: 'Projection reconstruction.',
      scope, blockedActions: ['route', 'provider_release'], issuedAt: 1_000,
    })
    await expect(reconstructHandler(owner, {
      checkpointId: 'checkpoint:matching', scope, recordedAt: 1_010,
    })).resolves.toEqual({ kind: 'reconstruction_recorded', projectionMatches: true })
    const control = db.rows('routingKernelIncidentScopeControls')[0]
    if (control === undefined) throw new Error('scope_control_missing')
    await db.patch(control._id, { blockedActions: [] })
    await expect(reconstructHandler(owner, {
      checkpointId: 'checkpoint:mismatch', scope, recordedAt: 1_020,
    })).resolves.toEqual({ kind: 'reconstruction_recorded', projectionMatches: false })
    expect(db.rows('routingKernelIncidentReconstructionCheckpoints')).toEqual([
      expect.objectContaining({ checkpointId: 'checkpoint:matching', projectionMatches: true, factSignature: expect.stringMatching(/^ed25519:/) }),
      expect.objectContaining({ checkpointId: 'checkpoint:mismatch', projectionMatches: false, factSignature: expect.stringMatching(/^ed25519:/) }),
    ])
  })

  it('records unreleased containment and already-released indeterminate leaves at freeze time', async () => {
    const db = new FakeDb()
    const owner = { db, auth: new FakeAuth(ownerIdentity()) }
    for (const [suffix, released] of [['pending', false], ['released', true]] as const) {
      await db.insert('routingKernelRootRuns', {
        rootRunId: `root:${suffix}`, networkId: 'network:au', principalId: 'principal:merchant', agentId: 'agent:external',
      })
      await db.insert('routingKernelLeafRuns', {
        rootRunId: `root:${suffix}`, leafRunId: `leaf:${suffix}`, bindingId: 'binding:parcel:v1', capabilityContractId: 'capability:label:v1',
      })
      await db.insert('routingKernelProtocolRecords', {
        rootRunId: `root:${suffix}`, recordId: `record:${suffix}:admitted`, type: 'root_run_admitted', sequence: 0, occurredAt: 1_000,
      })
      if (released) await db.insert('routingKernelProtocolRecords', {
        rootRunId: `root:${suffix}`, leafRunId: `leaf:${suffix}`, recordId: `record:${suffix}:released`,
        type: 'provider_attempt_released', sequence: 1, occurredAt: 1_010,
      })
    }
    await db.insert('routingKernelRootRuns', {
      rootRunId: 'root:cancellation', networkId: 'network:au', principalId: 'principal:merchant',
      agentId: 'agent:external', completedAt: 1_012,
    })
    await db.insert('routingKernelLeafRuns', {
      rootRunId: 'root:cancellation', leafRunId: 'leaf:cancellation', bindingId: 'binding:parcel:v1',
      capabilityContractId: 'capability:label:v1',
    })
    await db.insert('routingKernelProtocolRecords', {
      rootRunId: 'root:cancellation', recordId: 'record:cancellation:admitted',
      type: 'root_run_admitted', sequence: 0, occurredAt: 1_000,
    })
    await db.insert('routingKernelProviderCancellations', {
      cancellationRequestId: 'cancel:pending', rootRunId: 'root:cancellation', leafRunId: 'leaf:cancellation',
      bindingId: 'binding:parcel:v1', requestedAt: 1_015, disposition: 'pending',
    })
    vi.setSystemTime(1_020)
    await freezeHandler(owner, {
      freezeOrderId: 'freeze:drain', incidentId: 'incident:drain', reason: 'Drain matching attempts.',
      scope: { networkId: 'network:au', bindingId: 'binding:parcel:v1' },
      blockedActions: ['provider_release'], issuedAt: 1,
    })
    await expect(drainHandler(owner, { freezeOrderId: 'freeze:drain', cursor: null })).resolves.toMatchObject({
      kind: 'drain_complete', rootsExamined: 3, factsRecorded: 3,
    })
    expect(db.rows('routingKernelIncidentDrainFacts').map((row) => [row.rootRunId, row.egressKind, row.disposition])).toEqual([
      ['root:pending', 'provider_execution', 'pre_release_contained'],
      ['root:released', 'provider_execution', 'in_flight_indeterminate'],
      ['root:cancellation', 'provider_cancellation', 'cancellation_in_flight_indeterminate'],
    ])
  })
})

class FakeDb {
  private readonly tables: Record<string, Row[]> = {
    routingKernelIncidentScopeControls: [],
    routingKernelIncidentFreezeOrders: [],
    routingKernelIncidentResumeOrders: [],
    routingKernelIncidentResumeApprovals: [],
    routingKernelIncidentRefinementApprovals: [],
    routingKernelIncidentRefinementFacts: [],
    routingKernelIncidentRecoveryGrantApprovals: [],
    routingKernelIncidentRecoveryGrants: [],
    routingKernelIncidentRecoveryUses: [],
    routingKernelIncidentEvidenceQuarantines: [],
    routingKernelBindingEvidenceSnapshots: [],
    routingKernelBindings: [],
    routingKernelIncidentReconstructionCheckpoints: [],
    routingKernelIncidentReconformanceFacts: [],
    routingKernelIncidentCanaryRunFacts: [],
    routingKernelIncidentDrainSweeps: [],
    routingKernelIncidentDrainFacts: [],
    routingKernelRootRuns: [],
    routingKernelLeafRuns: [],
    routingKernelProtocolRecords: [],
    routingKernelProviderCancellations: [],
    routingKernelExecutionClaims: [],
    adminMemberships: [],
  }

  constructor(role: 'owner_admin' | 'support' = 'owner_admin') {
    this.tables.adminMemberships = [{
      _id: 'adminMemberships:1', clerkUserId: 'owner-admin', tokenIdentifier: 'token:owner-admin',
      role, state: 'active', grantedBy: 'bootstrap', grantedAt: 1,
    }, {
      _id: 'adminMemberships:2', clerkUserId: 'second-owner-admin', tokenIdentifier: 'token:second-owner-admin',
      role: 'owner_admin', state: 'active', grantedBy: 'token:owner-admin', grantedAt: 2,
    }]
  }

  query(table: string) { return new FakeQuery(this.tables[table] ?? []) }

  async insert(table: string, value: Record<string, unknown>) {
    const rows = this.tables[table] ?? (this.tables[table] = [])
    const id = `${table}:${rows.length + 1}`
    rows.push({ _id: id, ...structuredClone(value) })
    return id
  }

  async replace(id: string, value: Record<string, unknown>) {
    const row = this.find(id)
    for (const key of Object.keys(row)) if (key !== '_id') delete row[key]
    Object.assign(row, structuredClone(value))
  }

  async patch(id: string, value: Record<string, unknown>) {
    Object.assign(this.find(id), structuredClone(value))
  }

  rows(table: string) { return structuredClone(this.tables[table] ?? []) }

  private find(id: string): Row {
    const row = Object.values(this.tables).flat().find((candidate) => candidate._id === id)
    if (row === undefined) throw new Error(`row_not_found:${id}`)
    return row
  }
}

class FakeAuth {
  constructor(private readonly identity: ReturnType<typeof ownerIdentity> | null) {}
  async getUserIdentity() { return this.identity }
}

function ownerIdentity() {
  return { issuer: 'https://clerk.example', subject: 'owner-admin', tokenIdentifier: 'token:owner-admin' }
}

function secondOwnerIdentity() {
  return { issuer: 'https://clerk.example', subject: 'second-owner-admin', tokenIdentifier: 'token:second-owner-admin' }
}

function testCanaryPlan() {
  return {
    quoteId: 'quote:canary', quoteDigest: 'sha256:quote-canary', authorizationRef: 'authorization:canary',
    requestDigest: 'sha256:request-canary', bindingId: 'binding:parcel:v1',
    capabilityContractId: 'capability:label:v1', maximumSpendMinor: 250,
    currency: 'AUD', allowedDataFields: ['scenario'],
  }
}

async function recordHealthyReconformance(
  ctx: Context,
  input: { reconformanceFactId: string; freezeOrderId: string; canaryRunFactId: string; scope: { networkId: string; bindingId: string }; observedAt: number },
) {
  await seedCanaryRunFact(ctx.db, input.canaryRunFactId, input.freezeOrderId)
  const freeze = ctx.db.rows('routingKernelIncidentFreezeOrders').find((row) => row.freezeOrderId === input.freezeOrderId)
  if (freeze === undefined || typeof freeze.incidentId !== 'string') throw new Error('freeze_incident_missing')
  const snapshot = createBindingRoutingEvidenceSnapshot({
    contractVersion: 'routing-evidence:v1', networkId: input.scope.networkId, bindingId: input.scope.bindingId,
    bindingRegistrationHash: 'sha256:registration', environment: 'https://provider.example',
    networkPolicyVersion: 'network-policy:binding-evidence:v2', estimatorVersion: 'execution-reliability-lcb:v1',
    sourceCommitment: canonicalAuthorityDigest({ rootRunId: `root:${input.canaryRunFactId}`, canaryRunFactId: input.canaryRunFactId }),
    observedAt: input.observedAt, expiresAt: input.observedAt + 10_000,
    health: { state: 'healthy', evidenceStanding: 'eligible_observed' },
    incident: { routingEffect: 'none', activeIncidentIds: [freeze.incidentId], evidenceStanding: 'eligible_observed' },
    standing: { evidenceStanding: 'eligible_observed', executionReliability: { status: 'insufficient_evidence', sampleSize: 0 } },
  })
  await ctx.db.insert('routingKernelBindings', {
    bindingId: input.scope.bindingId, networkId: input.scope.networkId, capabilityContractId: 'capability:label:v1',
    registrationHash: 'sha256:registration', admission: 'admitted', conformance: 'conformant',
  })
  await ctx.db.insert('routingKernelBindingEvidenceSnapshots', { ...snapshot, admittedAt: input.observedAt })
  vi.setSystemTime(input.observedAt + 1)
  await expect(reconformanceHandler(ctx, {
    reconformanceFactId: input.reconformanceFactId, freezeOrderId: input.freezeOrderId,
    canaryRunFactId: input.canaryRunFactId,
    evidenceSnapshotDigest: snapshot.snapshotDigest,
  })).resolves.toEqual({ kind: 'reconformance_recorded', reconformanceFactId: input.reconformanceFactId })
}

async function seedCanaryRunFact(db: FakeDb, canaryRunFactId: string, freezeOrderId: string) {
  const freeze = db.rows('routingKernelIncidentFreezeOrders').find((row) => row.freezeOrderId === freezeOrderId)
  if (freeze === undefined || typeof freeze.scopeKey !== 'string') throw new Error('freeze_scope_missing')
  const factMaterial = {
    schemaVersion: 'incident-canary-run-fact:v1' as const, canaryRunFactId,
    recoveryGrantId: `recovery:${canaryRunFactId}`, freezeOrderIds: [freezeOrderId], scopeKey: freeze.scopeKey,
    rootRunId: `root:${canaryRunFactId}`, quoteId: `quote:${canaryRunFactId}`, quoteDigest: 'sha256:quote',
    authorizationRef: `authorization:${canaryRunFactId}`, requestDigest: 'sha256:request',
    bindingId: 'binding:parcel:v1', capabilityContractId: 'capability:label:v1',
    terminalState: 'completed' as const, effectState: 'committed' as const,
    recordSetDigest: 'sha256:records', outcomeDigest: 'sha256:outcome',
    recordedBy: 'token:owner-admin', recordedAt: Date.now(),
  }
  const factDigest = canonicalAuthorityDigest(factMaterial)
  await db.insert('routingKernelIncidentCanaryRunFacts', {
    ...factMaterial, factDigest,
    ...signIncidentFact(factDigest, { keyId: 'incident-facts:test', privateKey: '1f'.repeat(32) }),
  })
}

class FakeQuery {
  private readonly filters: Array<[string, unknown]> = []
  constructor(private readonly rows: Row[]) {}
  withIndex(_name: string, callback: (query: FakeQuery) => FakeQuery) { return callback(this) }
  order(_direction: 'asc' | 'desc') { return this }
  eq(field: string, value: unknown) { this.filters.push([field, value]); return this }
  async take(limit: number) {
    return this.rows
      .filter((row) => this.filters.every(([field, value]) => row[field] === value))
      .slice(0, limit)
  }
  async collect() { return this.rows.filter((row) => this.filters.every(([field, value]) => row[field] === value)) }
  async first() { return (await this.take(1))[0] ?? null }
  async paginate({ cursor, numItems }: { cursor: string | null; numItems: number }) {
    const start = cursor === null ? 0 : Number(cursor)
    const matches = this.rows.filter((row) => this.filters.every(([field, value]) => row[field] === value))
    const page = matches.slice(start, start + numItems)
    const next = start + page.length
    return { page, isDone: next >= matches.length, continueCursor: String(next) }
  }
  async unique() {
    const matches = this.rows.filter((row) => this.filters.every(([field, value]) => row[field] === value))
    if (matches.length > 1) throw new Error('not_unique')
    return matches[0] ?? null
  }
}
