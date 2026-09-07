import type * as ConvexSourceModule from '@/lib/server/convex-source'
import type * as SourceWriteAdmissionModule from '@/lib/server/source-write-admission'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  callPublicSourceAction: vi.fn(),
  callPublicSourceMutation: vi.fn(),
  sourceMutation: vi.fn((name: string) => ({ name })),
  sourceWriteAdmissionFromRequest: vi.fn(),
  sourceWriteRequestFromAdmission: vi.fn(),
}))

vi.mock('@/lib/server/convex-source', async (importOriginal) => ({
  ...(await importOriginal<typeof ConvexSourceModule>()),
  callPublicSourceAction: mocks.callPublicSourceAction,
  callPublicSourceMutation: mocks.callPublicSourceMutation,
  sourceMutation: mocks.sourceMutation,
}))
vi.mock('@/lib/server/source-write-admission', async (importOriginal) => ({
  ...(await importOriginal<typeof SourceWriteAdmissionModule>()),
  sourceWriteAdmissionFromRequest: mocks.sourceWriteAdmissionFromRequest,
  sourceWriteRequestFromAdmission: mocks.sourceWriteRequestFromAdmission,
}))

import { agentAccountActivityAction, createAccountManagementService } from '@/modules/agent-access/account.actions'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'

const principal: AgentAccessPrincipal = {
  principalId: 'principal:account', ownerId: 'owner:account', credentialId: 'credential:account',
  applicationRef: 'agentic-economy', environment: 'sandbox',
  scopes: ['market_tools:call'], authorityMode: 'read_only',
}

describe('account management action service', () => {
  beforeEach(() => {
    mocks.callPublicSourceAction.mockReset()
    mocks.callPublicSourceMutation.mockReset()
    mocks.sourceWriteAdmissionFromRequest.mockReset().mockResolvedValue({ operationKey: 'signed' })
    mocks.sourceWriteRequestFromAdmission.mockReset().mockReturnValue({ method: 'POST' })
  })

  it('reads exact account balance through the signed billing boundary', async () => {
    mocks.callPublicSourceAction.mockResolvedValue({
      kind: 'available', principalRef: principal.principalId, accountRef: principal.ownerId,
      balance: { currency: 'AUD', units: '25000000', exponent: 6 },
      accountState: 'active', version: 3, updatedAt: 10,
      funding: { kind: 'agent_funding_handoff', configAction: 'funding.handoff.config', createAction: 'funding.handoff.create', statusAction: 'funding.handoff.status' },
    })
    const service = createAccountManagementService(
      new Request('https://ae.example/api/v1/account/balance', { method: 'POST' }),
      '{"currency":"AUD"}',
    )

    await expect(service.balance({ input: { currency: 'AUD' }, principal, correlationId: 'request:one' }))
      .resolves.toMatchObject({ kind: 'available', balance: { units: '25000000' } })
    expect(mocks.sourceWriteAdmissionFromRequest).toHaveBeenCalledWith(expect.objectContaining({ scope: 'billing' }))
    expect(mocks.callPublicSourceAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ currency: 'AUD', agentPrincipal: principal }),
    )
  })

  it('projects native pagination without leaking backend pagination metadata', async () => {
    mocks.callPublicSourceMutation.mockResolvedValue({
      kind: 'available',
      activity: {
        page: [{
          callRef: 'invocation:one', credentialRef: principal.credentialId,
          toolRef: 'operation:one', providerRef: 'business:one',
          state: 'completed', deliveryState: 'delivered', paymentState: 'settled',
          audAmountUnits: '1250000', observedAt: 10,
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
      input: { currency: 'AUD', limit: 20 }, principal, correlationId: 'request:two',
    })

    expect(result).toMatchObject({ kind: 'available', hasMore: true, nextCursor: 'cursor:next' })
    expect(JSON.stringify(result)).not.toContain('splitCursor')
  })

  it('fails closed when the source adds undeclared balance fields', async () => {
    mocks.callPublicSourceAction.mockResolvedValue({
      kind: 'available', principalRef: principal.principalId, accountRef: principal.ownerId,
      balance: { currency: 'AUD', units: '25000000', exponent: 6 },
      accountState: 'active', version: 3, updatedAt: 10,
      funding: { kind: 'agent_funding_handoff', configAction: 'funding.handoff.config', createAction: 'funding.handoff.create', statusAction: 'funding.handoff.status' },
      stripeCustomerId: 'cus_secret',
    })
    const service = createAccountManagementService(
      new Request('https://ae.example/api/v1/account/balance', { method: 'POST' }),
      '{}',
    )
    await expect(service.balance({ input: { currency: 'AUD' }, principal, correlationId: 'request:three' }))
      .resolves.toEqual({ kind: 'error', code: 'source_unavailable' })
  })

  it('describes the account activity currency as AUD', () => {
    expect(agentAccountActivityAction.parameters.find(({ name }) => name === 'currency'))
      .toMatchObject({ description: 'Activity currency, default AUD.' })
  })
})
