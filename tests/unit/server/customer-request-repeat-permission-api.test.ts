import { describe, expect, it, vi } from 'vitest'

import {
  handleAgentCustomerRequestRepeatPermissionAllowPost,
  handleAgentCustomerRequestRepeatPermissionUsePost,
} from '@/lib/server/customer-request-agent-api'
import {
  handleCustomerRequestRepeatPermissionAllowPost,
  handleCustomerRequestRepeatPermissionUsePost,
} from '@/lib/server/customer-request-repeat-permission-api'
import { verifyCustomerRequestServiceAssertion } from '@/modules/customer-request/service-auth-envelope'

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
  scopes: ['customer_requests:create', 'customer_requests:standing_authority'],
}

describe('Customer Request repeat-permission HTTP surface', () => {
  it('refuses an external credential without standing-authority scope before the application call', async () => {
    const callAction = vi.fn()
    const response = await handleAgentCustomerRequestRepeatPermissionAllowPost(
      post({
        revision: 2,
        routeRef,
        delegatedCredentialId: 'credential:repeat',
        occurrences: 2,
        cumulativeSpend: { currency: 'AUD', amountMinor: 2_400 },
        validUntil: 50_000,
        idempotencyKey: 'allow-repeat:no-scope',
      }),
      requestRef,
      {
        ...agentOptions(async () => repeatPermissionReceipt()),
        authenticate: async () => ({ ...principal, scopes: ['customer_requests:create'] }),
        callAction,
      },
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ kind: 'refused', reason: 'scope_required' })
    expect(callAction).not.toHaveBeenCalled()
  })

  it('binds the external-agent allow command and returns the same customer receipt as the human handler', async () => {
    const body = {
      revision: 2,
      routeRef,
      delegatedCredentialId: 'credential:repeat',
      occurrences: 2,
      cumulativeSpend: { currency: 'AUD', amountMinor: 2_400 },
      validUntil: 50_000,
      idempotencyKey: 'allow-repeat:http',
    }
    const receipt = repeatPermissionReceipt()
    let humanCommand: Record<string, unknown> | undefined
    const human = await handleCustomerRequestRepeatPermissionAllowPost(post(body), requestRef, {
      allow: async (command) => {
        humanCommand = command
        return receipt
      },
    })
    const callAction = vi.fn(async (_name: string, args: Record<string, unknown>) => {
      expect(await verifyCustomerRequestServiceAssertion({
        key,
        operation: 'allow_repeat',
        command: humanCommand as never,
        assertion: args.serviceAuth as never,
        now: 1_001,
      })).toBe(true)
      const { serviceAuth: _serviceAuth, ...command } = args
      expect(command).toEqual(humanCommand)
      return receipt
    })
    const agent = await handleAgentCustomerRequestRepeatPermissionAllowPost(
      post(body),
      requestRef,
      agentOptions(callAction),
    )

    expect(human.status).toBe(200)
    expect(agent.status).toBe(200)
    expect(await agent.json()).toEqual(await human.json())
    expect(callAction).toHaveBeenCalledWith('customerRequestApplication:allowRepeatRoute', expect.any(Object))
  })

  it('binds use to the opaque permission and returns the canonical confirmed Request projection', async () => {
    const body = {
      revision: 2,
      routeRef,
      delegatedCredentialId: 'credential:repeat',
      idempotencyKey: 'use-repeat:http',
    }
    const result = {
      kind: 'refused' as const,
      reason: 'request_not_found' as const,
    }
    let humanCommand: Record<string, unknown> | undefined
    const human = await handleCustomerRequestRepeatPermissionUsePost(post(body), requestRef, permissionRef, {
      use: async (command) => {
        humanCommand = command
        return result
      },
    })
    const callAction = vi.fn(async (_name: string, args: Record<string, unknown>) => {
      expect(await verifyCustomerRequestServiceAssertion({
        key,
        operation: 'use_repeat',
        command: humanCommand as never,
        assertion: args.serviceAuth as never,
        now: 1_001,
      })).toBe(true)
      const { serviceAuth: _serviceAuth, ...command } = args
      expect(command).toEqual(humanCommand)
      return result
    })
    const agent = await handleAgentCustomerRequestRepeatPermissionUsePost(
      post(body),
      requestRef,
      permissionRef,
      agentOptions(callAction),
    )

    expect(human.status).toBe(404)
    expect(agent.status).toBe(404)
    expect(await agent.json()).toEqual(await human.json())
    expect(callAction).toHaveBeenCalledWith('customerRequestApplication:useRepeatRoute', expect.any(Object))
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
      perUseSpend: { currency: 'AUD', amountMinor: 1_200 },
      cumulativeSpend: { currency: 'AUD', amountMinor: 2_400 },
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

type TestAgentResult = ReturnType<typeof repeatPermissionReceipt> | Readonly<{
  kind: 'refused'
  reason: 'request_not_found'
}>

function agentOptions(callAction: (name: string, args: Record<string, unknown>) => Promise<TestAgentResult>) {
  return {
    authenticate: async () => principal,
    callAction,
    env: { AE_CONVEX_SERVER_FUNCTION_TOKEN: key },
    now: () => 1_000,
  }
}
