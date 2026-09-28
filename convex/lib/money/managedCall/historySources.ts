import { v, type Infer } from 'convex/values'
import { internal } from '../../../_generated/api'
import type { ActionCtx, QueryCtx } from '../../../_generated/server'
import { parseCallRef } from '../../../../src/modules/capability-execution/call-contracts'
import { digestReference, type AccountHistoryResult } from '../../../../src/modules/money/public'

export const resolveBuyerSaleSourcesArgs = v.object({
  accountRef: v.string(),
  sales: v.array(v.object({ transactionRef: v.string(), sourceDigest: v.string() })),
})
export const resolveBuyerSaleSourcesResult = v.array(v.union(v.string(), v.null()))

/** Only a single owner-booked, settled buyer-sale ref with the canonical digest earns a Call link. */
export const resolveBuyerSaleSourcesHandler = async (
  ctx: QueryCtx,
  args: Infer<typeof resolveBuyerSaleSourcesArgs>,
): Promise<(string | null)[]> => {
  const sources: (string | null)[] = []
  for (const sale of args.sales) {
    const matches = await ctx.db.query('capabilityCalls')
      .withIndex('by_ownerId_and_buyerSaleTransactionRef', (query) =>
        query.eq('ownerId', args.accountRef).eq('buyerSaleTransactionRef', sale.transactionRef))
      .take(2)
    const call = matches.length === 1 ? matches[0] : undefined
    const parsed = call === undefined ? undefined : parseCallRef(call.callRef)
    sources.push(call !== undefined
      && call.formanceFinancialState === 'settled'
      && call.formanceSettlementRefs?.[0] === sale.transactionRef
      && call.formanceSettlementRefs.length === 2
      && parsed?.kind === 'valid' && parsed.ref === call.callRef
      && digestReference('call', call.callRef) === sale.sourceDigest
      ? parsed.ref : null)
  }
  return sources
}

/** Resolve the owner on every page; ledger rows are never enough to infer a Call source. */
export const readOwnerHistoryHandler = async (
  ctx: ActionCtx,
  args: { cursor?: string },
): Promise<AccountHistoryResult> => {
  const subject: Readonly<
    | { kind: 'resolved'; accountRef: string; locked: boolean }
    | { kind: 'refused'; code: string; retryable: boolean }
  > = await ctx.runQuery(internal.moneyAccountFunding.readBalanceSubject, {})
  if (subject.kind === 'refused') return { kind: 'refused', code: subject.code }
  const history: AccountHistoryResult = await ctx.runAction(internal.moneyFormance.readAccountHistory, {
    accountRef: subject.accountRef, ...(args.cursor === undefined ? {} : { cursor: args.cursor }),
  })
  if (history.kind !== 'available') return history
  const candidates = history.entries.flatMap((entry, index) =>
    entry.kind === 'call_spend' && entry.transactionRef && entry.sourceDigest
      ? [{ index, transactionRef: entry.transactionRef, sourceDigest: entry.sourceDigest }]
      : [])
  if (candidates.length === 0) return history
  const sources: (string | null)[] = await ctx.runQuery(internal.moneyManagedCallLifecycle.resolveBuyerSaleSources, {
    accountRef: subject.accountRef,
    sales: candidates.map(({ transactionRef, sourceDigest }) => ({ transactionRef, sourceDigest })),
  })
  const entries = [...history.entries]
  let linked = 0
  for (const [index, candidate] of candidates.entries()) {
    const sourceRef = sources[index]
    const entry = entries[candidate.index]
    if (sourceRef === null || sourceRef === undefined || entry === undefined) continue
    entries[candidate.index] = { ...entry, sourceRef }
    linked += 1
  }
  return { ...history, entries, sourceLinkCoverage: linked === 0 ? 'unavailable'
    : linked === history.entries.filter((entry) => entry.kind === 'call_spend').length ? 'complete' : 'partial' }
}
