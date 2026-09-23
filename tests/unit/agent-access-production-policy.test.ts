import { describe, expect, it } from 'vitest'

import type { AgentAccessPrincipal } from '../../src/modules/agent-access/agent-access'
import {
  createAgentAccessGrant,
  evaluateAgentAccessTool,
} from '../../src/modules/agent-access/policy'
import {
  buildProductionAgentAccessPolicy,
  defaultProductionAgentAccessPolicy,
} from '../../src/modules/agent-access/production-policy'
import {
  normalizeCallAuthority,
  type CallGrant,
} from '../../src/modules/capability-execution/call-authority'

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
      toolAccess: 'all_admitted',
      authorityMode: 'spending_policy',
      spendingPolicy: policy,
      lifecycle: 'active',
      generation: 1,
      createdAt: 1,
      updatedAt: 1,
      expiresAt: 10_000,
    })
    if (created.kind !== 'accepted') throw new Error(created.code)
    expect(evaluateAgentAccessTool({
      grant: created.grant,
      principal: { principalId: 'principal-1', applicationRef: 'app-1', environment: 'production' },
      tool: { toolRef: 'operation:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', spend: timezonePrice },
      now: 100,
    })).toEqual({ kind: 'refused', code: 'spend_limit_exceeded' })
  })

  it('requires positive, representable, ordered ceilings for an explicit production policy', () => {
    const policy = buildProductionAgentAccessPolicy({
      currency: 'USD',
      exponent: 2,
      maximumSpendPerCall: { currency: 'USD', units: '100', exponent: 2 },
      maximumDailySpend: { currency: 'USD', units: '500', exponent: 2 },
      maximumMonthlySpend: { currency: 'USD', units: '2000', exponent: 2 },
    })
    expect(policy.environment).toBe('production')
    expect(() => buildProductionAgentAccessPolicy({
      currency: 'USD',
      exponent: 2,
      maximumSpendPerCall: { currency: 'USD', units: '0', exponent: 2 },
      maximumDailySpend: { currency: 'USD', units: '500', exponent: 2 },
      maximumMonthlySpend: { currency: 'USD', units: '2000', exponent: 2 },
    })).toThrow()
    expect(() => buildProductionAgentAccessPolicy({
      currency: 'USD',
      exponent: 2,
      maximumSpendPerCall: { currency: 'USD', units: '600', exponent: 2 },
      maximumDailySpend: { currency: 'USD', units: '500', exponent: 2 },
      maximumMonthlySpend: { currency: 'USD', units: '2000', exponent: 2 },
    })).toThrow()
    expect(() => buildProductionAgentAccessPolicy({
      currency: 'USD',
      exponent: 2,
      maximumSpendPerCall: { currency: 'USD', units: '100', exponent: 2 },
      maximumDailySpend: { currency: 'USD', units: '500', exponent: 2 },
      maximumMonthlySpend: { currency: 'EUR', units: '2000', exponent: 2 },
    })).toThrow()
  })

  it('refuses unrestricted_test_only at production grant creation and evaluation', () => {
    const policy = defaultProductionAgentAccessPolicy({ currency: 'USD', exponent: 2 })
    expect(createAgentAccessGrant({
      grantRef: 'grant-production-full-yolo',
      principalId: 'principal-1',
      ownerId: 'owner-1',
      applicationRef: 'app-1',
      credentialId: 'credential-1',
      environment: 'production',
      toolAccess: 'all_admitted',
      authorityMode: 'unrestricted_test_only',
      spendingPolicy: policy,
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
        toolAccess: 'all_admitted',
        authorityMode: 'spending_policy',
        spendingPolicy: productionPolicy,
        lifecycle: 'active',
        generation: 1,
        createdAt: 1,
        updatedAt: 1,
        expiresAt: 10_000,
      }),
    }
    if (forgedGrant.kind !== 'accepted') throw new Error(forgedGrant.code)
    expect(evaluateAgentAccessTool({
      grant: { ...forgedGrant.grant, authorityMode: 'unrestricted_test_only' },
      principal: { principalId: 'principal-1', applicationRef: 'app-1', environment: 'production' },
      tool: { toolRef: 'operation:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      now: 100,
    })).toEqual({ kind: 'refused', code: 'grant_material_invalid' })
  })

  it('does not remap approval_required to spending_policy_use for a production unrestricted_test_only principal', () => {
    const principal: AgentAccessPrincipal = {
      principalId: 'principal-1',
      ownerId: 'owner-1',
      credentialId: 'credential-1',
      applicationRef: 'app-1',
      environment: 'production',
      scopes: ['market_tools:call'],
      authorityMode: 'unrestricted_test_only',
    }
    const grant: CallGrant = {
      grantRef: 'grant-production-remap',
      principalId: principal.principalId,
      ownerId: principal.ownerId,
      applicationRef: principal.applicationRef,
      credentialId: principal.credentialId,
      environment: 'production',
      generation: 1,
      policyDigest: 'sha256:production-remap',
      expiresAt: 10_000,
      lifecycle: 'active',
      toolAccess: 'all_admitted',
      toolRefs: [],
    }
    const authority = {
      kind: 'approved' as const,
      basis: { kind: 'approval_required' as const, authorityRef: 'authority:production-approval' },
      expiresAt: '2026-09-15T00:00:20.000Z',
    }
    expect(normalizeCallAuthority({
      authority,
      principal,
      grant,
      callRef: 'operation-invocation:production-remap',
    })).toEqual(authority)
    expect(normalizeCallAuthority({
      authority,
      principal: { ...principal, environment: 'sandbox' },
      grant,
      callRef: 'operation-invocation:mixed-remap',
    })).toEqual(authority)
    expect(normalizeCallAuthority({
      authority,
      principal,
      grant: { ...grant, environment: 'sandbox' },
      callRef: 'operation-invocation:mixed-remap-grant',
    })).toEqual(authority)
  })
})
