import type { QueryCtx } from '../../../_generated/server'
import type { OpenDispatchValue } from './callIdentity'
import { type ObjectType, v } from 'convex/values'
import { openDispatchValue } from './contracts'

export const openDispatchArgs = { callRef: v.string() } as const
export const openDispatchResult = v.union(openDispatchValue, v.null())
export type OpenDispatchArgs = ObjectType<typeof openDispatchArgs>

export async function openDispatchHandler(
  ctx: QueryCtx,
  args: OpenDispatchArgs,
): Promise<OpenDispatchValue | null> {
  const row = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', args.callRef)).unique()
  if (
    row === null
    || row.toolJson === undefined
    || row.inputJson === undefined
  ) return null
  const rowQuoteRef = row.quoteRef
  const quote = rowQuoteRef === undefined ? null : await ctx.db.query('capabilityQuotes')
    .withIndex('by_quoteRef', (query) => query.eq('quoteRef', rowQuoteRef)).unique()
  if (quote !== null && (quote.accountRef !== row.ownerId || quote.principalId !== row.principalId || quote.toolRef !== row.toolRef)) return null
  return {
    ...(quote?.x402PaymentRequiredJson === undefined ? {} : { committedPaymentRequiredJson: quote.x402PaymentRequiredJson }),
    ...(quote?.sourceUsdcUnits === undefined ? {} : { sourceUsdcUnits: quote.sourceUsdcUnits }),
    ...(quote?.x402RequirementDigest === undefined ? {} : { x402RequirementDigest: quote.x402RequirementDigest }),
    ...(row.quoteRef === undefined ? {} : { quoteRef: row.quoteRef }),
    callRef: row.callRef,
    principalId: row.principalId,
    ownerId: row.ownerId,
    credentialId: row.credentialId,
    applicationRef: row.applicationRef,
    environment: row.environment,
    state: row.state,
    toolRef: row.toolRef,
    idempotencyKey: row.idempotencyKey,
    inputDigest: row.inputDigest,
    requestDigest: row.requestDigest,
    grantRef: row.grantRef,
    grantGeneration: row.grantGeneration,
    policyDigest: row.policyDigest,
    grantExpiresAt: row.grantExpiresAt,
    toolJson: row.toolJson,
    inputJson: row.inputJson,
    ...(row.authority === undefined ? {} : { authority: structuredClone(row.authority) }),
    ...(row.workId === undefined ? {} : { workId: row.workId }),
    ...(row.attemptRef === undefined ? {} : { attemptRef: row.attemptRef }),
    ...(row.dispatchState === undefined ? {} : { dispatchState: row.dispatchState }),
  }
}