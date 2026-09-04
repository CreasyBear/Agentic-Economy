import {
  WorkflowManager,
  getStatus,
  restart,
  start,
  type WorkflowId,
} from '@convex-dev/workflow'
import { v } from 'convex/values'

import { components, internal } from './_generated/api'
import type { Doc } from './_generated/dataModel'
import { internalMutation, mutation, query, type MutationCtx } from './_generated/server'
import { resolveBusinessActor } from './authz'
import {
  agentAccessPrincipalValue,
  verifySupplyAgentPrincipal,
} from './agentAccessPrincipals'
import {
  ownsPublishedBusiness,
  publicationPorts,
  rebuildCapabilityOriginSupplyProjection,
} from './capabilitySupply'
import { revokeProviderConnectionForActor } from './lib/providerConnections/owner'
import { admitInteractiveOwnerConsequence } from './lib/ownerConsequence'
import { clerkConsequenceProofValue } from './lib/consequenceProof'
import { requireSourceWrite, sourceWriteArgs } from './sourceWriteAdmission'
import {
  loadOfferingSourceState,
  persistOfferingSourceState,
} from './catalogOfferingMutations'
import {
  changeOfferingStatusInState,
  withdrawAccessPathInState,
} from '@/modules/catalog/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  providerOffboardingCompletion,
  type ProviderOffboardingBlocker,
  type ProviderOffboardingStatus,
} from '@/modules/capability-supply/provider-offboarding'
import { withdrawCapabilityCommand } from '@/modules/capability-supply/public'

const manager = new WorkflowManager(components.workflow)
const offboardingInternal = internal.capabilityProviderOffboarding

const statusValue = v.object({
  schemaVersion: v.literal('provider_offboarding:v1'),
  caseRef: v.string(),
  businessRef: v.string(),
  providerRef: v.string(),
  revision: v.number(),
  state: v.union(
    v.literal('Cancelled'),
    v.literal('Freezing'),
    v.literal('Draining'),
    v.literal('Waiting for obligations'),
    v.literal('Revoking connections'),
    v.literal('Verifying cleanup'),
    v.literal('Action required'),
    v.literal('Retired'),
  ),
  routeabilityFrozen: v.boolean(),
  blockerCodes: v.array(v.string()),
  observedAt: v.number(),
  retentionPolicyVersion: v.string(),
  continuation: v.optional(v.object({
    action: v.union(v.literal('supply.offboarding.status'), v.literal('supply.offboarding.resume')),
  })),
})
const resultValue = v.union(
  v.object({ kind: v.literal('available'), status: statusValue }),
  v.object({ kind: v.literal('not_found') }),
  v.object({ kind: v.literal('refused'), reason: v.string() }),
)

export const run = manager.define({
  args: { caseRef: v.string() },
  returns: v.string(),
}).handler(async (step, args): Promise<string> => {
  const frozen = await step.runMutation(offboardingInternal.freezeRouteability, args, { name: 'freeze-routeability' })
  if (frozen.cancelled) return args.caseRef
  if (!frozen.ready) throw new Error('provider_offboarding_freeze_blocked')
  for (let page = 0; ; page += 1) {
    const withdrawn = await step.runMutation(
      offboardingInternal.withdrawOperationTargetsPage,
      args,
      { name: `withdraw-operations-${page}` },
    )
    if (!withdrawn.ready) throw new Error('provider_offboarding_freeze_blocked')
    if (withdrawn.done) break
  }
  let connectionCursor: string | undefined
  for (let page = 0; ; page += 1) {
    const snapshotted = await step.runMutation(
      offboardingInternal.snapshotConnectionTargetsPage,
      { ...args, ...(connectionCursor === undefined ? {} : { afterConnectionRef: connectionCursor }) },
      { name: `snapshot-connections-${page}` },
    )
    connectionCursor = snapshotted.nextConnectionRef
    if (snapshotted.done) break
  }
  await step.runMutation(offboardingInternal.completeFreeze, args, { name: 'complete-freeze' })
  let operationCursor: string | undefined
  for (let page = 0; ; page += 1) {
    const drained = await step.runMutation(
      offboardingInternal.drainCallsPage,
      { ...args, ...(operationCursor === undefined ? {} : { afterOperationRef: operationCursor }) },
      { name: page === 0 ? 'drain-calls' : `drain-calls-${page}` },
    )
    if (!drained.ready) throw new Error('provider_offboarding_calls_blocked')
    operationCursor = drained.nextOperationRef
    if (drained.done) break
  }
  await step.runMutation(offboardingInternal.completeCallDrain, args, { name: 'complete-call-drain' })
  const settled = await step.runMutation(offboardingInternal.settleObligations, args, { name: 'settle-obligations' })
  if (!settled.ready) throw new Error('provider_offboarding_obligations_blocked')
  let revokeCursor: string | undefined
  for (let page = 0; ; page += 1) {
    const revoked = await step.runMutation(
      offboardingInternal.revokeConnectionsPage,
      { ...args, ...(revokeCursor === undefined ? {} : { afterConnectionRef: revokeCursor }) },
      { name: page === 0 ? 'revoke-connections' : `revoke-connections-${page}` },
    )
    if (!revoked.ready) throw new Error('provider_offboarding_connections_blocked')
    revokeCursor = revoked.nextConnectionRef
    if (revoked.done) break
  }
  const connectionRevocation = await step.runMutation(
    offboardingInternal.completeConnectionRevocation,
    args,
    { name: 'complete-connection-revocation' },
  )
  if (!connectionRevocation.ready) throw new Error('provider_offboarding_connections_blocked')
  let verificationCursor: string | undefined
  for (let page = 0; ; page += 1) {
    const verified = await step.runMutation(
      offboardingInternal.verifyCallsPage,
      { ...args, ...(verificationCursor === undefined ? {} : { afterOperationRef: verificationCursor }) },
      { name: `verify-calls-${page}` },
    )
    if (!verified.ready) throw new Error('provider_offboarding_calls_blocked')
    verificationCursor = verified.nextOperationRef
    if (verified.done) break
  }
  const completed = await step.runMutation(offboardingInternal.verifyCompletion, args, { name: 'verify-completion' })
  if (!completed.ready) throw new Error('provider_offboarding_completion_blocked')
  return args.caseRef
})

