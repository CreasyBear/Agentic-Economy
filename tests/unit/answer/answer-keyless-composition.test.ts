import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
  KeylessExecutableSourcePort,
  KeylessExecutableToolDescriptor,
} from '@/modules/capability-execution'
import { runAnswerToolUseAgent } from '@/modules/answer/internal/answer-tool-use-agent'
import { openRouterToolName } from '@/modules/answer/internal/action-to-tool-spec'
import {
  openRouterStructuredProseResponse,
  openRouterToolResponse,
  startOpenRouterContractServer,
} from '../../helpers/openrouter-contract-server'

const executionMocks = vi.hoisted(() => ({
  executeKeylessOperation: vi.fn(),
}))

vi.mock('@/modules/capability-execution/operation-execute.server', () => ({
  executeKeylessOperation: executionMocks.executeKeylessOperation,
}))

const forecastDescriptor: KeylessExecutableToolDescriptor = {
  operationRef: 'operation:v1:' + 'f'.repeat(64),
  capabilityId: 'open-meteo.forecast',
  name: 'Open-Meteo weather forecast',
  summary: 'Returns current weather for latitude and longitude.',
  searchTerms: ['weather', 'forecast', 'temperature'],
  inputSchema: {
    type: 'object',
    properties: {
      latitude: { type: 'number', minimum: -90, maximum: 90 },
      longitude: { type: 'number', minimum: -180, maximum: 180 },
      current_weather: { type: 'boolean', default: true },
    },
    required: ['latitude', 'longitude'],
    additionalProperties: false,
  },
}

const geocodingDescriptor: KeylessExecutableToolDescriptor = {
  operationRef: 'operation:v1:' + 'g'.repeat(64),
  capabilityId: 'open-meteo.geocoding',
  name: 'Open-Meteo geocoding search',
  summary: 'Searches place names and returns coordinates.',
  searchTerms: ['geocode', 'city coordinates', 'place lookup'],
  inputSchema: {
    type: 'object',
    properties: { name: { type: 'string', minLength: 1, maxLength: 200 } },
    required: ['name'],
    additionalProperties: false,
  },
}

const weatherResolution = {
  kind: 'resolved' as const,
  descriptors: [forecastDescriptor, geocodingDescriptor],
  candidates: [forecastDescriptor],
  selected: forecastDescriptor,
}

const source: KeylessExecutableSourcePort = {
  list: async () => [forecastDescriptor, geocodingDescriptor],
  read: async () => null,
  search: async () => [forecastDescriptor.operationRef],
}

function forecastToolName(): string {
  return openRouterToolName(`capability.${forecastDescriptor.operationRef}`)
}

function weatherResponse(latitude = 0, longitude = 0) {
  return {
    latitude,
    longitude,
    generationtime_ms: 0.1,
    timezone: 'Australia/Melbourne',
    current_weather: {
      temperature: 14.2,
      windspeed: 8.1,
      winddirection: 210,
      weathercode: 2,
      is_day: 1,
      time: '2026-08-09T12:00',
      interval: 900,
    },
  }
}

async function runWeatherQuery(query: string, input: Record<string, unknown>, prose: string) {
  const server = await startOpenRouterContractServer((request) => {
    if ((request.tools?.length ?? 0) > 0) {
      return openRouterToolResponse([{ id: 'call-weather', toolId: forecastToolName(), input }])
    }
    return openRouterStructuredProseResponse({
      oneLine: prose,
      summary: 'The answer is grounded in the returned weather operation result.',
      whatToDoNow: 'Use the returned conditions for the next decision.',
    })
  })
  const restoreOpenRouter = server.installEnv()
  try {
    return await runAnswerToolUseAgent({
      query,
      keylessDataAsk: weatherResolution,
      keylessExecutableSource: source,
      maxToolCalls: 1,
    })
  } finally {
    restoreOpenRouter()
    await server.close()
  }
}

