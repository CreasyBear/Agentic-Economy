import { v, type Infer } from 'convex/values'

import { customerRequestDigest, planRevisionDigest, preparedActionDigest as computePreparedActionDigest } from '@/modules/customer-request/preparation'
import type { PreparedAction } from '@/modules/customer-request/public'
import {
  customerRequestValue,
  planRevisionValue,
  preparedActionValue,
  preparedRouteCandidateSetValue,
  preparationRefusalReason,
} from '@/modules/customer-request/runtime'
import { internalMutation, internalQuery, type MutationCtx } from './_generated/server'

type PreparedActionValue = Infer<typeof preparedActionValue>
type ClaimPreparationArgs = Readonly<{
  preparationKey: string; preparationScope: string; commandDigest: string
  requestId: string; requestRevision: number; planRevisionId: string; actionId: string
  claimedAt: number; leaseExpiresAt: number; claimToken: string; routingRequestId: string
}>

const writeResult = v.union(
  v.object({ kind: v.literal('stored') }),
  v.object({ kind: v.literal('conflict') }),
  v.object({ kind: v.literal('stale') }),
)
const claimResult = v.union(
  v.object({ kind: v.literal('claimed'), claimToken: v.string(), routingRequestId: v.string(), claimedAt: v.number() }),
  v.object({ kind: v.literal('in_progress') }),
  v.object({ kind: v.literal('prepared'), preparedAction: preparedActionValue }),
  v.object({ kind: v.literal('options_prepared'), candidateSet: preparedRouteCandidateSetValue }),
  v.object({ kind: v.literal('refused'), reason: preparationRefusalReason, inspectionRef: v.optional(v.string()) }),
  v.object({ kind: v.literal('conflict') }),
  v.object({ kind: v.literal('stale') }),
)
const compilationOutcome = v.union(
      v.object({ kind: v.literal('plan_ready') }),
      v.object({
        kind: v.literal('needs_information'),
        missingInformation: v.array(v.object({
          field: v.string(), customerLabel: v.string(),
          reason: v.union(v.literal('required_for_registered_capability'), v.literal('disambiguates_registered_capabilities')),
          candidateCapabilityContractIds: v.optional(v.array(v.string())),
        })),
      }),
      v.object({
        kind: v.literal('unsupported'),
        reason: v.union(v.literal('no_registered_capability'), v.literal('unsafe_proposal')),
      }),
)
const compilationCommitResult = v.union(
  v.object({ kind: v.literal('stored') }),
  v.object({
    kind: v.literal('replayed'), request: customerRequestValue, planRevision: v.optional(planRevisionValue),
    outcome: compilationOutcome,
  }),
  v.object({ kind: v.literal('revision_conflict') }),
  v.object({ kind: v.literal('identity_conflict') }),
  v.object({ kind: v.literal('command_conflict') }),
)
const compilationLookupResult = v.union(
  v.null(),
  v.object({ kind: v.literal('command_conflict') }),
  v.object({
    kind: v.literal('replayed'), request: customerRequestValue, planRevision: v.optional(planRevisionValue),
    outcome: compilationOutcome,
  }),
)

export const lookupCompilation = internalQuery({
  args: { compilationKey: v.string(), commandDigest: v.string() },
  returns: compilationLookupResult,
  handler: async (ctx, args) => {
    const command = await ctx.db.query('customerRequestCompilationCommands')
      .withIndex('by_compilationKey', (query) => query.eq('compilationKey', args.compilationKey)).unique()
    if (command === null) return null
    if (command.commandDigest !== args.commandDigest) return { kind: 'command_conflict' as const }
    const revision = await ctx.db.query('customerRequestRevisions').withIndex('by_requestId_and_revision', (query) => query
      .eq('requestId', command.requestId).eq('revision', command.requestRevision)).unique()
    if (revision === null) throw new Error('customer_request_revision_missing')
    const request = stripRequestRevisionRow(revision)
    if (command.planRevisionId === undefined) return { kind: 'replayed' as const, request, outcome: command.outcome }
    const planRevisionId = command.planRevisionId
    const plan = await ctx.db.query('customerRequestPlanRevisions').withIndex('by_planRevisionId', (query) => query
      .eq('planRevisionId', planRevisionId)).unique()
    if (plan === null) throw new Error('plan_revision_missing')
    return { kind: 'replayed' as const, request, planRevision: stripPlanRow(plan), outcome: command.outcome }
  },
})

