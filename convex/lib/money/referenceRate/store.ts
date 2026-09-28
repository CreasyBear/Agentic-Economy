import type { GenericDatabaseReader } from 'convex/server'
import type { DataModel } from '../../../_generated/dataModel'
import { REFERENCE_RATE_MAX_AGE_MS, validReferenceRate, type ReferenceRate } from '@/modules/money/public'

/** A single normal-path observation; stale or future observations cannot price a new sale. */
export async function readReferenceRate(
  db: GenericDatabaseReader<DataModel>,
  now: number,
): Promise<ReferenceRate | null> {
  const row = await db.query('moneyReferenceRates')
    .withIndex('by_pair', (q) => q.eq('pair', 'USDC/AUD'))
    .unique()
  if (row === null) return null
  const rate: ReferenceRate = { source: 'coinbase', base: 'USDC', quote: 'AUD', rate: row.rate, fetchedAt: row.fetchedAt }
  return validReferenceRate(rate) && rate.fetchedAt <= now && now - rate.fetchedAt < REFERENCE_RATE_MAX_AGE_MS
    ? rate : null
}
