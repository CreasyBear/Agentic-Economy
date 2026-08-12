import { describe, expect, it, vi } from 'vitest'

import type {
  KeylessExecutableSourcePort,
  KeylessExecutableToolDescriptor,
  OperationExecutableDescriptor,
} from '@/modules/capability-execution'
import { seedKeylessExecutableSource } from '../../helpers/keyless-seed-source'
import {
  ANSWER_OPERATION_INPUT_MAX_BYTES,
  extractCanonicalOperationRefsFromRegistrySearchResult,
  filterKeylessDataAskCandidates,
  parseAnswerOperationSelectionInput,
  rebindKeylessDataAskFromRegistrySearch,
  resolveKeylessDataAsk,
  resolveKeylessDataAskSelection,
} from '@/modules/answer/internal/keyless-data-ask'
import { buildOperationArtifactsFromToolCalls } from '@/modules/answer/internal/operation-artifacts'
import { AnswerOperationCandidateSchema, AnswerOperationOutcomeSchema } from '@/modules/answer/answer-schema'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { parseAnswerOperationSelectionRecognition } from '@/modules/answer-thread/internal/turn-digests'

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
    price: { kind: 'fixed', amount: { currency: 'USD', units: '0', exponent: 2 } },
    effects: [],
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
      [postRef, executableDescriptor(postRef, {
        method: 'POST',
        effects: [{ class: 'external_state_change', authority: 'explicit' }],
      })],
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
    if (rebound.kind !== 'resolved') throw new Error(`unexpected resolution: ${rebound.kind}`)
    expect(rebound.candidates.map(({ operationRef }) => operationRef)).toEqual([currentRef])
    expect(rebound.operationCandidates?.map(({ operationRef }) => operationRef)).toEqual([currentRef])
    expect(rebound.selected?.operationRef).toBe(currentRef)
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

  it('deduplicates recovered refs and bounds newly rebound candidates to four', async () => {
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
    expect(result.kind).toBe('needs_clarification')
    if (result.kind !== 'needs_clarification') throw new Error('unexpected resolution kind')
    expect(result.candidates).toHaveLength(4)
    expect(result.candidates.map(({ operationRef }) => operationRef)).toEqual(refs.slice(0, 4))
    expect(result).toMatchObject({
      kind: 'needs_clarification',
      decision: {
        kind: 'choose_operation',
        candidates: refs.slice(0, 4).map((operationRef) => ({
          operationRef,
          offering: { label: 'XYZ current measurement' },
        })),
      },
    })
  })
})