export const startCase = mutation({
  args: {
    businessId: v.id('businesses'),
    idempotencyKey: v.string(),
    retentionPolicyVersion: v.string(),
    operationKey: v.string(),
    correlationId: v.string(),
    proof: clerkConsequenceProofValue,
    ...sourceWriteArgs,
  },
  returns: resultValue,
  handler: async (ctx, args) => {
    const sourceWrite = await requireSourceWrite(ctx, args, 'catalog_publish')
    if (sourceWrite.kind === 'rejected') return { kind: 'refused' as const, reason: 'authorization_denied' }
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner' || !(await ownsPublishedBusiness(ctx, args.businessId))) {
      return { kind: 'refused' as const, reason: 'authorization_denied' }
    }
    const command = {
      version: 'provider-offboarding:v1',
      businessId: String(args.businessId),
      idempotencyKey: args.idempotencyKey,
      retentionPolicyVersion: args.retentionPolicyVersion,
    }
    const commandDigest = canonicalDigest(command)
    const caseRef = canonicalDigest({ version: 'provider-offboarding-case:v1', businessId: String(args.businessId), idempotencyKey: args.idempotencyKey })
    const existing = await ctx.db.query('capabilityProviderOffboardingCases')
      .withIndex('by_caseRef', (index) => index.eq('caseRef', caseRef))
      .unique()
    if (existing !== null) {
      return existing.lastCommandDigest === commandDigest
        ? { kind: 'available' as const, status: projectStatus(existing, Date.now()) }
        : { kind: 'refused' as const, reason: 'idempotency_conflict' }
    }
    const active = await ctx.db.query('capabilityProviderOffboardingCases')
      .withIndex('by_businessId_and_updatedAt', (index) => index.eq('businessId', args.businessId))
      .order('desc')
      .first()
    if (active !== null && active.state !== 'retired' && active.state !== 'cancelled') {
      return { kind: 'refused' as const, reason: 'offboarding_already_active' }
    }
    const admitted = await admitInteractiveOwnerConsequence(ctx, {
      actor,
      action: 'provider.offboard',
      target: { targetType: 'provider', targetRef: String(args.businessId), targetRevision: actor.authorityRevision.currentOwnership },
      requiredScopes: ['catalog_publish', 'connection:revoke'],
      resourceRefs: [`business:${String(args.businessId)}`],
      budgetAmount: 0,
      consequenceSummary: 'Freeze every supplied Operation, settle outstanding work, revoke Provider connections, and retire this Provider.',
      statusReadbackRef: `/owner/offerings#offboarding`,
      correlationRef: caseRef,
      idempotencyRef: caseRef,
      command,
      proof: args.proof,
      now: Date.now(),
    })
    if (admitted.kind === 'refused') return { kind: 'refused' as const, reason: admitted.code }

    const now = Date.now()
    const caseId = await ctx.db.insert('capabilityProviderOffboardingCases', {
      caseRef,
      owningAccountRef: actor.canonicalAccountRef,
      businessId: args.businessId,
      providerRef: String(args.businessId),
      requestedByPrincipalRef: actor.canonicalPrincipalRef,
      authorityRevision: actor.authorityRevision,
      authorityProvenance: actor.authorityProvenance,
      operationTargetCount: 0,
      connectionTargetCount: 0,
      targetSnapshotDigest: canonicalDigest({ version: 'provider-offboarding-targets:v1', caseRef, targets: [] }),
      currentStep: 'freeze-routeability',
      state: 'freezing',
      retentionPolicyVersion: args.retentionPolicyVersion,
      blockerCodes: [],
      evidenceRefs: [`provider-offboarding:requested:${caseRef}`],
      revision: 1,
      lastCommandId: args.idempotencyKey,
      lastCommandDigest: commandDigest,
      requestedAt: now,
      updatedAt: now,
    })
    const workflowId = await start(ctx, offboardingInternal.run, { caseRef }, { startAsync: true })
    await ctx.db.patch(caseId, { workflowId: String(workflowId) })
    const created = await ctx.db.get(caseId)
    if (created === null) return { kind: 'refused' as const, reason: 'source_unavailable' }
    return { kind: 'available' as const, status: projectStatus(created, now) }
  },
})

