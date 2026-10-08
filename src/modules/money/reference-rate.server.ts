import { callPublicSourceQuery, sourceQuery, type CreatePublicConvexClientOptions } from '@/lib/server/convex-source'
import type { ReferenceRate } from './internal/executable-rate'

const currentReferenceRate = sourceQuery<Record<string, never>, ReferenceRate | null>('referenceRateRefresh:current')

/** Buyer displays read the same bounded observation as Quote; no Coinbase request. */
export async function readPersistedReferenceRate(options?: CreatePublicConvexClientOptions): Promise<ReferenceRate | undefined> {
  options?.signal?.throwIfAborted()
  const result = options === undefined ? await callPublicSourceQuery(currentReferenceRate, {}) : await callPublicSourceQuery(currentReferenceRate, {}, options)
  options?.signal?.throwIfAborted()
  return result ?? undefined
}
