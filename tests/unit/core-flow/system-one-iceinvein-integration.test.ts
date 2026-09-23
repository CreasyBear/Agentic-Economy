import { describe, expect, it } from 'vitest'
import { calculateAudGstSplit, parseDecimalExactAmount } from '@/modules/money/public'
import { executeDecisionGateway } from '@/modules/decision-engine/public'

describe('System One and AUD money invariants', () => {
  it('calculates deterministic 10% Australian GST splits with exact BigInt units', () => {
    const parsed = parseDecimalExactAmount('AUD', '0.0550', 6)
    expect(parsed).toBeDefined()
    if (!parsed) return

    const gstSplit = calculateAudGstSplit(parsed.units, 1000)
    expect(gstSplit).toBeDefined()
    if (!gstSplit) return

    expect(parsed.units).toBe('55000')
    expect(gstSplit.netUnits).toBe('50000')
    expect(gstSplit.gstUnits).toBe('5000')
    expect(BigInt(gstSplit.netUnits) + BigInt(gstSplit.gstUnits)).toBe(BigInt(parsed.units))
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
