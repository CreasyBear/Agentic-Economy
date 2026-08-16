import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestOperationLineage } from '../../helpers/customer-request-lineage'
import {
  defineCapabilityContract,
  openCapabilityDecisionModel,
  projectCapabilityInputValueSchema,
} from '@/modules/capability-contract/public'
import {
  createConfiguredRequestInterpreter,
  createDeterministicCustomerRequestInterpreter,
} from '@/modules/customer-request/application/interpret-compile'
import {
  bindCustomerCapabilityDescriptor,
  DETERMINISTIC_TOKEN_MATCH_INTERPRETER_ID,
  type CustomerRequestSemanticProposal,
} from '@/modules/customer-request/semantic-interpreter'
import type { ServerCapabilityDescriptor } from '@/modules/customer-request/semantic-interpreter'
import { capabilityContractV2 } from '@/../tests/fixtures/capability-contract-v2'

/**
 * Reproduces the LIVE multi-op curated pool against the ENGINE CONTRACT: discovery is the
 * retrieval authority, the interpreter selects from (never re-ranks) the discovery-ordered pool
 * once the eligibility gate confirms the request is GENUINE. Registration searches by exact
 * literal tokens (NFKC-normalized, NO stemming), so fixtures MUST carry the literal request words
 * in their registry searchTerms ('plumber' does not match 'plumbing'). The greedy uncovered-token
 * rule means alternatives sharing the same request vocabulary co-select only the top-ranked
 * candidate, and the honesty floor (hostile / greenfield / observed-x402) always yields zero
 * executable selections.
 */

const CRYPTO_JOB = 'bitcoin price in usd'
const GEOCODE_JOB = 'geocode Paris'
const SEARCH_JOB = 'search the web for AI agent payments'
const WEATHER_JOB = 'what is the weather in Paris'
const FX_JOB = 'convert EUR to USD'
const GREENFIELD_JOB = 'tell me a joke'

// Live-curated vocab (name + description + searchTerms), one factory closure per capability.
// The fx fixture carries the LITERAL pair codes ('eur'/'usd') so 'convert EUR to USD' resolves
// deterministically to the exchange-rate op; the geocoding/cat ops carry the bare verb 'search'
// only so a web-search request must rank the real web-search op first to win (discovery-order
// trust + greedy coverage), never a cat/geocoding op that merely shares the verb.
const weather = capability('open-meteo.forecast', 'Open-Meteo weather forecast',
  'Returns a public weather forecast (current, hourly, or daily) for a latitude/longitude through the keyless Open-Meteo API.',
  ['weather', 'forecast', 'temperature', 'current weather', 'hourly forecast', 'open-meteo'])
const coingecko = capability('coingecko.simple-price', 'CoinGecko simple price',
  'Returns current market prices for one or more crypto ids against requested fiat currencies through the keyless CoinGecko simple/price endpoint.',
  ['crypto price', 'bitcoin price', 'ethereum price', 'token price', 'coin price', 'crypto', 'bitcoin', 'ethereum', 'btc', 'eth', 'coingecko', 'cryptocurrency price'],
  'crypto')
const geocoding = capability('open-meteo.geocoding', 'Open-Meteo geocoding search',
  'Searches place names and returns matching coordinates and metadata through the keyless Open-Meteo geocoding API.',
  ['geocode', 'geocoding', 'place search', 'place lookup', 'city coordinates', 'coordinates lookup', 'location lookup', 'find location'])
const cat = capability('mockster.cat-images', 'Mockster random cat images',
  'Returns an exact bounded count of random cat image URLs through the keyless Mockster image endpoint.',
  ['cat', 'cat images', 'random cat', 'cat photo', 'cute cat pictures'])
const fx = capability('frankfurter.single-rate', 'Foreign exchange single rate',
  'Return a current European Central Bank reference rate for a currency pair.',
  ['forex rate', 'exchange rate', 'currency conversion', 'forex', 'eur', 'usd'], 'fiat_fx')
const tavily = capability('tavily.search', 'Tavily search',
  'Searches the web through Tavily and returns bounded, agent-oriented results.',
  ['tavily', 'web search', 'search the web', 'agent search', 'research'])

