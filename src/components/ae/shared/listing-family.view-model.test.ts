import { describe, expect, it } from 'vitest'
import { projectDirectoryListing } from '@/modules/registry/public'
import { projectToolObject } from './listing-family.view-model'

describe('shared Tool view model', () => {
  it('keeps an unjoined directory Host separate from a Provider or callable Tool', () => {
    const listing = projectDirectoryListing({
      resource: 'https://api.example/weather',
      title: 'Weather',
      description: 'Forecasts',
      provider: 'api.example',
      prices: [{ scheme: 'exact', decimalAmount: '0.10', symbol: 'USDC' }],
    })
    const view = projectToolObject(listing)
    expect(view.href).toBeUndefined()
    expect(view.identity).toEqual({ kind: 'directory_host', name: 'api.example', href: '/providers/api.example' })
    expect(view.listing.canonicalToolRef.kind).toBe('absent')
    expect(view.price?.label).toBe('USDC 0.10 per Call')
    expect(view.readiness.label).toBe('Readiness unknown')
  })

  it('does not show expired observation as currently routeable', () => {
    const base = projectDirectoryListing({ resource: 'https://api.example/weather', title: 'Weather', description: '', provider: 'api.example', prices: [] })
    const listing = { ...base, facts: { ...base.facts, readiness: {
      kind: 'present' as const, sourceRef: 'observation-1', provenance: 'ae_observed' as const,
      scope: 'admitted_tool' as const, value: { posture: 'routeable' as const, observedAt: 10, validUntil: 20 },
    } } }
    expect(projectToolObject(listing, undefined, 21).readiness.label).toBe('Readiness stale')
  })

  it('names an unverified publisher without inventing a Provider link', () => {
    const base = projectDirectoryListing({ resource: 'https://api.example/weather', title: 'Weather', description: '', provider: 'api.example', prices: [] })
    const listing = { ...base, identity: { ...base.identity, providerName: {
      kind: 'present' as const, value: 'Acme APIs', sourceRef: 'provider-claim', provenance: 'provider_declared' as const, scope: 'admitted_tool' as const,
    } } }
    expect(projectToolObject(listing).identity).toEqual({ kind: 'publisher', name: 'Acme APIs' })
  })
})
