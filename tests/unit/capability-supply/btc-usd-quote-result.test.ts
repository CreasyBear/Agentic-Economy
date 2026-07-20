import { describe, expect, it } from 'vitest'

import {
  developmentBtcUsdQuoteSource,
  presentDevelopmentBtcUsdQuoteResult,
  projectDevelopmentBtcUsdQuoteResult,
  type BtcUsdQuoteResult,
} from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'

const receivedAt = '2026-07-20T08:05:00.000Z'

function payload(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      BTC: {
        symbol: 'BTC',
        quote: {
          USD: {
            price: 118_245.12,
            last_updated: '2026-07-20T08:04:00.000Z',
            ...overrides,
          },
        },
      },
    },
  }
}

describe('Phase 3A BTC/USD result projection', () => {
  it('normalizes the exact provider payload without exposing its shape', () => {
    const raw = payload()
    const expectedResult = {
      base: 'BTC',
      quote: 'USD',
      price: 118_245.12,
      source: developmentBtcUsdQuoteSource,
      observedAt: '2026-07-20T08:04:00.000Z',
      receivedAt,
      freshness: 'fresh',
      rawEvidenceRef: canonicalDigest(raw),
    } satisfies BtcUsdQuoteResult
    expect(projectDevelopmentBtcUsdQuoteResult({ payload: raw, receivedAt })).toEqual({
      kind: 'accepted',
      result: expectedResult,
    })
  })

  it('adapts the operation result into generic presentation blocks', () => {
    const normalized = projectDevelopmentBtcUsdQuoteResult({
      payload: payload(),
      receivedAt,
    })
    if (normalized.kind !== 'accepted') throw new Error(normalized.code)
    const presentation = presentDevelopmentBtcUsdQuoteResult(normalized.result)
    expect(presentation.presentationBlocks).toEqual([
      { kind: 'text', label: 'Pair', value: 'BTC/USD' },
      expect.objectContaining({ kind: 'source', providerId: developmentBtcUsdQuoteSource.providerId }),
    ])
    expect(presentation.resultDelivery).toEqual(expect.objectContaining({
      state: 'valid',
      evidenceRefs: [normalized.result.rawEvidenceRef],
    }))
  })

  it('marks an attributable old observation as stale', () => {
    const result = projectDevelopmentBtcUsdQuoteResult({
      payload: payload({ last_updated: '2026-07-20T07:59:59.999Z' }),
      receivedAt,
    })
    expect(result).toMatchObject({ kind: 'accepted', result: { freshness: 'stale' } })
  })

  it.each([
    ['missing data', {}],
    ['wrong symbol', { data: { BTC: { symbol: 'ETH', quote: { USD: { price: 1, last_updated: receivedAt } } } } }],
    ['wrong quote currency', { data: { BTC: { symbol: 'BTC', quote: { EUR: { price: 1, last_updated: receivedAt } } } } }],
    ['missing price', payload({ price: undefined })],
    ['zero price', payload({ price: 0 })],
    ['negative price', payload({ price: -1 })],
    ['NaN price', payload({ price: Number.NaN })],
    ['infinite price', payload({ price: Number.POSITIVE_INFINITY })],
    ['malformed provider timestamp', payload({ last_updated: 'yesterday' })],
  ])('refuses %s', (_label, raw) => {
    expect(projectDevelopmentBtcUsdQuoteResult({ payload: raw, receivedAt })).toEqual({
      kind: 'refused',
      code: 'btc_usd_quote_payload_invalid',
    })
  })

  it('refuses a malformed receipt timestamp', () => {
    expect(projectDevelopmentBtcUsdQuoteResult({
      payload: payload(),
      receivedAt: 'later',
    })).toEqual({ kind: 'refused', code: 'btc_usd_quote_received_at_invalid' })
  })

  it('refuses a provider observation from after AE received it', () => {
    expect(projectDevelopmentBtcUsdQuoteResult({
      payload: payload({ last_updated: '2026-07-20T08:05:00.001Z' }),
      receivedAt,
    })).toEqual({ kind: 'refused', code: 'btc_usd_quote_observed_after_receipt' })
  })
})
