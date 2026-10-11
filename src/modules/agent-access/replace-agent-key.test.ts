import { describe, expect, it, vi } from 'vitest'

import { replaceAgentAccessKey, type ReplaceAgentKeyDeps } from './replace-agent-key'
import { MARKET_TOOLS_CALL_SCOPE, agentAuthorityScopeForMode } from './contract'
import { issuedAgentGrantRef } from './issued-agent-binding'
import type { AgentDetail } from './agent-operator-view-model'

const aud = (units: string) => ({ currency: 'AUD', units, exponent: 6 })
const detail = {
  agent: { principalRef: 'prn_a', displayName: 'Bot', applicationRef: 'app:one', environment: 'sandbox' },
  scopes: [MARKET_TOOLS_CALL_SCOPE, agentAuthorityScopeForMode('read_only')],
  grant: {
    lifecycle: 'active', toolAccess: 'all_admitted', toolRefs: [],
    budget: { maximumSpendPerCall: aud('1'), maximumDailySpend: aud('2'), maximumMonthlySpend: aud('3'), maximumConcurrentCalls: 1 },
    rate: { maximumCallsPerMinute: 30, maximumCallsPerHour: 300 },
  },
} as unknown as AgentDetail

function deps(over: Partial<ReplaceAgentKeyDeps> = {}) {
  const api = {
    list: vi.fn().mockResolvedValue({ data: [] }),
    create: vi.fn().mockResolvedValue({ id: 'key_new', secret: 'sk_new' }),
    getSecret: vi.fn(),
    revoke: vi.fn().mockResolvedValue(undefined),
  }
  const base = {
    userId: 'user_1', detail, idempotencyKey: 'replace-0123456789', api,
    prepare: vi.fn().mockResolvedValue({ kind: 'recorded', principalRef: 'prn_a', generation: 2, successorCredentialRef: 'cred:new', predecessorCredentialRef: 'cred:old', predecessorKeyId: 'key_old', successorGrantRef: 'grant:new' }),
    promote: vi.fn().mockResolvedValue({ kind: 'completed', providerCredentialId: 'key_old' }),
    cancel: vi.fn().mockResolvedValue({ kind: 'completed', providerCredentialId: 'key_old' }),
    completeLifecycle: vi.fn().mockResolvedValue({ kind: 'completed' }),
    correlationRef: 'corr',
    ...over,
  }
  return { ...base, api }
}

describe('replaceAgentAccessKey', () => {
  it('prepares, promotes, revokes the predecessor, and returns the new secret', async () => {
    const d = deps()
    const result = await replaceAgentAccessKey(d as unknown as ReplaceAgentKeyDeps)
    expect(result).toMatchObject({ kind: 'created', keyId: 'key_new', secret: 'sk_new' })
    expect(d.prepare).toHaveBeenCalledWith(expect.objectContaining({
      principalRef: 'prn_a', replacementMode: 'planned', credentialId: 'key_new',
      grantRef: issuedAgentGrantRef('user_1', 'replace-0123456789'),
    }))
    expect(d.promote).toHaveBeenCalledWith({ principalRef: 'prn_a', successorCredentialRef: 'cred:new', successorGrantRef: 'grant:new' })
    expect(d.completeLifecycle).toHaveBeenCalledWith(expect.objectContaining({
      providerTargets: [{ credentialRef: 'cred:old', providerCredentialId: 'key_old' }],
    }))
  })

  it('withholds the secret, cancels, and revokes the new key when promote fails', async () => {
    const d = deps({ promote: vi.fn().mockResolvedValue({ kind: 'conflict' }) })
    const result = await replaceAgentAccessKey(d as unknown as ReplaceAgentKeyDeps)
    expect(result).toEqual({ kind: 'error', code: 'issuance_unavailable', retryable: true })
    expect(d.cancel).toHaveBeenCalledOnce()
    expect(d.api.revoke).toHaveBeenCalledWith(expect.objectContaining({ apiKeyId: 'key_new' }))
    expect(d.completeLifecycle).not.toHaveBeenCalled()
  })

  it('never mints a key without an active grant readback', async () => {
    const d = deps({ detail: { ...detail, grant: undefined } as unknown as AgentDetail })
    expect(await replaceAgentAccessKey(d as unknown as ReplaceAgentKeyDeps)).toMatchObject({ kind: 'error', code: 'invalid_input' })
    expect(d.api.create).not.toHaveBeenCalled()
  })
})
