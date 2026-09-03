import { describe, expect, it } from 'vitest'

import {
  operationInspectResultSchema,
  projectOperationInspectRefusal,
  type OperationInspectRefusalCode,
} from '@/modules/capability-execution/operation-commitment'

const operationRef = `operation:v1:${'a'.repeat(64)}`
const input = { city: 'Perth' }

describe('operation.inspect continuations', () => {
  it.each<readonly [OperationInspectRefusalCode, string | undefined, string | undefined]>([
    ['operation_not_found', 'registry.operations.list', undefined],
    ['operation_not_current', 'registry.operations.list', undefined],
    ['operation_not_ready', 'operation.inspect', undefined],
    ['operation_unsupported', 'registry.operations.list', undefined],
    ['input_invalid', 'registry.operations.describe', undefined],
    ['grant_not_found', undefined, 'Review agent access'],
    ['budget_exceeded', undefined, 'Review agent access'],
    ['treasury_capacity_unavailable', 'operation.inspect', undefined],
    ['pricing_setup_required', 'registry.operations.list', undefined],
    ['commercial_policy_unavailable', undefined, 'Contact support'],
    ['inspection_unavailable', 'operation.inspect', undefined],
  ])('projects %s to exactly one safe next step', (code, action, requiredTitle) => {
    const result = projectOperationInspectRefusal({
      operationRef,
      input,
      code,
      retryable: code === 'operation_not_ready' || code === 'treasury_capacity_unavailable' || code === 'inspection_unavailable',
      correlationRef: 'request:test-inspection',
    })

    expect(operationInspectResultSchema.safeParse(result).success).toBe(true)
    expect(result.continuation?.action).toBe(action)
    expect(result.requiredActions?.[0]?.title).toBe(requiredTitle)
    expect(Number(result.continuation !== undefined) + Number(result.requiredActions !== undefined)).toBe(1)
  })

  it('returns a valid deterministic funding continuation for an exact shortfall', () => {
    const result = projectOperationInspectRefusal({
      operationRef,
      input,
      code: 'insufficient_balance',
      retryable: false,
      correlationRef: 'request:test-funding',
      funding: {
        principalAmount: { currency: 'AUD', units: '5000000', exponent: 6 },
        idempotencyKey: 'funding:deterministic-test',
      },
    })

    expect(result).toMatchObject({
      continuation: {
        action: 'funding.handoff.create',
        input: {
          principalAmount: { currency: 'AUD', units: '5000000', exponent: 6 },
          idempotencyKey: 'funding:deterministic-test',
        },
      },
    })
    expect(result).not.toHaveProperty('reinspection')
  })
})
