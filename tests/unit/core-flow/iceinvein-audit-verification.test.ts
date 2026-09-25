import { describe, expect, it, vi } from 'vitest'
import { calculateAudGstSplit, parseDecimalExactAmount } from '@/modules/money/public'
import { executeDecisionGateway, callDeterministicRuleEngine } from '@/modules/decision-engine/public'
import { toolProcureResultSchema } from '@/modules/capability-execution/procure'

describe('Procurement boundaries and decision invariants', () => {
  it('preserves Net + GST = Total across AUD prices', () => {
    for (const price of ['0.0022', '0.0330', '1.0000', '12.4567', '99.9999']) {
      const total = parseDecimalExactAmount('AUD', price, 6)
      expect(total).toBeDefined()
      if (!total) continue
      const split = calculateAudGstSplit(total.units, 1000)
      expect(split).toBeDefined()
      if (!split) continue
      expect(BigInt(split.netUnits) + BigInt(split.gstUnits)).toBe(BigInt(total.units))
    }
  })

  it('rejects a remedy claiming a nonzero buyer charge', () => {
    const remedy = {
      schemaVersion: 'tool.procure:v1', idempotencyKey: 'original-key-1',
      kind: 'remedied', status: 'remedied',
      toolRef: 'operation:v1:test', quoteRef: 'quote:test', callRef: 'call:test',
      refundedAmountAud: 'A$0.0330', netChargeAud: 'A$0.00',
      diagnostic: { whatHappened: 'Refunded', financialImpact: 'A$0.00 deducted', nextStep: 'Check call status' },
      audit: { adjudicator: 'call-service-settlement', confidence: 1, remedyLatencyMs: 0, totalLatencyMs: 40 },
    }
    expect(toolProcureResultSchema.safeParse(remedy).success).toBe(true)
    expect(toolProcureResultSchema.safeParse({ ...remedy, netChargeAud: 'A$0.05' }).success).toBe(false)
  })

  it('preserves the decision gateway degradation order', async () => {
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/alpha/decisions')) throw new Error('Jev API timeout')
      if (url.includes('/api/v1/chat/completions')) {
        return { ok: false, status: 503, text: async () => 'Service Unavailable' }
      }
      throw new Error('Unknown url')
    })
    const result = await executeDecisionGateway(
      {
        state: { need: 'convert timezone' },
        questions: { pick: { type: 'choice', instructions: 'pick tool', criteria: {
          timezone_service: 'Timezone tool', unsupported: 'None',
        } } },
      },
      { openrouterApiKey: 'test-key', fetchImpl: mockFetch as unknown as typeof fetch },
    )
    expect(result.tier).toBe('deterministic_rule_engine')
    expect(result.attemptedTiers).toEqual([
      'jev_system_one', 'secondary_llm_adapter', 'deterministic_rule_engine',
    ])
  })

  it('deterministic rule engine is free of hidden state across repeated reads', () => {
    const state = { need: 'Verify ABN status for company' }
    const questions = { pick: {
      type: 'choice' as const, instructions: 'pick tool',
      criteria: { abr_lookup: 'ABN verification', unsupported: 'None' },
    } }
    const first = callDeterministicRuleEngine({ state, questions })
    for (let i = 0; i < 100; i++) {
      const next = callDeterministicRuleEngine({ state, questions })
      expect(next.answers.pick).toEqual(first.answers.pick)
      expect(next.tier).toBe('deterministic_rule_engine')
    }
  })
})
