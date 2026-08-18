import { describe, expect, it, vi } from 'vitest'

import {
  handleAgentCustomerRequestRepeatPermissionAllowPost,
  handleAgentCustomerRequestRepeatPermissionGet,
  handleAgentCustomerRequestRepeatPermissionsGet,
  handleAgentCustomerRequestRepeatPermissionUsePost,
  handleAgentCustomerRequestRepeatPermissionWithdrawPost,
} from '@/lib/server/customer-request-agent-api'
import type { AgentAccessPrincipal } from '@/lib/server/agent-access-auth'
import {
  handleCustomerRequestConnectedAssistantsGet,
  handleCustomerRequestRepeatPermissionAllowPost,
  handleCustomerRequestRepeatPermissionGet,
  handleCustomerRequestRepeatPermissionUsePost,
  handleCustomerRequestRepeatPermissionWithdrawPost,
} from '@/lib/server/customer-request-repeat-permission-api'
import { customerRequestScopeForMode } from '@/modules/customer-request/agent-contract'
import { expectQuarantineWriteFrozen } from '../../helpers/http'

const key = 'repeat-permission-http-key-with-at-least-32-bytes'
const requestRef = 'request:repeat-http'
const routeRef = 'route:opaque'
const permissionRef = 'repeat-permission:opaque'
const principal = {
  isAuthenticated: true as const,
  tokenType: 'api_key' as const,
  id: 'ak_repeat',
  subject: 'user_repeat',
  userId: 'user_repeat',
  orgId: null,
  scopes: ['customer_requests:create', customerRequestScopeForMode('bounded_mandate')],
}
const resolvePrincipal = async (value: AgentAccessPrincipal): Promise<AgentAccessPrincipal> => value

