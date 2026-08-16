import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestOperationLineage } from '../../helpers/customer-request-lineage'
import {
  defineCapabilityContract,
  openCapabilityDecisionModel,
  projectCapabilityInputValueSchema,
  type JsonValue,
} from '@/modules/capability-contract/public'
import {
  createConfiguredRequestInterpreter,
  createDeterministicCustomerRequestInterpreter,
  capabilityDomainsConflict,
  classifyCapabilityDomain,
} from '@/modules/customer-request/application/interpret-compile'
import {
  bindCustomerCapabilityDescriptor,
  DETERMINISTIC_TOKEN_MATCH_INTERPRETER_ID,
  type ServerCapabilityDescriptor,
} from '@/modules/customer-request/semantic-interpreter'
import { capabilityContractV2 } from '@/../tests/fixtures/capability-contract-v2'

/**
 * Bounded multi-step recovery under the ENGINE CONTRACT (discovery-order selection + eligibility
 * gate). Selection NEVER re-ranks the pool: the caller passes the discovery-ranked eligible pool
 * and the deterministic interpreter picks from, but never reorders, that list — retrieval order is
 * the AI-SDK activeTools authority. Within that pool order it applies three honesty floors:
 * (1) the eligibility gate must classify the request GENUINE (hostile / greenfield /
 * non_executable / no_candidates propose nothing); (2) at most one binding per capability
 * identity; (3) the cross-capability domain guard keeps a multi-step recovery from ever mixing
 * crypto with an ECB-fiat-only op — even when the request's own domain classifies as `none`. The
 * cap stays MAXIMUM_SELECTIONS=2, so a genuine multi-step need (geocode a place, then fetch its
 * weather) is reachable while a single-intent query never gains a fabricated second step.
 */

const GEOCODING_NAME = 'Open-Meteo geocoding search'
const FORECAST_NAME = 'Open-Meteo weather forecast'

/** JSON-schema object, matching the working honesty-fixture shape (`Record<string, JsonValue>`). */
type SchemaRecord = Readonly<Record<string, JsonValue>>

function requestInputSchema(): SchemaRecord {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object',
    properties: { request: { type: 'string', minLength: 1 } },
    required: ['request'], additionalProperties: false,
  }
}

function placeInputSchema(): SchemaRecord {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object',
    properties: { name: { type: 'string', minLength: 1 }, count: { type: 'number' } },
    required: ['name'], additionalProperties: false,
  }
}

function weatherInputSchema(): SchemaRecord {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object',
    properties: {
      latitude: { type: 'number', minimum: -90, maximum: 90 },
      longitude: { type: 'number', minimum: -180, maximum: 180 },
    },
    required: ['latitude', 'longitude'], additionalProperties: false,
  }
}

function weatherOutputSchema(): SchemaRecord {
  return { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties: { generationtime_ms: { type: 'number' } }, required: ['generationtime_ms'], additionalProperties: false }
}

type BuiltCapability = {
  selectionKey: string
  descriptor: ServerCapabilityDescriptor
  get: () => ServerCapabilityDescriptor
}

function blockCapability(
  capabilityId: string,
  name: string,
  description: string,
  searchTerms: readonly string[],
  domain?: 'crypto' | 'fiat_fx' | 'none',
): BuiltCapability {
  const inputSchema = requestInputSchema()
  return buildCapability(
    capabilityContractV2({ capabilityId, name, description, inputSchema }),
    name, description, inputSchema, searchTerms, domain,
  )
}

