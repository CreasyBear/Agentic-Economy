import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MutationCtx } from '../../../convex/_generated/server'
import { createAgentAccessGrant } from '@/modules/agent-access/policy'
import { defaultSandboxAgentAccessPolicy } from '@/modules/agent-access/sandbox-policy'

import { registerIssuedAgentBindingForServerHandler } from '../../../convex/lib/agentAccess/principals/bindings'
import {
  prepareCredentialReplacementCore,
  prepareCredentialReplacementForServerHandler,
} from '../../../convex/lib/agentAccess/principals/replacement'
import { transitionCredentialReplacementCore } from '../../../convex/lib/agentAccess/principals/replacementTransition'
import {
  resolveAgentBindingHandler,
  resolveCanonicalAgentBinding,
} from '../../../convex/lib/authority/boundary/binding'

afterEach(() => vi.unstubAllEnvs())

describe('agent credential deployment boundary', () => {
  it.each([undefined, 'preview', 'production'])(
    'refuses sandbox binding and replacement before any context effects under %j', async (declaration) => {
      vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', declaration)
      const ctx = new Proxy({}, { get: () => { throw new Error('context_effect_before_environment_refusal') } }) as MutationCtx
      const binding = { environment: 'sandbox' } as Parameters<typeof registerIssuedAgentBindingForServerHandler>[1]
      const replacement = { environment: 'sandbox' } as Parameters<typeof prepareCredentialReplacementForServerHandler>[1]

      await expect(registerIssuedAgentBindingForServerHandler(ctx, binding)).resolves.toEqual({ kind: 'conflict' })
      await expect(prepareCredentialReplacementForServerHandler(ctx, replacement)).resolves.toEqual({ kind: 'conflict' })
      await expect(prepareCredentialReplacementCore(ctx, replacement, {} as never, Date.now()))
        .resolves.toEqual({ kind: 'conflict' })
    },
  )

  it.each([undefined, 'preview', 'production'])(
    'refuses sandbox source and direct binding resolution before nonce or DB access under %j', async (declaration) => {
      vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', declaration)
      const ctx = new Proxy({}, { get: () => { throw new Error('context_effect_before_environment_refusal') } }) as MutationCtx
      const input = { environment: 'sandbox' } as Parameters<typeof resolveAgentBindingHandler>[1]
      await expect(resolveAgentBindingHandler(ctx, input)).resolves.toBeNull()
      await expect(resolveCanonicalAgentBinding(ctx, input)).resolves.toBeNull()
    },
  )

  it('continues canonical resolution for a matching declaration', async () => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development')
    const query = vi.fn(() => ({ withIndex: () => ({ unique: async () => null }) }))
    const ctx = { db: { query } } as unknown as MutationCtx
    const input = {
      environment: 'sandbox',
      credentialId: 'credential-one',
      applicationRef: 'agentic-economy',
      authorityMode: 'read_only',
      scopes: ['market_tools:call'],
      requiredScopes: ['market_tools:call'],
      operationKey: 'market_tools:call',
      correlationId: 'correlation-one',
    } as Parameters<typeof resolveCanonicalAgentBinding>[1]
    await expect(resolveCanonicalAgentBinding(ctx, input)).resolves.toBeNull()
    expect(query).toHaveBeenCalledWith('externalIdentityBindings')
  })

  it('blocks new promotion across environments while preserving cancellation replay', async () => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', undefined)
    const now = Date.now()
    const policy = defaultSandboxAgentAccessPolicy({ currency: 'USD', exponent: 2 })
    const decision = createAgentAccessGrant({
      grantRef: 'grant-successor', principalId: 'principal-one', ownerId: 'account-one',
      applicationRef: 'agentic-economy', credentialId: 'key-successor', environment: 'sandbox',
      toolAccess: policy.toolAccess, toolRefs: policy.toolRefs, authorityMode: 'read_only',
      spendingPolicy: policy, lifecycle: 'active', generation: 2,
      createdAt: now - 1_000, updatedAt: now - 1_000, expiresAt: now + 60_000,
    })
    expect(decision.kind).toBe('accepted')
    if (decision.kind !== 'accepted') return
    const successor = {
      principalRef: 'principal-one', predecessorCredentialRef: 'credential-old',
      bindingRef: 'binding-successor', credentialRef: 'credential-successor',
      lifecycle: 'active', expiresAt: now + 60_000,
    }
    const current = { ownerId: 'account-one', credentialId: 'key-old', environment: 'sandbox' }
    const values: Record<string, unknown> = {
      credentials: successor,
      agentAccessGrants: decision.grant,
      agentAccessPrincipals: current,
      externalIdentityBindings: { providerIdentifier: 'key-successor', lifecycle: 'active' },
    }
    const query = vi.fn((table: string) => ({ withIndex: () => ({ unique: async () => values[table] }) }))
    const patch = vi.fn()
    const ctx = { db: { query, patch } } as unknown as MutationCtx
    const input = {
      principalRef: 'principal-one', successorCredentialRef: 'credential-successor',
      successorGrantRef: 'grant-successor',
    }
    const owner = { accountRef: 'account-one' } as Parameters<typeof transitionCredentialReplacementCore>[2]

    await expect(transitionCredentialReplacementCore(ctx, input, owner, 'promote', now))
      .resolves.toEqual({ kind: 'conflict' })
    expect(patch).not.toHaveBeenCalled()

    values.credentials = { ...successor, lifecycle: 'revoked' }
    await expect(transitionCredentialReplacementCore(ctx, input, owner, 'cancel', now))
      .resolves.toEqual({ kind: 'replayed', providerCredentialId: 'key-successor' })
    expect(patch).not.toHaveBeenCalled()
  })
})