describe('Customer Request repeat-permission HTTP surface', () => {
  it('tombstones connected-assistant GET as RFC 9457 410', async () => {
    const list = vi.fn()
    const response = await handleCustomerRequestConnectedAssistantsGet(get({}), requestRef, { list })
    const callAction = vi.fn()
    const agent = await handleAgentCustomerRequestRepeatPermissionsGet(
      get({}),
      requestRef,
      agentOptions(callAction),
    )
    const humanBody = await expectQuarantineWriteFrozen(response, 'customerRequest.listConnectedAssistants')
    const agentBody = await expectQuarantineWriteFrozen(agent, 'customerRequest.listConnectedAssistants')
    expect(agentBody).toEqual(humanBody)
    expect(list).not.toHaveBeenCalled()
    expect(callAction).not.toHaveBeenCalled()
  })

  it('refuses an external credential without the bounded-mandate scope before the application call', async () => {
    const callAction = vi.fn()
    const response = await handleAgentCustomerRequestRepeatPermissionAllowPost(
      post({
        revision: 2,
        routeRef,
        delegatedCredentialId: 'credential:repeat',
        occurrences: 2,
        cumulativeSpend: { currency: 'AUD', units: '2400', exponent: 2 },
        validUntil: 50_000,
        idempotencyKey: 'allow-repeat:no-scope',
      }),
      requestRef,
      {
        ...agentOptions(async () => repeatPermissionReceipt()),
        authenticate: async () => ({ ...principal, scopes: ['customer_requests:create'] }),
        resolvePrincipal,
        callAction,
      },
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({
      kind: 'PERMISSION_DENIED',
      code: 'scope_required',
      detail: 'scope_required',
    })
    expect(callAction).not.toHaveBeenCalled()
  })

  it('freezes allow writes on both human and agent HTTP entrypoints', async () => {
    const body = {
      revision: 2,
      routeRef,
      delegatedCredentialId: 'credential:repeat',
      occurrences: 2,
      cumulativeSpend: { currency: 'AUD', units: '2400', exponent: 2 },
      validUntil: 50_000,
      idempotencyKey: 'allow-repeat:http',
    }
    const allow = vi.fn()
    const callAction = vi.fn()
    const human = await handleCustomerRequestRepeatPermissionAllowPost(post(body), requestRef, { allow })
    const agent = await handleAgentCustomerRequestRepeatPermissionAllowPost(
      post(body),
      requestRef,
      agentOptions(callAction),
    )
    const humanBody = await expectQuarantineWriteFrozen(human, 'customerRequest.run')
    const agentBody = await expectQuarantineWriteFrozen(agent, 'customerRequest.run')
    expect(agentBody).toEqual(humanBody)
    expect(allow).not.toHaveBeenCalled()
    expect(callAction).not.toHaveBeenCalled()
  })

  it('freezes use writes on both human and agent HTTP entrypoints', async () => {
    const body = {
      revision: 2,
      routeRef,
      delegatedCredentialId: 'credential:repeat',
      idempotencyKey: 'use-repeat:http',
    }
    const use = vi.fn()
    const callAction = vi.fn()
    const human = await handleCustomerRequestRepeatPermissionUsePost(post(body), requestRef, permissionRef, { use })
    const agent = await handleAgentCustomerRequestRepeatPermissionUsePost(
      post(body),
      requestRef,
      permissionRef,
      agentOptions(callAction),
    )
    const humanBody = await expectQuarantineWriteFrozen(human, 'customerRequest.run')
    const agentBody = await expectQuarantineWriteFrozen(agent, 'customerRequest.run')
    expect(agentBody).toEqual(humanBody)
    expect(use).not.toHaveBeenCalled()
    expect(callAction).not.toHaveBeenCalled()
  })

  it('tombstones repeat-permission inspect GET as RFC 9457 410', async () => {
    const inspect = vi.fn()
    const request = get({ routeRef })
    const human = await handleCustomerRequestRepeatPermissionGet(request, requestRef, permissionRef, { inspect })
    const callAction = vi.fn()
    const agent = await handleAgentCustomerRequestRepeatPermissionGet(
      request,
      requestRef,
      permissionRef,
      agentOptions(callAction),
    )
    const humanBody = await expectQuarantineWriteFrozen(human, 'customerRequest.inspectRepeatPermission')
    const agentBody = await expectQuarantineWriteFrozen(agent, 'customerRequest.inspectRepeatPermission')
    expect(agentBody).toEqual(humanBody)
    expect(inspect).not.toHaveBeenCalled()
    expect(callAction).not.toHaveBeenCalled()
  })

  it('freezes withdrawal writes on both human and agent HTTP entrypoints', async () => {
    const body = { routeRef, idempotencyKey: 'withdraw-repeat:http' }
    const withdraw = vi.fn()
    const callAction = vi.fn()
    const human = await handleCustomerRequestRepeatPermissionWithdrawPost(
      post(body),
      requestRef,
      permissionRef,
      { withdraw },
    )
    const agent = await handleAgentCustomerRequestRepeatPermissionWithdrawPost(
      post(body),
      requestRef,
      permissionRef,
      agentOptions(callAction),
    )
    const humanBody = await expectQuarantineWriteFrozen(human, 'customerRequest.run')
    const agentBody = await expectQuarantineWriteFrozen(agent, 'customerRequest.run')
    expect(agentBody).toEqual(humanBody)
    expect(withdraw).not.toHaveBeenCalled()
    expect(callAction).not.toHaveBeenCalled()
  })
})

function repeatPermissionReceipt() {
  return {
    kind: 'repeat_permission' as const,
    status: 'active' as const,
    permissionRef,
    requestRef,
    revision: 2,
    routeRef,
    delegatedCredentialId: 'credential:repeat',
    limits: {
      perUseSpend: { currency: 'AUD', units: '1200', exponent: 2 },
      cumulativeSpend: { currency: 'AUD', units: '2400', exponent: 2 },
      perUseDataAllocations: 1,
      cumulativeDataAllocations: 2,
      occurrences: 2,
    },
    fallback: 'ask_for_confirmation' as const,
    validFrom: 1_000,
    validUntil: 50_000,
  }
}

function post(body: unknown): Request {
  return new Request('https://ae.example.test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function get(query: Record<string, string>): Request {
  const url = new URL('https://ae.example.test')
  for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value)
  return new Request(url)
}

type TestAgentResult = ReturnType<typeof repeatPermissionReceipt> | (Omit<
  ReturnType<typeof repeatPermissionReceipt>,
  'status'
> & Readonly<{ status: 'withdrawn'; withdrawnAt: number }>) | Readonly<{
  kind: 'refused'
  reason: 'request_not_found'
}> | Readonly<{
  kind: 'connected_assistants'
  requestRef: string
  assistants: { assistantRef: string; label: string; lastUsedAt: number }[]
  permissions: ReturnType<typeof repeatPermissionReceipt>[]
}>

function agentOptions(callAction: (name: string, args: Record<string, unknown>) => Promise<TestAgentResult>) {
  return {
    authenticate: async () => principal,
    resolvePrincipal,
    callAction,
    env: { AE_CONVEX_SERVER_FUNCTION_TOKEN: key },
    now: () => 1_000,
  }
}
