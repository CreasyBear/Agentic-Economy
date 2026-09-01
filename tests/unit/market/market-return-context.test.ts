import { describe, expect, it } from 'vitest'

import {
  buildMarketReturnContext,
  readMarketReturnContext,
} from '@/components/ae/market/market-return-context'

describe('market return context', () => {
  it('round-trips every known catalog presentation parameter', () => {
    const first = `operation:v1:${'a'.repeat(64)}`
    const second = `operation:v1:${'b'.repeat(64)}`
    const context = buildMarketReturnContext({
      window: '7d',
      query: 'company registry',
      availability: 'routeable',
      category: 'identity-compliance',
      capability: 'identity.company_search',
      cursor: 'page-2',
      compare: `${first},${second}`,
    }, 'operations')

    expect(readMarketReturnContext(context)).toBe(context)
    const url = new URL(context, 'https://agentic-economy.example')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      window: '7d',
      query: 'company registry',
      availability: 'routeable',
      category: 'identity-compliance',
      capability: 'identity.company_search',
      cursor: 'page-2',
      compare: `${first},${second}`,
    })
    expect(url.hash).toBe('#operations')
  })

  it.each([
    'https://evil.example/market?window=30d',
    '//evil.example/market?window=30d',
    '/marketplace?window=30d',
    '/market?window=30d&next=https://evil.example',
    '/market?window=forever',
    '/market?window=30d#admin',
    '/market?window=30d&window=7d',
  ])('refuses non-market, open-redirect, unknown, or ambiguous input: %s', (value) => {
    expect(readMarketReturnContext(value)).toBeUndefined()
  })
})
