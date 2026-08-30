import type * as ConvexSourceModule from '@/lib/server/convex-source'
import type * as SourceWriteAdmissionModule from '@/lib/server/source-write-admission'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  callPublicSourceMutation: vi.fn(),
  sourceMutation: vi.fn((name: string) => ({ name })),
  sourceWriteAdmissionFromRequest: vi.fn(),
  sourceWriteRequestFromAdmission: vi.fn(),
}))

vi.mock('@/lib/server/convex-source', async (importOriginal) => ({
  ...(await importOriginal<typeof ConvexSourceModule>()),
  callPublicSourceMutation: mocks.callPublicSourceMutation,
  sourceMutation: mocks.sourceMutation,
}))
vi.mock('@/lib/server/source-write-admission', async (importOriginal) => ({
  ...(await importOriginal<typeof SourceWriteAdmissionModule>()),
  sourceWriteAdmissionFromRequest: mocks.sourceWriteAdmissionFromRequest,
  sourceWriteRequestFromAdmission: mocks.sourceWriteRequestFromAdmission,
}))

import { createAccountManagementService } from '@/modules/agent-access/account.actions'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'

const principal: AgentAccessPrincipal = {
  principalId: 'principal:account', ownerId: 'owner:account', credentialId: 'credential:account',
  applicationRef: 'agentic-economy', environment: 'sandbox',
  scopes: ['market_operations:invoke'], authorityMode: 'inspect_only',
}

describe('account management action service', () => {
  beforeEach(() => {
    mocks.callPublicSourceMutation.mockReset()
    mocks.sourceWriteAdmissionFromRequest.mockReset().mockResolvedValue({ operationKey: 'signed' })
    mocks.sourceWriteRequestFromAdmission.mockReset().mockReturnValue({ method: 'POST' })
  })

  it('reads exact account balance through the signed billing boundary', async () => {
    mocks.callPublicSourceMutation.mockResolvedValue({
      kind: 'available', principalRef: principal.principalId, accountRef: principal.ownerId,
      balance: { currency: 'USD', units: '2500', exponent: 2 },
      recoveryDue: { currency: 'USD', units: '0', exponent: 2 },
      accountState: 'active', version: 3, updatedAt: 10,
      funding: { kind: 'owner_browser_required', path: '/owner/credit', anchor: 'fund' },
    })
    const service = createAccountManagementService(
      new Request('https://ae.example/api/v1/account/balance', { method: 'POST' }),
      '{"currency":"USD"}',
    )

    await expect(service.balance({ input: { currency: 'USD' }, principal, correlationId: 'request:one' }))
      .resolves.toMatchObject({ kind: 'available', balance: { units: '2500' } })
    expect(mocks.sourceWriteAdmissionFromRequest).toHaveBeenCalledWith(expect.objectContaining({ scope: 'billing' }))
    expect(mocks.callPublicSourceMutation).toHaveBeenCalledWith(
      { name: 'agentMoneyReads:balance' },
      expect.objectContaining({ currency: 'USD', agentPrincipal: principal }),
    )
  })

  it('projects native pagination without leaking backend pagination metadata', async () => {
    mocks.callPublicSourceMutation.mockResolvedValue({
      kind: 'available',
      activity: {
        page: [{
          activityRef: 'usage:one', credentialId: principal.credentialId,
          serviceRef: 'service:one', offeringRef: 'offering:one', businessId: 'business:one',
          operationKey: 'operation:one', invocationRef: 'invocation:one', attemptRef: 'attempt:one',
          grossAmount: { currency: 'USD', units: '125', exponent: 2 }, chargeState: 'paid',
          priceDigest: `sha256:${'a'.repeat(64)}`, observedAt: 10,
        }],
        isDone: false,
        continueCursor: 'cursor:next',
        splitCursor: 'private-backend-metadata',
      },
    })
    const service = createAccountManagementService(
      new Request('https://ae.example/api/v1/account/activity', { method: 'POST' }),
      '{}',
    )
    const result = await service.activity({
      input: { currency: 'USD', limit: 20 }, principal, correlationId: 'request:two',
    })

    expect(result).toMatchObject({ kind: 'available', hasMore: true, nextCursor: 'cursor:next' })
    expect(JSON.stringify(result)).not.toContain('splitCursor')
  })

  it('fails closed when the source adds undeclared balance fields', async () => {
    mocks.callPublicSourceMutation.mockResolvedValue({
      kind: 'available', principalRef: principal.principalId, accountRef: principal.ownerId,
      balance: { currency: 'USD', units: '2500', exponent: 2 },
      recoveryDue: { currency: 'USD', units: '0', exponent: 2 },
      accountState: 'active', version: 3, updatedAt: 10,
      funding: { kind: 'owner_browser_required', path: '/owner/credit', anchor: 'fund' },
      stripeCustomerId: 'cus_secret',
    })
    const service = createAccountManagementService(
      new Request('https://ae.example/api/v1/account/balance', { method: 'POST' }),
      '{}',
    )
    await expect(service.balance({ input: { currency: 'USD' }, principal, correlationId: 'request:three' }))
      .resolves.toEqual({ kind: 'error', code: 'source_unavailable' })
  })
})
