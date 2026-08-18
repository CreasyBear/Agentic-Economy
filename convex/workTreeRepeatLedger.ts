import { mutation, query, type MutationCtx } from './_generated/server'
import { v } from 'convex/values'

import { type ExactAmount } from '../src/modules/money/public'
import { unlistedWorkTreeTables } from './customerRequestUnlisted'

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

export const reserveRepeatUse = mutation({
  args: reserveArgs,
  handler: async () => ({ kind: 'refused' as const, code: 'work_tree_tables_unlisted' }),
})

export const finalizeRepeatUse = mutation({
  args: finalizeArgs,
  handler: async () => ({ kind: 'refused' as const, code: 'work_tree_tables_unlisted' }),
})

export const reconcileRepeatUse = mutation({
  args: reconcileArgs,
  handler: async () => ({ kind: 'refused' as const, code: 'work_tree_tables_unlisted' }),
})

export const inspectRepeatUse = query({
  args: { useRef: v.string(), serviceAuth: v.optional(serviceAuthArg) },
  handler: async () => ({ kind: 'refused' as const, code: 'not_found' }),
})

/** Source decision seam: only an accepted eligible decision may call this helper. */
export async function persistWorkTreeRepeatPermission(
  _ctx: Pick<MutationCtx, 'db'>,
  _input: RepeatPermissionPersistenceInput,
): Promise<Readonly<{ permissionRef: string; permissionDigest: string; replayed: boolean }>> {
  return unlistedWorkTreeTables()
}
