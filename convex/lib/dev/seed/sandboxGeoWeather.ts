import type { SandboxToolSpec } from './sandboxFixture'
import { SANDBOX_TOOL_COMMERCIAL_FIXTURE } from './sandboxReference'
import { SANDBOX_TOOL_OFFERING_PRICE, SANDBOX_TOOL_PRICE_AMOUNT, SANDBOX_TOOL_PRICING_SUMMARY } from './pricing'

export const SANDBOX_GEOCODE_CAPABILITY_ID = 'sandbox.open-meteo-geocoding'
export const SANDBOX_WEATHER_CAPABILITY_ID = 'sandbox.open-meteo-weather'

const GEOCODING_ENDPOINT_URL = 'https://geocoding-api.open-meteo.com/v1/search'
const WEATHER_ENDPOINT_URL = 'https://api.open-meteo.com/v1/forecast'

function sandboxOpenMeteoPricing() {
  return {
    pricingSummary: SANDBOX_TOOL_PRICING_SUMMARY,
    pricingConfig: {
      version: 'pricing:v3',
      kind: 'fixed_aud',
      currency: 'AUD',
      exponent: 6,
      amountUnits: SANDBOX_TOOL_PRICE_AMOUNT.units,
    },
    offeringPrice: SANDBOX_TOOL_OFFERING_PRICE,
    materialTerms: [{
      termId: 'sandbox-fixture',
      label: 'Sandbox commercial fixture',
      value: SANDBOX_TOOL_COMMERCIAL_FIXTURE,
    }],
    commercialFixture: SANDBOX_TOOL_COMMERCIAL_FIXTURE,
  } as const
}

function sandboxOpenMeteoSource(
  endpointUrl: string,
  query: readonly Readonly<{ inputPointer: string; parameter: string }>[],
  fixedQuery: readonly Readonly<{ parameter: string; value: string }>[],
) {
  return {
    kind: 'ae_envelope' as const,
    transport: {
      authority: { kind: 'public_upstream' as const },
      adapter: {
        adapterId: 'http-json:v1',
        config: {
          method: 'GET',
          query,
          fixedQuery,
          requestTimeoutMs: 5_000,
          credential: { kind: 'none' },
        },
      },
    },
  }
}

export function sandboxGeocodeToolSpec(): SandboxToolSpec {
  const endpointUrl = GEOCODING_ENDPOINT_URL
  return {
    businessSlug: 'sandbox-open-meteo-geocoding',
    businessName: 'AEcon sandbox Open-Meteo provider',
    label: 'AEcon sandbox city geocoding Tool',
    capabilityId: SANDBOX_GEOCODE_CAPABILITY_ID,
    summary: 'Find geographic coordinates for a named city using Open-Meteo.',
    contractDescription: 'Return Open-Meteo geocoding results for a city name.',
    requestField: 'name',
    resultField: 'results',
    inputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: { name: { type: 'string', minLength: 1 } },
      required: ['name'],
      additionalProperties: false,
    },
    outputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              latitude: { type: 'number' },
              longitude: { type: 'number' },
            },
            required: ['latitude', 'longitude'],
            additionalProperties: true,
          },
        },
      },
      required: ['results'],
      additionalProperties: true,
    },
    recovery: 'retry_safe',
    endpointUrl,
    method: 'GET',
    ...sandboxOpenMeteoPricing(),
    ownerMessage: 'Sandbox-only Open-Meteo geocoding Tool seeded for local Plan bring-up.',
    sourceLabel: `Open-Meteo public keyless geocoding endpoint ${endpointUrl}`,
    serviceAreaSummary: 'Public internet',
    availabilitySummary: 'Availability is checked from the public Open-Meteo geocoding endpoint',
    authenticationSummary: 'Public keyless HTTPS endpoint.',
    accessPathSummary: 'Resolve a city name to Open-Meteo geographic coordinates.',
    searchTerms: ['sandbox', 'geocoding', 'city coordinates', 'open-meteo'],
    inputExamples: [{ label: 'Perth, Australia', input: { name: 'Perth' } }],
    source: sandboxOpenMeteoSource(endpointUrl, [
      { inputPointer: '/name', parameter: 'name' },
    ], [
      { parameter: 'count', value: '1' },
    ]),
  }
}

export function sandboxWeatherToolSpec(): SandboxToolSpec {
  const endpointUrl = WEATHER_ENDPOINT_URL
  return {
    businessSlug: 'sandbox-open-meteo-weather',
    businessName: 'AEcon sandbox Open-Meteo provider',
    label: 'AEcon sandbox current weather Tool',
    capabilityId: SANDBOX_WEATHER_CAPABILITY_ID,
    summary: 'Read the current air temperature at geographic coordinates using Open-Meteo.',
    contractDescription: 'Return the current Open-Meteo air temperature for latitude and longitude.',
    requestField: 'latitude',
    resultField: 'current',
    additionalRequestFields: ['longitude'],
    inputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        latitude: { type: 'number', minimum: -90, maximum: 90 },
        longitude: { type: 'number', minimum: -180, maximum: 180 },
      },
      required: ['latitude', 'longitude'],
      additionalProperties: false,
    },
    outputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        latitude: { type: 'number' },
        longitude: { type: 'number' },
        current: {
          type: 'object',
          properties: {
            time: { type: 'string' },
            interval: { type: 'number' },
            temperature_2m: { type: 'number' },
          },
          required: ['temperature_2m'],
          additionalProperties: true,
        },
      },
      required: ['latitude', 'longitude', 'current'],
      additionalProperties: true,
    },
    recovery: 'retry_safe',
    endpointUrl,
    method: 'GET',
    ...sandboxOpenMeteoPricing(),
    ownerMessage: 'Sandbox-only Open-Meteo weather Tool seeded for local Plan bring-up.',
    sourceLabel: `Open-Meteo public keyless forecast endpoint ${endpointUrl}`,
    serviceAreaSummary: 'Public internet',
    availabilitySummary: 'Availability is checked from the public Open-Meteo forecast endpoint',
    authenticationSummary: 'Public keyless HTTPS endpoint.',
    accessPathSummary: 'Read current air temperature for supplied geographic coordinates.',
    searchTerms: ['sandbox', 'weather', 'current temperature', 'open-meteo'],
    inputExamples: [{ label: 'Perth, Australia coordinates', input: { latitude: -31.95224, longitude: 115.8614 } }],
    source: sandboxOpenMeteoSource(endpointUrl, [
      { inputPointer: '/latitude', parameter: 'latitude' },
      { inputPointer: '/longitude', parameter: 'longitude' },
    ], [
      { parameter: 'current', value: 'temperature_2m' },
    ]),
  }
}
