import { describe, expect, it } from 'vitest'

import {
  createAgentAccessGrant,
  evaluateAgentAccessOperation,
} from '../../src/modules/agent-access/policy'
import {
  buildProductionAgentAccessPolicy,
  defaultProductionAgentAccessPolicy,
} from '../../src/modules/agent-access/production-policy'

const timezonePrice = { currency: 'USD', units: '1', exponent: 3 } as const

describe('production agent access policy', () => {
  it('refuses positive spend on the production default ceiling', () => {
    const policy = defaultProductionAgentAccessPolicy({ currency: 'USD', exponent: 2 })
    const created = createAgentAccessGrant({
      grantRef: 'grant-production',
      principalId: 'principal-1',
      ownerId: 'owner-1',
      applicationRef: 'app-1',
      credentialId: 'credential-1',
      environment: 'production',
      operationAccess: 'all_admitted',
      authorityMode: 'bounded_mandate',
      policy,
      lifecycle: 'active',
      generation: 1,
      createdAt: 1,
      updatedAt: 1,
      expiresAt: 10_000,
    })
    if (created.kind !== 'accepted') throw new Error(created.code)
    expect(evaluateAgentAccessOperation({
      grant: created.grant,
      principal: { principalId: 'principal-1', applicationRef: 'app-1', environment: 'production' },
      operation: { operationRef: 'timezone-convert-x402', spend: timezonePrice },
      now: 100,
    })).toEqual({ kind: 'refused', code: 'spend_limit_exceeded' })
  })

  it('requires positive, representable, ordered ceilings for an explicit production policy', () => {
    const policy = buildProductionAgentAccessPolicy({
      currency: 'USD',
      exponent: 2,
      maximumSpendPerInvocation: { currency: 'USD', units: '100', exponent: 2 },
      maximumDailySpend: { currency: 'USD', units: '500', exponent: 2 },
      maximumMonthlySpend: { currency: 'USD', units: '2000', exponent: 2 },
    })
    expect(policy.environment).toBe('production')
    expect(() => buildProductionAgentAccessPolicy({
      currency: 'USD',
      exponent: 2,
      maximumSpendPerInvocation: { currency: 'USD', units: '0', exponent: 2 },
      maximumDailySpend: { currency: 'USD', units: '500', exponent: 2 },
      maximumMonthlySpend: { currency: 'USD', units: '2000', exponent: 2 },
    })).toThrow()
    expect(() => buildProductionAgentAccessPolicy({
      currency: 'USD',
      exponent: 2,
      maximumSpendPerInvocation: { currency: 'USD', units: '600', exponent: 2 },
      maximumDailySpend: { currency: 'USD', units: '500', exponent: 2 },
      maximumMonthlySpend: { currency: 'USD', units: '2000', exponent: 2 },
    })).toThrow()
    expect(() => buildProductionAgentAccessPolicy({
      currency: 'USD',
      exponent: 2,
      maximumSpendPerInvocation: { currency: 'USD', units: '100', exponent: 2 },
      maximumDailySpend: { currency: 'USD', units: '500', exponent: 2 },
      maximumMonthlySpend: { currency: 'EUR', units: '2000', exponent: 2 },
    })).toThrow()
  })

  it('refuses full_yolo at production grant creation and evaluation', () => {
    const policy = defaultProductionAgentAccessPolicy({ currency: 'USD', exponent: 2 })
    expect(createAgentAccessGrant({
      grantRef: 'grant-production-full-yolo',
      principalId: 'principal-1',
      ownerId: 'owner-1',
      applicationRef: 'app-1',
      credentialId: 'credential-1',
      environment: 'production',
      operationAccess: 'all_admitted',
      authorityMode: 'full_yolo',
      policy,
      lifecycle: 'active',
      generation: 1,
      createdAt: 1,
      updatedAt: 1,
      expiresAt: 10_000,
    })).toEqual({ kind: 'refused', code: 'grant_material_invalid' })

    const productionPolicy = defaultProductionAgentAccessPolicy({ currency: 'USD', exponent: 2 })
    const forgedGrant = {
      ...createAgentAccessGrant({
        grantRef: 'grant-production-full-yolo-evaluation',
        principalId: 'principal-1',
        ownerId: 'owner-1',
        applicationRef: 'app-1',
        credentialId: 'credential-1',
        environment: 'production',
        operationAccess: 'all_admitted',
        authorityMode: 'bounded_mandate',
        policy: productionPolicy,
        lifecycle: 'active',
        generation: 1,
        createdAt: 1,
        updatedAt: 1,
        expiresAt: 10_000,
      }),
    }
    if (forgedGrant.kind !== 'accepted') throw new Error(forgedGrant.code)
    expect(evaluateAgentAccessOperation({
      grant: { ...forgedGrant.grant, authorityMode: 'full_yolo' },
      principal: { principalId: 'principal-1', applicationRef: 'app-1', environment: 'production' },
      operation: { operationRef: 'operation-1' },
      now: 100,
    })).toEqual({ kind: 'refused', code: 'grant_material_invalid' })
  })
})
