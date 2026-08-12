import { describe, expect, it, vi } from 'vitest'

import { recordGatewayTelemetry } from '@/lib/server/gateway-telemetry'

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
