"use node"

import { financialUsageReadSchema, reconciliationPeriodSchema, type FinancialUsageEntry, type FinancialUsageRead } from '../usage-reconciliation'
import { formanceCommandPostingsMatch } from './formance-postings'
import { historyTransactionEffect, type LedgerHistoryTransaction } from './formance-reads'
import { DIGEST_PATTERN, COMMAND_REFERENCE_PATTERN, formanceSafeUnitsFromSdk, NO_RETRY, type FormanceContext, type FormanceMoneyCommand } from './formance-config'
import { degradeBackend } from '@/lib/observability/degrade-backend'

type Transaction = LedgerHistoryTransaction
function providerUnits(transaction: Transaction, callDigest: string, providerDigest: string): string | undefined {
  const reverse = transaction.template === 'PROVIDER_REVERSED'
  const postings = transaction.postings.filter(p => p.amount !== 0n)
  if (postings.length !== 2 || postings.some(p => p.asset !== 'USDC/6')) return undefined
  const provider = `providers:${providerDigest}:settlement`
  const transfer = postings.find(p => reverse ? p.source === provider : p.destination === provider)
  if (!transfer) return undefined
  const treasuryAddress = reverse ? transfer.destination : transfer.source
  if (!new RegExp(`^treasury:corporate:[a-f0-9]{64}:${reverse ? 'available' : 'committed'}$`, 'u').test(treasuryAddress)) return undefined
  const units = formanceSafeUnitsFromSdk(transfer.amount)
  if (units === undefined) return undefined
  const command: FormanceMoneyCommand = { commandRef: transaction.reference ?? '', idempotencyKey: transaction.reference ?? '', schemaVersion: 'v1.5.0',
    template: reverse ? 'PROVIDER_REVERSED' : 'PROVIDER_SETTLED', metadata: {}, variables: {
      [reverse ? 'treasury_available' : 'treasury_committed']: treasuryAddress,
      provider_settlement: provider,
      [reverse ? 'obligation_settled' : 'obligation_accrued']: `provider_obligations:${callDigest}:${reverse ? 'settled' : 'accrued'}`,
      [reverse ? 'obligation_reversed' : 'obligation_settled']: `provider_obligations:${callDigest}:${reverse ? 'reversed' : 'settled'}`,
      amount: `USDC/6 ${units}`,
    } }
  const observed = postings.map(posting => ({ source: posting.source, destination: posting.destination, asset: posting.asset,
    amountUnits: formanceSafeUnitsFromSdk(posting.amount) ?? 'invalid' }))
  return formanceCommandPostingsMatch(command, observed) ? units : undefined
}

/** Official SDK/native cursor. Effective-time filter and inserted-time cutoff are
 * checked independently on every row. Only bounded, allowlisted metadata leaves
 * this boundary; unknown templates/reverts prevent complete amount claims. */
