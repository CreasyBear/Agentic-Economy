import { v, type Infer } from 'convex/values'
import type { QueryCtx } from '../../../_generated/server'
import { requireSourceRead } from '../../security/sourceWrite/admission'
import { sourceWriteArgs, type SourceWriteArgs } from '../../security/sourceWrite/contracts'
import { principalValue, type CallPrincipal } from '../callLifecycle/contracts'
import { resolveCallAgentAuthorityHandler } from '../callLifecycle/agentCallAuthority'

export const quoteStatusArgs = {
  principal: principalValue,
  quoteRef: v.string(),
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
}

export const quoteStatusResult = v.union(v.null(), v.object({
  quoteRef: v.string(), toolRef: v.string(),
  principalRef: v.string(),
  state: v.union(v.literal('committed'), v.literal('refused'), v.literal('expired'), v.literal('consumed')),
  consumedCallRef: v.optional(v.string()), expiresAt: v.number(),
  maxSpend: v.object({ currency: v.literal('AUD'), units: v.string(), exponent: v.literal(6) }),
  currency: v.literal('AUD'),
}))

type Args = SourceWriteArgs & Readonly<{
  principal: CallPrincipal; quoteRef: string; operationKey: string; correlationId: string
}>

/** Read only the owner's commitment metadata; never return invocation input or proof material. */
export async function readQuoteStatusQueryHandler(ctx: QueryCtx, args: Args): Promise<Infer<typeof quoteStatusResult>> {
  const admission = await requireSourceRead(args, 'protected_action')
  if (admission.kind === 'rejected') throw new Error(`quote_status_source_read_rejected:${admission.reason}`)
  const row = await ctx.db.query('capabilityQuotes')
    .withIndex('by_quoteRef', query => query.eq('quoteRef', args.quoteRef)).unique()
  if (row === null) return null
  const principal = await resolveCallAgentAuthorityHandler(ctx, { principal: args.principal, toolRef: row.toolRef })
  if (principal === null || row.principalId !== principal.principalId
    || row.accountRef !== principal.ownerId || row.applicationRef !== principal.applicationRef
    || row.environment !== principal.environment) return null
  return {
    quoteRef: row.quoteRef, toolRef: row.toolRef, principalRef: row.principalId,
    state: row.state === 'issued' ? row.expiresAt <= Date.now() ? 'expired' : 'committed' : row.state,
    ...(row.consumedCallRef === undefined ? {} : { consumedCallRef: row.consumedCallRef }),
    expiresAt: row.expiresAt,
    maxSpend: { currency: 'AUD', units: row.maximumSpendPerCallUnits, exponent: 6 },
    currency: 'AUD',
  }
}