function geocodingCapability(): BuiltCapability {
  const inputSchema = placeInputSchema()
  const description = 'Searches place names and returns matching coordinates and metadata through the keyless Open-Meteo geocoding API.'
  return buildCapability(capabilityContractV2({
    capabilityId: 'open-meteo.geocoding',
    name: GEOCODING_NAME,
    description,
    inputSchema,
    outputSchema: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties: { results: { type: 'array', minItems: 1, items: { type: 'object' } } }, required: ['results'], additionalProperties: false },
    customerAnnotations: [
      { annotationId: 'name', document: 'input', pointer: '/name', label: 'Location name', role: 'request' },
      { annotationId: 'results', document: 'output', pointer: '/results', label: 'Geocoding matches', role: 'completion_evidence' },
    ],
    dataUse: [
      { effectId: 'request_release', inputPointer: '/name', classification: 'public', phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['geocode_location_name'] },
      { effectId: 'count_release', inputPointer: '/count', classification: 'public', phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['bound_geocoding_matches'] },
    ],
    effects: [
      { effectId: 'request_release', class: 'data_release', authority: 'mandate_or_explicit', reversibility: 'irreversible' },
      { effectId: 'count_release', class: 'data_release', authority: 'mandate_or_explicit', reversibility: 'irreversible' },
    ],
    evidence: [{ evidenceId: 'results', outputPointer: '/results', purpose: 'completion' }],
  }), GEOCODING_NAME, description, inputSchema, ['geocode', 'geocoding', 'place search', 'find location'])
}

function forecastCapability(): BuiltCapability {
  const inputSchema = weatherInputSchema()
  const description = 'Returns a public weather forecast (current, hourly, or daily) for a latitude/longitude through the keyless Open-Meteo API.'
  return buildCapability(capabilityContractV2({
    capabilityId: 'open-meteo.forecast',
    name: FORECAST_NAME,
    description,
    inputSchema,
    outputSchema: weatherOutputSchema(),
    customerAnnotations: [
      { annotationId: 'latitude', document: 'input', pointer: '/latitude', label: 'Latitude', role: 'request' },
      { annotationId: 'longitude', document: 'input', pointer: '/longitude', label: 'Longitude', role: 'request' },
      { annotationId: 'forecast', document: 'output', pointer: '/generationtime_ms', label: 'Forecast result', role: 'completion_evidence' },
    ],
    dataUse: [
      { effectId: 'request_release', inputPointer: '/latitude', classification: 'public', phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['retrieve_weather_forecast'] },
      { effectId: 'request_release', inputPointer: '/longitude', classification: 'public', phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['retrieve_weather_forecast'] },
    ],
    effects: [{ effectId: 'request_release', class: 'data_release', authority: 'mandate_or_explicit', reversibility: 'irreversible' }],
    evidence: [{ evidenceId: 'forecast', outputPointer: '/generationtime_ms', purpose: 'completion' }],
  }), FORECAST_NAME, description, inputSchema, ['weather', 'forecast', 'temperature', 'current weather'])
}

function buildCapability(
  document: unknown,
  name: string,
  description: string,
  inputSchema: SchemaRecord,
  searchTerms: readonly string[],
  domain?: 'crypto' | 'fiat_fx' | 'none',
): BuiltCapability {
  const model = openCapabilityDecisionModel(defineCapabilityContract(document))
  const descriptor = bindCustomerCapabilityDescriptor({
    operationRef: createTestOperationLineage(model.contractRef).operationRef,
    contractRef: model.contractRef,
    selectionKey: model.selectionKey,
    name,
    description,
    inputs: model.inputs,
    valueSchemas: model.inputs.map((input) => ({
      inputKey: input.key,
      valueSchema: projectCapabilityInputValueSchema(inputSchema, input),
    })),
    evidence: model.evidence.map(({ label, purpose, schemaIdentity }) => ({ label, purpose, schemaIdentity })),
    ...(searchTerms.length > 0 ? { searchTerms } : {}),
    ...(domain === undefined ? {} : { domain }),
  })
  return { selectionKey: model.selectionKey, descriptor, get: () => descriptor }
}

function assertNoDomainConflictAmong(caps: readonly BuiltCapability[], keys: readonly string[]) {
  const byKey = new Map(caps.map((cap) => [cap.selectionKey, cap.descriptor]))
  const domains = keys.map((key) => classifyCapabilityDomain(byKey.get(key)!))
  for (let i = 0; i < domains.length; i += 1) {
    for (let j = i + 1; j < domains.length; j += 1) {
      expect(capabilityDomainsConflict(domains[i]!, domains[j]!)).toBe(false)
    }
  }
}

