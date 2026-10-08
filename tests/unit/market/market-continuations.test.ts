import { describe, expect, it } from 'vitest'
import { marketCompareParam, marketUsesCanonicalSearch, parseMarketCompareRefs, validateMarketSearch } from '@/modules/market/market-route-data'
import { parseMarketSaveIntent } from '@/components/ae/market/market-save-intent'
import { directoryCompareReference, searchCompareReference } from '@/components/ae/market/compare/market-compare-reference'
import { trialNextAction } from '@/components/ae/trial/trial-next-action'
import type { SearchResult } from '@/modules/registry/tool-choice-contracts'

const toolRef = `operation:v1:${'a'.repeat(64)}`
const resource = 'https://example.test/weather'
const entry = { resource, title: 'Weather', description: 'Forecast', provider: 'example.test', prices: [], protocol: 'x402', metadataJson: '{}' }

describe('truthful search applicability', () => {
  it.each([{ minUsdPrice: 0 }, { maxUsdPrice: 0.01 }, { hasInputSchema: true }, { hasOutputExample: true }, { minPayers30d: 10 }, { tags: ['weather'] }, { curatedOnly: true }])('keeps detailed constraints on the catalogue path: %j', filter => {
    expect(marketUsesCanonicalSearch({ query: 'weather', ...filter })).toBe(false)
  })
  it('keeps supported canonical filters and natural matching', () => {
    expect(marketUsesCanonicalSearch({ query: 'weather', provider: 'example.test', network: 'base' })).toBe(true)
  })
})

describe('exact comparison and selected save identity', () => {
  it('retains comma-bearing resource identities through comparison URLs', () => {
    const first = 'https://example.test/weather?fields=city,country'
    const encoded = marketCompareParam([first, toolRef])
    expect(parseMarketCompareRefs(encoded)).toEqual([first, toolRef])
    expect(validateMarketSearch({ compare: encoded }).compare).toBe(encoded)
  })
  it('uses admitted identity only for a qualified join, never for an external listing', () => {
    expect(directoryCompareReference({ ...entry, choice: { access: 'ae_callable', toolRef } })).toBe(toolRef)
    expect(directoryCompareReference({ ...entry, choice: { access: 'external_listing', toolRef } })).toBe(resource)
    expect(directoryCompareReference({ ...entry, choice: { access: 'ae_callable', toolRef: 'invalid' } })).toBe(resource)
  })
  it('retains compact external identity without deriving an endpoint', () => {
    const id = `registry:${'b'.repeat(64)}`
    expect(searchCompareReference({ id, access: 'external_listing', sourceRouteRef: `source-route:v1:${'c'.repeat(64)}` } as SearchResult)).toBe(id)
    expect(searchCompareReference({ id, access: 'ae_callable', toolRef } as SearchResult)).toBe(toolRef)
  })
  it('accepts only an identity hint and rejects injected authority or invalid identifiers', () => {
    expect(parseMarketSaveIntent(JSON.stringify({ kind: 'ae_callable', toolRef }))).toEqual({ kind: 'ae_callable', toolRef })
    expect(parseMarketSaveIntent(JSON.stringify({ kind: 'ae_callable', toolRef, call: true }))).toBeUndefined()
    expect(parseMarketSaveIntent(JSON.stringify({ kind: 'external_listing', resource: 'javascript:alert(1)' }))).toBeUndefined()
    expect(parseMarketSaveIntent('not JSON')).toBeUndefined()
  })
})

describe('trial refusal next actions', () => {
  it('routes permanent refusal to its remedy and only transient unavailability to retry', () => {
    expect(trialNextAction('verified_email_required')?.href).toBe('/owner/settings/account/security')
    expect(trialNextAction('trial_already_claimed')?.href).toBe('/owner/credit')
    expect(trialNextAction('trial_expired')?.href).toBe('/support')
    expect(trialNextAction('trial_not_approved')?.href).toBe('/support')
    expect(trialNextAction('trial_verification_unavailable')).toBeUndefined()
  })
})
