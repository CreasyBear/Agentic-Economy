import { cancelResponseBody, readBoundedRequestJson } from '@/lib/server/bounded-request-body'
import { validReferenceRate, type ReferenceRate } from './executable-rate'

/** Fixed public endpoint; neither credentials nor caller-controlled URLs enter this request. */
export async function fetchCoinbaseReferenceRate(input: Readonly<{
  fetch?: typeof globalThis.fetch
  now?: () => number
}> = {}): Promise<ReferenceRate | undefined> {
  try {
    const response = await (input.fetch ?? globalThis.fetch)(
      'https://api.coinbase.com/v2/exchange-rates?currency=USDC',
      { signal: AbortSignal.timeout(10_000), redirect: 'error', headers: { accept: 'application/json' } },
    )
    if (!response.ok) {
      await cancelResponseBody(response)
      return undefined
    }
    const body = await readBoundedRequestJson(response, 128 * 1024)
    if (!body.ok || body.value === null || typeof body.value !== 'object') return undefined
    const data = (body.value as { data?: unknown }).data
    if (data === null || typeof data !== 'object') return undefined
    const { currency, rates } = data as { currency?: unknown; rates?: unknown }
    if (currency !== 'USDC' || rates === null || typeof rates !== 'object') return undefined
    const rate = (rates as { AUD?: unknown }).AUD
    if (typeof rate !== 'string') return undefined
    const observation: ReferenceRate = {
      source: 'coinbase', base: 'USDC', quote: 'AUD', rate,
      fetchedAt: (input.now ?? Date.now)(),
    }
    return validReferenceRate(observation) ? Object.freeze(observation) : undefined
  } catch {
    return undefined
  }
}
