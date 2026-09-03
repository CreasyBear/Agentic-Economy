import { describe, expect, it, vi } from 'vitest'

import {
  handleFundingHandoffAction,
  publicFundingHandoffResponse,
} from '@/lib/server/funding-handoff-api'
import type { FundingHandoffService } from '@/modules/money/funding-handoff.actions'
import type { AgentAccessPrincipalResolver } from '@/lib/server/agent-access-auth'

const authenticate = async () => ({
  isAuthenticated: true as const,
  tokenType: 'api_key' as const,
  id: 'credential:one',
  subject: 'user_agent_one',
  scopes: ['market_operations:invoke'],
})

const resolvePrincipal: AgentAccessPrincipalResolver = async (projection) => ({
  ...projection,
  principalId: 'prn_00000000000040008000000000000041',
  ownerId: 'acc_00000000000040008000000000000041',
})

function service(overrides: Partial<FundingHandoffService> = {}): FundingHandoffService {
  const base: FundingHandoffService = {
    config: vi.fn(async () => ({
      kind: 'funding_config', success: true, currency: 'AUD',
      minimum: { currency: 'AUD', exponent: 6, units: '5000000' },
      maximum: { currency: 'AUD', exponent: 6, units: '25000000000' },
      increment: { currency: 'AUD', exponent: 6, units: '10000' },
      checkout: 'stripe_hosted', payerGainsAuthority: false, reusablePaymentAuthority: false,
    } as const)),
    create: vi.fn(async () => ({
      kind: 'funding_session', success: true, fundingSessionId: 'cs_agent_one',
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_agent_one',
      statusUrl: 'https://ae.example/api/v1/account/funding-sessions/cs_agent_one',
      expiresAt: 1_800_000_000_000,
      quote: {
        principalAmount: { currency: 'AUD', exponent: 6, units: '5000000' },
        serviceFeeAmount: { currency: 'AUD', exponent: 6, units: '250000' },
        taxAmount: { currency: 'AUD', exponent: 6, units: '25000' },
        totalPaymentAmount: { currency: 'AUD', exponent: 6, units: '5275000' },
      },
      humanHandoff: { message: 'Open Stripe.', instruction: 'Persist fundingSessionId and poll status.' },
      pollAfterMs: 5000, idempotentReplay: true,
    } as const)),
    status: vi.fn(async () => ({ kind: 'not_found' } as const)),
  }
  return { ...base, ...overrides }
}

describe('agent funding handoff HTTP boundary', () => {
  it('requires a connected buyer agent', async () => {
    const result = await handleFundingHandoffAction(
      new Request('https://ae.example/api/v1/account/funding/config'),
      'config', undefined,
      { authenticate: async () => ({ isAuthenticated: false, tokenType: null, id: null, subject: null, scopes: null }) },
    )
    expect(result.status).toBe(401)
    expect(result.headers.get('www-authenticate')).toContain('market_operations:invoke')
  })

  it('takes HTTP idempotency from the standard header and returns a replay receipt', async () => {
    const funding = service()
    const result = await handleFundingHandoffAction(
      new Request('https://ae.example/api/v1/account/funding-sessions', {
        method: 'POST',
        headers: { Authorization: 'Bearer hidden', 'Content-Type': 'application/json', 'Idempotency-Key': 'logical-attempt-one' },
        body: JSON.stringify({ principalAmount: { currency: 'AUD', exponent: 6, units: '5000000' } }),
      }),
      'create', undefined,
      { authenticate, resolvePrincipal, service: funding },
    )
    expect(result.status).toBe(201)
    expect(result.headers.get('idempotent-replay')).toBe('true')
    expect(result.headers.get('cache-control')).toBe('no-store')
    expect(funding.create).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.objectContaining({ idempotencyKey: 'logical-attempt-one' }),
      principal: expect.objectContaining({ principalId: 'prn_00000000000040008000000000000041', ownerId: 'acc_00000000000040008000000000000041' }),
    }))
    await expect(result.json()).resolves.toMatchObject({
      fundingSessionId: 'cs_agent_one', checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_agent_one',
    })
  })

  it('makes malformed session references indistinguishable from missing sessions', async () => {
    const funding = service()
    const result = await handleFundingHandoffAction(
      new Request('https://ae.example/api/v1/account/funding-sessions/not-a-session'),
      'status', 'not-a-session',
      { authenticate, resolvePrincipal, service: funding },
    )

    expect(result.status).toBe(404)
    await expect(result.json()).resolves.toMatchObject({
      kind: 'NOT_FOUND',
      code: 'funding_session_not_found',
    })
    expect(funding.status).not.toHaveBeenCalled()
  })

  it('returns one safe polling continuation when funding status is uncertain', async () => {
    const funding = service({
      status: vi.fn(async () => ({
        kind: 'error', code: 'funding_source_unavailable', retryable: true,
        correlationRef: 'correlation:funding', nextAction: { kind: 'poll' },
      } as const)),
    })
    const result = await handleFundingHandoffAction(
      new Request('https://ae.example/api/v1/account/funding-sessions/cs_agent_one'),
      'status', 'cs_agent_one',
      { authenticate, resolvePrincipal, service: funding },
    )

    expect(result.status).toBe(503)
    await expect(result.json()).resolves.toMatchObject({
      code: 'funding_source_unavailable',
      retryable: true,
      correlationRef: 'correlation:funding',
      nextAction: { kind: 'poll' },
    })
  })

  it('projects only payer-safe public fields and disables caching and referrers', async () => {
    const result = publicFundingHandoffResponse({
      kind: 'found', funding: {
        state: 'processing', agentName: 'Invoice agent',
        creditAmount: { currency: 'AUD', exponent: 6, units: '5000000' },
      },
    })
    expect(result.headers.get('cache-control')).toBe('no-store')
    expect(result.headers.get('referrer-policy')).toBe('no-referrer')
    expect(result.headers.get('x-robots-tag')).toBe('noindex')
    const body = await result.text()
    expect(JSON.parse(body)).toEqual({ success: true, funding: {
      state: 'processing', agentName: 'Invoice agent', creditAmount: { currency: 'AUD', exponent: 6, units: '5000000' },
    } })
    expect(body).not.toMatch(/accountRef|owner|balance|checkoutUrl|serviceFee|tax|credential|commandRef|payment/u)
  })
})
