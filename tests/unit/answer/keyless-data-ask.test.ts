import { describe, expect, it, vi } from 'vitest'

import type {
  KeylessExecutableSourcePort,
  KeylessExecutableToolDescriptor,
  OperationExecutableDescriptor,
} from '@/modules/capability-execution'
import { seedKeylessExecutableSource } from '@/modules/capability-execution'
import {
  extractCanonicalOperationRefsFromRegistrySearchResult,
  rebindKeylessDataAskFromRegistrySearch,
  resolveKeylessDataAsk,
} from '@/modules/answer/internal/keyless-data-ask'

const strictDescriptor = (capabilityId: string, suffix: string): KeylessExecutableToolDescriptor => ({
  operationRef: `operation:v1:${suffix.repeat(64)}`,
  capabilityId,
  name: capabilityId,
  summary: `${capabilityId} summary`,
  searchTerms: [capabilityId],
  inputSchema: {
    type: 'object',
    properties: { value: { type: 'string' } },
    required: ['value'],
    additionalProperties: false,
  },
})

const looseDescriptor: KeylessExecutableToolDescriptor = {
  ...strictDescriptor('loose.operation', 'e'),
  inputSchema: {
    type: 'object',
    properties: { value: { type: 'string' } },
  },
}

function source(
  descriptors: readonly KeylessExecutableToolDescriptor[],
  rankedRefs: readonly string[] = [],
) {
  return {
    list: vi.fn().mockResolvedValue(descriptors),
    read: vi.fn().mockResolvedValue(null),
    search: vi.fn().mockResolvedValue(rankedRefs),
  } satisfies KeylessExecutableSourcePort
}

function executableDescriptor(
  operationRef: string,
  overrides: Partial<OperationExecutableDescriptor> = {},
): OperationExecutableDescriptor {
  return {
    operationRef,
    capabilityId: 'xyz.current-measurement',
    name: 'XYZ current measurement',
    endpointUrl: 'https://api.example.test/current',
    authority: { kind: 'keyless' },
    adapterId: 'http-json:v1',
    method: 'GET',
    query: [{ inputPointer: '/city', parameter: 'city' }],
    requestTimeoutMs: 5_000,
    inputSchema: {
      type: 'object',
      properties: { city: { type: 'string' } },
      required: ['city'],
      additionalProperties: false,
    },
    provenance: { publisher: 'provider_owned', sourceKind: 'openapi_http' },
    ...overrides,
  }
}

describe('registry search recovery rebind', () => {
  it('extracts canonical refs and rereads current executable state before binding', async () => {
    const currentRef = `operation:v1:${'a'.repeat(64)}`
    const keyedRef = `operation:v1:${'b'.repeat(64)}`
    const postRef = `operation:v1:${'c'.repeat(64)}`
    const x402Ref = `operation:v1:${'d'.repeat(64)}`
    const looseRef = `operation:v1:${'e'.repeat(64)}`
    const staleRef = `operation:v1:${'f'.repeat(64)}`
    const searchResult = {
      kind: 'ok',
      items: [
        { operationRef: currentRef, summary: 'Current measurement by city.' },
        { operationRef: currentRef, summary: 'Duplicate current measurement.' },
        { operationRef: keyedRef, summary: 'Current measurement by city.' },
        { operationRef: postRef, summary: 'Current measurement by city.' },
        { operationRef: x402Ref, summary: 'Current measurement by city.' },
        { operationRef: looseRef, summary: 'Current measurement by city.' },
        { operationRef: staleRef, summary: 'Current measurement by city.' },
        { operationRef: 'operation:v1:readable', summary: 'Current measurement by city.' },
      ],
    }
    expect(extractCanonicalOperationRefsFromRegistrySearchResult(searchResult)).toEqual([
      currentRef,
      keyedRef,
      postRef,
      x402Ref,
      looseRef,
      staleRef,
    ])

    const descriptors = new Map<string, OperationExecutableDescriptor>([
      [currentRef, executableDescriptor(currentRef)],
      [keyedRef, executableDescriptor(keyedRef, {
        authority: {
          kind: 'provider_connection',
          connectionRef: 'connection:xyz',
          providerRef: 'provider:xyz',
        },
      })],
      [postRef, executableDescriptor(postRef, { method: 'POST' })],
      [x402Ref, executableDescriptor(x402Ref, { provenance: { publisher: 'observed_external', sourceKind: 'x402' } })],
      [looseRef, executableDescriptor(looseRef, {
        inputSchema: { type: 'object', properties: { city: { type: 'string' } } },
      })],
    ])
    const read = vi.fn(async (operationRef: string) => descriptors.get(operationRef) ?? null)
    const rebound = await rebindKeylessDataAskFromRegistrySearch(
      'what is the current measurement for Sydney?',
      searchResult,
      {
        list: async () => [],
        read,
        search: async () => [],
      },
    )

    expect(rebound.kind).toBe('resolved')
    if (rebound.kind !== 'resolved') throw new Error(`unexpected resolution: ${rebound.reason}`)
    expect(rebound.candidates).toHaveLength(1)
    expect(rebound.candidates[0]).toMatchObject({
      operationRef: currentRef,
      capabilityId: 'xyz.current-measurement',
      inputSchema: descriptors.get(currentRef)?.inputSchema,
    })
    expect(read.mock.calls.map(([operationRef]) => operationRef)).toEqual([
      currentRef,
      keyedRef,
      postRef,
      x402Ref,
      looseRef,
      staleRef,
    ])
  })

  it('deduplicates recovered refs and bounds newly rebound candidates to five', async () => {
    const refs = ['a', 'b', 'c', 'd', 'e', 'f'].map((suffix) => `operation:v1:${suffix.repeat(64)}`)
    const source = {
      list: async () => [],
      read: async (operationRef: string) => executableDescriptor(operationRef),
      search: async () => [],
    } satisfies KeylessExecutableSourcePort
    const result = await rebindKeylessDataAskFromRegistrySearch(
      'current measurement',
      {
        kind: 'ok',
        items: refs.flatMap((operationRef) => [{ operationRef }, { operationRef }]),
      },
      source,
    )
    expect(result.kind).toBe('resolved')
    if (result.kind !== 'resolved') throw new Error(`unexpected resolution: ${result.reason}`)
    expect(result.candidates).toHaveLength(5)
    expect(result.candidates.map(({ operationRef }) => operationRef)).toEqual(refs.slice(0, 5))
  })
})

