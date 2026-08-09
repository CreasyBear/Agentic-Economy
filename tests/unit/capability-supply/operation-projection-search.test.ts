import { describe, expect, it } from 'vitest'

import { rankOperationSearchText } from '@/modules/capability-supply/operation-projection'

describe('capability operation search ranking', () => {
  it('does not select geocoding or cat operations from generic web-search words', () => {
    const ranked = rankOperationSearchText('Search the web for the latest on electric cars', [
      {
        value: 'geocoding',
        operationRef: 'operation:v1:' + 'a'.repeat(64),
        searchText: ['Open-Meteo geocoding search place lookup coordinates'],
      },
      {
        value: 'cat',
        operationRef: 'operation:v1:' + 'b'.repeat(64),
        searchText: ['Random cat image search'],
      },
    ])

    expect(ranked).toEqual([])
  })

  it('keeps meaningful capability terms after removing generic action and recency words', () => {
    const ranked = rankOperationSearchText('Get the current bitcoin value', [
      {
        value: 'weather',
        operationRef: 'operation:v1:' + 'a'.repeat(64),
        searchText: ['Open-Meteo weather forecast'],
      },
      {
        value: 'bitcoin',
        operationRef: 'operation:v1:' + 'b'.repeat(64),
        searchText: ['CoinGecko bitcoin price'],
      },
    ])

    expect(ranked).toEqual(['bitcoin'])
  })
})
