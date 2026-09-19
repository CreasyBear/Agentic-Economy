import { describe, expect, it } from 'vitest'
import {
  calculateAudGstSplit,
  parseDecimalExactAmount,
} from '@/modules/money/public'
import {
  REAL_APP_TOOLS,
  MagicalProcurementEngine,
} from '../../../tools/dev/magical-core-flow'

describe('Magical Core Flow (Real App Tools & IceInVein Contracts)', () => {
  it('anchors on real app tools from capability-supply fixtures and devSeed', () => {
    expect(REAL_APP_TOOLS.length).toBeGreaterThanOrEqual(4)
    const toolRefs = REAL_APP_TOOLS.map((t) => t.toolRef)
    expect(toolRefs).toContain('operation:v1:timezone_converter_x402')
    expect(toolRefs).toContain('operation:v1:onesource_eth_tx')
    expect(toolRefs).toContain('operation:v1:onesource_erc20_transfers')
    expect(toolRefs).toContain('operation:v1:sandbox_aecon_reference')
  })

  it('computes exact Australian GST itemization across all real in-app tools', () => {
    // 1. Timezone Converter (A$0.0020 AUD)
    const tzPrice = parseDecimalExactAmount('AUD', '0.002', 6)
    expect(tzPrice).toBeDefined()
    const tzGst = calculateAudGstSplit(tzPrice!.units, 1000)
    expect(tzGst).toBeDefined()
    expect(tzGst!.grossUnits).toBe('2000')
    expect(tzGst!.gstUnits).toBe('182') // ~10% inclusive GST rounded
    expect(tzGst!.netUnits).toBe('1818')
    expect(BigInt(tzGst!.netUnits) + BigInt(tzGst!.gstUnits)).toBe(2000n)

    // 2. Sandbox Reference Tool (A$1.0000 AUD)
    const sandboxPrice = parseDecimalExactAmount('AUD', '1.000', 6)
    expect(sandboxPrice).toBeDefined()
    const sandboxGst = calculateAudGstSplit(sandboxPrice!.units, 1000)
    expect(sandboxGst).toBeDefined()
    expect(sandboxGst!.grossUnits).toBe('1000000')
    expect(sandboxGst!.gstUnits).toBe('90909')
    expect(sandboxGst!.netUnits).toBe('909091')
    expect(BigInt(sandboxGst!.netUnits) + BigInt(sandboxGst!.gstUnits)).toBe(1000000n)
  })

  it('strictly enforces deterministic IceInVein budget gates before any reservation', async () => {
    const engine = new MagicalProcurementEngine()
    const refused = await engine.procure({
      need: 'Run AEcon deterministic sandbox reference benchmark',
      accountRef: 'account:cst_acme_corp',
      maxSpendAud: '0.05',
    })

    expect(refused).toMatchObject({
      status: 'refused',
      code: 'budget_exceeded',
    })
    if (refused.status === 'refused') {
      expect(refused.detail).toContain('exceeds maximum spend budget of A$0.05 AUD')
    }
  })

  it('guarantees Rule 4 and Rule 5 zero-anxiety diagnostic triplets on provider remedy', async () => {
    const engine = new MagicalProcurementEngine()
    const result = await engine.procure({
      need: 'Convert 3:30 PM New York time to Tokyo time',
      accountRef: 'account:cst_acme_corp',
      simulateProviderFailure: true,
    })

    expect(result.status).toBe('remedied')
    if (result.status === 'remedied') {
      expect(result.netChargeAud).toBe('A$0.00')
      expect(result.refundedAmountAud).toBe('A$0.0020')
      expect(result.diagnostic.whatHappened).toContain('Upstream provider')
      expect(result.diagnostic.financialImpact).toContain('A$0.00 deducted')
      expect(result.diagnostic.financialImpact).toContain('refunded immediately')
      expect(result.diagnostic.nextStep).toContain('Autonomous buyer protection secured your funds')
      expect(result.audit.adjudicator).toBe('jev-payload-auditor')
      expect(result.audit.confidence).toBeGreaterThanOrEqual(0.80)
    }
  })
})