// Selection is discovery-order-trust with the greedy uncovered-token rule. The web-search op is
// ranked first (discovery consults the registry searchTerms), so a genuine 'search the web' goes
// to the actual web-search op — never to a cat/geocoding op that merely shares the verb 'search',
// and never composing two same-verb alternatives.
describe('deterministic recovery respects discovery vocabulary', () => {
  describe('multi-op pool resolves the query-specific capability', () => {
    it(`maps '${CRYPTO_JOB}' to CoinGecko, not weather`, async () => {
      const interpreter = createDeterministicCustomerRequestInterpreter()
      const proposal = await interpreter.propose({
        customerJob: CRYPTO_JOB,
        capabilities: [weather(), coingecko(), geocoding(), cat(), fx()],
      })
      expect(proposal).toMatchObject({
        kind: 'capability_candidates',
        interpreterId: DETERMINISTIC_TOKEN_MATCH_INTERPRETER_ID,
        selections: [{ selectionKey: coingecko().selectionKey }],
      })
    })

    it(`maps '${GEOCODE_JOB}' to the geocoding op, not FX`, async () => {
      const proposal = await createDeterministicCustomerRequestInterpreter().propose({
        customerJob: GEOCODE_JOB,
        capabilities: [weather(), coingecko(), geocoding(), cat(), fx()],
      })
      expect(proposal).toMatchObject({
        selections: [{ selectionKey: geocoding().selectionKey }],
      })
    })

    it(`maps '${WEATHER_JOB}' to open-meteo and stays intact`, async () => {
      const proposal = await createDeterministicCustomerRequestInterpreter().propose({
        customerJob: WEATHER_JOB,
        capabilities: [weather(), coingecko(), geocoding(), cat(), fx()],
      })
      expect(proposal).toMatchObject({
        selections: [{ selectionKey: weather().selectionKey }],
      })
    })

    it(`resolves '${FX_JOB}' deterministically to Frankfurter via the literal pair`, async () => {
      // The fx fixture carries the literal pair codes ('eur'/'usd') in its registry searchTerms,
      // so the deterministic leg matches the exact tokens 'convert EUR to USD' shares with it
      // (exact-token matching, no stemming) and selects frankfurter in pool order — no longer
      // dependent on the composite's fiat special-case. A crypto asset ("bitcoin price in usd")
      // still cannot grab fx: the cross-capability domain guard culls the fiat_fx op from a
      // crypto-domain request.
      const proposal = await createDeterministicCustomerRequestInterpreter().propose({
        customerJob: FX_JOB,
        capabilities: [weather(), coingecko(), geocoding(), cat(), fx()],
      })
      expect(proposal).toMatchObject({
        kind: 'capability_candidates',
        interpreterId: DETERMINISTIC_TOKEN_MATCH_INTERPRETER_ID,
        selections: [{ selectionKey: fx().selectionKey }],
      })
    })
  })

  describe('discovery-order trust + greedy coverage over shared vocabulary', () => {
    it(`'${SEARCH_JOB}' selects the web-search op ranked first, never a cat/geocoding op sharing 'search'`, async () => {
      // Discovery (registry.operations.search) ranks the genuine web-search op first for a
      // 'search the web' request; the interpreter trusts that order and never re-ranks. The
      // greedy uncovered-token rule then keeps ONLY tavily: after it claims 'search'/'web'/'agent',
      // the geocoding/cat ops that merely share the verb 'search' cover 0 uncovered tokens and are
      // skipped — no arbitrary cat grab, and never a co-selection of a same-verb alternative.
      const proposal = await createDeterministicCustomerRequestInterpreter().propose({
        customerJob: SEARCH_JOB,
        capabilities: [tavily(), weather(), coingecko(), geocoding(), cat(), fx()],
      })
      expect(selectionKeys(proposal)).toEqual([tavily().selectionKey])
    })

    it('alternatives sharing the request vocabulary co-select only the top-ranked (greedy uncovered-token)', async () => {
      // Two web-search ops (tavily + exa) with overlapping vocabulary are ALTERNATIVES, never
      // compose steps: greedy coverage keeps only the top-ranked (pool[0]) — the activeTools
      // one-tool-many-providers rule.
      const exa = capability('exa.search', 'Exa web search',
        'Searches the web through Exa and returns agent-oriented results.',
        ['web search', 'search the web', 'exa'])
      const proposal = await createDeterministicCustomerRequestInterpreter().propose({
        customerJob: SEARCH_JOB,
        capabilities: [tavily(), exa(), geocoding(), cat()],
      })
      expect(selectionKeys(proposal)).toEqual([tavily().selectionKey])
    })
  })

  describe('identical-vocabulary bindings of one capability never compose — pool order picks the first', () => {
    it('keeps only the pool[0] binding and never co-selects its identical sibling', async () => {
      const description = 'Burst pipe and blocked drain triage for urgent local plumbing issues.'
      const first = capability('plumbing.first', 'Emergency plumbing callout', description,
        ['plumber', 'plumbing', 'burst pipe', 'blocked drain', 'emergency callout'])
      const second = capability('plumbing.second', 'Emergency plumbing callout', description,
        ['plumber', 'plumbing', 'burst pipe', 'blocked drain', 'emergency callout'])
      const accounting = capability('accounting.review', 'Business accounting review',
        'Prepare and lodge business activity statements for local companies.',
        ['accounting', 'business activity', 'bas', 'lodge'])
      const interpreter = createDeterministicCustomerRequestInterpreter()
      const job = 'emergency plumber near me tonight, how much?'

      const forward = await interpreter.propose({
        customerJob: job,
        capabilities: [first(), second(), accounting()],
      })
      const reversed = await interpreter.propose({
        customerJob: job,
        capabilities: [accounting(), second(), first()],
      })
      // Identity-dedupe (name + description + searchTerms) treats first/second as ONE capability
      // bound through two providers — alternatives, never compose steps. The interpreter keeps
      // only the pool[0] binding (activeTools one-tool-many-providers), so forward -> first,
      // reversed -> second, and neither ever contains both.
      expect(selectionKeys(forward)).toEqual([first().selectionKey])
      expect(selectionKeys(reversed)).toEqual([second().selectionKey])
      // Determinism: the same pool always yields the same pool[0] binding.
      const again = await interpreter.propose({
        customerJob: job,
        capabilities: [first(), second(), accounting()],
      })
      expect(selectionKeys(again)).toEqual([first().selectionKey])
    })
  })
})