export const readStatus = query({
  args: { businessId: v.id('businesses') },
  returns: resultValue,
  handler: async (ctx, args) => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') return { kind: 'not_found' as const }
    const business = await ctx.db.get(args.businessId)
    if (business === null || business.owningAccountRef !== actor.canonicalAccountRef) return { kind: 'not_found' as const }
    const row = await ctx.db.query('capabilityProviderOffboardingCases')
      .withIndex('by_businessId_and_updatedAt', (index) => index.eq('businessId', args.businessId))
      .order('desc')
      .first()
    return row === null
      ? { kind: 'not_found' as const }
      : { kind: 'available' as const, status: projectStatus(row, Date.now()) }
  },
})

export const readAgentStatus = mutation({
  args: {
    businessId: v.id('businesses'),
    agentPrincipal: agentAccessPrincipalValue,
    operationKey: v.string(),
    correlationId: v.string(),
    ...sourceWriteArgs,
  },
  returns: resultValue,
  handler: async (ctx, args) => {
    const sourceWrite = await requireSourceWrite(ctx, args, 'catalog_publish')
    if (sourceWrite.kind === 'rejected') return { kind: 'not_found' as const }
    const admission = await verifySupplyAgentPrincipal(ctx, args.agentPrincipal)
    if (admission.kind !== 'allowed') return { kind: 'not_found' as const }
    const business = await ctx.db.get(args.businessId)
    if (business === null || business.owningAccountRef !== admission.ownerId) {
      return { kind: 'not_found' as const }
    }
    const row = await ctx.db.query('capabilityProviderOffboardingCases')
      .withIndex('by_businessId_and_updatedAt', (index) => index.eq('businessId', args.businessId))
      .order('desc')
      .first()
    return row === null
      ? { kind: 'not_found' as const }
      : { kind: 'available' as const, status: projectStatus(row, Date.now()) }
  },
})

export const resumeCase = mutation({
  args: {
    caseRef: v.string(),
    expectedRevision: v.number(),
    idempotencyKey: v.string(),
    operationKey: v.string(),
    correlationId: v.string(),
    proof: clerkConsequenceProofValue,
    ...sourceWriteArgs,
  },
  returns: resultValue,
  handler: async (ctx, args) => {
    const sourceWrite = await requireSourceWrite(ctx, args, 'catalog_publish')
    if (sourceWrite.kind === 'rejected') return { kind: 'refused' as const, reason: 'authorization_denied' }
    const actor = await resolveBusinessActor(ctx)
    const row = await ctx.db.query('capabilityProviderOffboardingCases')
      .withIndex('by_caseRef', (index) => index.eq('caseRef', args.caseRef))
      .unique()
    if (actor.kind !== 'authenticated_owner' || row === null || row.owningAccountRef !== actor.canonicalAccountRef) {
      return { kind: 'not_found' as const }
    }
    if (row.state === 'retired' || row.state === 'cancelled') {
      return { kind: 'available' as const, status: projectStatus(row, Date.now()) }
    }
    const command = {
      version: 'provider-offboarding-resume:v1',
      caseRef: args.caseRef,
      expectedRevision: args.expectedRevision,
      idempotencyKey: args.idempotencyKey,
    }
    const commandDigest = canonicalDigest(command)
    if (row.lastCommandId === args.idempotencyKey) {
      return row.lastCommandDigest === commandDigest
        ? { kind: 'available' as const, status: projectStatus(row, Date.now()) }
        : { kind: 'refused' as const, reason: 'idempotency_conflict' }
    }
    if (row.revision !== args.expectedRevision) return { kind: 'refused' as const, reason: 'revision_conflict' }
    const admitted = await admitInteractiveOwnerConsequence(ctx, {
      actor,
      action: 'provider.offboard',
      target: { targetType: 'provider', targetRef: String(row.businessId), targetRevision: row.revision },
      requiredScopes: ['catalog_publish', 'connection:revoke'],
      resourceRefs: [`provider-offboarding:${row.caseRef}`],
      budgetAmount: 0,
      consequenceSummary: 'Resume this Provider offboarding case from its last authoritative checkpoint.',
      statusReadbackRef: '/owner/offerings#offboarding',
      correlationRef: args.correlationId,
      idempotencyRef: args.idempotencyKey,
      command,
      proof: args.proof,
      now: Date.now(),
    })
    if (admitted.kind === 'refused') return { kind: 'refused' as const, reason: admitted.code }
    if (row.workflowId === undefined) return { kind: 'refused' as const, reason: 'workflow_unavailable' }
    const status = await getStatus(ctx, components.workflow, row.workflowId as WorkflowId)
    if (status.type === 'inProgress') return { kind: 'available' as const, status: projectStatus(row, Date.now()) }
    await restart(ctx, components.workflow, row.workflowId as WorkflowId, {
      from: row.currentStep,
      startAsync: true,
    })
    await ctx.db.patch(row._id, {
      state: stateForStep(row.currentStep),
      blockerCodes: [],
      lastCommandId: args.idempotencyKey,
      lastCommandDigest: commandDigest,
      revision: row.revision + 1,
      updatedAt: Date.now(),
    })
    const resumed = await ctx.db.get(row._id)
    return resumed === null
      ? { kind: 'refused' as const, reason: 'source_unavailable' }
      : { kind: 'available' as const, status: projectStatus(resumed, Date.now()) }
  },
})