export const commitCompilation = internalMutation({
  args: {
    compilationKey: v.string(), commandDigest: v.string(), expectedRevision: v.number(),
    request: customerRequestValue, planRevision: v.optional(planRevisionValue),
    outcome: compilationOutcome,
  },
  returns: compilationCommitResult,
  handler: async (ctx, args) => {
    const priorCommand = await ctx.db.query('customerRequestCompilationCommands')
      .withIndex('by_compilationKey', (query) => query.eq('compilationKey', args.compilationKey)).unique()
    if (priorCommand !== null) {
      if (priorCommand.commandDigest !== args.commandDigest) return { kind: 'command_conflict' as const }
      const revision = await ctx.db.query('customerRequestRevisions').withIndex('by_requestId_and_revision', (query) => query
        .eq('requestId', priorCommand.requestId).eq('revision', priorCommand.requestRevision)).unique()
      if (revision === null) throw new Error('customer_request_revision_missing')
      const request = stripRequestRevisionRow(revision)
      if (priorCommand.planRevisionId === undefined) return { kind: 'replayed' as const, request, outcome: priorCommand.outcome }
      const planRevisionId = priorCommand.planRevisionId
      const plan = await ctx.db.query('customerRequestPlanRevisions').withIndex('by_planRevisionId', (query) => query
        .eq('planRevisionId', planRevisionId)).unique()
      if (plan === null) throw new Error('plan_revision_missing')
      return { kind: 'replayed' as const, request, planRevision: stripPlanRow(plan), outcome: priorCommand.outcome }
    }

    const current = await ctx.db.query('customerRequests').withIndex('by_requestId', (query) => query.eq('requestId', args.request.requestId)).unique()
    if ((current?.revision ?? 0) !== args.expectedRevision || args.request.revision !== args.expectedRevision + 1) {
      return { kind: 'revision_conflict' as const }
    }
    if (current !== null && (current.principalId !== args.request.principalId
      || current.delegatedAgentId !== args.request.delegatedAgentId)) return { kind: 'identity_conflict' as const }
    const requestDigest = customerRequestDigest(args.request)
    const existingRevision = await ctx.db.query('customerRequestRevisions').withIndex('by_requestId_and_revision', (query) => query
      .eq('requestId', args.request.requestId).eq('revision', args.request.revision)).unique()
    if (existingRevision !== null) return { kind: 'revision_conflict' as const }
    if (current !== null) {
      const priorRevision = await ctx.db.query('customerRequestRevisions').withIndex('by_requestId_and_revision', (query) => query
        .eq('requestId', current.requestId).eq('revision', current.revision)).unique()
      if (priorRevision === null) {
        const normalized = normalizeCurrentRequestRow(current)
        await ctx.db.insert('customerRequestRevisions', {
          ...normalized, requestDigest: customerRequestDigest(normalized), recordedAt: current.createdAt,
        })
      }
    }
    if (args.planRevision !== undefined) {
      if (args.planRevision.requestId !== args.request.requestId || args.planRevision.requestRevision !== args.request.revision) {
        throw new Error('plan_revision_request_mismatch')
      }
      const existingPlan = await ctx.db.query('customerRequestPlanRevisions').withIndex('by_planRevisionId', (query) => query
        .eq('planRevisionId', args.planRevision?.planRevisionId ?? '')).unique()
      if (existingPlan !== null) throw new Error('plan_revision_identity_conflict')
      await ctx.db.insert('customerRequestPlanRevisions', { ...args.planRevision, planDigest: planRevisionDigest(args.planRevision) })
    }
    if (current === null) {
      await ctx.db.insert('customerRequests', { ...args.request, requestDigest, updatedAt: args.request.createdAt })
    } else {
      await ctx.db.patch(current._id, { ...args.request, requestDigest, updatedAt: args.request.createdAt })
    }
    await ctx.db.insert('customerRequestRevisions', {
      ...args.request, requestDigest, recordedAt: args.request.createdAt,
    })
    await ctx.db.insert('customerRequestCompilationCommands', {
      compilationKey: args.compilationKey, commandDigest: args.commandDigest,
      requestId: args.request.requestId, requestRevision: args.request.revision,
      ...(args.planRevision === undefined ? {} : { planRevisionId: args.planRevision.planRevisionId }),
      committedAt: args.request.createdAt,
      outcome: args.outcome,
    })
    return { kind: 'stored' as const }
  },
})

