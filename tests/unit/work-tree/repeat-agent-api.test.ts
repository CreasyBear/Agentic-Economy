import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
}))

vi.mock('@/lib/server/customer-request-agent-auth', () => ({
  authenticateCustomerRequestAgent: mocks.authenticate,
}))

import { handleWorkTreeAgentAction } from '@/lib/server/work-tree-agent-api'

const principal = {
  principalId: 'clerk_api_key:repeat',
  ownerId: 'owner:repeat',
  credentialId: 'credential:repeat',
  scopes: [
    'customer_requests:approve_each',
    'work_trees:repeat_reserve',
    'work_trees:repeat_inspect',
  ],
  authorityMode: 'approve_each' as const,
}

beforeEach(() => {
  mocks.authenticate.mockReset()
  mocks.authenticate.mockResolvedValue({ kind: 'authenticated', principal })
})

describe('WorkTree repeat agent HTTP seam', () => {
  it('dispatches reserve and inspect through the named source operation', async () => {
    const calls: Array<{ operation: string; command: Record<string, unknown>; principal: { credentialId: string } }> = []
    const callOperation = async ({ operation, command, principal: actor }: {
      operation: string
      command: Record<string, unknown>
      principal: { credentialId: string }
    }) => {
      calls.push({ operation, command, principal: actor })
      if (operation === 'reserveRepeatUse') {
        return {
          kind: 'accepted',
          useRef: 'repeat-use:http',
          permissionRef: 'repeat-permission:http',
          operationKey: 'reserve:http',
          state: 'reserved',
          reservedOccurrences: 1,
          reservedDataAllocations: 1,
          reservedSpend: { currency: 'AUD', units: '0', exponent: 2 },
        }
      }
      return {
        kind: 'accepted',
        use: {
          useRef: 'repeat-use:http',
          permissionRef: 'repeat-permission:http',
          projectId: 'project:http',
          treeId: 'tree:http',
          principalId: 'principal:repeat',
          nodeId: 'node:http',
          generation: 1,
          revision: 1,
          delegatedCredentialId: 'credential:repeat',
          operationKey: 'reserve:http',
          requestedOccurrences: 1,
          requestedSpend: { currency: 'AUD', units: '0', exponent: 2 },
          requestedDataAllocations: 1,
          reservedOccurrences: 1,
          reservedSpend: { currency: 'AUD', units: '0', exponent: 2 },
          reservedDataAllocations: 1,
          state: 'reserved',
          releasedOccurrences: 0,
          releasedSpend: { currency: 'AUD', units: '0', exponent: 2 },
        },
        permission: {
          permissionRef: 'repeat-permission:http',
          projectId: 'project:http',
          treeId: 'tree:http',
          nodeId: 'node:http',
          generation: 1,
          revision: 1,
          delegatedCredentialId: 'credential:repeat',
          validFrom: 0,
          validUntil: 9_999_999_999_999,
          perUseSpend: { currency: 'AUD', units: '0', exponent: 2 },
          cumulativeSpend: { currency: 'AUD', units: '0', exponent: 2 },
          occurrenceLimit: 1,
          perUseDataAllocations: 1,
          cumulativeDataAllocations: 1,
          reservedDataAllocations: 1,
          settledDataAllocations: 0,
          reservedOccurrences: 1,
          settledOccurrences: 0,
          reservedSpend: { currency: 'AUD', units: '0', exponent: 2 },
          settledSpend: { currency: 'AUD', units: '0', exponent: 2 },
          status: 'active',
          issuedAt: 0,
          sourceReceiptId: 'receipt:http',
        },
      }
    }
    const reserve = await handleWorkTreeAgentAction(
      new Request('https://ae.test/api/v1/work-tree/reserveRepeatUse', {
        method: 'POST',
        headers: { Authorization: 'Bearer ak_repeat', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: 'project:http',
          permissionRef: 'repeat-permission:http',
          operationKey: 'reserve:http',
          requestedOccurrences: 1,
          requestedSpend: { currency: 'AUD', units: '0', exponent: 2 },
          requestedDataAllocations: 1,
        }),
      }),
      'reserveRepeatUse',
      { callOperation },
    )
    expect(reserve.status).toBe(200)
    await expect(reserve.json()).resolves.toMatchObject({ kind: 'accepted', useRef: 'repeat-use:http' })

    const inspect = await handleWorkTreeAgentAction(
      new Request('https://ae.test/api/v1/work-tree/inspectRepeatUse', {
        method: 'POST',
        headers: { Authorization: 'Bearer ak_repeat', 'Content-Type': 'application/json' },
        body: JSON.stringify({ useRef: 'repeat-use:http' }),
      }),
      'inspectRepeatUse',
      { callOperation },
    )
    expect(inspect.status).toBe(200)
    expect(calls[0]?.principal.credentialId).toBe('credential:repeat')
    expect(calls.map((call) => call.operation)).toEqual(['reserveRepeatUse', 'inspectRepeatUse'])
    expect(mocks.authenticate).toHaveBeenNthCalledWith(1, expect.objectContaining({
      requiredScope: 'work_trees:repeat_reserve',
      requiredMode: 'approve_each',
    }))
    expect(mocks.authenticate).toHaveBeenNthCalledWith(2, expect.objectContaining({
      requiredScope: 'work_trees:repeat_inspect',
      requiredMode: 'inspect_only',
    }))
  })

  it('refuses malformed and unauthorized repeat requests before source dispatch', async () => {
    const callOperation = vi.fn(async () => ({ kind: 'accepted' }))
    const malformed = await handleWorkTreeAgentAction(
      new Request('https://ae.test/api/v1/work-tree/reserveRepeatUse', {
        method: 'POST',
        headers: { Authorization: 'Bearer ak_repeat', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: 'project:http',
          permissionRef: 'repeat-permission:http',
          operationKey: 'reserve:unpaid-claim',
          requestedOccurrences: 1,
          requestedSpend: { currency: 'AUD', units: '400', exponent: 2 },
          requestedDataAllocations: 1,
          paid: false,
        }),
      }),
      'reserveRepeatUse',
      { callOperation },
    )
    expect(malformed.status).toBe(400)
    await expect(malformed.json()).resolves.toMatchObject({
      type: 'about:blank',
      title: 'Invalid argument',
      status: 400,
      kind: 'INVALID_ARGUMENT',
      code: 'invalid_input',
    })
    expect(callOperation).not.toHaveBeenCalled()

    mocks.authenticate.mockResolvedValue({ kind: 'refused', status: 403, reason: 'scope_required' })
    const unauthorized = await handleWorkTreeAgentAction(
      new Request('https://ae.test/api/v1/work-tree/reserveRepeatUse', {
        method: 'POST',
        headers: { Authorization: 'Bearer ak_repeat', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: 'project:http',
          permissionRef: 'repeat-permission:http',
          operationKey: 'reserve:http',
          requestedOccurrences: 1,
          requestedSpend: { currency: 'AUD', units: '0', exponent: 2 },
          requestedDataAllocations: 1,
        }),
      }),
      'reserveRepeatUse',
      { callOperation },
    )
    expect(unauthorized.status).toBe(403)
    expect(unauthorized.headers.get('content-type')).toBe('application/problem+json')
    await expect(unauthorized.json()).resolves.toMatchObject({
      type: 'about:blank',
      title: 'Permission denied',
      status: 403,
      kind: 'PERMISSION_DENIED',
      code: 'scope_required',
      detail: 'scope_required',
    })
    expect(callOperation).not.toHaveBeenCalled()
  })
})