describe('configured interpreter recovery (recoverFromPool) over the live pool', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it(`recovers '${CRYPTO_JOB}' to CoinGecko after the model declines`, async () => {
    stubModelDecline()
    const proposal = await createConfiguredRequestInterpreter({
      openRouterApiKey: 'sk-test', modelName: 'test/model', maximumDescriptorBytes: 64_000,
    }).propose({
      customerJob: CRYPTO_JOB, capabilities: [weather(), coingecko(), geocoding(), cat(), fx()],
    })
    expect(proposal).toMatchObject({
      kind: 'capability_candidates',
      interpreterId: DETERMINISTIC_TOKEN_MATCH_INTERPRETER_ID,
      selections: [{ selectionKey: coingecko().selectionKey }],
    })
  })

  it(`recovers '${GEOCODE_JOB}' to the geocoding op after the model declines`, async () => {
    stubModelDecline()
    const proposal = await createConfiguredRequestInterpreter({
      openRouterApiKey: 'sk-test', modelName: 'test/model', maximumDescriptorBytes: 64_000,
    }).propose({
      customerJob: GEOCODE_JOB, capabilities: [weather(), coingecko(), geocoding(), cat(), fx()],
    })
    expect(proposal).toMatchObject({
      kind: 'capability_candidates',
      selections: [{ selectionKey: geocoding().selectionKey }],
    })
  })

  it(`recovers '${FX_JOB}' to Frankfurter after the model declines`, async () => {
    stubModelDecline()
    const proposal = await createConfiguredRequestInterpreter({
      openRouterApiKey: 'sk-test', modelName: 'test/model', maximumDescriptorBytes: 64_000,
    }).propose({
      customerJob: FX_JOB, capabilities: [weather(), coingecko(), geocoding(), cat(), fx()],
    })
    // The deterministic leg now matches the literal pair (fx searchTerms carry 'eur'/'usd'), so
    // recovery lands on Frankfurter through discovery-order selection — the fiat special-case in
    // recoverFromPool is no longer needed for this well-named pair.
    expect(proposal).toMatchObject({
      kind: 'capability_candidates',
      interpreterId: DETERMINISTIC_TOKEN_MATCH_INTERPRETER_ID,
      selections: [{ selectionKey: fx().selectionKey }],
    })
  })

  it(`refuses to fabricate an arbitrary op after the model declines and asks a typed question instead`, async () => {
    stubModelDecline()
    const proposal = await createConfiguredRequestInterpreter({
      openRouterApiKey: 'sk-test', modelName: 'test/model', maximumDescriptorBytes: 64_000,
    }).propose({
      customerJob: GREENFIELD_JOB, capabilities: [weather(), coingecko(), geocoding(), cat(), fx()],
    })
    // Honesty floor: a greenfield request (no literal overlap with any capability's vocabulary)
    // is GENUINELY non-resolvable, so recovery surfaces a typed needs_information ask — never a
    // capability_candidates preview grabbed from incidental vocabulary overlap.
    expect(proposal).toMatchObject({ kind: 'needs_intent_direction', interpreterId: DETERMINISTIC_TOKEN_MATCH_INTERPRETER_ID })
    expect(proposal).not.toMatchObject({ kind: 'capability_candidates' })
  })

  it(`surfaces a true provider 4xx via console.error for operators`, async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => new Response('payment required', { status: 402 })))
    const proposal = await createConfiguredRequestInterpreter({
      openRouterApiKey: 'sk-test', modelName: 'test/model', maximumDescriptorBytes: 64_000,
    }).propose({
      customerJob: CRYPTO_JOB, capabilities: [weather(), coingecko(), geocoding(), cat(), fx()],
      finalAttempt: true,
    })
    // A genuine provider/auth outage must stay visible to operators.
    expect(errorSpy).toHaveBeenCalledWith(
      'customer_request_semantic_interpretation_fell_back',
      'customer_request_interpretation_provider_402',
    )
    // Recovery still answers honestly from the curated pool.
    expect(proposal).toMatchObject({
      kind: 'capability_candidates',
      interpreterId: DETERMINISTIC_TOKEN_MATCH_INTERPRETER_ID,
      selections: [{ selectionKey: coingecko().selectionKey }],
    })
  })

  it(`keeps a routine decline (length -> provider_invalid) silent while still recovering honestly`, async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{
        message: {
          role: 'assistant',
          content: JSON.stringify({
            kind: 'unsupported_request', reason: 'requested_result_not_available', prompt: '',
            canonicalStatements: [], supersededStatements: [], selections: [],
          }),
        },
        finish_reason: 'length',
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    const proposal = await createConfiguredRequestInterpreter({
      openRouterApiKey: 'sk-test', modelName: 'test/model', maximumDescriptorBytes: 64_000,
    }).propose({
      customerJob: CRYPTO_JOB, capabilities: [weather(), coingecko(), geocoding(), cat(), fx()],
      finalAttempt: true,
    })
    // Routine selection-decline must not alarm the operator channel (no error, no fell_back warn).
    expect(warnSpy).not.toHaveBeenCalledWith(
      'customer_request_interpretation_provider_declined', expect.anything(), expect.anything())
    expect(warnSpy).not.toHaveBeenCalledWith('customer_request_semantic_interpretation_fell_back', expect.anything())
    expect(errorSpy).not.toHaveBeenCalled()
    // Recovery still produces the same honest outcome as before — a CoinGecko preview on the
    // deterministic identity, not a fabrication.
    expect(proposal).toMatchObject({
      kind: 'capability_candidates',
      interpreterId: DETERMINISTIC_TOKEN_MATCH_INTERPRETER_ID,
      selections: [{ selectionKey: coingecko().selectionKey }],
    })
  })
})

