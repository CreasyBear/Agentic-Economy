import { mutation, query, type MutationCtx, type QueryCtx, env } from './_generated/server'
import type { Doc } from './_generated/dataModel'
import { v } from 'convex/values'

import {
  verifyCustomerRequestServiceAssertion,
  type CustomerRequestServiceAssertion,
} from '../src/modules/agent-access/service-auth-envelope'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import {
  addExactAmounts,
  compareExactAmounts,
  evaluateLiveMoneyGate,
  subtractExactAmounts,
  type ExactAmount,
} from '../src/modules/money/public'
import {
  repeatFinalizationDigest,
  repeatPermissionDigest,
  repeatReservationDigest,
  type WorkTreeRepeatFinalizeInput,
  type WorkTreeRepeatReconcileInput,
  type WorkTreeRepeatReserveInput,
} from '../src/modules/work-tree/public'
const moneyArg = v.object({ currency: v.string(), units: v.string(), exponent: v.number() })

const serviceAuthArg = v.object({
  principalId: v.string(),
  ownerId: v.string(),
  credentialId: v.string(),
  scopes: v.array(v.string()),
  authorityMode: v.optional(v.union(v.literal('inspect_only'), v.literal('approve_each'), v.literal('bounded_mandate'), v.literal('full_yolo'))),
  issuedAt: v.number(),
  signature: v.string(),
})
const reserveArgs = {
  projectId: v.string(),
  permissionRef: v.string(),
  operationKey: v.string(),
  requestedOccurrences: v.number(),
  requestedSpend: moneyArg,
  requestedDataAllocations: v.number(),
  serviceAuth: v.optional(serviceAuthArg),
}
const finalizeArgs = {
  useRef: v.string(),
  operationKey: v.string(),
  actualOccurrences: v.number(),
  actualSpend: v.optional(moneyArg),
  actualDataAllocations: v.optional(v.number()),
  outcome: v.union(v.literal('settled'), v.literal('unknown')),
  serviceAuth: v.optional(serviceAuthArg),
}
const reconcileArgs = {
  useRef: v.string(),
  operationKey: v.string(),
  actualOccurrences: v.number(),
  actualSpend: v.optional(moneyArg),
  actualDataAllocations: v.optional(v.number()),
  outcome: v.union(v.literal('settled'), v.literal('not_settled')),
  serviceAuth: v.optional(serviceAuthArg),
}

type RepeatUse = Doc<'workTreeRepeatUses'>
type RepeatPermission = Doc<'workTreeRepeatPermissions'>
type RepeatPermissionPersistenceInput = Readonly<{
  projectId: string
  treeId: string
  ownerId: string
  principalId: string
  nodeId: string
  generation: number
  revision: number
  proposalDigest: string
  delegatedCredentialId: string
  validFrom: number
  validUntil: number
  perUseSpend: ExactAmount
  cumulativeSpend: ExactAmount
  occurrenceLimit: number
  perUseDataAllocations: number
  cumulativeDataAllocations: number
  sourceReceiptId: string
}>

const refusal = (reason: string, useRef?: string) => ({
  kind: 'refused' as const,
  reason,
  ...(useRef === undefined ? {} : { useRef }),
})
const conflict = (operationKey: string, useRef?: string) => ({
  kind: 'conflict' as const,
  operationKey,
  ...(useRef === undefined ? {} : { useRef }),
})

export const reserveRepeatUse = mutation({
  args: reserveArgs,
  handler: async (ctx, args) => {
    const actor = await resolveRepeatActor(ctx, 'workTree.reserveRepeatUse', args, args.serviceAuth)
    if (actor === null) return refusal('authentication_required')
    const { serviceAuth: _serviceAuth, ...command } = args
    return reserve(ctx, command, actor)
  },
})

export const finalizeRepeatUse = mutation({
  args: finalizeArgs,
  handler: async (ctx, args) => {
    const actor = await resolveRepeatActor(ctx, 'workTree.finalizeRepeatUse', args, args.serviceAuth)
    if (actor === null) return refusal('authentication_required', args.useRef)
    const { serviceAuth: _serviceAuth, ...command } = args
    return finalize(ctx, command, actor)
  },
})

