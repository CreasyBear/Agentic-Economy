import { v } from 'convex/values'

import type { Doc } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'

export const x402PaymentSettlementStatusValue = v.union(
  v.literal('settled'),
  v.literal('not_settled'),
  v.literal('unknown'),
)

export const x402PaymentEventArgs = {
  dispatchRef: v.string(),
  attemptRef: v.string(),
  effectGeneration: v.number(),
  paymentIdentifier: v.string(),
  challengeDigest: v.string(),
  scheme: v.string(),
  network: v.string(),
  asset: v.string(),
  payTo: v.string(),
  amountUnits: v.string(),
  currency: v.string(),
  exponent: v.number(),
  providerEndpoint: v.string(),
  custodyRef: v.string(),
  authorizationDigest: v.string(),
  settlementStatus: v.optional(x402PaymentSettlementStatusValue),
  settlementDigest: v.optional(v.string()),
}

export type AttemptRow = Doc<'moneyX402PaymentAttempts'>

export type EventArgs = {
  dispatchRef: string
  attemptRef: string
  effectGeneration: number
  paymentIdentifier: string
  challengeDigest: string
  scheme: string
  network: string
  asset: string
  payTo: string
  amountUnits: string
  currency: string
  exponent: number
  providerEndpoint: string
  custodyRef: string
  authorizationDigest: string
}

export function expectedCustodyGenerationMatches(
  row: AttemptRow,
  expected: number | undefined,
): boolean {
  const managedFields = [
    row.custodyBudgetRef,
    row.custodyGeneration,
    row.custodyDailyMaximumUnits,
  ]
  const managedCount = managedFields.filter((value) => value !== undefined).length
  if (managedCount === 0) return expected === undefined
  return managedCount === managedFields.length
    && expected !== undefined
    && expected === row.custodyGeneration
}

export async function loadByAttempt(
  ctx: QueryCtx | MutationCtx,
  attemptRef: string,
  effectGeneration: number,
): Promise<AttemptRow | null> {
  return await ctx.db.query('moneyX402PaymentAttempts')
    .withIndex('by_attemptRef_and_effectGeneration', (query) => (
      query.eq('attemptRef', attemptRef).eq('effectGeneration', effectGeneration)
    ))
    .unique()
}

export async function loadByCustody(
  ctx: QueryCtx | MutationCtx,
  custodyRef: string,
): Promise<AttemptRow | null> {
  return await ctx.db.query('moneyX402PaymentAttempts')
    .withIndex('by_custodyRef', (query) => query.eq('custodyRef', custodyRef))
    .unique()
}

export function eventAttributionValid(row: AttemptRow, args: EventArgs): boolean {
  return (
    row.dispatchRef === args.dispatchRef
    && row.attemptRef === args.attemptRef
    && row.effectGeneration === args.effectGeneration
    && row.paymentIdentifier === args.paymentIdentifier
    && row.challengeDigest === args.challengeDigest
    && row.scheme === args.scheme
    && row.network === args.network
    && row.asset === args.asset
    && row.payTo === args.payTo
    && row.amountUnits === args.amountUnits
    && row.currency === args.currency
    && row.exponent === args.exponent
    && row.providerEndpoint === args.providerEndpoint
    && row.authorizationDigest === args.authorizationDigest
  )
}
