import { describe, expect, it } from 'vitest'
import {
  calculateAudGstSplit,
  compareExactAmounts,
  parseDecimalExactAmount,
} from '@/modules/money/public'
import {
  executeDecisionGateway,
} from '@/modules/decision-engine/public'
import {
  CapabilityProcurementEngine,
  type CatalogToolCandidate,
} from '@/modules/capability-execution/procure-engine'

describe('Comprehensive System One & IceInVein Integration Test', () => {
  const dynamicCatalog: readonly CatalogToolCandidate[] = [
    {
      toolRef: 'operation:v1:compliance_audit',
      name: 'ASIC Corporate Compliance Auditor',
      description: 'Audit company directors, shareholders, and insolvency filings for Australian entities.',
      endpoint: 'https://api.compliance.example/asic/audit',
      priceAud: '0.0550',
      inputSchema: {
        type: 'object',
        properties: {
          abn: { type: 'string', description: 'Australian Business Number' },
          query: { type: 'string', description: 'Query text' },
        },
      },
    },
    {
      toolRef: 'operation:v1:micro_convert',
      name: 'Currency & Timezone Converter',
      description: 'Convert values and dates across international formats.',
      endpoint: 'https://api.convert.example/v1',
      priceAud: '0.0022',
      inputSchema: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Origin' },
          to: { type: 'string', description: 'Target' },
          time: { type: 'string', description: 'Time string' },
        },
      },
    },
  ]

  const engine = new CapabilityProcurementEngine({
    catalogSearcher: async (query: string) => {
      const qTokens = query.toLowerCase().split(/\s+/)
      return dynamicCatalog.filter((tool) =>
        qTokens.some((tok) => tok.length > 2 && (tool.name.toLowerCase().includes(tok) || tool.description.toLowerCase().includes(tok))),
      )
    },
    callExecutor: async (req) => {
      if (req.simulateProviderFailure) {
        return {
          status: 200,
          payload: {
            error: 'gateway_504_upstream_timeout',
            code: 'ETIMEDOUT',
            detail: 'Downstream microservice failed to answer.',
          },
        }
      }
      return {
        status: 200,
        payload: {
          entityName: 'Atlassian Pty Ltd',
          status: 'Active',
          gstRegistered: true,
        },
      }
    },
  })

  it('calculates deterministic 10% Australian GST splits with exact BigInt units', () => {
    // A$0.0550 total
    const parsed = parseDecimalExactAmount('AUD', '0.0550', 6)
    expect(parsed).toBeDefined()
    if (!parsed) return

    expect(parsed.units).toBe('55000') // 55,000 micro-units
    const gstSplit = calculateAudGstSplit(parsed.units, 1000) // 1000 bps = 10%
    expect(gstSplit).toBeDefined()
    if (!gstSplit) return

    // Net = round(55000 * 10 / 11) = 50000; GST = 55000 - 50000 = 5000
    expect(gstSplit.netUnits).toBe('50000')
    expect(gstSplit.gstUnits).toBe('5000')
    expect(BigInt(gstSplit.netUnits) + BigInt(gstSplit.gstUnits)).toBe(BigInt(parsed.units))
  })

  it('enforces strict budget ceiling before calling provider', async () => {
    const total = parseDecimalExactAmount('AUD', '0.0550', 6)!
    const budget = parseDecimalExactAmount('AUD', '0.0200', 6)!

    expect(compareExactAmounts(budget, total)).toBe(-1)

    const outcome = await engine.procure({
      need: 'Audit ASIC compliance for company',
      maxSpendAud: '0.0200',
    })

    expect(outcome.status).toBe('refused')
    if (outcome.status === 'refused') {
      expect(outcome.code).toBe('budget_exceeded')
      expect(outcome.detail).toContain('exceeds maximum spend budget')
    }
  })

  it('autonomously detects stealth provider timeout and yields A$0.00 net deduction', async () => {
    const outcome = await engine.procure({
      need: 'Audit ASIC compliance for company',
      maxSpendAud: '0.1000',
      simulateProviderFailure: true,
    })

    expect(outcome.status).toBe('remedied')
    if (outcome.status === 'remedied') {
      expect(outcome.netChargeAud).toBe('A$0.00')
      expect(outcome.refundedAmountAud).toBe('A$0.0550')
      expect(outcome.diagnostic.whatHappened).toContain('Upstream provider')
      expect(outcome.diagnostic.financialImpact).toContain('A$0.00 deducted')
      expect(outcome.audit.adjudicator).toBe('jev-payload-auditor')
      expect(outcome.audit.confidence).toBeGreaterThanOrEqual(0.75)
    }
  })

  it('executes clean delivery with exact GST breakdown on happy path', async () => {
    const outcome = await engine.procure({
      need: 'Audit ASIC compliance for company',
      maxSpendAud: '0.1000',
    })

    expect(outcome.status).toBe('delivered')
    if (outcome.status === 'delivered') {
      expect(outcome.toolRef).toBe('operation:v1:compliance_audit')
      expect(outcome.price.totalAud).toBe('A$0.0550')
      expect(outcome.price.netAud).toBe('A$0.0500')
      expect(outcome.price.gstAud).toBe('A$0.0050')
      expect(outcome.output).toEqual({
        entityName: 'Atlassian Pty Ltd',
        status: 'Active',
        gstRegistered: true,
      })
    }
  })

  it('Tier 3 fallback reliably routes and diagnoses without external API keys', async () => {
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
      {
        disableJev: true,
        disableSecondaryLlm: true,
      },
    )

    expect(gatewayRes.tier).toBe('deterministic_rule_engine')
    expect(gatewayRes.answers.pickTool?.type).toBe('choice')
    if (gatewayRes.answers.pickTool?.type === 'choice') {
      expect(gatewayRes.answers.pickTool.choice).toBe('compliance_audit')
    }
  })
})