export const reconcileRepeatUse = mutation({
  args: reconcileArgs,
  handler: async (ctx, args) => {
    const actor = await resolveRepeatActor(ctx, 'workTree.reconcileRepeatUse', args, args.serviceAuth)
    if (actor === null) return refusal('authentication_required', args.useRef)
    const { serviceAuth: _serviceAuth, ...command } = args
    return reconcile(ctx, command, actor)
  },
})

export const inspectRepeatUse = query({
  args: { useRef: v.string(), serviceAuth: v.optional(serviceAuthArg) },
  handler: async (ctx, args) => {
    const actor = await resolveRepeatActor(ctx, 'workTree.inspectRepeatUse', args, args.serviceAuth)
    if (actor === null) return refusal('authentication_required', args.useRef)
    return inspect(ctx, args.useRef, actor)
  },
})

/** Source decision seam: only an accepted eligible decision may call this helper. */
export async function persistWorkTreeRepeatPermission(
  ctx: Pick<MutationCtx, 'db'>,
  input: RepeatPermissionPersistenceInput,
): Promise<Readonly<{ permissionRef: string; permissionDigest: string; replayed: boolean }>> {
  const permissionDigest = repeatPermissionDigest(input)
  const permissionRef = `repeat-permission:${permissionDigest}`
  const existing = await ctx.db.query('workTreeRepeatPermissions')
    .withIndex('by_permissionRef', (query) => query.eq('permissionRef', permissionRef))
    .unique()
  if (existing !== null) {
    if (existing.permissionDigest !== permissionDigest) throw new Error('repeat_permission_conflict')
    return { permissionRef, permissionDigest, replayed: true }
  }
  await ctx.db.insert('workTreeRepeatPermissions', {
    permissionRef,
    permissionDigest,
    projectId: input.projectId,
    treeId: input.treeId,
    ownerId: input.ownerId,
    principalId: input.principalId,
    nodeId: input.nodeId,
    generation: input.generation,
    revision: input.revision,
    proposalDigest: input.proposalDigest,
    delegatedCredentialId: input.delegatedCredentialId,
    validFrom: input.validFrom,
    validUntil: input.validUntil,
    perUseSpendCurrency: input.perUseSpend.currency,
    perUseSpendUnits: input.perUseSpend.units,
    perUseSpendExponent: input.perUseSpend.exponent,
    cumulativeSpendCurrency: input.cumulativeSpend.currency,
    cumulativeSpendUnits: input.cumulativeSpend.units,
    cumulativeSpendExponent: input.cumulativeSpend.exponent,
    occurrenceLimit: input.occurrenceLimit,
    perUseDataAllocations: input.perUseDataAllocations,
    cumulativeDataAllocations: input.cumulativeDataAllocations,
    reservedDataAllocations: 0,
    settledDataAllocations: 0,
    reservedOccurrences: 0,
    settledOccurrences: 0,
    reservedSpendCurrency: input.cumulativeSpend.currency,
    reservedSpendUnits: '0',
    reservedSpendExponent: input.cumulativeSpend.exponent,
    settledSpendCurrency: input.cumulativeSpend.currency,
    settledSpendUnits: '0',
    settledSpendExponent: input.cumulativeSpend.exponent,
    status: 'active',
    issuedAt: Date.now(),
    sourceReceiptId: input.sourceReceiptId,
  })
  return { permissionRef, permissionDigest, replayed: false }
}

