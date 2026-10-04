import type { Infer, ObjectType } from 'convex/values'
import type { QueryCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'
import { resolveBusinessActor } from '../../../authz'
import { digestReference, reconciliationPeriodSchema, type ReconciliationCall } from '@/modules/money/public'
import { parseCallRef } from '@/modules/capability-execution/call-contracts'
import { resolveBuyerSaleSourcesHandler } from '../managedCall/historySources'
import { factsArgs, factsResult } from './contracts'

/** Resolve owner authority again after the ledger read. Canonical references and
 * hashes must agree; a transaction reference alone cannot select a Credential. */
export async function readFactsHandler(ctx: QueryCtx, args: ObjectType<typeof factsArgs>): Promise<Infer<typeof factsResult>> {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return { kind: 'refused', code: 'call_history_authentication_required' }
  return await readFactsForAccount(ctx, args, actor.canonicalAccountRef)
}

/** Shared read-only join; callers establish fresh owner authority first. */
export async function readFactsForAccount(ctx: Pick<QueryCtx, 'db'>, args: ObjectType<typeof factsArgs>, accountRef: string): Promise<Infer<typeof factsResult>> {
  if (!reconciliationPeriodSchema.safeParse({ periodStartAt: args.periodStartAt, periodEndAt: args.periodEndAt }).success || args.entries.length > 1500) return { kind: 'refused', code: 'reconciliation_period_invalid' }
  const calls = new Map<string, Doc<'capabilityCalls'>>()
  for (const state of ['pending', 'completed', 'refused', 'reconciliation_required', 'cancelled'] as const) {
    const rows = await ctx.db.query('capabilityCalls').withIndex('by_ownerId_and_state_and_createdAt', q => q
      .eq('ownerId', accountRef).eq('state', state).gte('createdAt', args.periodStartAt).lt('createdAt', args.periodEndAt)).take(1501)
    for (const row of rows) calls.set(row.callRef, row)
    if (calls.size > 1500) return { kind: 'unavailable', code: 'reconciliation_window_too_large' }
  }
  const sources: (string | null)[] = args.entries.map(() => null)
  for (const [index, entry] of args.entries.entries()) {
    if (!entry.transactionRef || !entry.callDigest) continue
    let callRef: string | null = null
    if (entry.kind === 'charge' || entry.kind === 'refund') {
      const refs = await resolveBuyerSaleSourcesHandler(ctx, { accountRef, sales: [{ transactionRef: entry.transactionRef, sourceDigest: entry.callDigest }] })
      callRef = refs[0] ?? null
    } else if (entry.kind === 'provider_transfer' || entry.kind === 'provider_reversal') {
      const ref = entry.transactionRef
      const obligation = entry.kind === 'provider_transfer'
        ? await ctx.db.query('moneyProviderObligations').withIndex('by_settlementTransactionRef', q => q.eq('settlementTransactionRef', ref)).unique()
        : await ctx.db.query('moneyProviderObligations').withIndex('by_reversalTransactionRef', q => q.eq('reversalTransactionRef', ref)).unique()
      if (obligation?.buyerAccountRef === accountRef && digestReference('call', obligation.callRef) === entry.callDigest
        && digestReference('provider', obligation.providerRef) === entry.providerDigest && obligation.providerAmountUnits === entry.units) callRef = obligation.callRef
    }
    if (callRef === null && (entry.kind === 'promotional_use' || entry.kind === 'promotional_refund')) {
      const usage = await ctx.db.query('capabilityServiceUsageRecords').withIndex('by_accountRef_and_callDigest', q => q.eq('accountRef', accountRef).eq('callDigest', entry.callDigest ?? '')).take(2)
      if (usage.length === 1 && usage[0] !== undefined && digestReference('call', usage[0].callRef) === entry.callDigest) callRef = usage[0].callRef
    }
    if (callRef === null) continue
    const row = await ctx.db.query('capabilityCalls').withIndex('by_callRef', q => q.eq('callRef', callRef)).unique()
    if (row?.ownerId !== accountRef || parseCallRef(row.callRef).kind !== 'valid' || digestReference('call', row.callRef) !== entry.callDigest) continue
    calls.set(row.callRef, row)
    sources[index] = row.callRef
  }
  if (calls.size > 1500) return { kind: 'unavailable', code: 'reconciliation_window_too_large' }
  const facts: ReconciliationCall[] = []
  for (const call of calls.values()) {
    if (parseCallRef(call.callRef).kind !== 'valid' || !/^[A-Za-z0-9:._-]{1,200}$/u.test(call.credentialId) || !/^[A-Za-z0-9:._-]{1,200}$/u.test(call.principalId)) return { kind: 'unavailable', code: 'reconciliation_call_identity_invalid' }
    const report = await ctx.db.query('paidCallReports').withIndex('by_callRef', q => q.eq('callRef', call.callRef)).unique()
    const obligation = await ctx.db.query('moneyProviderObligations').withIndex('by_callRef', q => q.eq('callRef', call.callRef)).unique()
    if (obligation !== null && obligation.buyerAccountRef !== accountRef) return { kind: 'unavailable', code: 'reconciliation_obligation_conflict' }
    facts.push({ callRef: call.callRef, credentialRef: call.credentialId, principalRef: call.principalId,
      createdAt: call.createdAt, environment: call.environment,
      providerDigest: obligation === null ? null : digestReference('provider', obligation.providerRef),
      settlementRefs: call.formanceSettlementRefs ?? [],
      refundRefs: report?.state === 'posted' && report.accountRef === accountRef ? report.transactionRefs : [],
      providerSettlementRef: obligation?.settlementTransactionRef ?? null, providerReversalRef: obligation?.reversalTransactionRef ?? null,
      providerObligationUnits: obligation?.providerAmountUnits ?? null })
  }
  // Promotional links require both canonical digest and the booked settlement /
  // posted remedy array. The measured Call index supplies a lookup hint for
  // older pure-promo Calls; absent legacy measurements remain unlinked.
  const byDigest = new Map(facts.map(call => [digestReference('call', call.callRef), call]))
  for (const [index, entry] of args.entries.entries()) {
    if (entry.kind !== 'promotional_use' && entry.kind !== 'promotional_refund') continue
    const call = entry.callDigest === null ? undefined : byDigest.get(entry.callDigest)
    if (!call || !entry.transactionRef) continue
    if ((entry.kind === 'promotional_use' ? call.settlementRefs : call.refundRefs).includes(entry.transactionRef)) sources[index] = call.callRef
  }
  return { kind: 'available', accountRef, calls: facts, sources }
}
