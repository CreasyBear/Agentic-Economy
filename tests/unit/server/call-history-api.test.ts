import { describe, expect, it, vi } from 'vitest'

import type { AgentAccessPrincipalResolver } from '@/lib/server/agent-access-auth'
import { createCallService, handleCallListGet } from '@/lib/server/call-api'
import { createPublicSourceTransport, setPublicSourceTransportForTests } from '@/lib/server/convex-source'
import type { CallService } from '@/modules/capability-execution/call-authority'
import { installTestSourceWriteSecret } from '../../helpers/source-write-admission'
import { convexUrl } from './server-seams-harness'

const principal = {
  principalId: 'prn_00000000000040008000000000000043',
  ownerId: 'acc_00000000000040008000000000000043',
  credentialId: 'credential:one',
  applicationRef: 'application:one',
  environment: 'sandbox' as const,
  scopes: ['market_tools:call'],
  authorityMode: 'read_only' as const,
}
const authenticate = async () => ({
  isAuthenticated: true as const,
  tokenType: 'api_key' as const,
  id: principal.credentialId,
  subject: 'user_one',
  scopes: principal.scopes,
})
const resolvePrincipal: AgentAccessPrincipalResolver = async (projection) => ({
  ...projection,
  principalId: principal.principalId,
  ownerId: principal.ownerId,
})

function service(): CallService {
  return {
    callTool: vi.fn(),
    quoteTool: vi.fn(),
    listCalls: vi.fn().mockResolvedValue({
      kind: 'available',
      items: [{
        callRef: 'call:one',
        toolRef: 'tool:one',
        state: 'completed',
        resultKind: 'completed',
        receiptRef: 'receipt:one',
        createdAt: 10,
        updatedAt: 20,
      }],
      hasMore: true,
      nextCursor: 'cursor:two',
    }),
    readCallStatus: vi.fn(),
    cancelCall: vi.fn(),
    reconcileCall: vi.fn(),
  } satisfies CallService
}

describe('operation invocation history HTTP adapter', () => {
  it('signs the bounded list command and preserves the native Convex cursor request', async () => {
    installTestSourceWriteSecret()
    let payload: { path: string; args: [Record<string, unknown>] } | undefined
    const restore = setPublicSourceTransportForTests(createPublicSourceTransport({
      env: { CONVEX_URL: convexUrl },
      fetch: async (_input, init) => {
        payload = JSON.parse(String(init?.body)) as typeof payload
        return new Response(JSON.stringify({
          status: 'success',
          value: { page: [], isDone: false, continueCursor: 'cursor:two' },
        }))
      },
    }))
    try {
      const executor = createCallService(new Request('https://ae.example/api/v1/calls'), '')
      if (executor.listCalls === undefined) throw new Error('call_history_service_unavailable')
      const result = await executor.listCalls({
        input: { limit: 5, cursor: 'cursor:one', state: 'completed' },
        principal,
        correlationId: 'correlation:history',
      })

      expect(result).toEqual({ kind: 'available', items: [], hasMore: true, nextCursor: 'cursor:two' })
      expect(payload?.path).toBe('capabilityCalls:listCalls')
      expect(payload?.args[0]).toMatchObject({
        state: 'completed',
        paginationOpts: { numItems: 5, cursor: 'cursor:one' },
        principal,
        sourceWrite: expect.any(Object),
      })
    } finally {
      restore()
    }
  })

  it('passes one validated, filtered page request to the canonical service', async () => {
    const executor = service()
    const response = await handleCallListGet(
      new Request('https://ae.example/api/v1/calls?limit=5&cursor=cursor%3Aone&state=completed'),
      { authenticate, resolvePrincipal, callService: executor },
    )

    if (response.status !== 200) throw new Error(await response.clone().text())
    await expect(response.json()).resolves.toMatchObject({
      kind: 'available',
      items: [{ callRef: 'call:one', toolRef: 'tool:one', receiptRef: 'receipt:one' }],
      nextCursor: 'cursor:two',
    })
    expect(executor.listCalls).toHaveBeenCalledWith(expect.objectContaining({
      input: { limit: 5, cursor: 'cursor:one', state: 'completed' },
      principal: expect.objectContaining({
        principalId: principal.principalId,
        ownerId: principal.ownerId,
        credentialId: principal.credentialId,
      }),
    }))
  })

  it('refuses invalid filters before reading history', async () => {
    const executor = service()
    const response = await handleCallListGet(
      new Request('https://ae.example/api/v1/calls?limit=500&state=made_up'),
      { authenticate, resolvePrincipal, callService: executor },
    )

    if (response.status !== 400) throw new Error(await response.clone().text())
    expect(executor.listCalls).not.toHaveBeenCalled()
  })
})