async function reserve(ctx: MutationCtx, args: WorkTreeRepeatReserveInput, actor: RepeatActor) {
  const commandDigest = repeatReservationDigest(args, actor.principalId)
  const existing = await ctx.db.query('workTreeRepeatUses')
    .withIndex('by_operationKey', (query) => query.eq('operationKey', args.operationKey))
    .unique()
  if (existing !== null) {
    if (existing.ownerId !== actor.ownerId || existing.delegatedCredentialId !== actor.credentialId) return refusal('forbidden', existing.useRef)
    return existing.reservationCommandDigest === commandDigest
      ? reservationReceipt(existing, 'replayed')
      : conflict(args.operationKey, existing.useRef)
  }
  if (!validInteger(args.requestedOccurrences) || args.requestedOccurrences <= 0
    || !isValidExactAmount(args.requestedSpend)
    || !validInteger(args.requestedDataAllocations) || args.requestedDataAllocations < 0) return refusal('invalid_amount')
  const tree = await ctx.db.query('workTrees')
    .withIndex('by_projectId', (query) => query.eq('projectId', args.projectId))
    .unique()
  if (tree === null) return refusal('not_found')
  if (tree.ownerId !== actor.ownerId) return refusal('forbidden')
  const permission = await ctx.db.query('workTreeRepeatPermissions')
    .withIndex('by_permissionRef', (query) => query.eq('permissionRef', args.permissionRef))
    .unique()
  if (permission === null || permission.projectId !== args.projectId) return refusal('not_found')
  if (permission.ownerId !== actor.ownerId) return refusal('forbidden')
  if (permission.delegatedCredentialId !== actor.credentialId) return refusal('credential_mismatch')
  if (permission.status !== 'active') return refusal('permission_revoked')
  const now = Date.now()
  if (now < permission.validFrom || now >= permission.validUntil) return refusal('permission_expired')
  if (tree.generation !== permission.generation || tree.revision !== permission.revision) return refusal('fence_mismatch')
  if (args.requestedOccurrences > permission.occurrenceLimit - permission.reservedOccurrences - permission.settledOccurrences) return refusal('limit_exceeded')
  const requestedVsPerUse = compareExactAmounts(args.requestedSpend, permissionSpend(permission, 'perUse'))
  const consumedSpend = addExactAmounts(permissionSpend(permission, 'reserved'), permissionSpend(permission, 'settled'))
  const remainingSpend = consumedSpend === undefined
    ? undefined
    : subtractExactAmounts(permissionSpend(permission, 'cumulative'), consumedSpend)
  const requestedVsRemaining = remainingSpend === undefined
    ? undefined
    : compareExactAmounts(args.requestedSpend, remainingSpend)
  if (requestedVsPerUse === undefined || requestedVsRemaining === undefined) return refusal('invalid_amount')
  if (requestedVsPerUse > 0 || requestedVsRemaining > 0) return refusal('limit_exceeded')
  if (args.requestedDataAllocations > permission.perUseDataAllocations
    || args.requestedDataAllocations > permission.cumulativeDataAllocations - permission.reservedDataAllocations - permission.settledDataAllocations) return refusal('limit_exceeded')
  const nextReservedSpend = addExactAmounts(permissionSpend(permission, 'reserved'), args.requestedSpend)
  if (nextReservedSpend === undefined) return refusal('invalid_amount')
  const requestedIsPositive = compareExactAmounts(args.requestedSpend, zeroAmountLike(args.requestedSpend))
  if (requestedIsPositive === undefined) return refusal('invalid_amount')
  if (requestedIsPositive > 0) {
    const gate = evaluateLiveMoneyGate()
    if (gate.kind === 'refused') return refusal(gate.code)
  }
  const useRef = `repeat-use:${canonicalDigest({ permissionRef: args.permissionRef, operationKey: args.operationKey, commandDigest })}`
  const nowMs = Date.now()
  await ctx.db.insert('workTreeRepeatUses', {
    useRef,
    permissionRef: args.permissionRef,
    projectId: permission.projectId,
    treeId: permission.treeId,
    ownerId: permission.ownerId,
    principalId: actor.principalId,
    nodeId: permission.nodeId,
    generation: permission.generation,
    revision: permission.revision,
    proposalDigest: permission.proposalDigest,
    delegatedCredentialId: permission.delegatedCredentialId,
    operationKey: args.operationKey,
    reservationCommandDigest: commandDigest,
    requestedOccurrences: args.requestedOccurrences,
    reservedOccurrences: args.requestedOccurrences,
    requestedSpendCurrency: args.requestedSpend.currency,
    requestedSpendUnits: args.requestedSpend.units,
    requestedSpendExponent: args.requestedSpend.exponent,
    requestedDataAllocations: args.requestedDataAllocations,
    reservedDataAllocations: args.requestedDataAllocations,
    reservedSpendCurrency: args.requestedSpend.currency,
    reservedSpendUnits: args.requestedSpend.units,
    reservedSpendExponent: args.requestedSpend.exponent,
    state: 'reserved',
    finalizeOperationKey: null,
    finalizeCommandDigest: null,
    finalizeReceiptState: null,
    finalizeReleasedOccurrences: null,
    finalizeReleasedSpendCurrency: null,
    finalizeReleasedSpendUnits: null,
    finalizeReleasedSpendExponent: null,
    finalizeReleasedDataAllocations: null,
    finalizeHeldSpendCurrency: null,
    finalizeHeldSpendUnits: null,
    finalizeHeldSpendExponent: null,
    finalizeHeldDataAllocations: null,
    releasedOccurrences: 0,
    releasedSpendCurrency: args.requestedSpend.currency,
    releasedSpendUnits: '0',
    releasedSpendExponent: args.requestedSpend.exponent,
    releasedDataAllocations: 0,
    createdAt: nowMs,
    updatedAt: nowMs,
  })
  await ctx.db.patch(permission._id, {
    reservedOccurrences: permission.reservedOccurrences + args.requestedOccurrences,
    reservedSpendCurrency: nextReservedSpend.currency,
    reservedSpendUnits: nextReservedSpend.units,
    reservedSpendExponent: nextReservedSpend.exponent,
    reservedDataAllocations: permission.reservedDataAllocations + args.requestedDataAllocations,
  })
  return {
    kind: 'accepted' as const,
    useRef,
    permissionRef: args.permissionRef,
    operationKey: args.operationKey,
    state: 'reserved' as const,
    reservedOccurrences: args.requestedOccurrences,
    reservedDataAllocations: args.requestedDataAllocations,
    reservedSpend: args.requestedSpend,
  }
}

