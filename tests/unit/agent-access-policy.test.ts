import { describe, expect, it } from 'vitest'

import { canonicalDigest } from '../../src/modules/common/canonical-digest'
import {
  AGENT_ACCESS_GRANT_FORMAT,
  AGENT_ACCESS_POLICY_FORMAT,
  LEGACY_AGENT_ACCESS_GRANT_FORMAT,
  LEGACY_AGENT_ACCESS_POLICY_FORMAT,
  agentAccessGrantAllowsOperation,
  createAgentAccessGrant,
  evaluateAgentAccessOperation,
  normalizeStoredAgentAccessGrant,
  type AgentAccessGrant,
  type AgentAccessGrantInput,
  type LegacyAgentAccessPolicy,
  type StoredAgentAccessGrant,
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

const operationRef = (value: string) => `operation:v1:${value.repeat(64)}`

function selectedGrantInput(operationRefs: readonly string[]): AgentAccessGrantInput {
  const base = defaultSandboxAgentAccessPolicy({ currency: 'USD', exponent: 2 })
  return grantInput({
    operationAccess: 'selected_operations',
    operationRefs,
    policy: {
      ...base,
      operationAccess: 'selected_operations',
      operationRefs: [...operationRefs],
    },
  })
}

function legacyStoredGrant(): StoredAgentAccessGrant {
  const current = grant()
  const {
    format: _policyFormat,
    operationAccess: _policyOperationAccess,
    operationRefs: _policyOperationRefs,
    ...policyMaterial
  } = current.policy
  const legacyPolicy = {
    ...policyMaterial,
    format: LEGACY_AGENT_ACCESS_POLICY_FORMAT,
    operationAccess: 'all_admitted',
  } satisfies LegacyAgentAccessPolicy
  const {
    format: _grantFormat,
    operationAccess: _grantOperationAccess,
    operationRefs: _grantOperationRefs,
    policy: _policy,
    policyDigest: _policyDigest,
    ...grantMaterial
  } = current
  return {
    ...grantMaterial,
    format: LEGACY_AGENT_ACCESS_GRANT_FORMAT,
    operationAccess: 'all_admitted',
    policy: legacyPolicy,
    policyDigest: canonicalDigest(legacyPolicy as never),
  }
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
      operation: { operationRef: operationRef('a') },
      now: 100,
    })
    expect(accepted).toEqual({ kind: 'accepted', grantRef: 'grant-1', generation: 1 })
    expect(evaluateAgentAccessOperation({
      grant: current,
      principal: { principalId: 'principal-1', applicationRef: 'app-1', environment: 'sandbox', grantGeneration: 2, policyDigest: current.policyDigest },
      operation: { operationRef: operationRef('a') },
      now: 100,
    })).toEqual({ kind: 'refused', code: 'grant_generation_stale' })
  })

  it('fails closed for revoked, expired, and environment-mismatched grants', () => {
    expect(evaluateAgentAccessOperation({
      grant: grant({ lifecycle: 'revoked' }),
      principal: { principalId: 'principal-1', applicationRef: 'app-1', environment: 'sandbox' },
      operation: { operationRef: operationRef('a') },
      now: 100,
    })).toEqual({ kind: 'refused', code: 'grant_not_active' })
    expect(evaluateAgentAccessOperation({
      grant: grant({ expiresAt: 100 }),
      principal: { principalId: 'principal-1', applicationRef: 'app-1', environment: 'sandbox' },
      operation: { operationRef: operationRef('a') },
      now: 100,
    })).toEqual({ kind: 'refused', code: 'grant_expired' })
    expect(evaluateAgentAccessOperation({
      grant: grant(),
      principal: { principalId: 'principal-1', applicationRef: 'app-1', environment: 'production' },
      operation: { operationRef: operationRef('a') },
      now: 100,
    })).toEqual({ kind: 'refused', code: 'grant_environment_mismatch' })
  })

  it('normalizes genuine legacy v1 grants without relabeling their format or digest', () => {
    const legacy = legacyStoredGrant()
    const normalized = normalizeStoredAgentAccessGrant(legacy)

    expect(normalized).toMatchObject({
      format: LEGACY_AGENT_ACCESS_GRANT_FORMAT,
      operationAccess: 'all_admitted',
      operationRefs: [],
      policy: { format: LEGACY_AGENT_ACCESS_POLICY_FORMAT, operationAccess: 'all_admitted' },
    })
    expect('operationRefs' in normalized.policy).toBe(false)
    expect(normalized.policyDigest).toBe(legacy.policyDigest)
    expect(canonicalDigest(normalized.policy as never)).toBe(normalized.policyDigest)
    expect(() => normalizeStoredAgentAccessGrant({ ...legacy, policyDigest: 'sha256:wrong' })).toThrow('stored_agent_access_grant_invalid')
  })

  it('emits deterministic v2 selections and exposes the allowlist decision for later admission callers', () => {
    const allowed = operationRef('a')
    const second = operationRef('b')
    const result = createAgentAccessGrant(selectedGrantInput([second, allowed]))
    expect(result.kind).toBe('accepted')
    if (result.kind !== 'accepted') return
    expect(result.grant).toMatchObject({
      format: AGENT_ACCESS_GRANT_FORMAT,
      operationAccess: 'selected_operations',
      operationRefs: [allowed, second],
      policy: { format: AGENT_ACCESS_POLICY_FORMAT, operationRefs: [allowed, second] },
    })
    expect(agentAccessGrantAllowsOperation(result.grant, allowed)).toBe(true)
    expect(agentAccessGrantAllowsOperation(result.grant, operationRef('c'))).toBe(false)

    const reordered = createAgentAccessGrant(selectedGrantInput([allowed, second]))
    expect(reordered.kind).toBe('accepted')
    if (reordered.kind !== 'accepted') return
    expect(reordered.grant.operationRefs).toEqual(result.grant.operationRefs)
    expect(reordered.grant.policyDigest).toBe(result.grant.policyDigest)
  })

  it('rejects empty, duplicate, oversized, noncanonical, and all-admitted reference lists', () => {
    const canonical = operationRef('a')
    const cases = [
      selectedGrantInput([]),
      selectedGrantInput([canonical, canonical]),
      selectedGrantInput(Array.from({ length: 65 }, (_, index) => `operation:v1:${index.toString(16).padStart(64, '0')}`)),
      selectedGrantInput(['operation-1']),
      grantInput({ operationRefs: [canonical] }),
    ]
    for (const input of cases) {
      expect(createAgentAccessGrant(input)).toEqual({ kind: 'refused', code: 'grant_material_invalid' })
    }
  })

  it('rejects stored v1/v2 hybrids and mismatched top-level selections', () => {
    const legacy = legacyStoredGrant()
    const current = grant()
    const allowed = operationRef('a')
    const second = operationRef('b')
    const selected = createAgentAccessGrant(selectedGrantInput([allowed]))
    if (selected.kind !== 'accepted') throw new Error(selected.code)
    const { operationRefs: _topLevelRefs, ...v2WithoutTopLevelRefs } = current
    const { operationRefs: _policyRefs, ...v2PolicyWithoutRefs } = current.policy

    const invalidRows = [
      { ...legacy, operationRefs: [] },
      { ...legacy, policy: { ...legacy.policy, operationRefs: [] } },
      v2WithoutTopLevelRefs,
      { ...current, policy: v2PolicyWithoutRefs },
      {
        ...selected.grant,
        operationRefs: [allowed],
        policy: { ...selected.grant.policy, operationRefs: [second] },
      },
    ]
    for (const row of invalidRows) {
      expect(() => normalizeStoredAgentAccessGrant(row)).toThrow('stored_agent_access_grant_invalid')
    }
  })
})
