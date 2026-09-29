import { describe, expect, it, vi } from 'vitest'
import { parseDecimalExactAmount, quoteAudAccountFunding, SANDBOX_COMMERCIAL_POLICY_CONTROLS, audFundingPolicyFromCommercialControls } from '@/modules/money/public'
import { executeDecisionGateway, callDeterministicRuleEngine } from '@/modules/decision-engine/public'
import { toolProcureResultSchema } from '@/modules/capability-execution/procure'

describe('Procurement boundaries and decision invariants', () => {
  it('adds top-up GST to the loaded amount and fee without taxing the Call price', () => {
    const policy = audFundingPolicyFromCommercialControls(SANDBOX_COMMERCIAL_POLICY_CONTROLS)
    const quote = quoteAudAccountFunding(5_000_000n, policy)
    expect(quote).toEqual({
      principalUnits: 5_000_000n,
      serviceFeeUnits: 250_000n,
      taxUnits: 530_000n,
      totalUnits: 5_780_000n,
    })
    const callPrice = parseDecimalExactAmount('AUD', '1.0000', 6)
    expect(callPrice?.units).toBe('1000000')
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