async function finalize(ctx: MutationCtx, args: WorkTreeRepeatFinalizeInput, actor: RepeatActor) {
  const use = await ctx.db.query('workTreeRepeatUses')
    .withIndex('by_useRef', (query) => query.eq('useRef', args.useRef))
    .unique()
  if (use === null) return refusal('not_found', args.useRef)
  if (use.ownerId !== actor.ownerId || use.delegatedCredentialId !== actor.credentialId) return refusal('forbidden', use.useRef)
  const commandDigest = repeatFinalizationDigest(args)
  if (use.finalizeOperationKey !== null) {
    return use.finalizeOperationKey === args.operationKey && use.finalizeCommandDigest === commandDigest
      ? finalReceipt(use, 'replayed', 'finalize')
      : conflict(args.operationKey, use.useRef)
  }
  if (use.state !== 'reserved') return refusal('already_finalized', use.useRef)
  if (!validInteger(args.actualOccurrences) || args.actualOccurrences < 0 || args.actualOccurrences > use.reservedOccurrences) return refusal('invalid_amount', use.useRef)
  const reservedSpend = useSpend(use, 'reserved')
  if (args.outcome === 'unknown') {
    const releasedSpend = zeroAmountLike(reservedSpend)
    const now = Date.now()
    await ctx.db.patch(use._id, {
      state: 'unknown',
      finalizeOperationKey: args.operationKey,
      finalizeCommandDigest: commandDigest,
      finalizeReceiptState: 'unknown',
      finalizeReleasedOccurrences: 0,
      finalizeReleasedSpendCurrency: releasedSpend.currency,
      finalizeReleasedSpendUnits: releasedSpend.units,
      finalizeReleasedSpendExponent: releasedSpend.exponent,
      finalizeReleasedDataAllocations: 0,
      finalizeHeldSpendCurrency: reservedSpend.currency,
      finalizeHeldSpendUnits: reservedSpend.units,
      finalizeHeldSpendExponent: reservedSpend.exponent,
      finalizeHeldDataAllocations: use.reservedDataAllocations,
      updatedAt: now,
    })
    return {
      kind: 'unknown' as const,
      useRef: use.useRef,
      operationKey: args.operationKey,
      state: 'unknown' as const,
      releasedOccurrences: 0,
      releasedSpend,
      releasedDataAllocations: 0,
      heldSpend: reservedSpend,
      heldDataAllocations: use.reservedDataAllocations,
    }
  }
  if (args.actualSpend === undefined || !isValidExactAmount(args.actualSpend)) return refusal('invalid_amount', use.useRef)
  const actualSpend = args.actualSpend
  const actualVsReserved = compareExactAmounts(actualSpend, reservedSpend)
  if (actualVsReserved === undefined || actualVsReserved > 0
    || args.actualDataAllocations === undefined || !validInteger(args.actualDataAllocations)
    || args.actualDataAllocations < 0 || args.actualDataAllocations > use.reservedDataAllocations) return refusal('invalid_amount', use.useRef)
  return await settleUse(ctx, use, args.operationKey, commandDigest, args.actualOccurrences, actualSpend, args.actualDataAllocations, 'settled', 'finalize')
}