export const putRequest = internalMutation({
  args: { request: customerRequestValue },
  returns: writeResult,
  handler: async (ctx, args) => {
    const requestDigest = customerRequestDigest(args.request)
    const existing = await ctx.db.query('customerRequests').withIndex('by_requestId', (query) => query.eq('requestId', args.request.requestId)).unique()
    if (existing !== null) return existing.requestDigest === requestDigest ? { kind: 'stored' as const } : { kind: 'conflict' as const }
    await ctx.db.insert('customerRequests', { ...args.request, requestDigest, updatedAt: args.request.createdAt })
    await ctx.db.insert('customerRequestRevisions', {
      ...args.request, requestDigest, recordedAt: args.request.createdAt,
    })
    return { kind: 'stored' as const }
  },
})

export const putPlanRevision = internalMutation({
  args: { plan: planRevisionValue },
  returns: writeResult,
  handler: async (ctx, args) => {
    const request = await ctx.db.query('customerRequests').withIndex('by_requestId', (query) => query.eq('requestId', args.plan.requestId)).unique()
    if (request === null || request.revision !== args.plan.requestRevision) return { kind: 'stale' as const }
    const planDigest = planRevisionDigest(args.plan)
    const existing = await ctx.db.query('customerRequestPlanRevisions').withIndex('by_planRevisionId', (query) => query.eq('planRevisionId', args.plan.planRevisionId)).unique()
    if (existing !== null) return existing.planDigest === planDigest ? { kind: 'stored' as const } : { kind: 'conflict' as const }
    await ctx.db.insert('customerRequestPlanRevisions', { ...args.plan, planDigest })
    return { kind: 'stored' as const }
  },
})

export const getRequest = internalQuery({
  args: { requestId: v.string() },
  returns: v.union(customerRequestValue, v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db.query('customerRequests').withIndex('by_requestId', (query) => query.eq('requestId', args.requestId)).unique()
    if (row === null) return null
    return normalizeCurrentRequestRow(row)
  },
})

export const recordAgentPrincipal = internalMutation({
  args: {
    principalId: v.string(), ownerId: v.string(), credentialId: v.string(), scopes: v.array(v.string()), seenAt: v.number(),
  },
  returns: v.union(v.object({ kind: v.literal('recorded') }), v.object({ kind: v.literal('conflict') })),
  handler: async (ctx, args) => {
    const existing = await ctx.db.query('customerRequestAgentPrincipals')
      .withIndex('by_principalId', (query) => query.eq('principalId', args.principalId)).unique()
    const scopes = [...new Set(args.scopes)].sort()
    if (existing !== null) {
      if (existing.credentialId !== args.credentialId || existing.ownerId !== args.ownerId) return { kind: 'conflict' as const }
      await ctx.db.patch(existing._id, { scopes, lastSeenAt: args.seenAt })
      return { kind: 'recorded' as const }
    }
    const credential = await ctx.db.query('customerRequestAgentPrincipals')
      .withIndex('by_credentialId', (query) => query.eq('credentialId', args.credentialId)).unique()
    if (credential !== null) return { kind: 'conflict' as const }
    await ctx.db.insert('customerRequestAgentPrincipals', {
      principalId: args.principalId, ownerId: args.ownerId, credentialId: args.credentialId,
      scopes, recordedAt: args.seenAt, lastSeenAt: args.seenAt,
    })
    return { kind: 'recorded' as const }
  },
})