export const cancelCase = mutation({
  args: {
    caseRef: v.string(),
    expectedRevision: v.number(),
    idempotencyKey: v.string(),
    operationKey: v.string(),
    correlationId: v.string(),
    proof: clerkConsequenceProofValue,
    ...sourceWriteArgs,
  },
  returns: resultValue,
  handler: async (ctx, args) => {
    const sourceWrite = await requireSourceWrite(ctx, args, 'catalog_publish')
    if (sourceWrite.kind === 'rejected') return { kind: 'refused' as const, reason: 'authorization_denied' }
    const actor = await resolveBusinessActor(ctx)
    const row = await ctx.db.query('capabilityProviderOffboardingCases')
      .withIndex('by_caseRef', (index) => index.eq('caseRef', args.caseRef))
      .unique()
    if (actor.kind !== 'authenticated_owner' || row === null || row.owningAccountRef !== actor.canonicalAccountRef) {
      return { kind: 'not_found' as const }
    }
    const command = {
      version: 'provider-offboarding-cancel:v1',
      caseRef: args.caseRef,
      expectedRevision: args.expectedRevision,
      idempotencyKey: args.idempotencyKey,
    }
    const commandDigest = canonicalDigest(command)
    if (row.lastCommandId === args.idempotencyKey) {
      return row.lastCommandDigest === commandDigest
        ? { kind: 'available' as const, status: projectStatus(row, Date.now()) }
        : { kind: 'refused' as const, reason: 'idempotency_conflict' }
    }
    if (row.revision !== args.expectedRevision) return { kind: 'refused' as const, reason: 'revision_conflict' }
    if (row.routeabilityFrozenAt !== undefined || row.state !== 'freezing') {
      return { kind: 'refused' as const, reason: 'routeability_freeze_accepted' }
    }
    const admitted = await admitInteractiveOwnerConsequence(ctx, {
      actor,
      action: 'provider.offboard',
      target: { targetType: 'provider', targetRef: String(row.businessId), targetRevision: row.revision },
      requiredScopes: ['catalog_publish'],
      resourceRefs: [`provider-offboarding:${row.caseRef}`],
      budgetAmount: 0,
      consequenceSummary: 'Cancel this Provider offboarding request before routeability is frozen.',
      statusReadbackRef: '/owner/offerings#offboarding',
      correlationRef: args.correlationId,
      idempotencyRef: args.idempotencyKey,
      command,
      proof: args.proof,
      now: Date.now(),
    })
    if (admitted.kind === 'refused') return { kind: 'refused' as const, reason: admitted.code }
    const now = Date.now()
    await ctx.db.patch(row._id, {
      state: 'cancelled',
      blockerCodes: [],
      evidenceRefs: [...row.evidenceRefs, `provider-offboarding:cancelled:${row.caseRef}`],
      revision: row.revision + 1,
      lastCommandId: args.idempotencyKey,
      lastCommandDigest: commandDigest,
      updatedAt: now,
    })
    const cancelled = await ctx.db.get(row._id)
    return cancelled === null
      ? { kind: 'refused' as const, reason: 'source_unavailable' }
      : { kind: 'available' as const, status: projectStatus(cancelled, now) }
  },
})

export const freezeRouteability = internalMutation({
  args: { caseRef: v.string() },
  returns: v.object({ ready: v.boolean(), cancelled: v.boolean() }),
  handler: async (ctx, args) => {
    const row = await requireCase(ctx, args.caseRef)
    if (row.state === 'cancelled') return { ready: false, cancelled: true }
    if (row.routeabilityFrozenAt !== undefined) return { ready: true, cancelled: false }
    const now = Date.now()
    await ctx.db.patch(row._id, {
      routeabilityFrozenAt: now,
      blockerCodes: [],
      evidenceRefs: [...row.evidenceRefs, `provider-offboarding:routeability-frozen:${row.caseRef}`],
      revision: row.revision + 1,
      updatedAt: now,
    })
    await rebuildCapabilityOriginSupplyProjection(ctx, row.businessId, now)
    return { ready: true, cancelled: false }
  },
})