async function reconcile(ctx: MutationCtx, args: WorkTreeRepeatReconcileInput, actor: RepeatActor) {
  const use = await ctx.db.query('workTreeRepeatUses')
    .withIndex('by_useRef', (query) => query.eq('useRef', args.useRef))
    .unique()
  if (use === null) return refusal('not_found', args.useRef)
  if (use.ownerId !== actor.ownerId || use.delegatedCredentialId !== actor.credentialId) return refusal('forbidden', use.useRef)
  const commandDigest = repeatFinalizationDigest(args)
  if (use.reconcileOperationKey !== undefined) {
    return use.reconcileOperationKey === args.operationKey && use.reconcileCommandDigest === commandDigest
      ? finalReceipt(use, 'replayed', 'reconcile')
      : conflict(args.operationKey, use.useRef)
  }
  if (use.state !== 'unknown') return refusal('not_reconcilable', use.useRef)
  if (!validInteger(args.actualOccurrences) || args.actualOccurrences < 0 || args.actualOccurrences > use.reservedOccurrences) return refusal('invalid_amount', use.useRef)
  const requestedSpend = useSpend(use, 'requested')
  const reservedSpend = useSpend(use, 'reserved')
  if (args.outcome === 'not_settled' && (
    args.actualOccurrences !== 0
    || (args.actualSpend !== undefined && (
      !isValidExactAmount(args.actualSpend)
      || compareExactAmounts(args.actualSpend, zeroAmountLike(requestedSpend)) !== 0
    ))
    || (args.actualDataAllocations !== undefined && args.actualDataAllocations !== 0)
  )) return refusal('invalid_request', use.useRef)
  const actualSpend = args.outcome === 'not_settled' ? zeroAmountLike(requestedSpend) : args.actualSpend
  const actualDataAllocations = args.outcome === 'not_settled' ? 0 : args.actualDataAllocations
  const actualVsReserved = actualSpend === undefined || !isValidExactAmount(actualSpend)
    ? undefined
    : compareExactAmounts(actualSpend, reservedSpend)
  if (actualSpend === undefined || actualVsReserved === undefined || actualVsReserved > 0
    || actualDataAllocations === undefined || !validInteger(actualDataAllocations)
    || actualDataAllocations < 0 || actualDataAllocations > use.reservedDataAllocations) return refusal('invalid_amount', use.useRef)
  return await settleUse(ctx, use, args.operationKey, commandDigest, args.outcome === 'not_settled' ? 0 : args.actualOccurrences, actualSpend, actualDataAllocations, args.outcome, 'reconcile')
}