export const getRequestRevision = internalQuery({
  args: { requestId: v.string(), revision: v.number() },
  returns: v.union(customerRequestValue, v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db.query('customerRequestRevisions').withIndex('by_requestId_and_revision', (query) => query
      .eq('requestId', args.requestId).eq('revision', args.revision)).unique()
    return row === null ? null : stripRequestRevisionRow(row)
  },
})

export const getPlanRevision = internalQuery({
  args: { planRevisionId: v.string() },
  returns: v.union(planRevisionValue, v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db.query('customerRequestPlanRevisions').withIndex('by_planRevisionId', (query) => query.eq('planRevisionId', args.planRevisionId)).unique()
    if (row === null) return null
    const { _id: _ignoredId, _creationTime: _ignoredCreationTime, planDigest: _digest, ...plan } = row
    return plan
  },
})

export const getPlanForRequestRevision = internalQuery({
  args: { requestId: v.string(), requestRevision: v.number() },
  returns: v.union(planRevisionValue, v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db.query('customerRequestPlanRevisions')
      .withIndex('by_requestId_and_requestRevision', (query) => query.eq('requestId', args.requestId).eq('requestRevision', args.requestRevision))
      .unique()
    return row === null ? null : stripPlanRow(row)
  },
})

export const getCompilationForRequestRevision = internalQuery({
  args: { requestId: v.string(), requestRevision: v.number() },
  returns: v.union(v.null(), v.object({ outcome: compilationOutcome })),
  handler: async (ctx, args) => {
    const row = await ctx.db.query('customerRequestCompilationCommands')
      .withIndex('by_requestId_and_requestRevision', (query) => query
        .eq('requestId', args.requestId).eq('requestRevision', args.requestRevision))
      .unique()
    return row === null ? null : { outcome: row.outcome }
  },
})

export const getPreparationForRequestRevision = internalQuery({
  args: { requestId: v.string(), requestRevision: v.number() },
  returns: v.union(
    v.null(),
    v.object({
      status: v.union(v.literal('claimed'), v.literal('options_prepared'), v.literal('prepared'), v.literal('refused')),
      candidateSet: v.optional(preparedRouteCandidateSetValue),
    }),
  ),
  handler: async (ctx, args) => {
    const rows = await ctx.db.query('customerRequestPreparationCommands')
      .withIndex('by_requestId_and_requestRevision', (query) => query
        .eq('requestId', args.requestId).eq('requestRevision', args.requestRevision))
      .collect()
    const row = rows.sort((left, right) => right._creationTime - left._creationTime).at(0)
    if (row === undefined) return null
    return {
      status: row.status,
      ...(row.candidateSet === undefined ? {} : { candidateSet: row.candidateSet }),
    }
  },
})

export const claimPreparation = internalMutation({
  args: {
    preparationKey: v.string(), preparationScope: v.string(), commandDigest: v.string(),
    requestId: v.string(), requestRevision: v.number(), planRevisionId: v.string(), actionId: v.string(),
    claimedAt: v.number(), leaseExpiresAt: v.number(), claimToken: v.string(), routingRequestId: v.string(),
  },
  returns: claimResult,
  handler: async (ctx, args) => await claimPreparationMutation(ctx, args),
})