export async function readFormanceUsageReconciliation(context: FormanceContext, input: {
  accountDigest: string; periodStartAt: number; periodEndAt: number; now?: number
}): Promise<FinancialUsageRead> {
  if (!DIGEST_PATTERN.test(input.accountDigest) || !reconciliationPeriodSchema.safeParse({ periodStartAt: input.periodStartAt, periodEndAt: input.periodEndAt }).success) {
    return { kind: 'setup_required', code: 'formance_reconciliation_query_invalid' }
  }
  const snapshotAt = input.now ?? Date.now()
  if (!Number.isSafeInteger(snapshotAt) || snapshotAt < 0) return { kind: 'setup_required', code: 'formance_reconciliation_query_invalid' }
  const entries: FinancialUsageEntry[] = []
  let cursor: string | undefined
  let lastId: bigint | undefined
  const cursors = new Set<string>()
  let scanned = 0
  let coverage: 'complete' | 'partial' = 'complete'
  try {
    for (let index = 0; index < 200; index += 1) {
      const response = await context.sdk.ledger.v2.listTransactions(cursor === undefined ? {
        ledger: context.configuration.ledger, pageSize: 15, pit: new Date(snapshotAt), sort: 'id:desc',
        query: { $and: [ { $match: { 'metadata[account_digest]': input.accountDigest } },
          { $gte: { timestamp: new Date(input.periodStartAt).toISOString() } },
          { $lt: { timestamp: new Date(input.periodEndAt).toISOString() } },
          { $lte: { inserted_at: new Date(snapshotAt).toISOString() } } ] },
      } : { ledger: context.configuration.ledger, cursor }, NO_RETRY)
      const page = response.v2TransactionsCursorResponse?.cursor
      if (!page || page.data.length > 15 || (page.hasMore && (!page.next || page.data.length === 0 || page.next.length > 2000 || cursors.has(page.next)))) {
        return { kind: 'unavailable', code: 'formance_reconciliation_page_invalid' }
      }
      scanned += page.data.length
      if (scanned > 1500) return { kind: 'unavailable', code: 'reconciliation_window_too_large' }
      for (const transaction of page.data) {
        const occurredAt = transaction.timestamp.getTime()
        const recordedAt = transaction.insertedAt?.getTime() ?? null
        if (!Number.isSafeInteger(occurredAt) || occurredAt < input.periodStartAt || occurredAt >= input.periodEndAt || occurredAt > snapshotAt
          || (recordedAt !== null && (!Number.isSafeInteger(recordedAt) || recordedAt < 0 || recordedAt > snapshotAt))
          || (transaction.revertedAt?.getTime() ?? snapshotAt) > snapshotAt || formanceSafeUnitsFromSdk(transaction.id) === undefined
          || (lastId !== undefined && transaction.id >= lastId)) return { kind: 'unavailable', code: 'formance_reconciliation_snapshot_invalid' }
        lastId = transaction.id
        const history = historyTransactionEffect(transaction, input.accountDigest)
        if (history === undefined) return { kind: 'unavailable', code: 'formance_reconciliation_attribution_invalid' }
        const digest = transaction.metadata.call_digest
        const provider = transaction.metadata.provider_digest
        const callDigest = digest !== undefined && DIGEST_PATTERN.test(digest) ? digest : null
        const providerDigest = provider !== undefined && DIGEST_PATTERN.test(provider) ? provider : null
        let kind: FinancialUsageEntry['kind'] | undefined
        let units: string | null | undefined
        if (transaction.template === 'PROVIDER_SETTLED' || transaction.template === 'PROVIDER_REVERSED') {
          if (!callDigest || !providerDigest) return { kind: 'unavailable', code: 'formance_reconciliation_provider_invalid' }
          units = providerUnits(transaction, callDigest, providerDigest)
          if (units === undefined) return { kind: 'unavailable', code: 'formance_reconciliation_provider_invalid' }
          kind = transaction.template === 'PROVIDER_SETTLED' ? 'provider_transfer' : 'provider_reversal'
        } else if (history !== null) {
          const kinds = { call_spend: 'charge', call_refund: 'refund', promotional_use: 'promotional_use', promotional_refund: 'promotional_refund' } as const
          if (history.kind in kinds) {
            kind = kinds[history.kind as keyof typeof kinds]
            units = (BigInt(history.accountEffect.units) < 0n ? -BigInt(history.accountEffect.units) : BigInt(history.accountEffect.units)).toString()
          }
          if (history.kind === 'unmapped') { kind = 'unsupported'; units = null }
          if (history.kind === 'unmapped' || history.reverted || history.recordedAt === null) coverage = 'partial'
        }
        if (transaction.reverted || recordedAt === null) coverage = 'partial'
        if (!kind || units === undefined) continue
        const reference = transaction.reference
        const transactionRef = reference !== undefined && COMMAND_REFERENCE_PATTERN.test(reference) ? reference : null
        if (!transactionRef || !callDigest) coverage = 'partial'
        entries.push({ transactionId: transaction.id.toString(), transactionRef, callDigest, providerDigest,
          kind, units, occurredAt, recordedAt, reverted: transaction.reverted })
      }
      if (!page.hasMore) return financialUsageReadSchema.parse({ kind: 'available', entries, snapshotAt, coverage })
      cursor = page.next
      if (cursor !== undefined) cursors.add(cursor)
    }
    return { kind: 'unavailable', code: 'reconciliation_window_too_large' }
  } catch (cause) {
    return degradeBackend(cause instanceof Error ? 'Error' : typeof cause, { kind: 'unavailable' as const, code: 'formance_read_unavailable' }, { site: 'readFormanceUsageReconciliation', reason: 'source_unavailable' })
  }
}