async function settleUse(
  ctx: MutationCtx,
  use: RepeatUse,
  operationKey: string,
  commandDigest: string,
  actualOccurrences: number,
  actualSpend: ExactAmount,
  actualDataAllocations: number,
  state: 'settled' | 'not_settled',
  operationKind: 'finalize' | 'reconcile',
) {
  const permission = await ctx.db.query('workTreeRepeatPermissions')
    .withIndex('by_permissionRef', (query) => query.eq('permissionRef', use.permissionRef))
    .unique()
  if (permission === null) return refusal('not_found', use.useRef)
  const reservedSpend = useSpend(use, 'reserved')
  const releasedSpend = subtractExactAmounts(reservedSpend, actualSpend)
  const nextReservedSpend = subtractExactAmounts(permissionSpend(permission, 'reserved'), reservedSpend)
  const nextSettledSpend = addExactAmounts(permissionSpend(permission, 'settled'), actualSpend)
  if (releasedSpend === undefined || nextReservedSpend === undefined || nextSettledSpend === undefined) {
    return refusal('invalid_amount', use.useRef)
  }
  const releasedOccurrences = use.reservedOccurrences - actualOccurrences
  const releasedDataAllocations = use.reservedDataAllocations - actualDataAllocations
  const now = Date.now()
  await ctx.db.patch(use._id, {
    state,
    actualOccurrences,
    actualSpendCurrency: actualSpend.currency,
    actualSpendUnits: actualSpend.units,
    actualSpendExponent: actualSpend.exponent,
    actualDataAllocations,
    reservedOccurrences: 0,
    reservedSpendCurrency: reservedSpend.currency,
    reservedSpendUnits: '0',
    reservedSpendExponent: reservedSpend.exponent,
    reservedDataAllocations: 0,
    releasedOccurrences,
    releasedSpendCurrency: releasedSpend.currency,
    releasedSpendUnits: releasedSpend.units,
    releasedSpendExponent: releasedSpend.exponent,
    releasedDataAllocations,
    ...(operationKind === 'finalize'
      ? {
        finalizeOperationKey: operationKey,
        finalizeCommandDigest: commandDigest,
        finalizeReceiptState: state,
        finalizeReleasedOccurrences: releasedOccurrences,
        finalizeReleasedSpendCurrency: releasedSpend.currency,
        finalizeReleasedSpendUnits: releasedSpend.units,
        finalizeReleasedSpendExponent: releasedSpend.exponent,
        finalizeReleasedDataAllocations: releasedDataAllocations,
        finalizeHeldSpendCurrency: reservedSpend.currency,
        finalizeHeldSpendUnits: '0',
        finalizeHeldSpendExponent: reservedSpend.exponent,
        finalizeHeldDataAllocations: 0,
      }
      : { reconcileOperationKey: operationKey, reconcileCommandDigest: commandDigest }),
    updatedAt: now,
  })
  await ctx.db.patch(permission._id, {
    reservedOccurrences: permission.reservedOccurrences - use.reservedOccurrences,
    reservedSpendCurrency: nextReservedSpend.currency,
    reservedSpendUnits: nextReservedSpend.units,
    reservedSpendExponent: nextReservedSpend.exponent,
    reservedDataAllocations: permission.reservedDataAllocations - use.reservedDataAllocations,
    settledOccurrences: permission.settledOccurrences + actualOccurrences,
    settledSpendCurrency: nextSettledSpend.currency,
    settledSpendUnits: nextSettledSpend.units,
    settledSpendExponent: nextSettledSpend.exponent,
    settledDataAllocations: permission.settledDataAllocations + actualDataAllocations,
  })
  return {
    kind: 'accepted' as const,
    useRef: use.useRef,
    operationKey,
    ...(operationKind === 'reconcile' ? { reconcileOperationKey: operationKey } : {}),
    state,
    releasedOccurrences,
    releasedSpend,
    releasedDataAllocations,
    ...(operationKind === 'finalize'
      ? { heldSpend: zeroAmountLike(reservedSpend), heldDataAllocations: 0 }
      : {}),
  }
}

async function inspect(ctx: QueryCtx, useRef: string, actor: RepeatActor) {
  const use = await ctx.db.query('workTreeRepeatUses')
    .withIndex('by_useRef', (query) => query.eq('useRef', useRef))
    .unique()
  if (use === null) return refusal('not_found', useRef)
  if (use.ownerId !== actor.ownerId || use.delegatedCredentialId !== actor.credentialId) return refusal('forbidden', useRef)
  const permission = await ctx.db.query('workTreeRepeatPermissions')
    .withIndex('by_permissionRef', (query) => query.eq('permissionRef', use.permissionRef))
    .unique()
  if (permission === null) return refusal('not_found', useRef)
  const actualSpend = optionalExactAmount(use.actualSpendCurrency, use.actualSpendUnits, use.actualSpendExponent)
  return {
    kind: 'accepted' as const,
    use: {
      useRef: use.useRef,
      permissionRef: use.permissionRef,
      projectId: use.projectId,
      treeId: use.treeId,
      principalId: use.principalId,
      nodeId: use.nodeId,
      generation: use.generation,
      revision: use.revision,
      delegatedCredentialId: use.delegatedCredentialId,
      operationKey: use.operationKey,
      requestedOccurrences: use.requestedOccurrences,
      requestedSpend: useSpend(use, 'requested'),
      requestedDataAllocations: use.requestedDataAllocations,
      reservedOccurrences: use.reservedOccurrences,
      reservedSpend: useSpend(use, 'reserved'),
      reservedDataAllocations: use.reservedDataAllocations,
      state: use.state,
      ...(use.actualOccurrences === undefined ? {} : { actualOccurrences: use.actualOccurrences }),
      ...(actualSpend === undefined ? {} : { actualSpend }),
      ...(use.actualDataAllocations === undefined ? {} : { actualDataAllocations: use.actualDataAllocations }),
      releasedOccurrences: use.releasedOccurrences,
      releasedSpend: useSpend(use, 'released'),
      releasedDataAllocations: use.releasedDataAllocations,
      ...(use.finalizeOperationKey === null ? {} : { finalizeOperationKey: use.finalizeOperationKey }),
      ...(use.reconcileOperationKey === undefined ? {} : { reconcileOperationKey: use.reconcileOperationKey }),
    },
    permission: {
      permissionRef: permission.permissionRef,
      projectId: permission.projectId,
      treeId: permission.treeId,
      nodeId: permission.nodeId,
      generation: permission.generation,
      revision: permission.revision,
      delegatedCredentialId: permission.delegatedCredentialId,
      validFrom: permission.validFrom,
      validUntil: permission.validUntil,
      perUseSpend: permissionSpend(permission, 'perUse'),
      cumulativeSpend: permissionSpend(permission, 'cumulative'),
      occurrenceLimit: permission.occurrenceLimit,
      perUseDataAllocations: permission.perUseDataAllocations,
      cumulativeDataAllocations: permission.cumulativeDataAllocations,
      reservedDataAllocations: permission.reservedDataAllocations,
      settledDataAllocations: permission.settledDataAllocations,
      reservedOccurrences: permission.reservedOccurrences,
      settledOccurrences: permission.settledOccurrences,
      reservedSpend: permissionSpend(permission, 'reserved'),
      settledSpend: permissionSpend(permission, 'settled'),
      status: permission.status,
      issuedAt: permission.issuedAt,
      sourceReceiptId: permission.sourceReceiptId,
    },
  }
}

