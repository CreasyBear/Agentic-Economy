import { describe, expect, it, vi } from 'vitest'

import type { AgentAccessPrincipalResolver } from '@/lib/server/agent-access-auth'
import { createOperationInvokeService, handleOperationInvokeListGet } from '@/lib/server/operation-invoke-api'
import { createPublicSourceTransport, setPublicSourceTransportForTests } from '@/lib/server/convex-source'
import type { OperationInvokeService } from '@/modules/capability-execution/operation-invoke'
import { installTestSourceWriteSecret } from '../../helpers/source-write-admission'
import { convexUrl } from './server-seams-harness'

const principal = {
  principalId: 'prn_00000000000040008000000000000043',
  ownerId: 'acc_00000000000040008000000000000043',
  credentialId: 'credential:one',
  applicationRef: 'application:one',
  environment: 'sandbox' as const,
  scopes: ['market_operations:invoke'],
  authorityMode: 'inspect_only' as const,
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

function service() {
  return {
    invokeOperation: vi.fn(),
    listInvocations: vi.fn().mockResolvedValue({
      kind: 'available',
      items: [{
        invocationRef: 'invocation:one',
        operationRef: 'operation:one',
        state: 'completed',
        resultKind: 'completed',
        receiptRef: 'receipt:one',
        createdAt: 10,
        updatedAt: 20,
      }],
      hasMore: true,
      nextCursor: 'cursor:two',
    }),
    readInvocationStatus: vi.fn(),
    cancelInvocation: vi.fn(),
    reconcileInvocation: vi.fn(),
  } satisfies OperationInvokeService
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
      const executor = createOperationInvokeService(new Request('https://ae.example/api/v1/operations'), '')
      const result = await executor.listInvocations?.({
        input: { limit: 5, cursor: 'cursor:one', state: 'completed' },
        principal,
        correlationId: 'correlation:history',
      })

      expect(result).toEqual({ kind: 'available', items: [], hasMore: true, nextCursor: 'cursor:two' })
      expect(payload?.path).toBe('capabilityOperationInvocations:listInvocations')
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
    const response = await handleOperationInvokeListGet(
      new Request('https://ae.example/api/v1/operations?limit=5&cursor=cursor%3Aone&state=completed'),
      { authenticate, resolvePrincipal, operationInvokeService: executor },
    )

    if (response.status !== 200) throw new Error(await response.clone().text())
    await expect(response.json()).resolves.toMatchObject({
      kind: 'available',
      items: [{ invocationRef: 'invocation:one', receiptRef: 'receipt:one' }],
      nextCursor: 'cursor:two',
    })
    expect(executor.listInvocations).toHaveBeenCalledWith(expect.objectContaining({
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
    const response = await handleOperationInvokeListGet(
      new Request('https://ae.example/api/v1/operations?limit=500&state=made_up'),
      { authenticate, resolvePrincipal, operationInvokeService: executor },
    )

    if (response.status !== 400) throw new Error(await response.clone().text())
    expect(executor.listInvocations).not.toHaveBeenCalled()
  })
})
