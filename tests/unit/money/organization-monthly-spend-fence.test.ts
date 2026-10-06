import { describe, expect, it } from 'vitest'

import { evaluateOrganizationMonthlySpendFence } from '../../../src/modules/money/internal/organization-monthly-spend-fence'
import { quoteOrganizationMonthlySpendAdmission } from '../../../convex/lib/capabilityExecution/quotes/quoteValuation'

describe('evaluateOrganizationMonthlySpendFence (W-23)', () => {
  it('includes outstanding Plan exposure and permits the exact ceiling only', () => {
    const input = { enabled: true, ceilingUnits: '100', monthSpendUnits: '30', heldPlanExposure: { kind: 'known' as const, units: '50' } }
    expect(evaluateOrganizationMonthlySpendFence({ ...input, requestUnits: '20' })).toEqual({ kind: 'admitted' })
    expect(evaluateOrganizationMonthlySpendFence({ ...input, requestUnits: '21' })).toEqual({ kind: 'refused', reason: 'organization_monthly_ceiling' })
  })
  it.each([undefined, { kind: 'unavailable' }, { kind: 'known', units: '-1' }, { kind: 'known', units: 'bad' }])('fails closed for absent or invalid Hold evidence', (heldPlanExposure) => {
    const untrusted = JSON.parse(JSON.stringify({ enabled: true, ceilingUnits: '100', monthSpendUnits: '0', requestUnits: '1', heldPlanExposure }))
    expect(evaluateOrganizationMonthlySpendFence(untrusted)).toEqual({ kind: 'unavailable' })
  })
  it('F1: disabled ceiling is not applicable even when spend exceeds ceiling', () => {
    expect(evaluateOrganizationMonthlySpendFence({
      heldPlanExposure: { kind: 'known', units: '0' },
      enabled: false,
      monthSpendUnits: '200000000',
      requestUnits: '1',
      ceilingUnits: '100000000',
    })).toEqual({ kind: 'not_applicable' })
  })

  it('F2: missing or undefined enabled is treated as disabled', () => {
    expect(evaluateOrganizationMonthlySpendFence({
      heldPlanExposure: { kind: 'known', units: '0' },
      monthSpendUnits: '0',
      requestUnits: '1',
      ceilingUnits: '100000000',
    })).toEqual({ kind: 'not_applicable' })

    expect(evaluateOrganizationMonthlySpendFence({
      heldPlanExposure: { kind: 'known', units: '0' },
      enabled: undefined,
      monthSpendUnits: '999999999',
      requestUnits: '1',
      ceilingUnits: '1',
    })).toEqual({ kind: 'not_applicable' })
  })

  it('F3: admitted when enabled spend is zero and request fits under ceiling', () => {
    expect(evaluateOrganizationMonthlySpendFence({
      heldPlanExposure: { kind: 'known', units: '0' },
      enabled: true,
      monthSpendUnits: '0',
      requestUnits: '1',
      ceilingUnits: '100',
    })).toEqual({ kind: 'admitted' })
  })

  it('F4: admitted when request fills the ceiling exactly', () => {
    expect(evaluateOrganizationMonthlySpendFence({
      heldPlanExposure: { kind: 'known', units: '0' },
      enabled: true,
      monthSpendUnits: '50',
      requestUnits: '50',
      ceilingUnits: '100',
    })).toEqual({ kind: 'admitted' })
  })

  it('F5: refused when request would exceed the ceiling', () => {
    expect(evaluateOrganizationMonthlySpendFence({
      heldPlanExposure: { kind: 'known', units: '0' },
      enabled: true,
      monthSpendUnits: '50',
      requestUnits: '51',
      ceilingUnits: '100',
    })).toEqual({
      kind: 'refused',
      reason: 'organization_monthly_ceiling',
    })
  })

  it('F6: refused when spend already equals ceiling and request is positive', () => {
    expect(evaluateOrganizationMonthlySpendFence({
      heldPlanExposure: { kind: 'known', units: '0' },
      enabled: true,
      monthSpendUnits: '100',
      requestUnits: '1',
      ceilingUnits: '100',
    })).toEqual({
      kind: 'refused',
      reason: 'organization_monthly_ceiling',
    })
  })

  it('F7: refused when ceiling is zero and paid request is positive', () => {
    expect(evaluateOrganizationMonthlySpendFence({
      heldPlanExposure: { kind: 'known', units: '0' },
      enabled: true,
      monthSpendUnits: '0',
      requestUnits: '1',
      ceilingUnits: '0',
    })).toEqual({
      kind: 'refused',
      reason: 'organization_monthly_ceiling',
    })
  })

  it('F8: unavailable when enabled but month spend cannot be read', () => {
    expect(evaluateOrganizationMonthlySpendFence({
      heldPlanExposure: { kind: 'known', units: '0' },
      enabled: true,
      monthSpendUnits: undefined,
      requestUnits: '1',
      ceilingUnits: '100000000',
    })).toEqual({ kind: 'unavailable' })
  })

  it('F9: disabled with unreadable spend remains not applicable', () => {
    expect(evaluateOrganizationMonthlySpendFence({
      heldPlanExposure: { kind: 'known', units: '0' },
      enabled: false,
      monthSpendUnits: undefined,
      requestUnits: '1',
      ceilingUnits: '100000000',
    })).toEqual({ kind: 'not_applicable' })
  })
})

describe('quoteOrganizationMonthlySpendAdmission (W-23)', () => {
  const refusalContext = {
    toolRef: 'tool:test',
    input: { request: 'Perth' },
    correlationId: 'corr:test',
  }

  it('Q1: refuses issueQuote admission when enabled spend plus request exceeds ceiling', () => {
    expect(quoteOrganizationMonthlySpendAdmission(refusalContext, '20000000', {
      heldPlanExposure: { kind: 'known', units: '0' },
      enabled: true,
      ceilingUnits: '25000000',
      monthSpendUnits: '10000000',
    })).toMatchObject({
      kind: 'refused',
      code: 'budget_exceeded',
      reason: 'organization_monthly_ceiling',
    })
  })

  it('Q2: fails closed when enabled but organization month spend is unavailable', () => {
    expect(quoteOrganizationMonthlySpendAdmission(refusalContext, '1', {
      heldPlanExposure: { kind: 'known', units: '0' },
      enabled: true,
      ceilingUnits: '100000000',
      monthSpendUnits: undefined,
    })).toMatchObject({
      kind: 'refused',
      code: 'budget_exceeded',
      reason: 'organization_monthly_spend_unavailable',
    })
  })

  it('Q3: not applicable when organization monthly ceiling is disabled', () => {
    expect(quoteOrganizationMonthlySpendAdmission(refusalContext, '99999999', {
      heldPlanExposure: { kind: 'known', units: '0' },
      enabled: false,
      ceilingUnits: '1',
      monthSpendUnits: '99999999',
    })).toBeUndefined()
  })
})