type RepeatActor = Readonly<{ ownerId: string; principalId: string; credentialId: string }>
const REPEAT_SCOPES: Readonly<Record<'workTree.reserveRepeatUse' | 'workTree.finalizeRepeatUse' | 'workTree.reconcileRepeatUse' | 'workTree.inspectRepeatUse', string>> = {
  'workTree.reserveRepeatUse': 'work_trees:repeat_reserve',
  'workTree.finalizeRepeatUse': 'work_trees:repeat_finalize',
  'workTree.reconcileRepeatUse': 'work_trees:repeat_reconcile',
  'workTree.inspectRepeatUse': 'work_trees:repeat_inspect',
}

async function resolveRepeatActor(
  ctx: Pick<QueryCtx, 'auth'>,
  operation: keyof typeof REPEAT_SCOPES,
  command: Record<string, unknown>,
  serviceAuth: CustomerRequestServiceAssertion | undefined,
): Promise<RepeatActor | null> {
  if (serviceAuth !== undefined) {
    if (!serviceAuth.scopes.includes(REPEAT_SCOPES[operation])) return null
    const key = env.AE_CONVEX_SERVER_FUNCTION_TOKEN?.trim()
    if (key === undefined || key.length < 32) return null
    const { serviceAuth: _serviceAuth, ...material } = command
    if (!await verifyCustomerRequestServiceAssertion({
      key,
      operation,
      command: material as never,
      assertion: serviceAuth,
    })) return null
    return {
      ownerId: serviceAuth.ownerId,
      principalId: serviceAuth.principalId,
      credentialId: serviceAuth.credentialId,
    }
  }
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null || typeof identity.tokenIdentifier !== 'string' || identity.tokenIdentifier.length === 0) return null
  const ownerId = typeof identity.subject === 'string' && identity.subject.length > 0 ? identity.subject : identity.tokenIdentifier
  return { ownerId, principalId: identity.tokenIdentifier, credentialId: identity.tokenIdentifier }
}

function reservationReceipt(use: RepeatUse, kind: 'accepted' | 'replayed') {
  return {
    kind,
    useRef: use.useRef,
    permissionRef: use.permissionRef,
    operationKey: use.operationKey,
    state: 'reserved' as const,
    reservedOccurrences: use.requestedOccurrences,
    reservedDataAllocations: use.requestedDataAllocations,
    reservedSpend: useSpend(use, 'requested'),
  }
}

