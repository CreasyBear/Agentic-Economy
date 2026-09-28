import { callPublicSourceQuery, sourceQuery } from '@/lib/server/convex-source'
import type { ReferenceRate } from './internal/executable-rate'

const currentReferenceRate = sourceQuery<Record<string, never>, ReferenceRate | null>('referenceRateRefresh:current')

/** Buyer displays read the same bounded observation as Quote; no Coinbase request. */
export async function readPersistedReferenceRate(): Promise<ReferenceRate | undefined> {
  return await callPublicSourceQuery(currentReferenceRate, {}) ?? undefined
}
