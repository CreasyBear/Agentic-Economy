import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { canonicalDigest } from '../../src/modules/common/canonical-digest'
import {
  AGENT_ACCESS_GRANT_FORMAT,
  AGENT_ACCESS_POLICY_FORMAT,
  LEGACY_AGENT_ACCESS_GRANT_FORMAT,
  LEGACY_AGENT_ACCESS_POLICY_FORMAT,
  agentAccessGrantAllowsTool,
  agentAccessPolicyDigest,
  createAgentAccessGrant,
  evaluateAgentAccessTool,
  legacyAgentAccessGrantSchema,
  normalizeStoredAgentAccessGrant,
  normalizeStoredAgentAccessGrantForTool,
  storedAgentAccessGrantSchema,
  type AgentAccessGrant,
  type AgentAccessGrantInput,
} from '../../src/modules/agent-access/policy'
import { defaultSandboxAgentAccessPolicy } from '../../src/modules/agent-access/sandbox-policy'
import { stableStringify } from '../../src/modules/common/stable-hash'

type ProtectedLegacyStoredGrant = z.infer<typeof legacyAgentAccessGrantSchema>
type ProtectedV2StoredGrant = Extract<
  z.infer<typeof storedAgentAccessGrantSchema>,
  { format: typeof AGENT_ACCESS_GRANT_FORMAT; policyDigest: string }
>