export const withdrawOperationTargetsPage = internalMutation({
  args: { caseRef: v.string() },
  returns: v.object({ ready: v.boolean(), done: v.boolean() }),
  handler: async (ctx, args) => {
    const row = await requireCase(ctx, args.caseRef)
    if (row.routeabilityFrozenAt === undefined) return { ready: false, done: false }
    const publications = await ctx.db.query('capabilityPublications')
      .withIndex('by_businessId_and_disposition', (index) => index
        .eq('businessId', row.businessId)
        .eq('disposition', 'current'))
      .take(100)
    const insertedTargets: Array<Readonly<{ targetRef: string; targetRevision: number; authorityDigest: string }>> = []
    for (const publication of publications) {
      const canonicalPublication = await publicationPorts(ctx).loadPublicationAtRevision(
        publication.publicationRef,
        publication.revision,
      )
      if (canonicalPublication === null) {
        await block(ctx, row, 'freeze-routeability', 'routeable_operations_remain')
        return { ready: false, done: false }
      }
      const authorityDigest = canonicalDigest({
        version: 'provider-offboarding-operation-authority:v1',
        publicationRef: publication.publicationRef,
        revision: publication.revision,
        publisherRef: publication.publisherRef,
        authorityMode: publication.authorityMode,
        connectionAuthority: publication.connectionAuthority ?? null,
      })
      const existingTarget = await ctx.db.query('capabilityProviderOffboardingTargets')
        .withIndex('by_caseRef_and_kind_and_targetRef', (index) => index
          .eq('caseRef', row.caseRef)
          .eq('kind', 'operation')
          .eq('targetRef', publication.operationRef))
        .unique()
      if (existingTarget === null) {
        await ctx.db.insert('capabilityProviderOffboardingTargets', {
          caseRef: row.caseRef,
          businessId: row.businessId,
          kind: 'operation',
          targetRef: publication.operationRef,
          targetRevision: publication.revision,
          authorityDigest,
          createdAt: Date.now(),
        })
        insertedTargets.push({ targetRef: publication.operationRef, targetRevision: publication.revision, authorityDigest })
      }
      const result = await withdrawCapabilityCommand({
        publication: canonicalPublication,
        evidenceRefs: [`provider-offboarding:${row.caseRef}`],
        now: Date.now(),
      }, publicationPorts(ctx))
      if (result.kind === 'refused') {
        await block(ctx, row, 'freeze-routeability', 'routeable_operations_remain')
        return { ready: false, done: false }
      }
    }
    if (insertedTargets.length > 0) {
      await ctx.db.patch(row._id, {
        operationTargetCount: row.operationTargetCount + insertedTargets.length,
        targetSnapshotDigest: canonicalDigest({
          version: 'provider-offboarding-target-page:v1',
          previousDigest: row.targetSnapshotDigest,
          targets: insertedTargets,
        }),
        revision: row.revision + 1,
        updatedAt: Date.now(),
      })
    }
    return { ready: true, done: publications.length < 100 }
  },
})

