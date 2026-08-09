import { describe, expect, it } from 'vitest'

import {
  verifyWorkTreeApprovalBinding,
  workTreeApprovalDigest,
  workTreeApprovalIssueInputSchema,
  type WorkTreeApprovalArtifact,
} from '@/modules/work-tree/internal/approval'

const issue = workTreeApprovalIssueInputSchema.parse({
  projectId: 'project:one',
  nodeId: 'node:one',
  kind: 'lock',
  expectedGeneration: 1,
  expectedRevision: 4,
  proposalDigest: 'proposal:one',
  credentialId: 'credential:agent',
  authority: { kind: 'per_item', amount: { currency: 'AUD', units: '10000', exponent: 2 } },
  expiresAt: 20_000,
  idempotencyKey: 'approval:one',
})

const artifact = (overrides: Partial<WorkTreeApprovalArtifact> = {}): WorkTreeApprovalArtifact => ({
  approvalRef: 'work-tree-approval:opaque',
  approvalDigest: workTreeApprovalDigest({ ownerId: 'owner:one', issue, issuedAt: 1_000 }),
  ownerId: 'owner:one',
  credentialId: issue.credentialId,
  projectId: issue.projectId,
  nodeId: issue.nodeId,
  proposalDigest: issue.proposalDigest,
  authority: issue.authority,
  issuedAt: 1_000,
  expiresAt: issue.expiresAt,
  status: 'unused',
  ...overrides,
})

const expected = (overrides: Partial<Parameters<typeof verifyWorkTreeApprovalBinding>[1]> = {}) => ({
  ownerId: 'owner:one',
  credentialId: issue.credentialId,
  projectId: issue.projectId,
  nodeId: issue.nodeId,
  proposalDigest: issue.proposalDigest,
  authority: issue.authority,
  now: 2_000,
  ...overrides,
})

describe('T49 single-use approval binding', () => {
  it('accepts the exact owner, credential, target, proposal, authority and expiry', () => {
    expect(verifyWorkTreeApprovalBinding(artifact(), expected())).toEqual({ kind: 'accepted' })
    expect(artifact().approvalRef).toMatch(/^work-tree-approval:/u)
  })

  it.each([
    ['owner', { ownerId: 'owner:other' }, 'approval_owner_mismatch'],
    ['credential', { credentialId: 'credential:other' }, 'approval_credential_mismatch'],
    ['project', { projectId: 'project:other' }, 'approval_project_mismatch'],
    ['node', { nodeId: 'node:other' }, 'approval_node_mismatch'],
    ['proposal', { proposalDigest: 'proposal:other' }, 'approval_proposal_mismatch'],
    ['amount', { authority: { kind: 'per_item', amount: { currency: 'AUD', units: '1', exponent: 2 } } }, 'approval_amount_mismatch'],
  ] as const)('refuses a wrong %s without accepting the artifact', (_label, override, code) => {
    expect(verifyWorkTreeApprovalBinding(artifact(), expected(override))).toEqual({ kind: 'refused', code })
    expect(artifact().status).toBe('unused')
  })

  it('refuses an expired artifact and a consumed artifact', () => {
    expect(verifyWorkTreeApprovalBinding(artifact({ expiresAt: 2_000 }), expected())).toEqual({ kind: 'refused', code: 'approval_expired' })
    expect(verifyWorkTreeApprovalBinding(artifact({ status: 'consumed' }), expected())).toEqual({ kind: 'refused', code: 'approval_used' })
  })
  it('accepts equivalent authority amounts across exact scales', () => {
    expect(verifyWorkTreeApprovalBinding(artifact(), expected({
      authority: { kind: 'per_item', amount: { currency: 'AUD', units: '100000', exponent: 3 } },
    }))).toEqual({ kind: 'accepted' })
  })

  it('changes its canonical digest when exact authority material changes', () => {
    const original = workTreeApprovalDigest({ ownerId: 'owner:one', issue, issuedAt: 1_000 })
    const changed = workTreeApprovalDigest({
      ownerId: 'owner:one',
      issue: { ...issue, authority: { kind: 'per_item', amount: { currency: 'AUD', units: '10001', exponent: 2 } } },
      issuedAt: 1_000,
    })
    expect(changed).not.toBe(original)
  })
})