export const completePreparation = internalMutation({
  args: { preparationScope: v.string(), claimToken: v.string(), preparedAction: preparedActionValue, completedAt: v.number() },
  returns: preparedActionValue,
  handler: async (ctx, args) => {
    const command = await ctx.db.query('customerRequestPreparationCommands').withIndex('by_preparationScope', (query) => query.eq('preparationScope', args.preparationScope)).unique()
    if (command === null) throw new Error('preparation_claim_not_found')
    if (command.status === 'prepared' && command.preparedActionId !== undefined) {
      const preparedActionId = command.preparedActionId
      const existing = await ctx.db.query('customerRequestPreparedActions').withIndex('by_preparedActionId', (query) => query.eq('preparedActionId', preparedActionId)).unique()
      if (existing === null) throw new Error('prepared_action_missing')
      return stripPreparedRow(existing)
    }
    if (command.status !== 'claimed' || command.claimToken !== args.claimToken) throw new Error('preparation_claim_lost')
    const preparedAction = normalizePreparedActionContract(args.preparedAction)
    const writablePreparedAction = writablePreparedActionContract(preparedAction)
    if (command.requestId !== preparedAction.requestId || command.requestRevision !== preparedAction.requestRevision
      || command.planRevisionId !== preparedAction.planRevisionId || command.actionId !== preparedAction.actionId) throw new Error('prepared_action_scope_mismatch')
    const { preparedActionDigest, ...material } = preparedAction
    if (computePreparedActionDigest(material) !== preparedActionDigest) throw new Error('prepared_action_digest_invalid')
    const existing = await ctx.db.query('customerRequestPreparedActions').withIndex('by_preparedActionId', (query) => query.eq('preparedActionId', preparedAction.preparedActionId)).unique()
    if (existing !== null) {
      if (existing.preparedActionDigest !== preparedActionDigest) throw new Error('prepared_action_identity_conflict')
    } else {
      await ctx.db.insert('customerRequestPreparedActions', {
        ...writablePreparedAction, preparationScope: args.preparationScope, recordedAt: args.completedAt,
      })
    }
    await ctx.db.patch(command._id, {
      status: 'prepared', preparedActionId: preparedAction.preparedActionId,
      completedAt: args.completedAt, leaseExpiresAt: args.completedAt,
    })
    return writablePreparedAction
  },
})

export const completeOptions = internalMutation({
  args: {
    preparationScope: v.string(), claimToken: v.string(),
    candidateSet: preparedRouteCandidateSetValue, completedAt: v.number(),
  },
  returns: preparedRouteCandidateSetValue,
  handler: async (ctx, args) => {
    const command = await ctx.db.query('customerRequestPreparationCommands')
      .withIndex('by_preparationScope', (query) => query.eq('preparationScope', args.preparationScope)).unique()
    if (command === null) throw new Error('preparation_claim_not_found')
    if (command.status === 'options_prepared' && command.candidateSet !== undefined) return command.candidateSet
    if (command.status !== 'claimed' || command.claimToken !== args.claimToken) throw new Error('preparation_claim_lost')
    await ctx.db.patch(command._id, {
      status: 'options_prepared', candidateSet: args.candidateSet,
      completedAt: args.completedAt, leaseExpiresAt: args.completedAt,
    })
    return args.candidateSet
  },
})

export const refusePreparation = internalMutation({
  args: {
    preparationScope: v.string(), claimToken: v.string(), reason: preparationRefusalReason,
    inspectionRef: v.optional(v.string()), completedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const command = await ctx.db.query('customerRequestPreparationCommands').withIndex('by_preparationScope', (query) => query.eq('preparationScope', args.preparationScope)).unique()
    if (command === null) throw new Error('preparation_claim_not_found')
    if (command.status === 'refused' && command.refusalReason === args.reason) return null
    if (command.status !== 'claimed' || command.claimToken !== args.claimToken) throw new Error('preparation_claim_lost')
    await ctx.db.patch(command._id, {
      status: 'refused', refusalReason: args.reason,
      ...(args.inspectionRef === undefined ? {} : { refusalInspectionRef: args.inspectionRef }),
      completedAt: args.completedAt, leaseExpiresAt: args.completedAt,
    })
    return null
  },
})

