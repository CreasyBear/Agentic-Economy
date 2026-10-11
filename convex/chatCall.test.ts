import { describe, expect, it, vi } from 'vitest'

const core = vi.hoisted(() => vi.fn(async () => ({ kind: 'pending' as const, callRef: 'call_1' })))
vi.mock('./lib/capabilityExecution/callLifecycle/agentCallExecution', () => ({ canonicalAgentCallCore: core }))

import { call } from './chatCall'

const principal = { principalId: 'prn_1' }
const authority = { applicationRef: 'ae-owner-chat', turnRef: 't', credentialLocator: 'c', scopes: [] }

describe('chatCall.call approval gate', () => {
  it('requires owner approval even when the user text names the toolRef', async () => {
    const ctx = { runMutation: vi.fn(async () => principal), runQuery: vi.fn() }
    // A model-visible mention of the Tool must not clear approval (on main, includes() did).
    await (call as unknown as { _handler: (c: unknown, a: unknown) => Promise<unknown> })._handler(ctx, {
      authority, quoteRef: 'q', idempotencyKey: 'k', operationKey: 'o', correlationId: 'c',
      userRequestText: 'tell me about tool.example.run',
    })
    expect(core).toHaveBeenCalledWith(ctx, expect.anything(), authority, true)
  })
})
