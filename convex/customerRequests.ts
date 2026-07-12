import { v, type Infer } from 'convex/values'

import { customerRequestDigest, planRevisionDigest, preparedActionDigest as computePreparedActionDigest } from '@/modules/customer-request/preparation'
import {
  customerRequestValue,
  planRevisionValue,
  preparedActionValue,
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
  v.object({ kind: v.literal('refused'), reason: preparationRefusalReason }),
  v.object({ kind: v.literal('conflict') }),
  v.object({ kind: v.literal('stale') }),
)

export const putRequest = internalMutation({
  args: { request: customerRequestValue },
  returns: writeResult,
  handler: async (ctx, args) => {
    const requestDigest = customerRequestDigest(args.request)
    const existing = await ctx.db.query('customerRequests').withIndex('by_requestId', (query) => query.eq('requestId', args.request.requestId)).unique()
    if (existing !== null) return existing.requestDigest === requestDigest ? { kind: 'stored' as const } : { kind: 'conflict' as const }
    await ctx.db.insert('customerRequests', { ...args.request, requestDigest, updatedAt: args.request.createdAt })
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
    const { _id: _ignoredId, _creationTime: _ignoredCreationTime, requestDigest: _digest, updatedAt: _updatedAt, ...request } = row
    return request
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
    if (command.requestId !== args.preparedAction.requestId || command.requestRevision !== args.preparedAction.requestRevision
      || command.planRevisionId !== args.preparedAction.planRevisionId || command.actionId !== args.preparedAction.actionId) throw new Error('prepared_action_scope_mismatch')
    const { preparedActionDigest, ...material } = args.preparedAction
    if (computePreparedActionDigest(material) !== preparedActionDigest) throw new Error('prepared_action_digest_invalid')
    const existing = await ctx.db.query('customerRequestPreparedActions').withIndex('by_preparedActionId', (query) => query.eq('preparedActionId', args.preparedAction.preparedActionId)).unique()
    if (existing !== null) {
      if (existing.preparedActionDigest !== preparedActionDigest) throw new Error('prepared_action_identity_conflict')
    } else {
      await ctx.db.insert('customerRequestPreparedActions', { ...args.preparedAction, preparationScope: args.preparationScope, recordedAt: args.completedAt })
    }
    await ctx.db.patch(command._id, {
      status: 'prepared', preparedActionId: args.preparedAction.preparedActionId,
      completedAt: args.completedAt, leaseExpiresAt: args.completedAt,
    })
    return args.preparedAction
  },
})

export const refusePreparation = internalMutation({
  args: { preparationScope: v.string(), claimToken: v.string(), reason: preparationRefusalReason, completedAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const command = await ctx.db.query('customerRequestPreparationCommands').withIndex('by_preparationScope', (query) => query.eq('preparationScope', args.preparationScope)).unique()
    if (command === null) throw new Error('preparation_claim_not_found')
    if (command.status === 'refused' && command.refusalReason === args.reason) return null
    if (command.status !== 'claimed' || command.claimToken !== args.claimToken) throw new Error('preparation_claim_lost')
    await ctx.db.patch(command._id, { status: 'refused', refusalReason: args.reason, completedAt: args.completedAt, leaseExpiresAt: args.completedAt })
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
    if (existing.status === 'refused' && existing.refusalReason !== undefined) return { kind: 'refused', reason: existing.refusalReason }
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
