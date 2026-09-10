import { describe, expect, it } from 'vitest'
import { directoryDepthBand, directoryRecencyBand, DIRECTORY_DAY_MS } from './lib/x402DirectoryIndex/analytics'
import { searchAnalytics } from './lib/x402DirectoryIndex/analytics'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'

const DAY = DIRECTORY_DAY_MS
const NOW = 1_000_000_000_000

function entry(activity?: X402DirectoryEntry['activity']): X402DirectoryEntry {
  return {
    resource: 'x:test', title: 'Test', description: 'd', protocol: 'http',
    provider: 'p', metadataJson: '{}', prices: [], ...(activity === undefined ? {} : { activity }),
  }
}

describe('directoryDepthBand', () => {
  it('returns unknown for missing, malformed, zero or negative payers', () => {
    expect(directoryDepthBand(10, undefined)).toBe('unknown')
    expect(directoryDepthBand(10, 0)).toBe('unknown')
    expect(directoryDepthBand(10, -1)).toBe('unknown')
    expect(directoryDepthBand(10, 1.5)).toBe('unknown')
    expect(directoryDepthBand(10, Number.NaN)).toBe('unknown')
    expect(directoryDepthBand(undefined, 5)).toBe('unknown')
    expect(directoryDepthBand(-3, 1)).toBe('unknown')
  })

  it('classifies calls-per-payer thresholds', () => {
    expect(directoryDepthBand(1, 1)).toBe('broad')
    expect(directoryDepthBand(199, 100)).toBe('broad') // 1.99
    expect(directoryDepthBand(2, 1)).toBe('repeat')
    expect(directoryDepthBand(4, 1)).toBe('repeat')
    expect(directoryDepthBand(5, 1)).toBe('concentrated')
    expect(directoryDepthBand(9, 1)).toBe('concentrated')
    expect(directoryDepthBand(10, 1)).toBe('whale_heavy')
    expect(directoryDepthBand(1000, 7)).toBe('whale_heavy')
  })

  it('rounds the ratio to 2dp before banding', () => {
    // 4499/2250 = 1.99955… → rounds to 2 → repeat, not broad
    expect(directoryDepthBand(4499, 2250)).toBe('repeat')
    // 199/100 = 1.99 stays broad
    expect(directoryDepthBand(199, 100)).toBe('broad')
  })
})

describe('directoryRecencyBand', () => {
  it('returns stale for absent timestamps', () => {
    expect(directoryRecencyBand(undefined, NOW)).toBe('stale')
  })

  it('returns unknown for unparseable timestamps', () => {
    expect(directoryRecencyBand('not-a-date', NOW)).toBe('unknown')
  })

  it('bounds fresh below 7 days and recent below 30 days', () => {
    expect(directoryRecencyBand(new Date(NOW - DAY).toISOString(), NOW)).toBe('fresh')
    expect(directoryRecencyBand(new Date(NOW - (7 * DAY - 1)).toISOString(), NOW)).toBe('fresh')
    expect(directoryRecencyBand(new Date(NOW - 7 * DAY).toISOString(), NOW)).toBe('recent')
    expect(directoryRecencyBand(new Date(NOW - (30 * DAY - 1)).toISOString(), NOW)).toBe('recent')
    expect(directoryRecencyBand(new Date(NOW - 30 * DAY).toISOString(), NOW)).toBe('stale')
    expect(directoryRecencyBand(new Date(NOW - 90 * DAY).toISOString(), NOW)).toBe('stale')
  })
})

describe('searchAnalytics derived fields', () => {
  it('keeps payerDepth only when computable and derives bands from the injected now', () => {
    const derived = searchAnalytics(entry({ calls30d: 7, payers30d: 2, lastCalledAt: new Date(NOW - 3 * DAY).toISOString() }), '*', NOW)
    expect(derived.payerDepth).toBe(3.5)
    expect(derived.depthBand).toBe('repeat')
    expect(derived.lastActivatedAt).toBe(Date.parse(new Date(NOW - 3 * DAY).toISOString()))
    expect(derived.lastCalledBand).toBe('fresh')
  })

  it('omits payerDepth and lastActivatedAt when unsafe or missing', () => {
    const missing = searchAnalytics(entry(), '*', NOW)
    expect('payerDepth' in missing).toBe(false)
    expect(missing.depthBand).toBe('unknown')
    expect('lastActivatedAt' in missing).toBe(false)
    expect(missing.lastCalledBand).toBe('stale')

    const malformed = searchAnalytics(entry({ calls30d: 5, payers30d: 0, lastCalledAt: 'garbage' }), '*', NOW)
    expect('payerDepth' in malformed).toBe(false)
    expect(malformed.depthBand).toBe('unknown')
    expect('lastActivatedAt' in malformed).toBe(false)
    expect(malformed.lastCalledBand).toBe('unknown')
  })
})