describe('deterministic bounded multi-step recovery', () => {
  it('returns a bounded 2-selection plan with non-conflicting domains for a genuine geocode+weather compose', async () => {
    const geocode = geocodingCapability()
    const forecast = forecastCapability()
    const cat = blockCapability('mockster.cat-images', 'Mockster random cat images',
      'Returns an exact bounded count of random cat image URLs.', ['cat images'])

    const proposal = await createDeterministicCustomerRequestInterpreter().propose({
      customerJob: 'geocode Paris then what is the weather forecast',
      capabilities: [geocode.get(), forecast.get(), cat.get()],
    })

    expect(proposal).toMatchObject({ kind: 'capability_candidates', interpreterId: DETERMINISTIC_TOKEN_MATCH_INTERPRETER_ID })
    if (proposal.kind === 'capability_candidates') {
      const keys = proposal.selections.map((selection) => selection.selectionKey)
      // Genuine two-intent need: geocode covers 'geocode', forecast covers 'weather'/'forecast' —
      // both are selected in pool order, and the plan never exceeds the recovery cap (2).
      expect(keys).toHaveLength(2)
      expect(keys).toEqual(expect.arrayContaining([geocode.selectionKey, forecast.selectionKey]))
      expect(keys.length).toBeLessThanOrEqual(2)
      assertNoDomainConflictAmong([geocode, forecast, cat], keys)
    }
  })

  it('never fabricates a second selection for a single-intent query that token-matches one capability', async () => {
    const geocode = geocodingCapability()
    const forecast = forecastCapability()
    // 'geocode Paris' genuinely needs only the geocoding op; the weather cap is in the pool but is
    // NOT token-specific to this request (it covers no uncovered request token), so it must not be
    // dragged in as a fabricated second step.
    const proposal = await createDeterministicCustomerRequestInterpreter().propose({
      customerJob: 'geocode Paris',
      capabilities: [geocode.get(), forecast.get()],
    })

    expect(proposal).toMatchObject({ kind: 'capability_candidates' })
    if (proposal.kind === 'capability_candidates') {
      expect(proposal.selections.map((selection) => selection.selectionKey)).toEqual([geocode.selectionKey])
    }
  })

  it('refuses a same-domain-conflicting pairing: a crypto query never gains an ECB-fiat-only op', async () => {
    const coingecko = blockCapability('coingecko.simple-price', 'CoinGecko simple price',
      'Returns current market prices for crypto ids against fiat currencies.',
      ['crypto price', 'bitcoin price', 'ethereum price'], 'crypto')
    const frankfurter = blockCapability('frankfurter.single-rate', 'Foreign exchange single rate',
      'Returns a current European Central Bank reference rate for a currency pair.',
      ['forex rate', 'exchange rate', 'currency conversion'], 'fiat_fx')

    // Pool order is DISCOVERY order (the interpreter never re-ranks — discovery is the retrieval
    // authority), so the crypto op leads even though the request also names an exchange-rate op.
    const proposal = await createDeterministicCustomerRequestInterpreter().propose({
      customerJob: 'bitcoin price and frankfurter exchange rate',
      capabilities: [coingecko.get(), frankfurter.get()],
    })

    expect(proposal).toMatchObject({ kind: 'capability_candidates' })
    if (proposal.kind === 'capability_candidates') {
      const keys = proposal.selections.map((selection) => selection.selectionKey)
      // The request classifies `crypto` ('bitcoin'), so the ECB-fiat-only op is culled outright.
      expect(keys).toEqual([coingecko.selectionKey])
      expect(keys).not.toContain(frankfurter.selectionKey)
      expect(keys).toHaveLength(1)
    }
  })

  it('rejects a domain-mismatched pairing even when the request domain is none (crypto + fiat must never co-plan)', async () => {
    const coingecko = blockCapability('coingecko.simple-price', 'CoinGecko simple price',
      'Returns current market prices for crypto ids against fiat currencies.',
      ['crypto price', 'bitcoin price'], 'crypto')
    const frankfurter = blockCapability('frankfurter.single-rate', 'Foreign exchange single rate',
      'Returns a current European Central Bank reference rate for a currency pair.',
      ['forex rate', 'exchange rate'], 'fiat_fx')

    // 'crypto price and exchange rate' is classified `none` (no concrete asset, no ISO pair) yet
    // token-matches BOTH a crypto op and a fiat op. The request-vs-capability guard alone would
    // not cull either (none conflicts with nothing), so the CROSS-capability guard must drop the
    // fiat op against the already-selected crypto op — no domain-mismatched multi-selection.
    const proposal = await createDeterministicCustomerRequestInterpreter().propose({
      customerJob: 'crypto price and exchange rate',
      capabilities: [coingecko.get(), frankfurter.get()],
    })

    expect(proposal).toMatchObject({ kind: 'capability_candidates' })
    if (proposal.kind === 'capability_candidates') {
      const keys = proposal.selections.map((selection) => selection.selectionKey)
      expect(keys).toEqual([coingecko.selectionKey])
      assertNoDomainConflictAmong([coingecko, frankfurter], keys)
    }
  })
})