function grantInput(overrides: Partial<AgentAccessGrantInput> = {}): AgentAccessGrantInput {
  return {
    grantRef: 'grant-1',
    principalId: 'principal-1',
    ownerId: 'owner-1',
    applicationRef: 'app-1',
    credentialId: 'credential-1',
    environment: 'sandbox',
    toolAccess: 'all_admitted',
    authorityMode: 'approval_required',
    spendingPolicy: defaultSandboxAgentAccessPolicy({ currency: 'USD', exponent: 2 }),
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

const toolRef = (value: string) => `operation:v1:${value.repeat(64)}`

function selectedGrantInput(toolRefs: readonly string[]): AgentAccessGrantInput {
  const base = defaultSandboxAgentAccessPolicy({ currency: 'USD', exponent: 2 })
  return grantInput({
    toolAccess: 'selected_tools',
    toolRefs,
    spendingPolicy: {
      ...base,
      toolAccess: 'selected_tools',
      toolRefs: [...toolRefs],
    },
  })
}

function protectedPolicyMaterial(policy: AgentAccessGrant['spendingPolicy']): ProtectedV2StoredGrant['policy'] {
  return {
    budget: {
      budgetPolicyRef: policy.budget.budgetPolicyRef,
      currency: policy.budget.currency,
      exponent: policy.budget.exponent,
      generation: policy.budget.generation,
      maximumConcurrentInvocations: policy.budget.maximumConcurrentCalls,
      maximumDailySpend: policy.budget.maximumDailySpend,
      maximumSpendPerInvocation: policy.budget.maximumSpendPerCall,
      maximumMonthlySpend: policy.budget.maximumMonthlySpend,
    },
    environment: policy.environment,
    format: AGENT_ACCESS_POLICY_FORMAT,
    operationAccess: policy.toolAccess === 'selected_tools' ? 'selected_operations' : 'all_admitted',
    operationRefs: policy.toolAccess === 'selected_tools' ? [...policy.toolRefs] : [],
    rate: policy.rate,
  }
}

function legacyPolicyMaterial(policy: AgentAccessGrant['spendingPolicy']): ProtectedLegacyStoredGrant['policy'] {
  const { operationRefs: _operationRefs, ...legacyMaterial } = protectedPolicyMaterial(policy)
  return {
    ...legacyMaterial,
    operationAccess: 'all_admitted',
    format: LEGACY_AGENT_ACCESS_POLICY_FORMAT,
  }
}

function protectedV2StoredGrant(
  authorityMode: 'inspect_only' | 'approve_each' | 'bounded_mandate' | 'full_yolo' = 'approve_each',
  source: AgentAccessGrant = grant(),
): ProtectedV2StoredGrant {
  const policy = protectedPolicyMaterial(source.spendingPolicy)
  return {
    format: AGENT_ACCESS_GRANT_FORMAT,
    grantRef: source.grantRef,
    principalId: source.principalId,
    ownerId: source.ownerId,
    applicationRef: source.applicationRef,
    credentialId: source.credentialId,
    environment: source.environment,
    authorityMode,
    operationAccess: source.toolAccess === 'selected_tools' ? 'selected_operations' : 'all_admitted',
    operationRefs: [...source.toolRefs],
    policy,
    budgetPolicyRef: source.budgetPolicyRef,
    ratePolicyRef: source.ratePolicyRef,
    lifecycle: source.lifecycle,
    generation: source.generation,
    policyDigest: canonicalDigest(policy),
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
    expiresAt: source.expiresAt,
  }
}

function legacyStoredGrant(): ProtectedLegacyStoredGrant {
  const current = grant()
  const policy = legacyPolicyMaterial(current.spendingPolicy)
  return {
    format: LEGACY_AGENT_ACCESS_GRANT_FORMAT,
    grantRef: current.grantRef,
    principalId: current.principalId,
    ownerId: current.ownerId,
    applicationRef: current.applicationRef,
    credentialId: current.credentialId,
    environment: current.environment,
    authorityMode: 'approve_each',
    operationAccess: 'all_admitted',
    policy,
    budgetPolicyRef: current.budgetPolicyRef,
    ratePolicyRef: current.ratePolicyRef,
    lifecycle: current.lifecycle,
    generation: current.generation,
    policyDigest: canonicalDigest(policy),
    createdAt: current.createdAt,
    updatedAt: current.updatedAt,
    expiresAt: current.expiresAt,
  }
}

describe('agent access grant policy', () => {
  it('rejects a grant whose policy environment differs from the grant', () => {
    const result = createAgentAccessGrant(grantInput({
      environment: 'production',
      spendingPolicy: defaultSandboxAgentAccessPolicy({ currency: 'USD', exponent: 2 }),
    }))
    expect(result).toEqual({ kind: 'refused', code: 'grant_environment_mismatch' })
  })

  it('accepts the current generation and rejects stale generation or digest', () => {
    const current = grant()
    const accepted = evaluateAgentAccessTool({
      grant: current,
      principal: { principalId: 'principal-1', applicationRef: 'app-1', environment: 'sandbox', grantGeneration: 1, spendingPolicyDigest: current.spendingPolicyDigest },
      tool: { toolRef: toolRef('a') },
      now: 100,
    })
    expect(accepted).toEqual({ kind: 'accepted', grantRef: 'grant-1', generation: 1 })
    expect(evaluateAgentAccessTool({
      grant: current,
      principal: { principalId: 'principal-1', applicationRef: 'app-1', environment: 'sandbox', grantGeneration: 2, spendingPolicyDigest: current.spendingPolicyDigest },
      tool: { toolRef: toolRef('a') },
      now: 100,
    })).toEqual({ kind: 'refused', code: 'grant_generation_stale' })
  })

  it('fails closed for revoked, expired, and environment-mismatched grants', () => {
    expect(evaluateAgentAccessTool({
      grant: grant({ lifecycle: 'revoked' }),
      principal: { principalId: 'principal-1', applicationRef: 'app-1', environment: 'sandbox' },
      tool: { toolRef: toolRef('a') },
      now: 100,
    })).toEqual({ kind: 'refused', code: 'grant_not_active' })
    expect(evaluateAgentAccessTool({
      grant: grant({ expiresAt: 100 }),
      principal: { principalId: 'principal-1', applicationRef: 'app-1', environment: 'sandbox' },
      tool: { toolRef: toolRef('a') },
      now: 100,
    })).toEqual({ kind: 'refused', code: 'grant_expired' })
    expect(evaluateAgentAccessTool({
      grant: grant(),
      principal: { principalId: 'principal-1', applicationRef: 'app-1', environment: 'production' },
      tool: { toolRef: toolRef('a') },
      now: 100,
    })).toEqual({ kind: 'refused', code: 'grant_environment_mismatch' })
  })

  it('normalizes genuine legacy v1 grants without relabeling their format or digest', () => {
    const legacy = legacyStoredGrant()
    const normalized = normalizeStoredAgentAccessGrant(legacy)

    expect(normalized).toMatchObject({
      format: LEGACY_AGENT_ACCESS_GRANT_FORMAT,
      authorityMode: 'approval_required',
      toolAccess: 'all_admitted',
      toolRefs: [],
      spendingPolicy: { format: LEGACY_AGENT_ACCESS_POLICY_FORMAT, operationAccess: 'all_admitted' },
    })
    expect('operationRefs' in normalized.spendingPolicy).toBe(false)
    expect(normalized.spendingPolicyDigest).toBe(legacy.policyDigest)
    expect(canonicalDigest(normalized.spendingPolicy)).toBe(normalized.spendingPolicyDigest)
    expect(() => normalizeStoredAgentAccessGrant({ ...legacy, policyDigest: 'sha256:wrong' })).toThrow('stored_agent_access_grant_invalid')
  })

  it('maps protected v2 grant material to target fields without changing its digest', () => {
    const protectedGrant = protectedV2StoredGrant()
    const normalized = normalizeStoredAgentAccessGrant(protectedGrant)

    expect(normalized).toMatchObject({
      format: AGENT_ACCESS_GRANT_FORMAT,
      authorityMode: 'approval_required',
      toolAccess: 'all_admitted',
      toolRefs: [],
      spendingPolicy: { format: AGENT_ACCESS_POLICY_FORMAT, toolAccess: 'all_admitted', toolRefs: [] },
    })
    expect(normalized.spendingPolicyDigest).toBe(protectedGrant.policyDigest)
    expect(agentAccessPolicyDigest(normalized.spendingPolicy)).toBe(normalized.spendingPolicyDigest)
  })

  it('normalizes a selected protected v2 wrapper for tool admission with its fixed digest', () => {
    const allowed = toolRef('a')
    const second = toolRef('b')
    const selected = createAgentAccessGrant(selectedGrantInput([second, allowed]))
    if (selected.kind !== 'accepted') throw new Error(selected.code)

    const protectedGrant = protectedV2StoredGrant('approve_each', selected.grant)
    const normalized = normalizeStoredAgentAccessGrant(protectedGrant)

    expect(protectedGrant.policyDigest).toBe('sha256:d8ff1d4528347f881fab31c2236434a5e6982e96be90873166f505ba3648b1ea')
    expect(normalized).toMatchObject({
      format: AGENT_ACCESS_GRANT_FORMAT,
      authorityMode: 'approval_required',
      toolAccess: 'selected_tools',
      toolRefs: [allowed, second],
      spendingPolicy: {
        format: AGENT_ACCESS_POLICY_FORMAT,
        toolAccess: 'selected_tools',
        toolRefs: [allowed, second],
      },
      spendingPolicyDigest: protectedGrant.policyDigest,
    })
    expect(agentAccessGrantAllowsTool(normalized, allowed)).toBe(true)
    expect(agentAccessGrantAllowsTool(normalized, toolRef('c'))).toBe(false)
    expect(normalizeStoredAgentAccessGrantForTool(protectedGrant, allowed)).toEqual(normalized)
    expect(normalizeStoredAgentAccessGrantForTool(protectedGrant, toolRef('c'))).toBeUndefined()
  })

  it('maps each protected authority mode to its target mode', () => {
    const modes = [
      ['inspect_only', 'read_only'],
      ['approve_each', 'approval_required'],
      ['bounded_mandate', 'spending_policy'],
      ['full_yolo', 'unrestricted_test_only'],
    ] as const
    for (const [protectedMode, targetMode] of modes) {
      expect(normalizeStoredAgentAccessGrant(protectedV2StoredGrant(protectedMode)).authorityMode).toBe(targetMode)
    }
  })

  it('retains the protected policy and grant digest vectors across target and legacy codecs', () => {
    const allAdmitted = defaultSandboxAgentAccessPolicy({ currency: 'USD', exponent: 2 })
    const selected = createAgentAccessGrant(selectedGrantInput([toolRef('b'), toolRef('a')]))
    if (selected.kind !== 'accepted') throw new Error(selected.code)
    const selectedProtected = protectedPolicyMaterial(selected.grant.spendingPolicy)
    const legacy = legacyStoredGrant()

    expect(stableStringify(protectedPolicyMaterial(allAdmitted))).toBe(
      '{"budget":{"budgetPolicyRef":"budget:sandbox:USD:2","currency":"USD","exponent":2,"generation":1,"maximumConcurrentInvocations":1,"maximumDailySpend":{"currency":"USD","exponent":2,"units":"500"},"maximumMonthlySpend":{"currency":"USD","exponent":2,"units":"2000"},"maximumSpendPerInvocation":{"currency":"USD","exponent":2,"units":"100"}},"environment":"sandbox","format":"ae.agent-access-policy:v2","operationAccess":"all_admitted","operationRefs":[],"rate":{"generation":1,"maximumCallsPerHour":300,"maximumCallsPerMinute":30,"ratePolicyRef":"rate:sandbox:operations-invoke"}}',
    )
    expect(agentAccessPolicyDigest(allAdmitted)).toBe('sha256:0428ecf16ad51cbb94667b7dbe04061f52c54c0010c5ea5c0d76f07726bf034b')
    expect(stableStringify(selectedProtected)).toBe(
      '{"budget":{"budgetPolicyRef":"budget:sandbox:USD:2","currency":"USD","exponent":2,"generation":1,"maximumConcurrentInvocations":1,"maximumDailySpend":{"currency":"USD","exponent":2,"units":"500"},"maximumMonthlySpend":{"currency":"USD","exponent":2,"units":"2000"},"maximumSpendPerInvocation":{"currency":"USD","exponent":2,"units":"100"}},"environment":"sandbox","format":"ae.agent-access-policy:v2","operationAccess":"selected_operations","operationRefs":["operation:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","operation:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],"rate":{"generation":1,"maximumCallsPerHour":300,"maximumCallsPerMinute":30,"ratePolicyRef":"rate:sandbox:operations-invoke"}}',
    )
    expect(agentAccessPolicyDigest(selected.grant.spendingPolicy)).toBe('sha256:d8ff1d4528347f881fab31c2236434a5e6982e96be90873166f505ba3648b1ea')
    expect(stableStringify(legacy.policy)).toBe(
      '{"budget":{"budgetPolicyRef":"budget:sandbox:USD:2","currency":"USD","exponent":2,"generation":1,"maximumConcurrentInvocations":1,"maximumDailySpend":{"currency":"USD","exponent":2,"units":"500"},"maximumMonthlySpend":{"currency":"USD","exponent":2,"units":"2000"},"maximumSpendPerInvocation":{"currency":"USD","exponent":2,"units":"100"}},"environment":"sandbox","format":"ae.agent-access-policy:v1","operationAccess":"all_admitted","rate":{"generation":1,"maximumCallsPerHour":300,"maximumCallsPerMinute":30,"ratePolicyRef":"rate:sandbox:operations-invoke"}}',
    )
    expect(legacy.policyDigest).toBe('sha256:b1b2858d7900f8d798f1fd8bac36c55fe037774a0a5c0da71dce4ddb567dc263')
    expect(canonicalDigest(protectedV2StoredGrant())).toBe('sha256:feddb9427d766daece86a04c08465aa3205c671961163b0e0b8cc5588b548803')
    expect(canonicalDigest(legacy)).toBe('sha256:f4615e86325f6e4c6ecb42b17155add7f4b8498f4840c5e2935e80e78d47779b')
  })

  it('emits deterministic v2 selections and exposes the allowlist decision for later admission callers', () => {
    const allowed = toolRef('a')
    const second = toolRef('b')
    const result = createAgentAccessGrant(selectedGrantInput([second, allowed]))
    expect(result.kind).toBe('accepted')
    if (result.kind !== 'accepted') return
    expect(result.grant).toMatchObject({
      format: AGENT_ACCESS_GRANT_FORMAT,
      toolAccess: 'selected_tools',
      toolRefs: [allowed, second],
      spendingPolicy: { format: AGENT_ACCESS_POLICY_FORMAT, toolRefs: [allowed, second] },
    })
    expect(agentAccessGrantAllowsTool(result.grant, allowed)).toBe(true)
    expect(agentAccessGrantAllowsTool(result.grant, toolRef('c'))).toBe(false)

    const reordered = createAgentAccessGrant(selectedGrantInput([allowed, second]))
    expect(reordered.kind).toBe('accepted')
    if (reordered.kind !== 'accepted') return
    expect(reordered.grant.toolRefs).toEqual(result.grant.toolRefs)
    expect(reordered.grant.spendingPolicyDigest).toBe(result.grant.spendingPolicyDigest)
  })

  it('rejects empty, duplicate, oversized, noncanonical, and all-admitted reference lists', () => {
    const canonical = toolRef('a')
    const cases = [
      selectedGrantInput([]),
      selectedGrantInput([canonical, canonical]),
      selectedGrantInput(Array.from({ length: 65 }, (_, index) => `operation:v1:${index.toString(16).padStart(64, '0')}`)),
      selectedGrantInput(['operation-1']),
      grantInput({ toolRefs: [canonical] }),
    ]
    for (const input of cases) {
      expect(createAgentAccessGrant(input)).toEqual({ kind: 'refused', code: 'grant_material_invalid' })
    }
  })

  it('rejects stored v1/v2 hybrids and mismatched top-level selections', () => {
    const legacy = legacyStoredGrant()
    const current = grant()
    const allowed = toolRef('a')
    const second = toolRef('b')
    const selected = createAgentAccessGrant(selectedGrantInput([allowed]))
    if (selected.kind !== 'accepted') throw new Error(selected.code)
    const { toolRefs: _topLevelRefs, ...v2WithoutTopLevelRefs } = current
    const { toolRefs: _policyRefs, ...v2PolicyWithoutRefs } = current.spendingPolicy
    const protectedV2 = protectedV2StoredGrant()

    const invalidRows = [
      { ...legacy, operationRefs: [] },
      { ...legacy, policy: { ...legacy.policy, operationRefs: [] } },
      { ...legacy, policy: { ...legacy.policy, budget: { ...legacy.policy.budget, currency: 'EUR' } } },
      v2WithoutTopLevelRefs,
      { ...current, spendingPolicy: v2PolicyWithoutRefs },
      { ...protectedV2, operationRefs: [allowed] },
      { ...protectedV2, policy: { ...protectedV2.policy, operationRefs: [allowed] } },
      { ...protectedV2, operationAccess: 'selected_operations', operationRefs: [allowed] },
      {
        ...selected.grant,
        toolRefs: [allowed],
        spendingPolicy: { ...selected.grant.spendingPolicy, toolRefs: [second] },
      },
    ]
    for (const row of invalidRows) {
      expect(() => normalizeStoredAgentAccessGrant(row)).toThrow('stored_agent_access_grant_invalid')
    }
  })
})
