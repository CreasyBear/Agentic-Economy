import { describe, expect, it } from 'vitest'
import { createTestOperationLineage } from '../../helpers/customer-request-lineage'
import {
  defineCapabilityContract,
  openCapabilityDecisionModel,
  projectCapabilityInputValueSchema,
  type JsonValue,
} from '@/modules/capability-contract/public'
import {
  bindCustomerCapabilityDescriptor,
  suggestGeocodePriorStep,
} from '@/modules/customer-request/semantic-interpreter'
import { capabilityContractV2 } from '@/../tests/fixtures/capability-contract-v2'

type SchemaRecord = Readonly<Record<string, JsonValue>>

const forecastInputSchema: SchemaRecord = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    latitude: { type: 'number', minimum: -90, maximum: 90 },
    longitude: { type: 'number', minimum: -180, maximum: 180 },
  },
  required: ['latitude', 'longitude'],
  additionalProperties: false,
}
const forecastOutputSchema: SchemaRecord = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: { generationtime_ms: { type: 'number' } },
  required: ['generationtime_ms'],
  additionalProperties: false,
}

const geocodeInputSchema: SchemaRecord = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1 },
    count: { type: 'integer', minimum: 1, maximum: 5 },
  },
  required: ['name'],
  additionalProperties: false,
}
const geocodeOutputSchema: SchemaRecord = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: { results: { type: 'array', minItems: 1, items: { type: 'object' } } },
  required: ['results'],
  additionalProperties: false,
}

const coinInputSchema: SchemaRecord = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    ids: { type: 'string', minLength: 1 },
    vs_currencies: { type: 'string', minLength: 1 },
  },
  required: ['ids', 'vs_currencies'],
  additionalProperties: false,
}
const coinOutputSchema: SchemaRecord = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: { price: { type: 'object' } },
  required: ['price'],
  additionalProperties: false,
}

interface TestCapability {
  model: ReturnType<typeof openCapabilityDecisionModel>
  descriptor: ReturnType<typeof bindCustomerCapabilityDescriptor>
}

function capabilityWithContract(
  document: ReturnType<typeof capabilityContractV2>,
  inputSchema: SchemaRecord,
  inputExamples?: readonly { label?: string; input: Readonly<Record<string, JsonValue>> }[],
): TestCapability {
  const model = openCapabilityDecisionModel(defineCapabilityContract(document))
  const descriptor = bindCustomerCapabilityDescriptor({
    operationRef: createTestOperationLineage(model.contractRef).operationRef,
    contractRef: model.contractRef,
    selectionKey: model.selectionKey,
    name: document.name,
    description: document.description,
    inputs: model.inputs,
    valueSchemas: model.inputs.map((input) => ({
      inputKey: input.key,
      valueSchema: projectCapabilityInputValueSchema(inputSchema, input),
    })),
    evidence: model.evidence.map(({ label, purpose, schemaIdentity }) => ({ label, purpose, schemaIdentity })),
    ...(inputExamples === undefined ? {} : { inputExamples }),
  })
  return { model, descriptor }
}

function forecastCapability() {
  return capabilityWithContract(capabilityContractV2({
    capabilityId: 'open-meteo.forecast',
    name: 'Open-Meteo weather forecast',
    description: 'Returns a public weather forecast for a latitude/longitude.',
    inputSchema: forecastInputSchema,
    outputSchema: forecastOutputSchema,
    customerAnnotations: [
      { annotationId: 'latitude', document: 'input', pointer: '/latitude', label: 'Latitude', role: 'request' },
      { annotationId: 'longitude', document: 'input', pointer: '/longitude', label: 'Longitude', role: 'request' },
      { annotationId: 'forecast', document: 'output', pointer: '/generationtime_ms', label: 'Forecast result', role: 'completion_evidence' },
    ],
    dataUse: [
      { effectId: 'request_release', inputPointer: '/latitude', classification: 'public', phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['retrieve_weather_forecast'] },
      { effectId: 'request_release', inputPointer: '/longitude', classification: 'public', phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['retrieve_weather_forecast'] },
    ],
    evidence: [{ evidenceId: 'forecast', outputPointer: '/generationtime_ms', purpose: 'completion' }],
  }), forecastInputSchema, [
    { label: 'Paris weather', input: { latitude: 48.857, longitude: 2.352 } },
  ])
}

function geocodeCapability() {
  return capabilityWithContract(capabilityContractV2({
    capabilityId: 'open-meteo.geocoding',
    name: 'Open-Meteo geocoding search',
    description: 'Searches place names and returns matching coordinates through the keyless Open-Meteo geocoding API.',
    inputSchema: geocodeInputSchema,
    outputSchema: geocodeOutputSchema,
    customerAnnotations: [
      { annotationId: 'name', document: 'input', pointer: '/name', label: 'Location name', role: 'request' },
      { annotationId: 'results', document: 'output', pointer: '/results', label: 'Geocoding matches', role: 'completion_evidence' },
    ],
    dataUse: [
      { effectId: 'request_release', inputPointer: '/name', classification: 'public', phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['geocode_location_name'] },
      { effectId: 'request_release', inputPointer: '/count', classification: 'public', phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['bound_geocoding_matches'] },
    ],
    evidence: [{ evidenceId: 'results', outputPointer: '/results', purpose: 'completion' }],
  }), geocodeInputSchema)
}