describe('resolveKeylessDataAsk', () => {
  it('takes one sorted descriptor snapshot and selects only an exact canonical ref', async () => {
    const lowerRanked = strictDescriptor('lower.ranked', 'a')
    const topRanked = strictDescriptor('top.ranked', 'b')
    const descriptorSource = source([topRanked, lowerRanked], [topRanked.operationRef, 'operation:v1:readable'])

    await expect(resolveKeylessDataAsk('top ranked value', descriptorSource)).resolves.toEqual({
      kind: 'resolved',
      descriptors: [lowerRanked, topRanked],
      candidates: [topRanked],
      selected: topRanked,
    })
    expect(descriptorSource.list).toHaveBeenCalledTimes(1)
    expect(descriptorSource.search).toHaveBeenCalledWith('top ranked value', [lowerRanked, topRanked])
  })

  it('returns ordered deduplicated candidates bounded to five without selecting multiple matches', async () => {
    const candidateDescriptors = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
      .map((suffix, index) => strictDescriptor(`candidate.${index}`, suffix))
    const rankedRefs = [
      candidateDescriptors[4]!.operationRef,
      candidateDescriptors[1]!.operationRef,
      candidateDescriptors[4]!.operationRef,
      candidateDescriptors[0]!.operationRef,
      candidateDescriptors[2]!.operationRef,
      candidateDescriptors[3]!.operationRef,
      candidateDescriptors[5]!.operationRef,
      candidateDescriptors[6]!.operationRef,
    ]
    const descriptorSource = source([...candidateDescriptors].reverse(), rankedRefs)

    await expect(resolveKeylessDataAsk('candidate values', descriptorSource)).resolves.toEqual({
      kind: 'resolved',
      descriptors: candidateDescriptors,
      candidates: [
        candidateDescriptors[4],
        candidateDescriptors[1],
        candidateDescriptors[0],
        candidateDescriptors[2],
        candidateDescriptors[3],
      ],
    })
    expect(descriptorSource.search).toHaveBeenCalledWith('candidate values', candidateDescriptors)
  })

  it('returns duplicate_operation_ref before searching', async () => {
    const first = strictDescriptor('first.operation', 'a')
    const second = { ...strictDescriptor('second.operation', 'b'), operationRef: first.operationRef }
    const descriptorSource = source([first, second], [first.operationRef])

    await expect(resolveKeylessDataAsk('shared value', descriptorSource)).resolves.toEqual({
      kind: 'unavailable',
      reason: 'duplicate_operation_ref',
    })
    expect(descriptorSource.search).not.toHaveBeenCalled()
  })

  it('preserves the full descriptor snapshot while excluding non-strict candidates', async () => {
    const strict = strictDescriptor('strict.operation', 'a')
    const descriptorSource = source([looseDescriptor, strict], [strict.operationRef])

    await expect(resolveKeylessDataAsk('strict value', descriptorSource)).resolves.toEqual({
      kind: 'resolved',
      descriptors: [strict, looseDescriptor],
      candidates: [strict],
      selected: strict,
    })
    expect(descriptorSource.search).toHaveBeenCalledWith('strict value', [strict, looseDescriptor])
  })

  it('preserves an authoritative empty or non-match search without selection', async () => {
    const descriptor = strictDescriptor('empty.search', 'a')
    const descriptorSource = source([descriptor])

    await expect(resolveKeylessDataAsk('', descriptorSource)).resolves.toEqual({
      kind: 'resolved',
      descriptors: [descriptor],
      candidates: [],
    })
  })
  it.each([
    {
      query: 'I need a plumber',
      capabilityId: 'thecatapi.image-search',
      name: 'Random cat image search',
      summary: 'Returns random cat image URLs through TheCatAPI.',
      searchTerms: ['cat', 'cat photo'],
      expected: false,
    },
    {
      query: 'Show me a cat photo',
      capabilityId: 'thecatapi.image-search',
      name: 'Random cat image search',
      summary: 'Returns random cat image URLs through TheCatAPI.',
      searchTerms: ['cat', 'cat photo'],
      expected: true,
    },
    {
      query: 'What is the current bitcoin price?',
      capabilityId: 'coingecko.simple-price',
      name: 'CoinGecko simple price',
      summary: 'Returns current cryptocurrency prices for requested coin ids.',
      searchTerms: ['crypto price', 'bitcoin', 'btc'],
      expected: true,
    },
    {
      query: 'Convert EUR to USD',
      capabilityId: 'frankfurter.single-rate',
      name: 'Frankfurter ECB single-pair rate',
      summary: 'Returns one current European Central Bank reference rate.',
      searchTerms: ['currency conversion', 'exchange rate', 'eur', 'usd', 'convert currency'],
      expected: true,
    },
    {
      query: 'What is the weather in Melbourne?',
      capabilityId: 'open-meteo.forecast',
      name: 'Open-Meteo weather forecast',
      summary: 'Returns a public weather forecast for a latitude and longitude.',
      searchTerms: ['weather', 'forecast', 'temperature'],
      expected: true,
    },
    {
      query: 'What is the current value?',
      capabilityId: 'generic.current-value',
      name: 'Current value lookup',
      summary: 'Returns the current value.',
      searchTerms: ['current', 'value', 'lookup'],
      expected: false,
    },
    {
      query: 'Find coordinates for Melbourne',
      capabilityId: 'open-meteo.geocoding',
      name: 'Open-Meteo geocoding search',
      summary: 'Searches place names and returns matching coordinates.',
      searchTerms: ['geocode', 'geocoding', 'city coordinates', 'location lookup'],
      expected: true,
    },
    {
      query: 'Summarize the Wikipedia article on Ada Lovelace',
      capabilityId: 'wikipedia-rest.page-summary',
      name: 'Wikipedia page summary',
      summary: 'Returns a plain-text summary and metadata for a Wikipedia page.',
      searchTerms: ['wikipedia', 'page summary', 'article summary', 'encyclopedia'],
      expected: true,
    },
  ])('applies the final domain gate for $query', async ({
    query,
    capabilityId,
    name,
    summary,
    searchTerms,
    expected,
  }) => {
    const descriptor = {
      ...strictDescriptor(capabilityId, 'd'),
      name,
      summary,
      searchTerms,
    }
    const descriptorSource = source([descriptor], [descriptor.operationRef])

    const result = await resolveKeylessDataAsk(query, descriptorSource)

    expect(result.kind).toBe('resolved')
    if (result.kind !== 'resolved') throw new Error(`unexpected result: ${result.reason}`)
    expect(result.candidates).toEqual(expected ? [descriptor] : [])
    expect(result.selected).toEqual(expected ? descriptor : undefined)
  })


  it('maps list and search failures to typed source_unavailable', async () => {
    const listFailure = source([])
    listFailure.list.mockRejectedValue(new Error('list down'))
    await expect(resolveKeylessDataAsk('current bitcoin value', listFailure)).resolves.toEqual({
      kind: 'unavailable',
      reason: 'source_unavailable',
    })

    const searchFailure = source([strictDescriptor('search.failure', 'a')])
    searchFailure.search.mockRejectedValue(new Error('search down'))
    await expect(resolveKeylessDataAsk('value', searchFailure)).resolves.toEqual({
      kind: 'unavailable',
      reason: 'source_unavailable',
    })
  })
  it('exposes the curated Frankfurter operation through the answer seed fallback', async () => {
    const result = await resolveKeylessDataAsk('Convert 100 US dollars to euros', seedKeylessExecutableSource)

    expect(result.kind).toBe('resolved')
    if (result.kind !== 'resolved') throw new Error(`unexpected answer seed result: ${result.reason}`)

    const frankfurter = result.descriptors.filter((descriptor) => descriptor.capabilityId === 'frankfurter.single-rate')
    expect(frankfurter).toHaveLength(1)
    expect(frankfurter[0]).toMatchObject({
      operationRef: expect.stringMatching(/^operation:v1:[0-9a-f]{64}$/),
      capabilityId: 'frankfurter.single-rate',
    })
    expect(result.selected?.capabilityId).toBe('frankfurter.single-rate')
  })
})

