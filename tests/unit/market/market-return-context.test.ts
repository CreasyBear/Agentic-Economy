import { describe, expect, it } from 'vitest'

import {
  buildMarketReturnContext,
  readMarketReturnContext,
  toMarketReturnNavigation,
} from '@/components/ae/market/market-return-context'

describe('market return context', () => {
  it('round-trips every known catalog presentation parameter', () => {
    const first = `operation:v1:${'a'.repeat(64)}`
    const second = `operation:v1:${'b'.repeat(64)}`
    const context = buildMarketReturnContext({
      query: 'company registry',
      availability: 'routeable',
      category: 'identity-compliance',
      capability: 'identity.company_search',
      cursor: 'page-2',
      compare: `${first},${second}`,
    }, 'tools')

    expect(readMarketReturnContext(context)).toBe(context)
    const url = new URL(context, 'https://agentic-economy.example')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      query: 'company registry',
      availability: 'routeable',
      category: 'identity-compliance',
      capability: 'identity.company_search',
      cursor: 'page-2',
      compare: `${first},${second}`,
    })
    expect(url.hash).toBe('#tools')
  })

  it('keeps the native directory position and selected endpoint', () => {
    const context = buildMarketReturnContext({ offset: 20, resource: 'https://example.com/tool/:id' })
    expect(readMarketReturnContext(context)).toBe(context)
    expect(new URL(context, 'https://example.com').searchParams.get('offset')).toBe('20')
    expect(new URL(context, 'https://example.com').searchParams.get('resource')).toBe('https://example.com/tool/:id')
  })

  it.each([
    'https://evil.example/market?query=x',
    '//evil.example/market?query=x',
    '/marketplace?query=x',
    '/market?query=x&next=https://evil.example',
    '/market?window=30d',
    '/market?query=x#admin',
    '/market?query=one&query=two',
  ])('refuses non-market, open-redirect, unknown, or ambiguous input: %s', (value) => {
    expect(readMarketReturnContext(value)).toBeUndefined()
  })
})

it('retains native filters and refuses invalid filter values', async () => {
  const { toMarketReturnNavigation } = await import('@/components/ae/market/market-return-context')
  const search = { network: 'eip155:8453', provider: 'example.com', maxUsdPrice: 0.001, view: 'saved' as const }
  expect(toMarketReturnNavigation(buildMarketReturnContext(search)).search).toEqual(search)
  expect(readMarketReturnContext('/market?maxUsdPrice=-1')).toBeUndefined()
  expect(readMarketReturnContext('/market?maxUsdPrice=')).toBeUndefined()
  expect(readMarketReturnContext('/market?provider=https://example.com')).toBeUndefined()
})


it('round-trips index category, cursor and sort independently from canonical fields', () => {
  const search = { directoryCategory: 'creative', indexCursor: 'cursor:+/==&next', sort: 'updated' as const, resource: 'https://example.com/tool?output=json', provider: 'example.com' };
  const context = buildMarketReturnContext(search);
  expect(toMarketReturnNavigation(context).search).toEqual(search);
  const parameters = new URL(context, 'https://example.com').searchParams;
  expect(parameters.has('category')).toBe(false);
  expect(parameters.has('cursor')).toBe(false);
  expect(parameters.has('offset')).toBe(false);
});

it.each([
  '/market?directoryCategory=',
  '/market?directoryCategory=%20creative',
  '/market?indexCursor=',
  '/market?indexCursor=cursor&offset=20',
  '/market?indexCursor=one&indexCursor=two',
  '/market?sort=cheapest',
  '/market?query=image&sort=popular',
  '/market?query=image&sort=updated',
])('rejects invalid indexed return context: %s', value => {
  expect(readMarketReturnContext(value)).toBeUndefined();
});

it('round-trips exact bands, arrays and false metadata filters without losing zero bounds', () => {
  const search = { view: 'tools' as const, layout: 'table' as const, priceBand: '0_01_to_0_03' as const, adoptionBand: '0' as const, tags: ['search', 'a&b'], bundleSlugs: ['image-tools'], hasInputFields: true, hasOutputFields: false, hasInputSchema: false, hasOutputSchema: true, hasOutputExample: false, curatedOnly: false, minUsdPrice: 0, maxUsdPrice: 0.03, minPayers30d: 0, maxPayers30d: 4, indexCursor: 'next:+/=' };
  const context = buildMarketReturnContext(search);
  expect(readMarketReturnContext(context)).toBe(context);
  expect(toMarketReturnNavigation(context).search).toEqual(search);
});
it.each([
  'minUsdPrice=0.1&maxUsdPrice=0.01', 'minPayers30d=5&maxPayers30d=4',
  'minPayers30d=0.5', 'hasInputSchema=0', 'hasOutputExample=',
  'tags=search', 'tags=%5B%5D', 'tags=%5B%22search%22%5D&tags=%5B%22other%22%5D',
  'priceBand=cheap', 'adoptionBand=none',
])('rejects malformed or reversed explorer return filters: %s', filters => {
  expect(readMarketReturnContext(`/market?${filters}`)).toBeUndefined();
});