function coinPriceCapability() {
  return capabilityWithContract(capabilityContractV2({
    capabilityId: 'coingecko.simple-price',
    name: 'CoinGecko simple price',
    description: 'Returns current market prices for crypto ids against requested fiat currencies.',
    inputSchema: coinInputSchema,
    outputSchema: coinOutputSchema,
    customerAnnotations: [
      { annotationId: 'ids', document: 'input', pointer: '/ids', label: 'Coin ids', role: 'request' },
      { annotationId: 'vs_currencies', document: 'input', pointer: '/vs_currencies', label: 'Quote currencies', role: 'request' },
      { annotationId: 'prices', document: 'output', pointer: '/price', label: 'Price record', role: 'completion_evidence' },
    ],
    dataUse: [
      { effectId: 'request_release', inputPointer: '/ids', classification: 'public', phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['retrieve_crypto_prices'] },
      { effectId: 'request_release', inputPointer: '/vs_currencies', classification: 'public', phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['retrieve_crypto_prices'] },
    ],
    evidence: [{ evidenceId: 'prices', outputPointer: '/price', purpose: 'completion' }],
  }), coinInputSchema)
}

describe('capability teaching surfaces', () => {
  it('carries inputExamples on the model-facing descriptor when seeded', () => {
    const forecast = forecastCapability()
    expect(forecast.descriptor.inputExamples).toEqual([
      { label: 'Paris weather', input: { latitude: 48.857, longitude: 2.352 } },
    ])
    expect(Object.isFrozen(forecast.descriptor.inputExamples)).toBe(true)
  })

  it('omits inputExamples from the descriptor by default when none are seeded', () => {
    expect(geocodeCapability().descriptor.inputExamples).toBeUndefined()
    expect(coinPriceCapability().descriptor.inputExamples).toBeUndefined()
  })
})

describe('deterministic geocode compose-teaching policy', () => {
  it('suggests a geocode prior step feeding lat/lon for a known coordinate mapping', () => {
    const forecast = forecastCapability()
    const geocode = geocodeCapability()
    const suggestion = suggestGeocodePriorStep(
      [forecast.descriptor, geocode.descriptor],
      { operationRef: forecast.descriptor.operationRef, facts: [] },
    )
    expect(suggestion).toBeDefined()
    expect(suggestion?.geocodeDescriptor.selectionKey).toBe(geocode.descriptor.selectionKey)
    expect(suggestion?.destinationDescriptor.selectionKey).toBe(forecast.descriptor.selectionKey)
    const fedPointers = suggestion?.fedInputKeys.map((key) => (
      forecast.descriptor.inputs.find((input) => input.inputKey === key)?.label
    )).sort()
    expect(fedPointers).toEqual(['Latitude', 'Longitude'])
    expect(suggestion?.reason).toBe('geocode_prior_step')
  })

  it('returns undefined when no geocoding op is registered', () => {
    const forecast = forecastCapability()
    const coin = coinPriceCapability()
    expect(suggestGeocodePriorStep(
      [forecast.descriptor, coin.descriptor],
      { operationRef: forecast.descriptor.operationRef, facts: [] },
    )).toBeUndefined()
  })

  it('returns undefined for an input that is not a coordinate pair (unmapped)', () => {
    const coin = coinPriceCapability()
    const geocode = geocodeCapability()
    expect(suggestGeocodePriorStep(
      [coin.descriptor, geocode.descriptor],
      { operationRef: coin.descriptor.operationRef, facts: [] },
    )).toBeUndefined()
  })

  it('returns undefined when the coordinates are already supplied', () => {
    const forecast = forecastCapability()
    const geocode = geocodeCapability()
    const latitude = forecast.descriptor.inputs.find((input) => input.label === 'Latitude')!
    const longitude = forecast.descriptor.inputs.find((input) => input.label === 'Longitude')!
    const facts = [
      { contractRef: forecast.descriptor.contractRef, selectionKey: forecast.descriptor.selectionKey, inputKey: latitude.inputKey, inputPointer: '/latitude', schemaIdentity: latitude.schemaIdentity, value: 48.857, source: { kind: 'customer' as const, assertionRef: 'assertion:test:1' } },
      { contractRef: forecast.descriptor.contractRef, selectionKey: forecast.descriptor.selectionKey, inputKey: longitude.inputKey, inputPointer: '/longitude', schemaIdentity: longitude.schemaIdentity, value: 2.352, source: { kind: 'customer' as const, assertionRef: 'assertion:test:2' } },
    ]
    expect(suggestGeocodePriorStep(
      [forecast.descriptor, geocode.descriptor],
      { operationRef: forecast.descriptor.operationRef, facts },
    )).toBeUndefined()
  })
})
