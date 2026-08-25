import { describe, expect, it } from 'vitest'

import {
  createAgentAccessGrant,
  evaluateAgentAccessOperation,
  type AgentAccessGrant,
  type AgentAccessGrantInput,
} from '../../src/modules/agent-access/policy'
import { defaultSandboxAgentAccessPolicy } from '../../src/modules/agent-access/sandbox-policy'

function grantInput(overrides: Partial<AgentAccessGrantInput> = {}): AgentAccessGrantInput {
  return {
    grantRef: 'grant-1',
    principalId: 'principal-1',
    ownerId: 'owner-1',
    applicationRef: 'app-1',
    credentialId: 'credential-1',
    environment: 'sandbox',
    operationAccess: 'all_admitted',
    authorityMode: 'approve_each',
    policy: defaultSandboxAgentAccessPolicy({ currency: 'USD', exponent: 2 }),
    lifecycle: 'active',
    generation: 1,
    createdAt: 1,
    updatedAt: 1,
    expiresAt: 10_000,
    ...overrides,
  }
}

function grant(overrides: Partial<AgentAccessGrantInput> = {}): AgentAccessGrant {
  const result = createAgentAccessGrant(grantInput(overrides))
  if (result.kind === 'refused') throw new Error(result.code)
  return result.grant
}

describe('agent access grant policy', () => {
  it('rejects a grant whose policy environment differs from the grant', () => {
    const result = createAgentAccessGrant(grantInput({
      environment: 'production',
      policy: defaultSandboxAgentAccessPolicy({ currency: 'USD', exponent: 2 }),
    }))
    expect(result).toEqual({ kind: 'refused', code: 'grant_environment_mismatch' })
  })

  it('accepts the current generation and rejects stale generation or digest', () => {
    const current = grant()
    const accepted = evaluateAgentAccessOperation({
      grant: current,
      principal: { principalId: 'principal-1', applicationRef: 'app-1', environment: 'sandbox', grantGeneration: 1, policyDigest: current.policyDigest },
      operation: { operationRef: 'operation-1' },
      now: 100,
    })
    expect(accepted).toEqual({ kind: 'accepted', grantRef: 'grant-1', generation: 1 })
    expect(evaluateAgentAccessOperation({
      grant: current,
      principal: { principalId: 'principal-1', applicationRef: 'app-1', environment: 'sandbox', grantGeneration: 2, policyDigest: current.policyDigest },
      operation: { operationRef: 'operation-1' },
      now: 100,
    })).toEqual({ kind: 'refused', code: 'grant_generation_stale' })
  })

  it('fails closed for revoked, expired, and environment-mismatched grants', () => {
    expect(evaluateAgentAccessOperation({
      grant: grant({ lifecycle: 'revoked' }),
      principal: { principalId: 'principal-1', applicationRef: 'app-1', environment: 'sandbox' },
      operation: { operationRef: 'operation-1' },
      now: 100,
    })).toEqual({ kind: 'refused', code: 'grant_not_active' })
    expect(evaluateAgentAccessOperation({
      grant: grant({ expiresAt: 100 }),
      principal: { principalId: 'principal-1', applicationRef: 'app-1', environment: 'sandbox' },
      operation: { operationRef: 'operation-1' },
      now: 100,
    })).toEqual({ kind: 'refused', code: 'grant_expired' })
    expect(evaluateAgentAccessOperation({
      grant: grant(),
      principal: { principalId: 'principal-1', applicationRef: 'app-1', environment: 'production' },
      operation: { operationRef: 'operation-1' },
      now: 100,
    })).toEqual({ kind: 'refused', code: 'grant_environment_mismatch' })
  })
})
