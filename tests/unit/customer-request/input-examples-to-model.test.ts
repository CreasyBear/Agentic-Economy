import { describe, expect, it } from 'vitest'
import { createTestOperationLineage } from '../../helpers/customer-request-lineage'
import {
  defineCapabilityContract,
  openCapabilityDecisionModel,
  projectCapabilityInputValueSchema,
  type CapabilityDecisionModel,
  type JsonValue,
} from '@/modules/capability-contract/public'
import {
  bindCustomerCapabilityDescriptor,
  createJsonCustomerRequestSemanticInterpreter,
  type CustomerRequestSemanticInterpreterPayload,
  type ServerCapabilityDescriptor,
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

type InputExample = readonly { label?: string; input: Readonly<Record<string, JsonValue>> }[]

interface TestCapability {
  model: CapabilityDecisionModel
  descriptor: ServerCapabilityDescriptor
}

function capabilityWithContract(
  document: ReturnType<typeof capabilityContractV2>,
  inputSchema: SchemaRecord,
  inputExamples?: InputExample,
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
    { input: { latitude: 40.7128, longitude: -74.006 } },
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

describe('input examples projected to model payload', () => {
  it('carries worked inputExamples intact on the seeded operation and omits the key on the unseeded one', async () => {
    const forecast = forecastCapability()
    const geocode = geocodeCapability()
    const maximumPayloadBytes = 1_000_000

    let capturedPayload: CustomerRequestSemanticInterpreterPayload | undefined
    const interpreter = createJsonCustomerRequestSemanticInterpreter({
      interpreterId: 'test:interpreter:input-examples',
      timeoutMs: 10_000,
      maximumPayloadBytes,
      maximumResponseBytes: 1_000_000,
      transport: {
        generateJson: async (input) => {
          capturedPayload = input.payload
          return {
            kind: 'capability_candidates',
            canonicalStatements: [],
            supersededStatements: [],
            selections: [],
          }
        },
      },
    })

    await interpreter.propose({
      customerJob: 'customer:test:1',
      capabilities: [forecast.descriptor, geocode.descriptor],
    })

    expect(capturedPayload).toBeDefined()
    const capabilities = capturedPayload!.capabilities
    const forecastPayload = capabilities.find((candidate) => candidate.selectionKey === forecast.descriptor.selectionKey)!
    const geocodePayload = capabilities.find((candidate) => candidate.selectionKey === geocode.descriptor.selectionKey)!

    // (a) worked examples intact on the seeded op: labels + inputs preserved, including a label-less example.
    expect(forecastPayload.inputExamples).toEqual([
      { label: 'Paris weather', input: { latitude: 48.857, longitude: 2.352 } },
      { input: { latitude: 40.7128, longitude: -74.006 } },
    ])

    // (b) unseeded op OMITS the inputExamples key entirely (no undefined-valued key).
    expect(Object.prototype.hasOwnProperty.call(geocodePayload, 'inputExamples')).toBe(false)
    expect(geocodePayload.inputExamples).toBeUndefined()

    // (c) JSON round-trip byte length stays within the configured maximumPayloadBytes.
    const byteLength = new TextEncoder().encode(JSON.stringify(capturedPayload)).byteLength
    expect(byteLength).toBeGreaterThan(0)
    expect(byteLength).toBeLessThanOrEqual(maximumPayloadBytes)
  })

  it('does not leak server-side searchTerms or domain into the model payload', async () => {
    const forecast = forecastCapability()
    const geocode = geocodeCapability()
    let capturedPayload: CustomerRequestSemanticInterpreterPayload | undefined
    const interpreter = createJsonCustomerRequestSemanticInterpreter({
      interpreterId: 'test:interpreter:input-examples:no-leak',
      timeoutMs: 10_000,
      maximumPayloadBytes: 1_000_000,
      maximumResponseBytes: 1_000_000,
      transport: {
        generateJson: async (input) => {
          capturedPayload = input.payload
          return {
            kind: 'capability_candidates',
            canonicalStatements: [],
            supersededStatements: [],
            selections: [],
          }
        },
      },
    })
    await interpreter.propose({
      customerJob: 'customer:test:2',
      capabilities: [forecast.descriptor, geocode.descriptor],
    })
    for (const candidate of capturedPayload!.capabilities) {
      expect(Object.prototype.hasOwnProperty.call(candidate, 'searchTerms')).toBe(false)
      expect(Object.prototype.hasOwnProperty.call(candidate, 'domain')).toBe(false)
    }
  })
})

describe('input examples payload guard', () => {
  it('rejects a payload that exceeds maximumPayloadBytes', async () => {
    const forecast = forecastCapability()
    const maximumPayloadBytes = 1
    const interpreter = createJsonCustomerRequestSemanticInterpreter({
      interpreterId: 'test:interpreter:input-examples:guard',
      timeoutMs: 10_000,
      maximumPayloadBytes,
      maximumResponseBytes: 1_000_000,
      transport: {
        generateJson: async () => {
          throw new Error('transport should not be reached')
        },
      },
    })
    await expect(interpreter.propose({
      customerJob: 'customer:test:3',
      capabilities: [forecast.descriptor],
    })).rejects.toThrow('customer_request_semantic_interpretation_payload_too_large')
  })
})