describe('composite recovery composes a geocode-then-forecast 2-step plan', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

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

  it('recovers a geocode-then-forecast 2-step plan with the geocode op first and no double-add', async () => {
    stubModelDecline()
    const geocode = geocodingCapability()
    const forecast = forecastCapability()
    const interpreter = createConfiguredRequestInterpreter({
      openRouterApiKey: 'sk-test', modelName: 'test/model', maximumDescriptorBytes: 64_000,
    })

    // Pool order is [forecast, geocode] (discovery order, never re-ranked by the interpreter).
    const proposal = await interpreter.propose({
      customerJob: 'geocode Paris then what is the weather forecast',
      capabilities: [forecast.get(), geocode.get()],
    })

    expect(proposal).toMatchObject({ kind: 'capability_candidates', interpreterId: DETERMINISTIC_TOKEN_MATCH_INTERPRETER_ID })
    if (proposal.kind === 'capability_candidates') {
      const keys = proposal.selections.map((selection) => selection.selectionKey)
      // The recovered slice is deterministic [forecast, geocode]; suggestGeocodePriorStep then
      // reorders so the geocode op LEADS (it feeds coordinates forward to the forecast
      // destination). Exactly one of each, and the compose must not double-add the geocode op.
      expect(keys).toEqual([geocode.selectionKey, forecast.selectionKey])
      expect(new Set(keys).size).toBe(2)
    }
  })

  it('recovers a single fiat-pair selection, untouched by the multi-step cap', async () => {
    stubModelDecline()
    const frankfurter = blockCapability('frankfurter.single-rate', 'Foreign exchange single rate',
      'Returns a current European Central Bank reference rate for a currency pair.',
      ['forex rate', 'exchange rate', 'currency conversion'], 'fiat_fx')
    const geocode = geocodingCapability()
    const proposal = await createConfiguredRequestInterpreter({
      openRouterApiKey: 'sk-test', modelName: 'test/model', maximumDescriptorBytes: 64_000,
    }).propose({
      customerJob: 'convert EUR to USD',
      capabilities: [frankfurter.get(), geocode.get()],
    })

    expect(proposal).toMatchObject({ kind: 'capability_candidates' })
    if (proposal.kind === 'capability_candidates') {
      expect(proposal.selections.map((selection) => selection.selectionKey)).toEqual([frankfurter.selectionKey])
    }
  })

  it('under-specified/ambiguous recovery still surfaces needs_information, never a guessed plan', async () => {
    stubModelDecline()
    const geocode = geocodingCapability()
    const forecast = forecastCapability()
    // No token in the request is specific to either capability, so no leg can confidently compose
    // a plan; the honest outcome is a typed ask, never a guessed co-plan.
    const proposal = await createConfiguredRequestInterpreter({
      openRouterApiKey: 'sk-test', modelName: 'test/model', maximumDescriptorBytes: 64_000,
    }).propose({
      customerJob: 'give me some useful information',
      capabilities: [geocode.get(), forecast.get()],
    })

    expect(proposal).toMatchObject({ kind: 'needs_intent_direction', interpreterId: DETERMINISTIC_TOKEN_MATCH_INTERPRETER_ID })
  })
})
