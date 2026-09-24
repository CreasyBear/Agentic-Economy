import { getStatus, restart, start, type WorkflowId } from '@convex-dev/workflow'
import { v, type Infer } from 'convex/values'

import { components, internal } from '../../../_generated/api'
import type { Id } from '../../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'
import {
  agentAccessPrincipalValue,
  verifySupplyAgentPrincipal,
} from '../../../agentAccessPrincipals'
import { ownsPublishedBusiness } from '../../../capabilitySupply'
import { admitInteractiveOwnerConsequence } from '../../authority/consequence/owner'
import { clerkConsequenceProofValue } from '../../authority/consequence/proof'
import {
  requireSourceRead,
  requireSourceWrite,
  sourceWriteAdmissionArg,
  sourceWriteArgs,
  sourceWriteRequestArg,
} from '../../../sourceWriteAdmission'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { projectStatus, stateForStep } from './caseState'
import type { resultValue } from './contracts'

const offboardingInternal = internal.capabilityProviderOffboarding

type OwnerCommandResult = Infer<typeof resultValue>

type SourceWriteFields = Readonly<{
  sourceWrite?: Infer<typeof sourceWriteAdmissionArg>
  sourceWriteRequest?: Infer<typeof sourceWriteRequestArg>
}>

type StartCaseArgs = Readonly<{
  businessId: Id<'businesses'>
  idempotencyKey: string
  retentionPolicyVersion: string
  operationKey: string
  correlationId: string
  proof: Infer<typeof clerkConsequenceProofValue>
}> & SourceWriteFields

type ReadAgentStatusArgs = Readonly<{
  businessId: Id<'businesses'>
  agentPrincipal: Infer<typeof agentAccessPrincipalValue>
  operationKey: string
  correlationId: string
}> & SourceWriteFields

type ResumeCaseArgs = Readonly<{
  caseRef: string
  expectedRevision: number
  idempotencyKey: string
  operationKey: string
  correlationId: string
  proof: Infer<typeof clerkConsequenceProofValue>
}> & SourceWriteFields

type CancelCaseArgs = ResumeCaseArgs

export const startCaseArgs = {
  businessId: v.id('businesses'),
  idempotencyKey: v.string(),
  retentionPolicyVersion: v.string(),
  operationKey: v.string(),
  correlationId: v.string(),
  proof: clerkConsequenceProofValue,
  ...sourceWriteArgs,
}

export async function startCaseHandler(ctx: MutationCtx, args: StartCaseArgs): Promise<OwnerCommandResult> {
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
    consequenceSummary: 'Freeze every supplied Tool, settle outstanding work, revoke Provider connections, and retire this Provider.',
    statusReadbackRef: `/owner/operations#offboarding`,
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
    toolTargetCount: 0,
    offeringTargetCount: 0,
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
}

export const readStatusArgs = { businessId: v.id('businesses') }

export async function readStatusHandler(ctx: QueryCtx, args: { businessId: Id<'businesses'> }): Promise<OwnerCommandResult> {
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
}

export const readAgentStatusArgs = {
  businessId: v.id('businesses'),
  agentPrincipal: agentAccessPrincipalValue,
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
}

export async function readAgentStatusHandler(ctx: QueryCtx, args: ReadAgentStatusArgs): Promise<OwnerCommandResult> {
  const sourceWrite = await requireSourceRead(args, 'catalog_publish')
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
}

export const resumeCaseArgs = {
  caseRef: v.string(),
  expectedRevision: v.number(),
  idempotencyKey: v.string(),
  operationKey: v.string(),
  correlationId: v.string(),
  proof: clerkConsequenceProofValue,
  ...sourceWriteArgs,
}

export async function resumeCaseHandler(ctx: MutationCtx, args: ResumeCaseArgs): Promise<OwnerCommandResult> {
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
    statusReadbackRef: '/owner/operations#offboarding',
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
}

export const cancelCaseArgs = {
  caseRef: v.string(),
  expectedRevision: v.number(),
  idempotencyKey: v.string(),
  operationKey: v.string(),
  correlationId: v.string(),
  proof: clerkConsequenceProofValue,
  ...sourceWriteArgs,
}

export async function cancelCaseHandler(ctx: MutationCtx, args: CancelCaseArgs): Promise<OwnerCommandResult> {
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
    statusReadbackRef: '/owner/operations#offboarding',
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
}