function finalReceipt(use: RepeatUse, kind: 'replayed', operationKind: 'finalize' | 'reconcile') {
  if (operationKind === 'finalize') {
    const releasedSpend = nullableExactAmount(
      use.finalizeReleasedSpendCurrency,
      use.finalizeReleasedSpendUnits,
      use.finalizeReleasedSpendExponent,
    )
    const heldSpend = nullableExactAmount(
      use.finalizeHeldSpendCurrency,
      use.finalizeHeldSpendUnits,
      use.finalizeHeldSpendExponent,
    )
    if (use.finalizeOperationKey === null
      || use.finalizeCommandDigest === null
      || use.finalizeReceiptState === null
      || use.finalizeReleasedOccurrences === null
      || releasedSpend === undefined
      || use.finalizeReleasedDataAllocations === null
      || heldSpend === undefined
      || use.finalizeHeldDataAllocations === null) {
      throw new Error('repeat_finalization_receipt_missing')
    }
    return {
      kind,
      useRef: use.useRef,
      operationKey: use.finalizeOperationKey,
      state: use.finalizeReceiptState,
      releasedOccurrences: use.finalizeReleasedOccurrences,
      releasedSpend,
      releasedDataAllocations: use.finalizeReleasedDataAllocations,
      heldSpend,
      heldDataAllocations: use.finalizeHeldDataAllocations,
    }
  }
  if (use.reconcileOperationKey === undefined) throw new Error('repeat_reconcile_receipt_missing')
  return {
    kind,
    useRef: use.useRef,
    operationKey: use.reconcileOperationKey,
    reconcileOperationKey: use.reconcileOperationKey,
    state: use.state,
    releasedOccurrences: use.releasedOccurrences,
    releasedSpend: useSpend(use, 'released'),
    releasedDataAllocations: use.releasedDataAllocations,
    ...(use.state === 'unknown'
      ? { heldSpend: useSpend(use, 'reserved'), heldDataAllocations: use.reservedDataAllocations }
      : {}),
  }
}

function permissionSpend(permission: RepeatPermission, kind: 'perUse' | 'cumulative' | 'reserved' | 'settled'): ExactAmount {
  switch (kind) {
    case 'perUse':
      return {
        currency: permission.perUseSpendCurrency,
        units: permission.perUseSpendUnits,
        exponent: permission.perUseSpendExponent,
      }
    case 'cumulative':
      return {
        currency: permission.cumulativeSpendCurrency,
        units: permission.cumulativeSpendUnits,
        exponent: permission.cumulativeSpendExponent,
      }
    case 'reserved':
      return {
        currency: permission.reservedSpendCurrency,
        units: permission.reservedSpendUnits,
        exponent: permission.reservedSpendExponent,
      }
    case 'settled':
      return {
        currency: permission.settledSpendCurrency,
        units: permission.settledSpendUnits,
        exponent: permission.settledSpendExponent,
      }
  }
}

function useSpend(use: RepeatUse, kind: 'requested' | 'reserved' | 'released'): ExactAmount {
  switch (kind) {
    case 'requested':
      return {
        currency: use.requestedSpendCurrency,
        units: use.requestedSpendUnits,
        exponent: use.requestedSpendExponent,
      }
    case 'reserved':
      return {
        currency: use.reservedSpendCurrency,
        units: use.reservedSpendUnits,
        exponent: use.reservedSpendExponent,
      }
    case 'released':
      return {
        currency: use.releasedSpendCurrency,
        units: use.releasedSpendUnits,
        exponent: use.releasedSpendExponent,
      }
  }
}

function optionalExactAmount(
  currency: string | undefined,
  units: string | undefined,
  exponent: number | undefined,
): ExactAmount | undefined {
  if (currency === undefined && units === undefined && exponent === undefined) return undefined
  if (currency === undefined || units === undefined || exponent === undefined) {
    throw new Error('repeat_optional_spend_missing')
  }
  return { currency, units, exponent }
}

function nullableExactAmount(
  currency: string | null,
  units: string | null,
  exponent: number | null,
): ExactAmount | undefined {
  if (currency === null && units === null && exponent === null) return undefined
  if (currency === null || units === null || exponent === null) {
    throw new Error('repeat_finalization_spend_missing')
  }
  return { currency, units, exponent }
}

function isValidExactAmount(amount: ExactAmount): boolean {
  return compareExactAmounts(amount, amount) !== undefined
}

function zeroAmountLike(amount: ExactAmount): ExactAmount {
  return { currency: amount.currency, units: '0', exponent: amount.exponent }
}

function validInteger(value: number): boolean { return Number.isSafeInteger(value) }