describe('resolveKeylessDataAsk', () => {
  it('takes one sorted descriptor snapshot and selects only an exact canonical ref', async () => {
    const lowerRanked = strictDescriptor('lower.ranked', 'a')
    const topRanked = strictDescriptor('top.ranked', 'b')
    const descriptorSource = source([topRanked, lowerRanked], [topRanked.operationRef, 'operation:v1:readable'])

    await expect(resolveKeylessDataAsk('top ranked value', descriptorSource)).resolves.toMatchObject({
      kind: 'resolved',
      descriptors: [lowerRanked, topRanked],
      candidates: [topRanked],
      selected: topRanked,
    })
    expect(descriptorSource.list).toHaveBeenCalledTimes(1)
    expect(descriptorSource.search).toHaveBeenCalledWith('top ranked value', [lowerRanked, topRanked])
  })

  it('falls back to the executable descriptor snapshot when registry ranking returns only a keyed twin', async () => {
    const currency = strictDescriptor('currency.rate', 'a')
    const bitcoin = strictDescriptor('bitcoin.price', 'b')
    const descriptorSource = source(
      [currency, bitcoin],
      [`operation:v1:${'c'.repeat(64)}`],
    )

    await expect(resolveKeylessDataAsk('current bitcoin price in usd', descriptorSource)).resolves.toMatchObject({
      kind: 'resolved',
      candidates: [bitcoin],
      selected: bitcoin,
    })
  })

  it('returns ordered deduplicated candidates bounded to four without selecting multiple matches', async () => {
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

    await expect(resolveKeylessDataAsk('candidate values', descriptorSource)).resolves.toMatchObject({
      kind: 'needs_clarification',
      descriptors: candidateDescriptors,
      candidates: [
        candidateDescriptors[4],
        candidateDescriptors[1],
        candidateDescriptors[0],
        candidateDescriptors[2],
      ],
      decision: {
        kind: 'choose_operation',
        candidates: [
          candidateDescriptors[4]!,
          candidateDescriptors[1]!,
          candidateDescriptors[0]!,
          candidateDescriptors[2]!,
        ].map(({ operationRef, name }) => ({
          operationRef,
          offering: { label: name },
        })),
      },
    })
    expect(descriptorSource.search).toHaveBeenCalledWith('candidate values', candidateDescriptors)
  })

  it('selects one candidate when a distinctive candidate name appears in the query', async () => {
    const alpha = {
      ...strictDescriptor('alpha.weather', 'h'),
      name: 'Alpha Weather',
      summary: 'Shared weather feed',
      searchTerms: ['weather'],
    }
    const beta = {
      ...strictDescriptor('beta.weather', 'i'),
      name: 'Beta Weather',
      summary: 'Shared weather feed',
      searchTerms: ['weather'],
    }
    const descriptorSource = source(
      [alpha, beta],
      [alpha.operationRef, beta.operationRef],
    )

    await expect(resolveKeylessDataAsk('use Alpha weather for today', descriptorSource)).resolves.toMatchObject({
      kind: 'resolved',
      descriptors: [alpha, beta],
      candidates: [alpha, beta],
      selected: alpha,
    })
  })

  it('does not preserve a selected candidate when a later query names another operation', () => {
    const alpha = {
      ...strictDescriptor('alpha.weather', 'h'),
      name: 'Alpha Weather',
      summary: 'Shared weather feed',
      searchTerms: ['weather'],
    }
    const beta = {
      ...strictDescriptor('beta.weather', 'i'),
      name: 'Beta Weather',
      summary: 'Shared weather feed',
      searchTerms: ['weather'],
    }

    expect(filterKeylessDataAskCandidates('use Beta Weather', {
      kind: 'resolved',
      descriptors: [alpha, beta],
      candidates: [alpha, beta],
      selected: alpha,
    })).toMatchObject({
      kind: 'resolved',
      descriptors: [alpha, beta],
      candidates: [alpha, beta],
      selected: beta,
    })
  })

  it('drops a stale single selection when a later query is incompatible', () => {
    const selected = {
      ...strictDescriptor('alpha.weather', 'h'),
      name: 'Alpha Weather',
      summary: 'Weather observations.',
      searchTerms: ['weather'],
    }

    expect(filterKeylessDataAskCandidates('I need an emergency plumber', {
      kind: 'resolved',
      descriptors: [selected],
      candidates: [selected],
      selected,
    })).toEqual({
      kind: 'resolved',
      descriptors: [selected],
      candidates: [],
    })
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

    await expect(resolveKeylessDataAsk('strict value', descriptorSource)).resolves.toMatchObject({
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
    if (result.kind !== 'resolved') throw new Error(`unexpected result: ${result.kind}`)
    expect(result.candidates).toEqual(expected ? [descriptor] : [])
    expect(result.selected).toEqual(expected ? descriptor : undefined)
  })


  it('selects the unique highest-scoring live operation instead of asking about incidental cross-domain matches', async () => {
    const crypto = {
      ...strictDescriptor('coingecko.simple-price', 'c'),
      name: 'CoinGecko simple price',
      summary: 'Return current cryptocurrency prices for requested coin ids.',
      searchTerms: ['crypto price', 'bitcoin price', 'ethereum price', 'coin price'],
    }
    const exchangeRate = {
      ...strictDescriptor('frankfurter.single-rate', 'f'),
      name: 'Frankfurter ECB single-pair rate',
      summary: 'Return a current European Central Bank reference exchange rate.',
      searchTerms: ['currency conversion', 'exchange rate', 'convert money', 'USD'],
    }

    const result = await resolveKeylessDataAsk(
      'What is the current bitcoin price in USD?',
      source([crypto, exchangeRate], [crypto.operationRef, exchangeRate.operationRef]),
    )

    expect(result.kind).toBe('resolved')
    if (result.kind !== 'resolved') throw new Error(`unexpected result: ${result.kind}`)
    expect(result.selected?.operationRef).toBe(crypto.operationRef)
  })

  it('preserves clarification when an options request names multiple live-operation domains', async () => {
    const crypto = {
      ...strictDescriptor('coingecko.simple-price', 'c'),
      name: 'CoinGecko simple price',
      summary: 'Return current cryptocurrency prices.',
      searchTerms: ['bitcoin price', 'crypto price'],
    }
    const exchangeRate = {
      ...strictDescriptor('frankfurter.single-rate', 'f'),
      name: 'Frankfurter ECB single-pair rate',
      summary: 'Return a current exchange rate.',
      searchTerms: ['exchange rate', 'currency conversion'],
    }

    const result = await resolveKeylessDataAsk(
      'Compare bitcoin price and exchange-rate options without running anything.',
      source([crypto, exchangeRate], [crypto.operationRef, exchangeRate.operationRef]),
    )

    expect(result.kind).toBe('needs_clarification')
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
    const result = await resolveKeylessDataAsk('Convert EUR to USD', seedKeylessExecutableSource)

    expect(result.kind).toBe('resolved')
    if (result.kind !== 'resolved') throw new Error(`unexpected answer seed result: ${result.kind}`)

    const frankfurter = result.descriptors.filter((descriptor) => descriptor.capabilityId === 'frankfurter.single-rate')
    expect(frankfurter).toHaveLength(1)
    expect(frankfurter[0]).toMatchObject({
      operationRef: expect.stringMatching(/^operation:v1:[0-9a-f]{64}$/),
      capabilityId: 'frankfurter.single-rate',
    })
    expect(result.selected?.capabilityId).toBe('frankfurter.single-rate')
  })
})
describe('resolveKeylessDataAskSelection', () => {
  const alpha = {
    ...strictDescriptor('alpha.weather', 'a'),
    name: 'Alpha Weather',
    summary: 'Shared weather feed',
    searchTerms: ['weather'],
  }
  const beta = {
    ...strictDescriptor('beta.weather', 'b'),
    name: 'Beta Weather',
    summary: 'Shared weather feed',
    searchTerms: ['weather'],
  }

  async function fixture() {
    const initial = await resolveKeylessDataAsk('weather', source([alpha, beta], [
      alpha.operationRef,
      beta.operationRef,
    ]))
    expect(initial.kind).toBe('needs_clarification')
    if (initial.kind !== 'needs_clarification') throw new Error('expected candidate set')
    const current = new Map([
      [alpha.operationRef, executableDescriptor(alpha.operationRef, {
        capabilityId: alpha.capabilityId,
        name: alpha.name,
        inputSchema: alpha.inputSchema,
      })],
      [beta.operationRef, executableDescriptor(beta.operationRef, {
        capabilityId: beta.capabilityId,
        name: beta.name,
        inputSchema: beta.inputSchema,
      })],
    ])
    const selectionSource: KeylessExecutableSourcePort = {
      list: async () => [alpha, beta],
      read: vi.fn(async (operationRef) => current.get(operationRef) ?? null),
      search: async () => [alpha.operationRef, beta.operationRef],
    }
    return { initial, selectionSource }
  }

  it.each([
    ['option 1', 'operation:v1:' + 'a'.repeat(64)],
    ['choose Alpha Weather', 'operation:v1:' + 'a'.repeat(64)],
    ['operation:v1:' + 'b'.repeat(64), 'operation:v1:' + 'b'.repeat(64)],
  ])('resolves %s only within the frozen candidate set', async (query, expectedRef) => {
    const { initial, selectionSource } = await fixture()
    if (initial.kind !== 'needs_clarification') throw new Error('expected candidate set')
    const result = await resolveKeylessDataAskSelection(query, initial.decision.candidates, selectionSource)
    expect(result?.kind).toBe('resolved')
    expect(result?.kind === 'resolved' ? result.selected?.operationRef : undefined).toBe(expectedRef)
    expect(selectionSource.read).toHaveBeenCalledTimes(1)
  })

  it('parses an exact bounded operationRef and JSON object before authoritative rebind', async () => {
    const { initial, selectionSource } = await fixture()
    if (initial.kind !== 'needs_clarification') throw new Error('expected candidate set')
    const query = JSON.stringify({
      operationRef: beta.operationRef,
      input: { value: 'Darwin' },
      candidateSetDigest: initial.decision.candidateSetDigest,
    })

    expect(parseAnswerOperationSelectionInput(query)).toEqual({
      operationRef: beta.operationRef,
      input: { value: 'Darwin' },
      candidateSetDigest: initial.decision.candidateSetDigest,
    })
    const result = await resolveKeylessDataAskSelection(query, initial.decision.candidates, selectionSource)
    expect(result?.kind).toBe('resolved')
    expect(result?.kind === 'resolved' ? result.selected?.operationRef : undefined).toBe(beta.operationRef)
    expect(selectionSource.read).toHaveBeenCalledWith(beta.operationRef)
  })
  it('rejects an unsafe POST candidate during selection requalification', async () => {
    const { initial, selectionSource } = await fixture()
    if (initial.kind !== 'needs_clarification') throw new Error('expected candidate set')
    vi.mocked(selectionSource.read).mockImplementation(async (operationRef) =>
      operationRef === beta.operationRef
        ? executableDescriptor(beta.operationRef, {
            method: 'POST',
            effects: [{ class: 'external_state_change', authority: 'explicit' }],
            capabilityId: beta.capabilityId,
            name: beta.name,
            inputSchema: beta.inputSchema,
          })
        : null)

    const result = await resolveKeylessDataAskSelection('option 2', initial.decision.candidates, selectionSource)
    expect(result?.kind).toBe('needs_clarification')
    if (result?.kind !== 'needs_clarification') throw new Error('expected a clarification')
    expect(result.decision.status).toBe('unavailable')
    expect(result.decision.invalidOperationRef).toBe(beta.operationRef)
    expect(result.decision.candidates.map(({ operationRef }) => operationRef)).toEqual([alpha.operationRef])
  })

  it('rejects malformed, non-object, and oversized input envelopes', () => {
    expect(parseAnswerOperationSelectionInput('{"operationRef":')).toBeUndefined()
    expect(parseAnswerOperationSelectionInput(JSON.stringify({
      operationRef: alpha.operationRef,
      input: [],
    }))).toBeUndefined()
    expect(parseAnswerOperationSelectionInput(JSON.stringify({
      operationRef: alpha.operationRef,
      input: { value: 'x'.repeat(ANSWER_OPERATION_INPUT_MAX_BYTES) },
    }))).toBeUndefined()
  })
  it('triages structured envelopes without fresh search or execution', async () => {
    const { initial, selectionSource } = await fixture()
    const search = vi.spyOn(selectionSource, 'search')
    const candidateSetDigest = initial.decision.candidateSetDigest
    const alphaRef = alpha.operationRef
    const malformed = `{"operationRef":"${alphaRef}","input":{},"candidateSetDigest":"${candidateSetDigest}"`
    const reordered = JSON.stringify({
      candidateSetDigest,
      input: { value: 'Darwin' },
      operationRef: beta.operationRef,
    })
    const wrongDigest = JSON.stringify({
      input: { value: 'Darwin' },
      operationRef: alphaRef,
      candidateSetDigest: canonicalDigest({ stale: true }).toString(),
    })
    const wrongMembership = JSON.stringify({
      candidateSetDigest,
      input: { value: 'Darwin' },
      operationRef: `operation:v1:${'f'.repeat(64)}`,
    })
    const oversized = JSON.stringify({
      operationRef: alphaRef,
      input: { value: 'x'.repeat(ANSWER_OPERATION_INPUT_MAX_BYTES) },
      candidateSetDigest,
    })

    expect(parseAnswerOperationSelectionRecognition('weather')).toEqual({ kind: 'absent' })
    expect(parseAnswerOperationSelectionRecognition(malformed)).toEqual({ kind: 'invalid' })
    expect(parseAnswerOperationSelectionRecognition(reordered).kind).toBe('valid')
    expect(parseAnswerOperationSelectionRecognition(wrongDigest).kind).toBe('valid')
    expect(parseAnswerOperationSelectionRecognition(wrongMembership).kind).toBe('valid')
    expect(parseAnswerOperationSelectionRecognition(oversized)).toEqual({ kind: 'invalid' })

    for (const query of [malformed, wrongDigest, wrongMembership, oversized]) {
      const result = await resolveKeylessDataAskSelection(query, initial.decision.candidates, selectionSource)
      expect(result?.kind).toBe('needs_clarification')
    }
    const reorderedResult = await resolveKeylessDataAskSelection(
      reordered,
      initial.decision.candidates,
      selectionSource,
    )
    expect(reorderedResult?.kind).toBe('resolved')
    expect(search).not.toHaveBeenCalled()
    expect(selectionSource.read).toHaveBeenCalledTimes(1)
  })

  it('rejects stale structured choices before rereading the candidate', async () => {
    const { initial, selectionSource } = await fixture()
    if (initial.kind !== 'needs_clarification') throw new Error('expected candidate set')
    const query = JSON.stringify({
      operationRef: alpha.operationRef,
      input: { value: 'Darwin' },
      candidateSetDigest: canonicalDigest({ stale: true }).toString(),
    })

    const result = await resolveKeylessDataAskSelection(query, initial.decision.candidates, selectionSource)
    expect(result?.kind).toBe('needs_clarification')
    if (result?.kind !== 'needs_clarification') throw new Error('expected stale clarification')
    expect(result.decision.status).toBe('changed')
    expect(result.decision.candidates.map(({ operationRef }) => operationRef))
      .toEqual(initial.decision.candidates.map(({ operationRef }) => operationRef))
    expect(selectionSource.read).not.toHaveBeenCalled()
  })

  it('preserves keyless truth and canonical parameter metadata in Answer candidates', async () => {
    const { initial } = await fixture()
    if (initial.kind !== 'needs_clarification') throw new Error('expected candidate set')
    const candidate = initial.decision.candidates[0]
    if (candidate === undefined) throw new Error('expected candidate')
    expect(candidate.authority.authentication).toEqual({ kind: 'keyless' })
    const richParameter = {
      group: 'header' as const,
      name: 'x-api-key',
      type: 'string',
      description: 'Credential header',
      example: 'demo-key',
      enumValues: ['demo-key', 'live-key'],
      default: 'demo-key',
      style: 'simple' as const,
      explode: false,
      required: true as const,
    }
    const parsed = AnswerOperationCandidateSchema.safeParse({
      ...candidate,
      requiredParameters: [richParameter],
    })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.requiredParameters[0]).toEqual(richParameter)

    const authenticationVariants = [
      { kind: 'keyless' },
      { kind: 'platform_credential', scheme: 'api_key', in: 'query', name: 'api_key' },
      { kind: 'platform_credential', scheme: 'bearer' },
      { kind: 'x402' },
      { kind: 'unknown' },
    ] as const
    for (const authentication of authenticationVariants) {
      const variant = AnswerOperationCandidateSchema.safeParse({
        ...candidate,
        authority: { ...candidate.authority, authentication },
      })
      expect(variant.success).toBe(true)
      if (variant.success) expect(variant.data.authority.authentication).toEqual(authentication)
    }
  })

  it('accepts the current public price evidence in answer candidates', async () => {
    const { initial } = await fixture()
    if (initial.kind !== 'needs_clarification') throw new Error('expected candidate set')
    const candidate = initial.decision.candidates[0]
    expect(candidate).toBeDefined()
    expect(AnswerOperationCandidateSchema.safeParse({
      ...candidate,
      commercial: {
        ...candidate?.commercial,
        priceEvidence: {
          priceDigest: 'sha256:price',
          sourceRef: 'pricing:example',
          evidenceRefs: ['https://example.com/pricing'],
          observedAt: 1,
          validUntil: 2,
        },
      },
    }).success).toBe(true)
  })

  it('re-clarifies an invalid name without rereading or executing a non-candidate', async () => {
    const { initial, selectionSource } = await fixture()
    if (initial.kind !== 'needs_clarification') throw new Error('expected candidate set')
    const result = await resolveKeylessDataAskSelection('choose Gamma Weather', initial.decision.candidates, selectionSource)
    expect(result?.kind).toBe('needs_clarification')
    expect(result?.kind === 'needs_clarification' ? result.decision.candidateSetDigest : undefined)
      .toBe(initial.decision.candidateSetDigest)
    expect(selectionSource.read).not.toHaveBeenCalled()
  })

  it('keeps candidate-set identity when display compaction removes nonselected schemas', async () => {
    const { initial } = await fixture()
    if (initial.kind !== 'needs_clarification') throw new Error('expected candidate set')
    const artifacts = buildOperationArtifactsFromToolCalls([], initial)
    expect(artifacts.candidates).toHaveLength(2)
    expect(artifacts.candidates.every((candidate) => candidate.inputJsonSchema === undefined)).toBe(true)
    expect(artifacts.candidates.every((candidate) => candidate.exactRebindRequired)).toBe(true)
    expect(artifacts.candidateSetDigest).toBe(initial.decision.candidateSetDigest)
  })

  it('separates and validates the canonical operation result digest from the tool wrapper digest', () => {
    const operationRef = alpha.operationRef
    const result = {
      kind: 'ok' as const,
      operationRef,
      capabilityId: alpha.capabilityId,
      name: alpha.name,
      output: { value: 'current' },
      evidenceHash: 'sha256:evidence',
    }
    const wrapperDigest = 'sha256:tool-wrapper'
    const artifacts = buildOperationArtifactsFromToolCalls([{
      toolCallId: 'call:operation',
      turnId: 'turn:operation',
      seq: 0,
      toolId: 'operation.execute',
      inputJson: JSON.stringify({ operationRef, input: { value: 'current' } }),
      resultSummaryJson: JSON.stringify({ slugs: [], count: 0 }),
      resultJson: JSON.stringify(result),
      resultHash: wrapperDigest,
      status: 'complete',
      createdAt: 1,
    }])

    expect(artifacts.outcome).toMatchObject({
      resultDigest: canonicalDigest(result).toString(),
      toolCallDigest: wrapperDigest,
    })
    expect(AnswerOperationOutcomeSchema.safeParse({
      ...artifacts.outcome,
      resultDigest: 'sha256:forged',
    }).success).toBe(false)
    if (artifacts.outcome === undefined) throw new Error('expected operation outcome')
    expect(AnswerOperationOutcomeSchema.safeParse({
      ...artifacts.outcome,
      toolId: 'operation.invoke',
    }).success).toBe(false)
    const mismatchedResult = { ...result, operationRef: beta.operationRef }
    expect(AnswerOperationOutcomeSchema.safeParse({
      ...artifacts.outcome,
      result: mismatchedResult,
      resultDigest: canonicalDigest(mismatchedResult).toString(),
    }).success).toBe(false)
  })

  it('replays the recorder resultHash for an oversized operation refusal', () => {
    const operationRef = alpha.operationRef
    const result = {
      kind: 'refused' as const,
      operationRef,
      reason: 'result_too_large' as const,
      resultHash: 'sha256:full-result',
    }
    const wrapperDigest = 'sha256:tool-wrapper'
    const artifacts = buildOperationArtifactsFromToolCalls([{
      toolCallId: 'call:operation',
      turnId: 'turn:operation',
      seq: 0,
      toolId: 'operation.execute',
      inputJson: JSON.stringify({ operationRef, input: { value: 'current' } }),
      resultSummaryJson: JSON.stringify({ slugs: [], count: 0, errorCode: 'result_too_large' }),
      resultJson: JSON.stringify(result),
      resultHash: wrapperDigest,
      status: 'refused',
      createdAt: 1,
    }])

    expect(artifacts.outcome?.result).toEqual(result)
    expect(artifacts.outcome?.resultDigest).toBe(canonicalDigest(result).toString())
    expect(artifacts.outcome?.toolCallDigest).toBe(wrapperDigest)
  })

  it('re-clarifies when the selected operation schema changed after the candidate set was frozen', async () => {
    const { initial, selectionSource } = await fixture()
    if (initial.kind !== 'needs_clarification') throw new Error('expected candidate set')
    const changed = executableDescriptor(alpha.operationRef, {
      capabilityId: alpha.capabilityId,
      name: alpha.name,
      inputSchema: { type: 'object', properties: { changed: { type: 'string' } }, required: ['changed'] },
    })
    vi.mocked(selectionSource.read).mockResolvedValueOnce(changed)
    const result = await resolveKeylessDataAskSelection('option 1', initial.decision.candidates, selectionSource)
    expect(result?.kind).toBe('needs_clarification')
    if (result?.kind !== 'needs_clarification') throw new Error('expected changed clarification')
    expect(result.decision.status).toBe('changed')
    expect(result.decision.invalidOperationRef).toBe(alpha.operationRef)
    expect(result.decision.candidates.map(({ operationRef }) => operationRef))
      .not.toContain(alpha.operationRef)
    expect(result.decision.candidateSetDigest).not.toBe(initial.decision.candidateSetDigest)
    expect(selectionSource.read).toHaveBeenCalledTimes(1)
  })
})

