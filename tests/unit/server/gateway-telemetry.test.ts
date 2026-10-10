import { describe, expect, it, vi } from 'vitest'

const posthog = vi.hoisted(() => ({ captureServerEvent: vi.fn() }))
vi.mock('@/lib/observability/posthog.server', () => posthog)

import { recordGatewayTelemetry } from '@/lib/server/gateway-telemetry'
import { recordRefusal, recordSearchOutcome } from '@/lib/observability/refusal-event'

describe('gateway refusal events', () => {
  it('emits one ae_refusal per refusalCode event on the event transport surface', () => {
    posthog.captureServerEvent.mockClear()
    recordGatewayTelemetry({ record: vi.fn() }, {
      transport: 'mcp', operation: 'quote', stage: 'pre_admission', outcome: 'refused',
      refusalCode: 'budget_exhausted', retryable: false, principalId: 'principal_1', durationMs: 1,
    })
    expect(posthog.captureServerEvent).toHaveBeenCalledTimes(1)
    expect(posthog.captureServerEvent).toHaveBeenCalledWith(expect.stringMatching(/^sha256:/u), 'ae_refusal', expect.objectContaining({
      surface: 'mcp', code: 'budget_exhausted', operation: 'quote', stage: 'pre_admission', retryable: false,
    }))
  })

  it('keys refusals by principal, never by the per-request correlation id', () => {
    posthog.captureServerEvent.mockClear()
    for (const correlationId of ['corr_a', 'corr_b']) {
      recordGatewayTelemetry({ record: vi.fn() }, { transport: 'http', outcome: 'refused', refusalCode: 'auth_required', correlationId, durationMs: 1 })
    }
    recordGatewayTelemetry({ record: vi.fn() }, { transport: 'http', outcome: 'refused', refusalCode: 'auth_required', principalId: 'principal_1', correlationId: 'corr_c', durationMs: 1 })
    const ids = posthog.captureServerEvent.mock.calls.map(([id]) => id)
    expect(ids[0]).toBe(ids[1])
    expect(ids[2]).not.toBe(ids[0])
  })

  it('emits no ae_refusal for events without a refusalCode', () => {
    posthog.captureServerEvent.mockClear()
    recordGatewayTelemetry({ record: vi.fn() }, { transport: 'http', outcome: 'completed', durationMs: 1 })
    expect(posthog.captureServerEvent).not.toHaveBeenCalled()
  })
})

describe('refusal and search outcome payloads', () => {
  const search = { surface: 'mcp' as const, resultKind: 'match', resultCount: 3, callableCount: 0, externalListingCount: 1 }

  it('sends the exact ae_search_outcome property set and derives zeroCallable', () => {
    posthog.captureServerEvent.mockClear()
    recordSearchOutcome(search)
    recordSearchOutcome({ ...search, resultCount: 0 })
    expect(posthog.captureServerEvent.mock.calls.map(([, event, properties]) => [event, properties])).toEqual([
      ['ae_search_outcome', { ...search, zeroCallable: true, $process_person_profile: false }],
      ['ae_search_outcome', { ...search, resultCount: 0, zeroCallable: false, $process_person_profile: false }],
    ])
  })

  it.each([
    ['an unknown resultKind', { resultKind: 'everything' }],
    ['a count above 1,000,000', { resultCount: 1_000_001 }],
    ['a negative count', { callableCount: -1 }],
    ['a fractional count', { externalListingCount: 1.5 }],
  ])('drops a search outcome with %s', (_label, override) => {
    posthog.captureServerEvent.mockClear()
    recordSearchOutcome({ ...search, ...override })
    expect(posthog.captureServerEvent).not.toHaveBeenCalled()
  })

  it('sends the exact ae_refusal property set and drops unbounded fields', () => {
    posthog.captureServerEvent.mockClear()
    recordRefusal({ surface: 'http', code: 'auth_required', operation: 'bad operation', stage: 'nowhere', outcome: 'refused', retryable: true })
    recordRefusal({ surface: 'http', code: 'not an identifier' })
    expect(posthog.captureServerEvent.mock.calls.map(([, event, properties]) => [event, properties])).toEqual([
      ['ae_refusal', { surface: 'http', code: 'auth_required', retryable: true, outcome: 'refused', $process_person_profile: false }],
    ])
  })
})

describe('gateway telemetry projection', () => {
  it('emits only bounded gateway dimensions through the existing timing sink', () => {
    const record = vi.fn()
    recordGatewayTelemetry({ record }, {
      correlationId: 'corr_gateway_1',
      operationRef: 'operation:provider:quote',
      pricing: 'paid',
      costUnits: '12.50',
      durationMs: 2_000_000_000,
      outcome: 'refused',
      refusalCode: 'budget_exhausted',
      retryable: false,
      unknown: false,
      approval: 'required',
      rateLimited: false,
      concurrencyLimited: true,
    })

    expect(record).toHaveBeenCalledWith('gateway.operation', 86_400_000, expect.objectContaining({
      correlationId: 'corr_gateway_1',
      operationRef: 'operation:provider:quote',
      pricing: 'paid',
      costUnits: '12.50',
      durationMs: 86_400_000,
      outcome: 'refused',
      refusalCode: 'budget_exhausted',
      retryable: false,
      unknown: false,
      approval: 'required',
      rateLimited: false,
      concurrencyLimited: true,
    }))
  })

  it('drops unbounded identifiers and non-numeric cost values and never accepts content-shaped fields', () => {
    const record = vi.fn()
    recordGatewayTelemetry({ record }, {
      correlationId: 'corr_gateway_2',
      operationRef: 'https://supplier.example/secret?token=do-not-log',
      costUnits: 'x'.repeat(200),
      durationMs: Number.NaN,
      outcome: 'failed',
      refusalCode: 'provider response: secret body',
    })

    const metadata = record.mock.calls[0]?.[2]
    expect(metadata).toMatchObject({
      correlationId: 'corr_gateway_2',
      durationMs: 0,
      outcome: 'failed',
    })
    expect(metadata).not.toHaveProperty('operationRef')
    expect(metadata).not.toHaveProperty('refusalCode')
    expect(metadata).not.toHaveProperty('costUnits')
  })
})