function selectionKeys(proposal: CustomerRequestSemanticProposal): readonly string[] {
  return proposal.kind === 'capability_candidates'
    ? proposal.selections.map((selection) => selection.selectionKey)
    : []
}

function stubModelDecline() {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
    choices: [{
      message: {
        role: 'assistant',
        content: JSON.stringify({
          kind: 'unsupported_request', reason: 'requested_result_not_available', prompt: '',
          canonicalStatements: [], supersededStatements: [], selections: [],
        }),
      },
      finish_reason: 'stop',
    }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
}

type Descriptor = ServerCapabilityDescriptor & { selectionKey: string }

function capability(
  capabilityId: string,
  name: string,
  description: string,
  searchTerms: readonly string[],
  domain?: 'crypto' | 'fiat_fx' | 'none',
) {
  const document = capabilityContractV2({ capabilityId, name, description, inputSchema: requestInputSchema() })
  const model = openCapabilityDecisionModel(defineCapabilityContract(document))
  const selectionKey = model.selectionKey
  const contractRef = model.contractRef
  const descriptor = bindCustomerCapabilityDescriptor({
    operationRef: createTestOperationLineage(model.contractRef).operationRef,
    contractRef,
    selectionKey,
    name,
    description,
    inputs: model.inputs,
    valueSchemas: model.inputs.map((input) => ({
      inputKey: input.key,
      valueSchema: projectCapabilityInputValueSchema(requestInputSchema(), input),
    })),
    evidence: model.evidence.map(({ label, purpose, schemaIdentity }) => ({ label, purpose, schemaIdentity })),
    ...(searchTerms.length > 0 ? { searchTerms } : {}),
    ...(domain === undefined ? {} : { domain }),
  }) as Descriptor
  return () => descriptor
}

function requestInputSchema() {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object',
    properties: { request: { type: 'string', minLength: 1 } },
    required: ['request'], additionalProperties: false,
  }
}