async function claimPreparationMutation(
  ctx: Pick<MutationCtx, 'db'>,
  args: ClaimPreparationArgs,
): Promise<Infer<typeof claimResult>> {
  const request = await ctx.db.query('customerRequests').withIndex('by_requestId', (query) => query.eq('requestId', args.requestId)).unique()
  const plan = await ctx.db.query('customerRequestPlanRevisions').withIndex('by_planRevisionId', (query) => query.eq('planRevisionId', args.planRevisionId)).unique()
  if (request === null || plan === null || request.revision !== args.requestRevision || plan.requestRevision !== args.requestRevision || plan.requestId !== args.requestId) return { kind: 'stale' }
  const keyCommand = await ctx.db.query('customerRequestPreparationCommands').withIndex('by_preparationKey', (query) => query.eq('preparationKey', args.preparationKey)).unique()
  if (keyCommand !== null && keyCommand.preparationScope !== args.preparationScope) return { kind: 'conflict' }
  const existing = await ctx.db.query('customerRequestPreparationCommands').withIndex('by_preparationScope', (query) => query.eq('preparationScope', args.preparationScope)).unique()
  if (existing !== null) {
    if (existing.commandDigest !== args.commandDigest) return { kind: 'conflict' }
    if (existing.status === 'prepared' && existing.preparedActionId !== undefined) {
      const preparedActionId = existing.preparedActionId
      const prepared = await ctx.db.query('customerRequestPreparedActions').withIndex('by_preparedActionId', (query) => query.eq('preparedActionId', preparedActionId)).unique()
      if (prepared === null) throw new Error('prepared_action_missing')
      return { kind: 'prepared', preparedAction: stripPreparedRow(prepared) }
    }
    if (existing.status === 'options_prepared' && existing.candidateSet !== undefined) {
      return { kind: 'options_prepared', candidateSet: existing.candidateSet }
    }
    if (existing.status === 'refused' && existing.refusalReason !== undefined) return {
      kind: 'refused', reason: existing.refusalReason,
      ...(existing.refusalInspectionRef === undefined ? {} : { inspectionRef: existing.refusalInspectionRef }),
    }
    if (existing.leaseExpiresAt > args.claimedAt) return { kind: 'in_progress' }
    const claimToken = `${existing.claimToken}:retry:${args.claimedAt}`
    await ctx.db.patch(existing._id, { claimToken, leaseExpiresAt: args.leaseExpiresAt })
    return { kind: 'claimed', claimToken, routingRequestId: existing.routingRequestId, claimedAt: existing.claimedAt }
  }
  await ctx.db.insert('customerRequestPreparationCommands', {
    preparationKey: args.preparationKey, preparationScope: args.preparationScope, commandDigest: args.commandDigest,
    requestId: args.requestId, requestRevision: args.requestRevision, planRevisionId: args.planRevisionId, actionId: args.actionId,
    status: 'claimed', claimToken: args.claimToken, routingRequestId: args.routingRequestId,
    claimedAt: args.claimedAt, leaseExpiresAt: args.leaseExpiresAt,
  })
  return { kind: 'claimed', claimToken: args.claimToken, routingRequestId: args.routingRequestId, claimedAt: args.claimedAt }
}

function stripPreparedRow(row: PreparedActionValue & { _id: unknown; _creationTime: number; preparationScope: string; recordedAt: number }): PreparedActionValue {
  const { _id: _ignoredId, _creationTime: _ignoredCreationTime, preparationScope: _scope, recordedAt: _recordedAt, ...prepared } = row
  return prepared
}