afterEach(() => {
  executionMocks.executeKeylessOperation.mockReset()
  delete process.env.OPENROUTER_API_KEY
  delete process.env.AE_OPENROUTER_API_BASE_URL
})

describe('keyless weather input composition', () => {
  it('geocodes Melbourne before forecasting and preserves the descriptor-owned current_weather default', async () => {
    executionMocks.executeKeylessOperation.mockImplementation(async ({ operationRef, input }) => {
      if (operationRef === geocodingDescriptor.operationRef) {
        return {
          kind: 'ok',
          operationRef,
          capabilityId: geocodingDescriptor.capabilityId,
          name: geocodingDescriptor.name,
          output: { results: [{ id: 7839805, name: 'Melbourne', latitude: -37.8136, longitude: 144.9631 }] },
          evidenceHash: 'sha256:melbourne-geocode',
        }
      }
      expect(input).toEqual({ latitude: -37.8136, longitude: 144.9631, current_weather: true })
      return {
        kind: 'ok',
        operationRef,
        capabilityId: forecastDescriptor.capabilityId,
        name: forecastDescriptor.name,
        output: weatherResponse(-37.8136, 144.9631),
        evidenceHash: 'sha256:melbourne-weather',
      }
    })

    const result = await runWeatherQuery(
      'What is the weather like in Melbourne right now?',
      { latitude: 0, longitude: 0 },
      'Melbourne is 14.2°C with light cloud.',
    )
    expect(executionMocks.executeKeylessOperation).toHaveBeenNthCalledWith(
      1,
      { operationRef: geocodingDescriptor.operationRef, input: { name: 'Melbourne' } },
      source,
    )
    expect(executionMocks.executeKeylessOperation).toHaveBeenNthCalledWith(
      2,
      {
        operationRef: forecastDescriptor.operationRef,
        input: { latitude: -37.8136, longitude: 144.9631, current_weather: true },
      },
      source,
    )
    expect(result.toolCalls).toHaveLength(2)
    expect(result.toolCalls.map((call) => call.seq)).toEqual([0, 1])
    expect(result.toolCalls.map((call) => JSON.parse(call.inputJson))).toEqual([
      { operationRef: geocodingDescriptor.operationRef, input: { name: 'Melbourne' } },
      { operationRef: forecastDescriptor.operationRef, input: { latitude: -37.8136, longitude: 144.9631, current_weather: true } },
    ])
    expect(result.snapshot.oneLine).toBe('Melbourne is 14.2°C with light cloud.')
  })

  it('keeps the supplied complex Parramatta place rather than using default context', async () => {
    executionMocks.executeKeylessOperation.mockImplementation(async ({ operationRef, input }) => {
      if (operationRef === geocodingDescriptor.operationRef) {
        expect(input).toEqual({ name: 'Parramatta' })
        return {
          kind: 'ok',
          operationRef,
          capabilityId: geocodingDescriptor.capabilityId,
          name: geocodingDescriptor.name,
          output: { results: [{ id: 2151364, name: 'Parramatta', latitude: -33.815, longitude: 151.0011 }] },
          evidenceHash: 'sha256:parramatta-geocode',
        }
      }
      expect(input).toMatchObject({ latitude: -33.815, longitude: 151.0011, current_weather: true })
      return {
        kind: 'ok',
        operationRef,
        capabilityId: forecastDescriptor.capabilityId,
        name: forecastDescriptor.name,
        output: weatherResponse(-33.815, 151.0011),
        evidenceHash: 'sha256:parramatta-weather',
      }
    })

    const result = await runWeatherQuery(
      'Give me the weather in Parramatta for an urgent update tomorrow morning.',
      { latitude: 0, longitude: 0, current_weather: true },
      'Parramatta is 14.2°C with light cloud.',
    )

    expect(executionMocks.executeKeylessOperation).toHaveBeenCalledTimes(2)
    expect(JSON.parse(result.toolCalls[0]!.inputJson)).toMatchObject({ input: { name: 'Parramatta' } })
    expect(JSON.stringify(result.prose)).not.toContain('clarify')
  })

  it('fails closed on an invalid geocoder result without asking for the supplied place again', async () => {
    executionMocks.executeKeylessOperation.mockResolvedValue({
      kind: 'ok',
      operationRef: geocodingDescriptor.operationRef,
      capabilityId: geocodingDescriptor.capabilityId,
      name: geocodingDescriptor.name,
      output: { results: [{ name: 'Melbourne', latitude: 'not-a-number', longitude: 144.9631 }] },
      evidenceHash: 'sha256:invalid-geocode',
    })

    const result = await runWeatherQuery(
      'What is the weather like in Melbourne right now?',
      { latitude: 0, longitude: 0, current_weather: true },
      'I could not use the supplied Melbourne place because geocoding returned invalid coordinates.',
    )

    expect(executionMocks.executeKeylessOperation).toHaveBeenCalledTimes(1)
    expect(result.toolCalls[0]).toMatchObject({ status: 'error' })
    expect(JSON.parse(result.toolCalls[0]!.resultJson)).toMatchObject({
      kind: 'error',
      code: 'response_invalid',
    })
    expect(result.snapshot.oneLine).not.toContain('clarify your location')
  })

  it('preserves a forecast HTTP 400 after successful geocoding as an explicit failure', async () => {
    executionMocks.executeKeylessOperation.mockImplementation(async ({ operationRef }) => operationRef === geocodingDescriptor.operationRef
      ? {
          kind: 'ok',
          operationRef,
          capabilityId: geocodingDescriptor.capabilityId,
          name: geocodingDescriptor.name,
          output: { results: [{ id: 7839805, name: 'Melbourne', latitude: -37.8136, longitude: 144.9631 }] },
          evidenceHash: 'sha256:melbourne-geocode',
        }
      : {
          kind: 'error',
          operationRef,
          code: 'provider_error',
          retryable: false,
          reason: 'The operation returned HTTP 400.',
        })

    const result = await runWeatherQuery(
      'What is the weather like in Melbourne right now?',
      { latitude: 0, longitude: 0, current_weather: true },
      'The weather provider rejected the request for the supplied Melbourne place (HTTP 400).',
    )

    expect(executionMocks.executeKeylessOperation).toHaveBeenCalledTimes(2)
    expect(result.toolCalls).toHaveLength(2)
    expect(result.toolCalls[1]).toMatchObject({ status: 'error' })
    expect(JSON.parse(result.toolCalls[1]!.resultJson)).toMatchObject({
      kind: 'error',
      code: 'provider_error',
      reason: 'The operation returned HTTP 400.',
      composition: { place: 'Melbourne' },
    })
    expect(result.snapshot.oneLine).not.toContain('clarify your location')
  })

  it('executes direct numeric-coordinate forecasts without a geocoding attempt', async () => {
    executionMocks.executeKeylessOperation.mockResolvedValue({
      kind: 'ok',
      operationRef: forecastDescriptor.operationRef,
      capabilityId: forecastDescriptor.capabilityId,
      name: forecastDescriptor.name,
      output: weatherResponse(-37.8136, 144.9631),
      evidenceHash: 'sha256:direct-weather',
    })

    const result = await runWeatherQuery(
      'What is the weather at -37.8136, 144.9631 right now?',
      { latitude: -37.8136, longitude: 144.9631, current_weather: true },
      'The supplied coordinates are 14.2°C with light cloud.',
    )

    expect(executionMocks.executeKeylessOperation).toHaveBeenCalledTimes(1)
    expect(executionMocks.executeKeylessOperation).toHaveBeenCalledWith(
      {
        operationRef: forecastDescriptor.operationRef,
        input: { latitude: -37.8136, longitude: 144.9631, current_weather: true },
      },
      source,
    )
    expect(result.toolCalls).toHaveLength(1)
  })
})
