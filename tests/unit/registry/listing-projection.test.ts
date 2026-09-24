import { describe, expect, it } from 'vitest'
import { projectAdmittedListing, projectDirectoryListing } from '@/modules/registry/public'
import { TOOL_TIMEZONE } from '../../helpers/tool-search-rerank-fixtures'

describe('registry listing identity and facts', () => {
  it('does not turn an admitted publisher slug into an unverified public Business page', () => {
    const unjoined = projectAdmittedListing(TOOL_TIMEZONE)
    expect(unjoined.canonicalToolRef).toMatchObject({ kind: 'present', value: TOOL_TIMEZONE.toolRef })
    expect(unjoined.providerPage).toMatchObject({ kind: 'absent', reason: 'not_joined' })
    expect(unjoined.identity.providerName).toMatchObject({ provenance: 'provider_declared', value: 'Provider Corp' })

    const verified = projectAdmittedListing(TOOL_TIMEZONE, TOOL_TIMEZONE.business.slug)
    expect(verified.providerPage).toMatchObject({ kind: 'present', value: '/provider', provenance: 'business_published' })
    expect(projectAdmittedListing(TOOL_TIMEZONE, 'another-provider').providerPage.kind).toBe('absent')
  })

  it('keeps a directory Host separate from Business and admission, with sourced price', () => {
    const listing = projectDirectoryListing({
      resource: 'https://weather.example/api', title: 'Current weather', description: 'Weather by city',
      provider: 'weather.example', slug: 'current-weather', prices: [{ scheme: 'exact', decimalAmount: '0.02', symbol: 'USDC' }],
    })
    expect(listing.canonicalToolRef).toMatchObject({ kind: 'absent', reason: 'not_joined' })
    expect(listing.providerPage).toMatchObject({ kind: 'absent', reason: 'not_joined' })
    expect(listing.hostPage).toMatchObject({ kind: 'present', value: '/providers/weather.example' })
    expect(listing.facts.price).toMatchObject({ kind: 'present', provenance: 'directory_reported', value: { kind: 'fixed', amount: '0.02', currency: 'USDC', basis: 'per_call' } })
    expect(listing.facts.readiness).toMatchObject({ kind: 'absent', reason: 'not_measured' })
  })
})