function normalizePreparedActionContract(action: PreparedActionValue): PreparedAction {
  return {
    ...action,
    disclosures: action.disclosures.map((disclosure) => ({
      ...disclosure,
      dataCategory: disclosure.dataCategory ?? disclosure.field,
      purposeLabels: disclosure.purposeLabels ?? disclosure.purposes.map(customerPurposeLabel),
      status: disclosure.status ?? (disclosure.timing === 'already_shared_to_prepare' ? 'released' : 'not_released'),
      recordedAt: disclosure.recordedAt ?? action.preparedAt,
      inspectionRef: disclosure.inspectionRef ?? action.preparedActionId,
    })),
  }
}

function writablePreparedActionContract(action: PreparedAction) {
  return {
    ...action,
    selectedBusiness: { ...action.selectedBusiness },
    alternatives: action.alternatives.map((item) => ({
      ...item, business: { ...item.business }, expectedCost: { ...item.expectedCost }, maximumCost: { ...item.maximumCost },
    })),
    comparisonBasis: { ...action.comparisonBasis, selectedBecause: [...action.comparisonBasis.selectedBecause] },
    allowedFallbacks: action.allowedFallbacks.map((item) => ({
      ...item, business: { ...item.business }, maximumCost: { ...item.maximumCost },
    })),
    expectedCost: { ...action.expectedCost }, maximumGrossCost: { ...action.maximumGrossCost },
    priceComponents: action.priceComponents.map((item) => ({ ...item })),
    disclosures: action.disclosures.map((item) => ({
      ...item, purposes: [...item.purposes], purposeLabels: [...item.purposeLabels],
    })),
    materialTerms: action.materialTerms.map((item) => ({ ...item })), cancellation: { ...action.cancellation },
  }
}

function customerPurposeLabel(value: string) {
  const words = value.replace(/[_-]+/g, ' ').trim()
  if (words.length === 0) return 'Prepare this option'
  const first = words.at(0)
  return first === undefined ? 'Prepare this option' : `${first.toUpperCase()}${words.slice(1)}`
}

function stripRequestRevisionRow(row: Infer<typeof customerRequestValue> & {
  _id: unknown; _creationTime: number; requestDigest: string; recordedAt: number
}): Infer<typeof customerRequestValue> {
  const { _id: _ignoredId, _creationTime: _ignoredCreationTime, requestDigest: _digest, recordedAt: _recordedAt, ...request } = row
  return request
}

function stripPlanRow(row: Infer<typeof planRevisionValue> & {
  _id: unknown; _creationTime: number; planDigest: string
}): Infer<typeof planRevisionValue> {
  const { _id: _ignoredId, _creationTime: _ignoredCreationTime, planDigest: _digest, ...plan } = row
  return plan
}

function normalizeCurrentRequestRow(row: {
  _id: unknown; _creationTime: number; requestDigest: string; updatedAt: number
  requestId: string; principalId: string; delegatedAgentId: string; intent: string; revision: number
  compilationState?: Infer<typeof customerRequestValue>['compilationState']
  understanding?: Infer<typeof customerRequestValue>['understanding']
  knownFacts?: Infer<typeof customerRequestValue>['knownFacts']
  routing: Infer<typeof customerRequestValue>['routing']; createdAt: number
}): Infer<typeof customerRequestValue> {
  return {
    requestId: row.requestId, principalId: row.principalId, delegatedAgentId: row.delegatedAgentId,
    intent: row.intent, revision: row.revision, compilationState: row.compilationState ?? 'submitted',
    understanding: row.understanding ?? {
      outcome: row.intent, hardConstraints: [], preferences: [],
      substitutions: { allowed: false, boundaries: [] }, completionCriterion: row.intent,
      completionRequirement: { evidenceRole: 'status', valueType: 'string' },
    },
    knownFacts: row.knownFacts ?? {},
    routing: row.routing, createdAt: row.createdAt,
  }
}
