import { describe, expect, it } from 'vitest'

import {
  toolQuoteAction,
} from '@/modules/capability-execution/quote.actions'
import {
  toolQuoteResultSchema,
  projectToolQuoteRefusal,
  type ToolQuoteRefusalCode,
} from '@/modules/capability-execution/quote'

const toolRef = `operation:v1:${'a'.repeat(64)}`
const input = { city: 'Perth' }

describe('tool.quote continuations', () => {
  it.each<readonly [ToolQuoteRefusalCode, string | undefined, string | undefined]>([
    ['tool_not_found', 'registry.tools.list', undefined],
    ['tool_not_current', 'registry.tools.list', undefined],
    ['tool_not_ready', 'tool.quote', undefined],
    ['tool_unsupported', 'registry.tools.list', undefined],
    ['input_invalid', 'registry.tools.describe', undefined],
    ['grant_not_found', undefined, 'Review agent access'],
    ['budget_exceeded', undefined, 'Review agent access'],
    ['treasury_capacity_unavailable', 'tool.quote', undefined],
    ['pricing_setup_required', 'registry.tools.list', undefined],
    ['commercial_policy_unavailable', undefined, 'Contact support'],
    ['inspection_unavailable', 'tool.quote', undefined],
  ])('projects %s to exactly one safe next step', (code, action, requiredTitle) => {
    const result = projectToolQuoteRefusal({
      toolRef,
      input,
      code,
      retryable: code === 'tool_not_ready' || code === 'treasury_capacity_unavailable' || code === 'inspection_unavailable',
      correlationRef: 'request:test-inspection',
    })

    expect(toolQuoteResultSchema.safeParse(result).success).toBe(true)
    expect(result.continuation?.action).toBe(action)
    expect(result.requiredActions?.[0]?.title).toBe(requiredTitle)
    expect(Number(result.continuation !== undefined) + Number(result.requiredActions !== undefined)).toBe(1)
  })

  it('rejects legacy operation refusal labels at the Tool Quote boundary', () => {
    const result = toolQuoteResultSchema.safeParse({
      kind: 'refused',
      toolRef,
      code: 'operation_not_found',
      retryable: false,
      correlationRef: 'request:legacy-refusal',
    })

    expect(result.success).toBe(false)
  })

  it('reports the current Tool Quote service error when the adapter is absent', async () => {
    await expect(toolQuoteAction.run({
      data: { toolRef, input },
      context: {
        agentAccessPrincipal: {} as never,
        callService: {} as never,
      },
    })).rejects.toThrow('tool_quote_unavailable')
  })

  it('returns a valid deterministic funding continuation for an exact shortfall', () => {
    const result = projectToolQuoteRefusal({
      toolRef,
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
