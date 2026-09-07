import { describe, expect, it, vi } from 'vitest'

import {
  callListAction,
  callListInputSchema,
  callListResultSchema,
} from '@/modules/capability-execution/call-history.actions'

const principal = {
  principalId: 'principal:one',
  ownerId: 'owner:one',
  credentialId: 'credential:one',
  applicationRef: 'application:one',
  environment: 'sandbox' as const,
  scopes: ['market_tools:call'],
  authorityMode: 'read_only' as const,
}

describe('Call history action', () => {
  it('defaults to a bounded first page and delegates with the exact principal', async () => {
    const listCalls = vi.fn().mockResolvedValue({ kind: 'available', items: [], hasMore: false })
    const input = callListInputSchema.parse({})

    await expect(callListAction.run({
      data: input,
      context: {
        agentAccessPrincipal: principal,
        correlationId: 'correlation:one',
        callService: { listCalls } as never,
      },
    })).resolves.toEqual({ kind: 'available', items: [], hasMore: false })

    expect(input).toEqual({ limit: 20 })
    expect(listCalls).toHaveBeenCalledWith({ input, principal, correlationId: 'correlation:one' })
  })

  it('keeps list rows compact and rejects raw input or output material', () => {
    expect(callListResultSchema.safeParse({
      kind: 'available',
      items: [{
        callRef: 'call:one',
        toolRef: 'tool:one',
        state: 'completed',
        createdAt: 1,
        updatedAt: 2,
        input: { secret: true },
      }],
      hasMore: false,
    }).success).toBe(false)
  })
})
