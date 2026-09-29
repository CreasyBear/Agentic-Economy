import { describe, expect, it } from 'vitest'
import { quoteAudAccountFunding, SANDBOX_COMMERCIAL_POLICY_CONTROLS, audFundingPolicyFromCommercialControls } from '@/modules/money/public'
import { executeDecisionGateway } from '@/modules/decision-engine/public'

describe('System One and AUD money invariants', () => {
  it('calculates top-up GST as 10% of the loaded amount plus fee in exact units', () => {
    const quote = quoteAudAccountFunding(5_000_000n, audFundingPolicyFromCommercialControls(SANDBOX_COMMERCIAL_POLICY_CONTROLS))
    expect(quote?.principalUnits).toBe(5_000_000n)
    expect(quote?.serviceFeeUnits).toBe(250_000n)
    expect(quote?.taxUnits).toBe(530_000n)
    expect(quote?.totalUnits).toBe(5_780_000n)
  })

  it('Tier 3 fallback reliably routes without external API keys', async () => {
    const gatewayRes = await executeDecisionGateway(
      {
        state: { need: 'audit asic corporate compliance' },
        questions: {
          pickTool: {
            type: 'choice',
            instructions: 'Select tool',
            criteria: {
              compliance_audit: 'Corporate audit tool',
              unsupported: 'None',
            },
          },
        },
      },
      { disableJev: true, disableSecondaryLlm: true },
    )

    expect(gatewayRes.tier).toBe('deterministic_rule_engine')
    expect(gatewayRes.answers.pickTool?.type).toBe('choice')
    if (gatewayRes.answers.pickTool?.type === 'choice') {
      expect(gatewayRes.answers.pickTool.choice).toBe('compliance_audit')
    }
  })
})
