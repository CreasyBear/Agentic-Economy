import { describe, expect, it, vi } from 'vitest'

import {
  operationListAction,
  operationListInputSchema,
  operationListResultSchema,
} from '@/modules/capability-execution/operation-history.actions'

const principal = {
  principalId: 'principal:one',
  ownerId: 'owner:one',
  credentialId: 'credential:one',
  applicationRef: 'application:one',
  environment: 'sandbox' as const,
  scopes: ['market_operations:invoke'],
  authorityMode: 'inspect_only' as const,
}

describe('operation invocation history action', () => {
  it('defaults to a bounded first page and delegates with the exact principal', async () => {
    const listInvocations = vi.fn().mockResolvedValue({ kind: 'available', items: [], hasMore: false })
    const input = operationListInputSchema.parse({})

    await expect(operationListAction.run({
      data: input,
      context: {
        agentAccessPrincipal: principal,
        correlationId: 'correlation:one',
        operationInvokeService: { listInvocations } as never,
      },
    })).resolves.toEqual({ kind: 'available', items: [], hasMore: false })

    expect(input).toEqual({ limit: 20 })
    expect(listInvocations).toHaveBeenCalledWith({ input, principal, correlationId: 'correlation:one' })
  })

  it('keeps list rows compact and rejects raw input or output material', () => {
    expect(operationListResultSchema.safeParse({
      kind: 'available',
      items: [{
        invocationRef: 'invocation:one',
        operationRef: 'operation:one',
        state: 'completed',
        createdAt: 1,
        updatedAt: 2,
        input: { secret: true },
      }],
      hasMore: false,
    }).success).toBe(false)
  })
})
