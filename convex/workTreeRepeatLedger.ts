import { mutation, query, type MutationCtx, type QueryCtx, env } from './_generated/server'
import type { Doc } from './_generated/dataModel'
import { v } from 'convex/values'

import {
  verifyCustomerRequestServiceAssertion,
  type CustomerRequestServiceAssertion,
} from '../src/modules/customer-request/service-auth-envelope'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import { evaluateLiveMoneyGate } from '../src/modules/money/public'
import {
  repeatFinalizationDigest,
  repeatPermissionDigest,
  repeatReservationDigest,
  type WorkTreeRepeatFinalizeInput,
  type WorkTreeRepeatReconcileInput,
  type WorkTreeRepeatReserveInput,
} from '../src/modules/work-tree/public'
const moneyArg = v.object({ currency: v.string(), amountMinor: v.number() })

const serviceAuthArg = v.object({
  principalId: v.string(),
  ownerId: v.string(),
  credentialId: v.string(),
  scopes: v.array(v.string()),
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
  perUseSpend: Readonly<{ currency: string; amountMinor: number }>
  cumulativeSpend: Readonly<{ currency: string; amountMinor: number }>
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
    perUseSpendMinor: input.perUseSpend.amountMinor,
    cumulativeSpendCurrency: input.cumulativeSpend.currency,
    cumulativeSpendMinor: input.cumulativeSpend.amountMinor,
    occurrenceLimit: input.occurrenceLimit,
    perUseDataAllocations: input.perUseDataAllocations,
    cumulativeDataAllocations: input.cumulativeDataAllocations,
    reservedDataAllocations: 0,
    settledDataAllocations: 0,
    reservedOccurrences: 0,
    settledOccurrences: 0,
    reservedSpendMinor: 0,
    settledSpendMinor: 0,
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
    || !validInteger(args.requestedSpend.amountMinor) || args.requestedSpend.amountMinor < 0
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
  if (args.requestedSpend.currency !== permission.perUseSpendCurrency
    || args.requestedSpend.currency !== permission.cumulativeSpendCurrency) return refusal('invalid_amount')
  if (args.requestedSpend.amountMinor > permission.perUseSpendMinor
    || args.requestedSpend.amountMinor > permission.cumulativeSpendMinor - permission.reservedSpendMinor - permission.settledSpendMinor) return refusal('limit_exceeded')
  if (args.requestedDataAllocations > permission.perUseDataAllocations
    || args.requestedDataAllocations > permission.cumulativeDataAllocations - permission.reservedDataAllocations - permission.settledDataAllocations) return refusal('limit_exceeded')
  if (args.requestedSpend.amountMinor > 0) {
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
    requestedSpendMinor: args.requestedSpend.amountMinor,
    requestedDataAllocations: args.requestedDataAllocations,
    reservedDataAllocations: args.requestedDataAllocations,
    reservedSpendMinor: args.requestedSpend.amountMinor,
    state: 'reserved',
    finalizeOperationKey: null,
    finalizeCommandDigest: null,
    finalizeReceiptState: null,
    finalizeReleasedOccurrences: null,
    finalizeReleasedSpendMinor: null,
    finalizeReleasedDataAllocations: null,
    finalizeHeldSpendMinor: null,
    finalizeHeldDataAllocations: null,
    releasedOccurrences: 0,
    releasedDataAllocations: 0,
    releasedSpendMinor: 0,
    createdAt: nowMs,
    updatedAt: nowMs,
  })
  await ctx.db.patch(permission._id, {
    reservedOccurrences: permission.reservedOccurrences + args.requestedOccurrences,
    reservedSpendMinor: permission.reservedSpendMinor + args.requestedSpend.amountMinor,
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
  if (args.outcome === 'unknown') {
    const now = Date.now()
    await ctx.db.patch(use._id, {
      state: 'unknown',
      finalizeOperationKey: args.operationKey,
      finalizeCommandDigest: commandDigest,
      finalizeReceiptState: 'unknown',
      finalizeReleasedOccurrences: 0,
      finalizeReleasedDataAllocations: 0,
      finalizeReleasedSpendMinor: 0,
      finalizeHeldDataAllocations: use.reservedDataAllocations,
      finalizeHeldSpendMinor: use.reservedSpendMinor,
      updatedAt: now,
    })
    return {
      kind: 'unknown' as const,
      useRef: use.useRef,
      operationKey: args.operationKey,
      state: 'unknown' as const,
      releasedOccurrences: 0,
      releasedDataAllocations: 0,
      releasedSpendMinor: 0,
      heldDataAllocations: use.reservedDataAllocations,
      heldSpendMinor: use.reservedSpendMinor,
    }
  }
  if (args.actualSpend === undefined || !validInteger(args.actualSpend.amountMinor) || args.actualSpend.amountMinor < 0
    || args.actualSpend.currency !== use.requestedSpendCurrency || args.actualSpend.amountMinor > use.reservedSpendMinor
    || args.actualDataAllocations === undefined || !validInteger(args.actualDataAllocations)
    || args.actualDataAllocations < 0 || args.actualDataAllocations > use.reservedDataAllocations) return refusal('invalid_amount', use.useRef)
  return await settleUse(ctx, use, args.operationKey, commandDigest, args.actualOccurrences, args.actualSpend, args.actualDataAllocations, 'settled', 'finalize')
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
  if (args.outcome === 'not_settled' && (
    args.actualOccurrences !== 0
    || (args.actualSpend !== undefined && (
      args.actualSpend.currency !== use.requestedSpendCurrency
      || args.actualSpend.amountMinor !== 0
    ))
    || (args.actualDataAllocations !== undefined && args.actualDataAllocations !== 0)
  )) return refusal('invalid_request', use.useRef)
  const actualSpend = args.outcome === 'not_settled' ? { currency: use.requestedSpendCurrency, amountMinor: 0 } : args.actualSpend
  const actualDataAllocations = args.outcome === 'not_settled' ? 0 : args.actualDataAllocations
  if (actualSpend === undefined || !validInteger(actualSpend.amountMinor) || actualSpend.amountMinor < 0
    || actualSpend.currency !== use.requestedSpendCurrency || actualSpend.amountMinor > use.reservedSpendMinor
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
  actualSpend: { currency: string; amountMinor: number },
  actualDataAllocations: number,
  state: 'settled' | 'not_settled',
  operationKind: 'finalize' | 'reconcile',
) {
  const permission = await ctx.db.query('workTreeRepeatPermissions')
    .withIndex('by_permissionRef', (query) => query.eq('permissionRef', use.permissionRef))
    .unique()
  if (permission === null) return refusal('not_found', use.useRef)
  const releasedOccurrences = use.reservedOccurrences - actualOccurrences
  const releasedSpendMinor = use.reservedSpendMinor - actualSpend.amountMinor
  const releasedDataAllocations = use.reservedDataAllocations - actualDataAllocations
  const now = Date.now()
  await ctx.db.patch(use._id, {
    state,
    actualOccurrences,
    actualSpendCurrency: actualSpend.currency,
    actualSpendMinor: actualSpend.amountMinor,
    actualDataAllocations,
    reservedOccurrences: 0,
    reservedSpendMinor: 0,
    reservedDataAllocations: 0,
    releasedOccurrences,
    releasedSpendMinor,
    releasedDataAllocations,
    ...(operationKind === 'finalize'
      ? {
        finalizeOperationKey: operationKey,
        finalizeCommandDigest: commandDigest,
        finalizeReceiptState: state,
        finalizeReleasedOccurrences: releasedOccurrences,
        finalizeReleasedSpendMinor: releasedSpendMinor,
        finalizeReleasedDataAllocations: releasedDataAllocations,
        finalizeHeldSpendMinor: 0,
        finalizeHeldDataAllocations: 0,
      }
      : { reconcileOperationKey: operationKey, reconcileCommandDigest: commandDigest }),
    updatedAt: now,
  })
  await ctx.db.patch(permission._id, {
    reservedOccurrences: permission.reservedOccurrences - use.reservedOccurrences,
    reservedSpendMinor: permission.reservedSpendMinor - use.reservedSpendMinor,
    reservedDataAllocations: permission.reservedDataAllocations - use.reservedDataAllocations,
    settledOccurrences: permission.settledOccurrences + actualOccurrences,
    settledSpendMinor: permission.settledSpendMinor + actualSpend.amountMinor,
    settledDataAllocations: permission.settledDataAllocations + actualDataAllocations,
  })
  return {
    kind: 'accepted' as const,
    useRef: use.useRef,
    operationKey,
    ...(operationKind === 'reconcile' ? { reconcileOperationKey: operationKey } : {}),
    state,
    releasedOccurrences,
    releasedDataAllocations,
    releasedSpendMinor,
    ...(operationKind === 'finalize' ? { heldDataAllocations: 0, heldSpendMinor: 0 } : {}),
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
      requestedSpend: { currency: use.requestedSpendCurrency, amountMinor: use.requestedSpendMinor },
      requestedDataAllocations: use.requestedDataAllocations,
      reservedOccurrences: use.reservedOccurrences,
      reservedSpend: { currency: use.requestedSpendCurrency, amountMinor: use.reservedSpendMinor },
      reservedDataAllocations: use.reservedDataAllocations,
      state: use.state,
      ...(use.actualOccurrences === undefined ? {} : { actualOccurrences: use.actualOccurrences }),
      ...(use.actualSpendMinor === undefined ? {} : {
        actualSpend: {
          currency: use.actualSpendCurrency ?? use.requestedSpendCurrency,
          amountMinor: use.actualSpendMinor,
        },
      }),
      ...(use.actualDataAllocations === undefined ? {} : { actualDataAllocations: use.actualDataAllocations }),
      releasedOccurrences: use.releasedOccurrences,
      releasedSpendMinor: use.releasedSpendMinor,
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
      perUseSpend: { currency: permission.perUseSpendCurrency, amountMinor: permission.perUseSpendMinor },
      cumulativeSpend: { currency: permission.cumulativeSpendCurrency, amountMinor: permission.cumulativeSpendMinor },
      occurrenceLimit: permission.occurrenceLimit,
      perUseDataAllocations: permission.perUseDataAllocations,
      cumulativeDataAllocations: permission.cumulativeDataAllocations,
      reservedDataAllocations: permission.reservedDataAllocations,
      settledDataAllocations: permission.settledDataAllocations,
      reservedOccurrences: permission.reservedOccurrences,
      settledOccurrences: permission.settledOccurrences,
      reservedSpend: { currency: permission.cumulativeSpendCurrency, amountMinor: permission.reservedSpendMinor },
      settledSpend: { currency: permission.cumulativeSpendCurrency, amountMinor: permission.settledSpendMinor },
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
    reservedSpend: { currency: use.requestedSpendCurrency, amountMinor: use.requestedSpendMinor },
  }
}

function finalReceipt(use: RepeatUse, kind: 'replayed', operationKind: 'finalize' | 'reconcile') {
  if (operationKind === 'finalize') {
    if (use.finalizeOperationKey === null
      || use.finalizeCommandDigest === null
      || use.finalizeReceiptState === null
      || use.finalizeReleasedOccurrences === null
      || use.finalizeReleasedDataAllocations === null
      || use.finalizeReleasedSpendMinor === null
      || use.finalizeHeldDataAllocations === null
      || use.finalizeHeldSpendMinor === null) {
      throw new Error('repeat_finalization_receipt_missing')
    }
    return {
      kind,
      useRef: use.useRef,
      operationKey: use.finalizeOperationKey,
      state: use.finalizeReceiptState,
      releasedOccurrences: use.finalizeReleasedOccurrences,
      releasedDataAllocations: use.finalizeReleasedDataAllocations,
      releasedSpendMinor: use.finalizeReleasedSpendMinor,
      heldDataAllocations: use.finalizeHeldDataAllocations,
      heldSpendMinor: use.finalizeHeldSpendMinor,
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
    releasedDataAllocations: use.releasedDataAllocations,
    releasedSpendMinor: use.releasedSpendMinor,
    ...(use.state === 'unknown'
      ? { heldDataAllocations: use.reservedDataAllocations, heldSpendMinor: use.reservedSpendMinor }
      : {}),
  }
}

function validInteger(value: number): boolean { return Number.isSafeInteger(value) }