export const snapshotConnectionTargetsPage = internalMutation({
  args: { caseRef: v.string(), afterConnectionRef: v.optional(v.string()) },
  returns: v.object({ done: v.boolean(), nextConnectionRef: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const row = await requireCase(ctx, args.caseRef)
    const connections = await ctx.db.query('capabilityProviderConnections')
      .withIndex('by_businessId_and_connectionRef', (index) => {
        const business = index.eq('businessId', row.businessId)
        return args.afterConnectionRef === undefined
          ? business
          : business.gt('connectionRef', args.afterConnectionRef)
      })
      .take(100)
    const insertedTargets: Array<Readonly<{ targetRef: string; targetRevision: number; authorityDigest: string }>> = []
    for (const connection of connections) {
      if (connection.lifecycle === 'revoked') continue
      const existingTarget = await ctx.db.query('capabilityProviderOffboardingTargets')
        .withIndex('by_caseRef_and_kind_and_targetRef', (index) => index
          .eq('caseRef', row.caseRef)
          .eq('kind', 'connection')
          .eq('targetRef', connection.connectionRef))
        .unique()
      if (existingTarget !== null) continue
      await ctx.db.insert('capabilityProviderOffboardingTargets', {
        caseRef: row.caseRef,
        businessId: row.businessId,
        kind: 'connection',
        targetRef: connection.connectionRef,
        targetRevision: connection.authorityGeneration,
        authorityDigest: connection.authorityDigest,
        createdAt: Date.now(),
      })
      insertedTargets.push({
        targetRef: connection.connectionRef,
        targetRevision: connection.authorityGeneration,
        authorityDigest: connection.authorityDigest,
      })
    }
    if (insertedTargets.length > 0) {
      await ctx.db.patch(row._id, {
        connectionTargetCount: row.connectionTargetCount + insertedTargets.length,
        targetSnapshotDigest: canonicalDigest({
          version: 'provider-offboarding-target-page:v1',
          previousDigest: row.targetSnapshotDigest,
          targets: insertedTargets,
        }),
        revision: row.revision + 1,
        updatedAt: Date.now(),
      })
    }
    const last = connections.at(-1)
    return {
      done: connections.length < 100,
      ...(connections.length < 100 || last === undefined ? {} : { nextConnectionRef: last.connectionRef }),
    }
  },
})

export const completeFreeze = internalMutation({
  args: { caseRef: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await requireCase(ctx, args.caseRef)
    await rebuildCapabilityOriginSupplyProjection(ctx, row.businessId, Date.now())
    await advance(ctx, row, 'drain-calls', 'draining')
    return null
  },
})

export const drainCallsPage = internalMutation({
  args: { caseRef: v.string(), afterOperationRef: v.optional(v.string()) },
  returns: v.object({ ready: v.boolean(), done: v.boolean(), nextOperationRef: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const row = await requireCase(ctx, args.caseRef)
    const targets = await readTargetPage(ctx, row.caseRef, 'operation', args.afterOperationRef)
    for (const target of targets) {
      if (await hasActiveCall(ctx, target.targetRef)) {
        await block(ctx, row, 'drain-calls', 'calls_remain')
        return { ready: false, done: false }
      }
    }
    const last = targets.at(-1)
    return {
      ready: true,
      done: targets.length < 100,
      ...(targets.length < 100 || last === undefined ? {} : { nextOperationRef: last.targetRef }),
    }
  },
})

export const completeCallDrain = internalMutation({
  args: { caseRef: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await requireCase(ctx, args.caseRef)
    await advance(ctx, row, 'settle-obligations', 'waiting_for_obligations')
    return null
  },
})

export const settleObligations = internalMutation({
  args: { caseRef: v.string() },
  returns: v.object({ ready: v.boolean() }),
  handler: async (ctx, args) => {
    const row = await requireCase(ctx, args.caseRef)
    if (await hasUnresolvedObligations(ctx, row.providerRef)) {
      return await block(ctx, row, 'settle-obligations', 'obligations_remain')
    }
    if (await hasUnresolvedPayouts(ctx, String(row.businessId))) {
      return await block(ctx, row, 'settle-obligations', 'payout_resolution_required')
    }
    await advance(ctx, row, 'revoke-connections', 'revoking_connections')
    return { ready: true }
  },
})

export const revokeConnectionsPage = internalMutation({
  args: { caseRef: v.string(), afterConnectionRef: v.optional(v.string()) },
  returns: v.object({ ready: v.boolean(), done: v.boolean(), nextConnectionRef: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const row = await requireCase(ctx, args.caseRef)
    const targets = await readTargetPage(ctx, row.caseRef, 'connection', args.afterConnectionRef)
    for (const connection of targets) {
      const current = await ctx.db.query('capabilityProviderConnections')
        .withIndex('by_connectionRef', (index) => index.eq('connectionRef', connection.targetRef))
        .unique()
      if (current === null || current.lifecycle === 'revoked') continue
      if (current.authorityGeneration !== connection.targetRevision || current.authorityDigest !== connection.authorityDigest) {
        await block(ctx, row, 'revoke-connections', 'connections_remain')
        return { ready: false, done: false }
      }
      await revokeProviderConnectionForActor(ctx, {
        connectionRef: connection.targetRef,
        commandId: `${row.caseRef}:revoke:${connection.targetRef}`,
        expectedAuthorityGeneration: connection.targetRevision,
        expectedAuthorityDigest: connection.authorityDigest,
        reasonCode: 'provider_offboarding',
        evidenceRefs: [`provider-offboarding:${row.caseRef}`],
      }, {
        canonicalPrincipalRef: row.requestedByPrincipalRef,
        canonicalAccountRef: row.owningAccountRef,
        authorityRevision: row.authorityRevision,
        authorityProvenance: row.authorityProvenance as never,
      })
    }
    const last = targets.at(-1)
    return {
      ready: true,
      done: targets.length < 100,
      ...(targets.length < 100 || last === undefined ? {} : { nextConnectionRef: last.targetRef }),
    }
  },
})

export const completeConnectionRevocation = internalMutation({
  args: { caseRef: v.string() },
  returns: v.object({ ready: v.boolean() }),
  handler: async (ctx, args) => {
    const row = await requireCase(ctx, args.caseRef)
    const remaining = await countActiveConnections(ctx, row.businessId)
    if (remaining > 0) return await block(ctx, row, 'revoke-connections', 'provider_cleanup_pending')
    await advance(ctx, row, 'verify-completion', 'verifying_cleanup')
    return { ready: true }
  },
})

export const verifyCallsPage = internalMutation({
  args: { caseRef: v.string(), afterOperationRef: v.optional(v.string()) },
  returns: v.object({ ready: v.boolean(), done: v.boolean(), nextOperationRef: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const row = await requireCase(ctx, args.caseRef)
    const targets = await readTargetPage(ctx, row.caseRef, 'operation', args.afterOperationRef)
    for (const target of targets) {
      if (await hasActiveCall(ctx, target.targetRef)) {
        await block(ctx, row, 'drain-calls', 'calls_remain')
        return { ready: false, done: false }
      }
    }
    const last = targets.at(-1)
    return {
      ready: true,
      done: targets.length < 100,
      ...(targets.length < 100 || last === undefined ? {} : { nextOperationRef: last.targetRef }),
    }
  },
})

export const verifyCompletion = internalMutation({
  args: { caseRef: v.string() },
  returns: v.object({ ready: v.boolean() }),
  handler: async (ctx, args) => {
    const row = await requireCase(ctx, args.caseRef)
    const routeable = await ctx.db.query('capabilityPublications')
      .withIndex('by_businessId_and_disposition', (index) => index.eq('businessId', row.businessId))
      .filter((queryBuilder) => queryBuilder.eq(queryBuilder.field('disposition'), 'current'))
      .take(1)
    const completion = providerOffboardingCompletion({
      routeableOperationCount: routeable.length,
      activeOrUnknownCallCount: 0,
      unresolvedObligationCount: await hasUnresolvedObligations(ctx, row.providerRef) ? 1 : 0,
      activeOrCleanupPendingConnectionCount: await countActiveConnections(ctx, row.businessId),
      retentionPolicyVersion: row.retentionPolicyVersion,
    })
    if (completion.kind === 'blocked') return await block(ctx, row, 'verify-completion', completion.blocker)
    if (await hasUnresolvedPayouts(ctx, String(row.businessId))) return await block(ctx, row, 'verify-completion', 'payout_resolution_required')
    await retireOfferings(ctx, row)
    const now = Date.now()
    await ctx.db.patch(row._id, {
      state: 'retired',
      blockerCodes: [],
      evidenceRefs: [...row.evidenceRefs, `retention-policy:${row.retentionPolicyVersion}`, `provider-offboarding:completed:${row.caseRef}`],
      revision: row.revision + 1,
      completedAt: now,
      updatedAt: now,
    })
    return { ready: true }
  },
})

async function requireCase(ctx: MutationCtx, caseRef: string): Promise<Doc<'capabilityProviderOffboardingCases'>> {
  const row = await ctx.db.query('capabilityProviderOffboardingCases')
    .withIndex('by_caseRef', (index) => index.eq('caseRef', caseRef))
    .unique()
  if (row === null) throw new Error('provider_offboarding_case_missing')
  return row
}

async function advance(
  ctx: MutationCtx,
  row: Doc<'capabilityProviderOffboardingCases'>,
  currentStep: Doc<'capabilityProviderOffboardingCases'>['currentStep'],
  state: Doc<'capabilityProviderOffboardingCases'>['state'],
  patch: Partial<Doc<'capabilityProviderOffboardingCases'>> = {},
): Promise<void> {
  await ctx.db.patch(row._id, {
    ...patch,
    currentStep,
    state,
    blockerCodes: [],
    revision: row.revision + 1,
    updatedAt: Date.now(),
  })
}

async function block(
  ctx: MutationCtx,
  row: Doc<'capabilityProviderOffboardingCases'>,
  currentStep: Doc<'capabilityProviderOffboardingCases'>['currentStep'],
  blocker: ProviderOffboardingBlocker,
): Promise<{ ready: false }> {
  await ctx.db.patch(row._id, {
    currentStep,
    state: 'action_required',
    blockerCodes: [blocker],
    revision: row.revision + 1,
    updatedAt: Date.now(),
  })
  return { ready: false }
}

async function readTargetPage(
  ctx: MutationCtx,
  caseRef: string,
  kind: 'operation' | 'connection',
  afterTargetRef?: string,
): Promise<Array<Doc<'capabilityProviderOffboardingTargets'>>> {
  return await ctx.db.query('capabilityProviderOffboardingTargets')
    .withIndex('by_caseRef_and_kind_and_targetRef', (index) => {
      const caseTargets = index.eq('caseRef', caseRef).eq('kind', kind)
      return afterTargetRef === undefined ? caseTargets : caseTargets.gt('targetRef', afterTargetRef)
    })
    .take(100)
}

async function hasActiveCall(ctx: MutationCtx, operationRef: string): Promise<boolean> {
  for (const state of ['pending', 'reconciliation_required'] as const) {
    if ((await ctx.db.query('capabilityOperationInvocations')
      .withIndex('by_operationRef_and_state', (index) => index.eq('operationRef', operationRef).eq('state', state))
      .take(1)).length > 0) return true
  }
  return false
}

async function hasUnresolvedObligations(ctx: MutationCtx, providerRef: string): Promise<boolean> {
  for (const state of ['accrued', 'held', 'payable', 'disputed'] as const) {
    if ((await ctx.db.query('moneyProviderObligations')
      .withIndex('by_providerRef_and_state', (index) => index.eq('providerRef', providerRef).eq('state', state))
      .take(1)).length > 0) return true
  }
  return false
}

async function hasUnresolvedPayouts(ctx: MutationCtx, businessId: string): Promise<boolean> {
  for (const state of ['review', 'held_kyc', 'held_threshold', 'transfer_pending', 'failed', 'outcome_unknown'] as const) {
    if ((await ctx.db.query('moneyPayouts')
      .withIndex('by_businessId_and_currency_and_state', (index) => index.eq('businessId', businessId).eq('currency', 'AUD').eq('state', state))
      .take(1)).length > 0) return true
  }
  return false
}

async function countActiveConnections(
  ctx: MutationCtx,
  businessId: Doc<'capabilityProviderOffboardingCases'>['businessId'],
): Promise<number> {
  let count = 0
  for (const lifecycle of ['active', 'reauthorization_required', 'revocation_pending', 'cleanup_required'] as const) {
    const connection = await ctx.db.query('capabilityProviderConnections')
      .withIndex('by_businessId_and_lifecycle', (index) => index
        .eq('businessId', businessId)
        .eq('lifecycle', lifecycle))
      .take(1)
    count += connection.length
  }
  return count
}

async function retireOfferings(
  ctx: MutationCtx,
  row: Doc<'capabilityProviderOffboardingCases'>,
): Promise<void> {
  const initial = await loadOfferingSourceState(ctx.db, row.businessId)
  let next = initial
  const authority = {
    actorRef: row.requestedByPrincipalRef,
    ownerRef: row.requestedByPrincipalRef,
    businessOwnerRef: row.requestedByPrincipalRef,
  }
  for (const offering of initial.offerings) {
    for (const path of next.accessPaths.filter((candidate) => candidate.offeringRef === offering.offeringRef && candidate.status !== 'withdrawn')) {
      const withdrawn = withdrawAccessPathInState(next, {
        authority,
        operationKey: `${row.caseRef}:withdraw-path:${path.accessPathRef}`,
        accessPathRef: path.accessPathRef,
        expectedRevision: offering.currentRevision,
        now: Date.now(),
      })
      if (withdrawn.kind === 'error') throw new Error(`provider_offboarding_path_${withdrawn.code}`)
      next = withdrawn.state
    }
    const retired = changeOfferingStatusInState(next, {
      authority,
      operationKey: `${row.caseRef}:retire-offering:${offering.offeringRef}`,
      offeringRef: offering.offeringRef,
      expectedRevision: offering.currentRevision,
      status: 'retired',
      now: Date.now(),
    })
    if (retired.kind === 'error') throw new Error(`provider_offboarding_offering_${retired.code}`)
    next = retired.state
  }
  const persisted = await persistOfferingSourceState(ctx.db, row.businessId, initial, next, 'owner')
  if (persisted.kind === 'error') throw new Error('provider_offboarding_retirement_persist_failed')
}

function stateForStep(step: Doc<'capabilityProviderOffboardingCases'>['currentStep']): Doc<'capabilityProviderOffboardingCases'>['state'] {
  if (step === 'freeze-routeability') return 'freezing'
  if (step === 'drain-calls') return 'draining'
  if (step === 'settle-obligations') return 'waiting_for_obligations'
  if (step === 'revoke-connections') return 'revoking_connections'
  return 'verifying_cleanup'
}

function projectStatus(row: Doc<'capabilityProviderOffboardingCases'>, now: number) {
  const state: ProviderOffboardingStatus['state'] = row.state === 'freezing'
    ? 'Freezing'
    : row.state === 'draining'
      ? 'Draining'
      : row.state === 'waiting_for_obligations'
        ? 'Waiting for obligations'
        : row.state === 'revoking_connections'
          ? 'Revoking connections'
          : row.state === 'verifying_cleanup'
            ? 'Verifying cleanup'
            : row.state === 'retired'
              ? 'Retired'
              : row.state === 'cancelled'
                ? 'Cancelled'
                : 'Action required'
  return {
    schemaVersion: 'provider_offboarding:v1' as const,
    caseRef: row.caseRef,
    businessRef: String(row.businessId),
    providerRef: row.providerRef,
    revision: row.revision,
    state,
    routeabilityFrozen: row.routeabilityFrozenAt !== undefined,
    blockerCodes: [...row.blockerCodes],
    observedAt: now,
    retentionPolicyVersion: row.retentionPolicyVersion,
    ...(state === 'Retired' || state === 'Cancelled'
      ? {}
      : { continuation: { action: state === 'Action required' ? 'supply.offboarding.resume' as const : 'supply.offboarding.status' as const } }),
  }
}
