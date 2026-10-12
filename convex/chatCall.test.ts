import { describe, expect, it, vi } from 'vitest'

const core = vi.hoisted(() => vi.fn(async () => ({ kind: 'pending' as const, callRef: 'call_1' })))
vi.mock('./lib/capabilityExecution/callLifecycle/agentCallExecution', () => ({ canonicalAgentCallCore: core }))

import { call } from './chatCall'

const principal = { principalId: 'prn_1' }
const authority = { applicationRef: 'ae-owner-chat', turnRef: 't', credentialLocator: 'c', scopes: [] }

describe('chatCall.call authority policy', () => {
  it.each([undefined, false, true])('preserves an explicit approval requirement of %s', async (requireApproval) => {
    core.mockClear()
    const ctx = { runMutation: vi.fn(async () => principal), runQuery: vi.fn() }
    await (call as unknown as { _handler: (c: unknown, a: unknown) => Promise<unknown> })._handler(ctx, {
      authority, quoteRef: 'q', idempotencyKey: 'k', operationKey: 'o', correlationId: 'c',
      ...(requireApproval === undefined ? {} : { requireApproval }),
    })
    expect(core).toHaveBeenCalledTimes(1)
    expect(core).toHaveBeenCalledWith(ctx, expect.objectContaining({ principal }), authority, requireApproval === true)
  })
})
