import { describe, expect, it } from 'vitest'

import {
  issueProviderApprovalDecision,
  projectProviderApprovalDecision,
  providerApprovalDecisionDigest,
  type IssueProviderApprovalDecisionCommand,
  type ProviderApprovalAuthoritySnapshot,
  type ProviderApprovalDecision,
  type ProviderApprovalDecisionCommandResult,
} from '@/modules/capability-supply/server'

const authority: ProviderApprovalAuthoritySnapshot = {
  connectionRef: 'connection:one',
  providerRef: 'provider:one',
  providerAccountRef: 'account:one',
  authorityGeneration: 1,
  authorityDigest: `sha256:${'a'.repeat(64)}`,
}

const baseCommand: IssueProviderApprovalDecisionCommand = {
  commandId: 'command:approval:one',
  decisionRef: 'decision:one',
  providerRef: authority.providerRef,
  providerAccountRef: authority.providerAccountRef,
  connectionRef: authority.connectionRef,
  authorityGeneration: authority.authorityGeneration,
  connectionAuthorityDigest: authority.authorityDigest,
  requestedScopes: ['orders:read', 'profile:read'],
  grantedScopes: ['orders:read', 'profile:read'],
  requestedResources: ['account:one', 'orders'],
  grantedResources: ['account:one', 'orders'],
  decision: 'granted',
  decisionMakerAuthorityRef: 'mandate:one',
  reasonCode: 'provider_account_granted',
  evidenceRefs: ['evidence:approval'],
}

function applied(result: ProviderApprovalDecisionCommandResult): ProviderApprovalDecision {
  if (result.kind !== 'applied') throw new Error(`expected applied result, received ${result.kind}`)
  return result.decision
}

function issue(
  command: IssueProviderApprovalDecisionCommand = baseCommand,
  currentAuthority: ProviderApprovalAuthoritySnapshot | undefined = authority,
  existing?: { byCommandId?: ProviderApprovalDecision; byConnectionGeneration?: ProviderApprovalDecision },
  now = 1_000,
): ProviderApprovalDecisionCommandResult {
  return issueProviderApprovalDecision(command, now, currentAuthority, existing)
}

describe('provider approval decision contract', () => {
  it('records a full grant with an immutable decision digest', () => {
    const decision = applied(issue())

    expect(decision).toMatchObject({
      decisionRef: 'decision:one',
      decision: 'granted',
      authorityGeneration: 1,
      decisionTime: 1_000,
      evidenceRefs: ['evidence:approval'],
    })
    expect(decision.requestedScopes).toEqual(decision.grantedScopes)
    expect(decision.requestedResources).toEqual(decision.grantedResources)
    expect(decision.decisionDigest).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(decision.decisionDigest).toBe(providerApprovalDecisionDigest(decision))
  })

  it('records a partial decision only when both grants are non-empty strict subsets', () => {
    const decision = applied(issue({
      ...baseCommand,
      commandId: 'command:approval:partial',
      decisionRef: 'decision:partial',
      grantedScopes: ['orders:read'],
      grantedResources: ['orders'],
      decision: 'partial',
      reasonCode: 'provider_account_narrowed',
    }))

    expect(decision.grantedScopes).toEqual(['orders:read'])
    expect(decision.grantedResources).toEqual(['orders'])
    expect(decision.requestedScopes).toEqual(['orders:read', 'profile:read'])
    expect(decision.requestedResources).toEqual(['account:one', 'orders'])
  })

  it('refuses over-grant, malformed decision shapes, and credential material', () => {
    expect(issue({
      ...baseCommand,
      grantedScopes: ['billing:write'],
    })).toEqual({ kind: 'refused', code: 'invalid_scope' })

    expect(issue({
      ...baseCommand,
      decision: 'partial',
      grantedScopes: [],
      grantedResources: [],
    })).toEqual({ kind: 'refused', code: 'invalid_decision' })

    const withCredentialMaterial = {
      ...baseCommand,
      credentialRef: 'oauth:access-token-value',
    } as IssueProviderApprovalDecisionCommand & { credentialRef: string }
    expect(issue(withCredentialMaterial)).toEqual({
      kind: 'refused',
      code: 'credential_material_forbidden',
    })

    expect(issue({
      ...baseCommand,
      decisionMakerAuthorityRef: 'oauth:access-token-value',
    })).toEqual({
      kind: 'refused',
      code: 'invalid_identity',
    })
  })

  it('refuses stale connection generations and authority digests before issuing', () => {
    expect(issue(baseCommand, { ...authority, authorityGeneration: 2 })).toEqual({
      kind: 'refused',
      code: 'stale_generation',
    })
    expect(issue(baseCommand, {
      ...authority,
      authorityDigest: `sha256:${'b'.repeat(64)}`,
    })).toEqual({
      kind: 'refused',
      code: 'stale_digest',
    })
  })

  it('replays an identical command and refuses a changed command under the same identity', () => {
    const first = applied(issue())
    const duplicate = issue(baseCommand, undefined, {
      byCommandId: first,
      byConnectionGeneration: first,
    }, 2_000)
    expect(duplicate).toEqual({
      kind: 'duplicate',
      decision: first,
      commandDigest: first.commandDigest,
    })

    expect(issue({ ...baseCommand, reasonCode: 'provider_account_refused' }, undefined, {
      byCommandId: first,
    })).toEqual({ kind: 'refused', code: 'command_identity_conflict' })
  })

  it('changes the decision digest when any authority-bearing decision field changes', () => {
    const decision = applied(issue())
    expect(providerApprovalDecisionDigest({
      ...decision,
      decisionMakerAuthorityRef: 'mandate:two',
    })).not.toBe(decision.decisionDigest)
    expect(providerApprovalDecisionDigest({
      ...decision,
      grantedResources: ['orders'],
    })).not.toBe(decision.decisionDigest)
  })

  it('projects lookup data without command receipts or credential material', () => {
    const decision = applied(issue())
    const projection = projectProviderApprovalDecision(decision)

    expect(projection).not.toHaveProperty('commandId')
    expect(projection).not.toHaveProperty('commandDigest')
    expect(projection).not.toHaveProperty('credentialRef')
    expect(projection).not.toHaveProperty('accessToken')
    expect(projection).not.toHaveProperty('refreshToken')
    expect(JSON.stringify(projection)).not.toContain('oauth:access-token-value')
  })
})
