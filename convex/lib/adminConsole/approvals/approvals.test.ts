import { afterEach, describe, expect, it, vi } from 'vitest'

import { resolveAdminAuthority } from '../../../authz'
import {
  listOpenApprovalProposals,
  resolveApprovalIntent,
  type ApprovalResolution,
} from './approvals'
import { parseAdminProposalCommand } from '@/components/ae/admin/actions/actions.contracts'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { AdminActionInput, AdminApprovalIntent, AdminReasonCodeByAction } from '@/lib/operator/admin-console/contracts'
import {
  convexTestWithMarketComponents,
  ownerAdmin,
  supportAdmin,
  type ConvexFixtureBackend,
} from '../../../../tests/helpers/convex-fixtures'

const ACTION = 'set_business_suppression'
const COMMAND_DIGEST = canonicalDigest({
  scope: 'admin_operator', action: 'set_business_suppression',
  input: { businessId: 'business:approval-test', intent: 'suppress' },
  reasonCode: 'policy_violation', evidenceRefs: ['evidence:approval-test'],
  expectedStateDigest: 'sha256:before-approval',
})
const NOW = 1_800_000_000_000
const DAY_MS = 24 * 60 * 60 * 1_000
const COMMAND_INPUT = { businessId: 'business:approval-test', intent: 'suppress' } satisfies AdminActionInput[typeof ACTION]
const COMMAND_REASON = 'policy_violation'
const COMMAND_EVIDENCE = ['evidence:approval-test']
const EXPECTED_STATE_DIGEST = 'sha256:before-approval'
const ISSUER = 'https://identity.example'

afterEach(() => { vi.useRealTimers() })

describe('admin command second approval', () => {
  it('executes without approval when exactly one owner admin is active', async () => {
    const backend = convexTestWithMarketComponents()
    await seedOwner(backend, 'user_first-owner')

    await expect(runResolution(
      backend,
      'user_first-owner',
      { kind: 'execute' },
      COMMAND_DIGEST,
      NOW,
    )).resolves.toEqual({
      kind: 'execute',
      approval: 'not_required',
      ownerAdminCountAtDecision: 1,
    })
  })

  it('requires approval when two owner admins are active', async () => {
    const backend = convexTestWithMarketComponents()
    await seedOwner(backend, 'user_proposer')
    await seedOwner(backend, 'user_approver')

    await expect(runResolution(
      backend,
      'user_proposer',
      { kind: 'execute' },
      COMMAND_DIGEST,
      NOW,
    )).resolves.toEqual({
      kind: 'refused',
      code: 'approval_required',
    })
  })

  it('pages open proposals with a stable now when the wall clock advances', async () => {
    const backend = convexTestWithMarketComponents()
    await seedOwner(backend, 'user_proposer')
    await seedOwner(backend, 'user_approver')
    await createProposal(backend, 'user_proposer')
    await backend.run(async (ctx) => {
      const { _id, _creationTime, ...row } = (await ctx.db.query('adminApprovalProposals').collect())[0]!
      await ctx.db.insert('adminApprovalProposals', { ...row, proposalRef: 'admin-proposal:second' })
    })
    vi.useFakeTimers()
    const first = await backend.run((ctx) => listOpenApprovalProposals(ctx, false, { numItems: 1, cursor: null }, NOW))
    vi.setSystemTime(NOW + 2 * DAY_MS)
    const second = await backend.run((ctx) => listOpenApprovalProposals(ctx, false, { numItems: 1, cursor: first.continueCursor }, NOW))
    expect(first.page).toHaveLength(1)
    expect(second.page).toHaveLength(1)
    expect(second.page[0]?.proposalRef).not.toBe(first.page[0]?.proposalRef)
  })

  it('restarts from the first page when the cursor is invalid', async () => {
    const paginate = vi.fn()
      .mockRejectedValueOnce(new Error('InvalidCursor: cursor is from a different query'))
      .mockResolvedValueOnce({ page: [], isDone: true, continueCursor: '' })
    const query = { withIndex: () => ({ order: () => ({ paginate }) }) }
    const ctx = { db: { query: () => query } } as never
    await listOpenApprovalProposals(ctx, false, { numItems: 5, cursor: 'stale' }, NOW)
    expect(paginate.mock.calls.map(call => call[0].cursor)).toEqual(['stale', null])
  })

  it('persists one immutable proposal and its audit event', async () => {
    const backend = convexTestWithMarketComponents()
    await seedOwner(backend, 'user_proposer')
    await seedOwner(backend, 'user_approver')

    const result = await createProposal(backend, 'user_proposer')
    expect(result).toMatchObject({
      kind: 'proposed',
      receipt: {
        kind: 'proposed',
        action: ACTION,
        expiresAt: NOW + DAY_MS,
        correlationId: 'corr:approval-test',
      },
    })
    if (result.kind !== 'proposed') throw new Error('proposal_expected')
    expect(result.receipt.proposalRef).toMatch(/^admin-proposal:/u)

    const stored = await backend.run(async (ctx) => ({
      proposals: (await listOpenApprovalProposals(ctx, true, { numItems: 50, cursor: null }, NOW)).page,
      rows: await ctx.db.query('adminApprovalProposals').collect(),
      audits: await ctx.db
        .query('auditEvents')
        .withIndex('by_eventType_and_createdAt', (query) =>
          query.eq('eventType', 'admin.action_proposed'))
        .collect(),
    }))
    expect(stored.proposals).toEqual([{
      proposalRef: result.receipt.proposalRef,
      action: ACTION,
      commandJson: JSON.stringify({
        input: COMMAND_INPUT,
        reasonCode: COMMAND_REASON,
        evidenceRefs: COMMAND_EVIDENCE,
        expectedStateDigest: EXPECTED_STATE_DIGEST,
      }),
      proposerRef: 'token_proposer',
      createdAt: NOW,
      expiresAt: NOW + DAY_MS,
    }])
    expect(stored.rows).toHaveLength(1)
    expect(stored.proposals[0]?.commandJson).not.toContain('secret-proof-reverification')
    expect(stored.proposals[0]?.commandJson).not.toContain('secret-source-write-signature')
    expect(stored.audits).toHaveLength(1)
    expect(stored.audits[0]).toMatchObject({
      eventType: 'admin.action_proposed',
      targetType: 'admin_approval_proposal',
      targetRef: result.receipt.proposalRef,
    })
    const parsed = parseAdminProposalCommand(ACTION, stored.rows[0]?.commandJson ?? '')
    expect(parsed).toMatchObject({
      action: ACTION,
      input: COMMAND_INPUT,
      reasonCode: COMMAND_REASON,
      evidenceRefs: COMMAND_EVIDENCE,
      expectedStateDigest: EXPECTED_STATE_DIGEST,
    })
    if (parsed === null || parsed.action !== ACTION) throw new Error('proposal_material_expected')
    const second = await runResolutionWithCommand(
      backend, 'user_approver', { kind: 'approve', proposalRef: result.receipt.proposalRef },
      canonicalDigest({ scope: 'admin_operator', action: ACTION, input: parsed.input,
        reasonCode: parsed.reasonCode, evidenceRefs: parsed.evidenceRefs,
        ...(parsed.expectedStateDigest === undefined ? {} : { expectedStateDigest: parsed.expectedStateDigest }) }),
      NOW + 1, {
        input: parsed.input,
        reasonCode: parsed.reasonCode,
        evidenceRefs: parsed.evidenceRefs,
        ...(parsed.expectedStateDigest === undefined ? {} : { expectedStateDigest: parsed.expectedStateDigest }),
      },
    )
    expect(second).toMatchObject({ kind: 'execute', approval: 'second_approved' })
  })

  it('refuses approval by the proposer', async () => {
    const backend = convexTestWithMarketComponents()
    await seedOwner(backend, 'user_proposer')
    await seedOwner(backend, 'user_approver')
    const proposalRef = proposalRefFrom(await createProposal(backend, 'user_proposer'))

    await expect(runResolution(
      backend,
      'user_proposer',
      { kind: 'approve', proposalRef },
      COMMAND_DIGEST,
      NOW + 1,
    )).resolves.toEqual({ kind: 'refused', code: 'approval_same_actor' })
  })

  it('refuses approval when the command digest changed', async () => {
    const backend = convexTestWithMarketComponents()
    await seedOwner(backend, 'user_proposer')
    await seedOwner(backend, 'user_approver')
    const proposalRef = proposalRefFrom(await createProposal(backend, 'user_proposer'))

    await expect(runResolution(
      backend,
      'user_approver',
      { kind: 'approve', proposalRef },
      'sha256:different-command',
      NOW + 1,
    )).resolves.toEqual({ kind: 'refused', code: 'approval_digest_mismatch' })
  })

  it('expires exactly at the 24 hour deadline without mutating audit history and allows a new proposal', async () => {
    const backend = convexTestWithMarketComponents()
    await seedOwner(backend, 'user_proposer')
    await seedOwner(backend, 'user_approver')
    const proposalRef = proposalRefFrom(await createProposal(backend, 'user_proposer'))
    await expect(runResolution(
      backend, 'user_approver', { kind: 'approve', proposalRef },
      COMMAND_DIGEST, NOW + DAY_MS,
    )).resolves.toEqual({ kind: 'refused', code: 'approval_expired' })
    const row = await backend.run(async (ctx) => await ctx.db.query('adminApprovalProposals')
      .withIndex('by_proposalRef', (query) => query.eq('proposalRef', proposalRef)).unique())
    expect(row).toMatchObject({ status: 'awaiting_second_approval', expiresAt: NOW + DAY_MS })
    const renewed = await runResolution(backend, 'user_proposer', { kind: 'propose' }, COMMAND_DIGEST, NOW + DAY_MS + 1)
    expect(proposalRefFrom(renewed)).not.toBe(proposalRef)
  })

  it('atomically consumes an approval once', async () => {
    const backend = convexTestWithMarketComponents()
    await seedOwner(backend, 'user_proposer')
    await seedOwner(backend, 'user_approver')
    const proposalRef = proposalRefFrom(await createProposal(backend, 'user_proposer'))
    const approval = { kind: 'approve', proposalRef } satisfies AdminApprovalIntent

    await expect(runResolution(
      backend,
      'user_approver',
      approval,
      COMMAND_DIGEST,
      NOW + 1,
    )).resolves.toEqual({
      kind: 'execute',
      approval: 'second_approved',
      ownerAdminCountAtDecision: 2,
    })
    await expect(runResolution(
      backend,
      'user_approver',
      approval,
      COMMAND_DIGEST,
      NOW + 2,
    )).resolves.toEqual({
      kind: 'refused',
      code: 'approval_already_resolved',
    })
    const audits = await backend.run(async (ctx) =>
      await ctx.db
        .query('auditEvents')
        .withIndex('by_eventType_and_createdAt', (query) =>
          query.eq('eventType', 'admin.proposal_approved'))
        .collect())
    expect(audits).toHaveLength(1)
  })
  it('requires a second owner only for owner-admin membership changes', async () => {
    const backend = convexTestWithMarketComponents()
    await seedOwner(backend, 'user_proposer')
    await seedOwner(backend, 'user_approver')
    await supportAdmin(backend, 'user_support-target')
    const caller = backend.withIdentity({
      subject: 'user_proposer', issuer: ISSUER,
      tokenIdentifier: 'token_proposer', exp: Math.floor(Date.now() / 1_000) + 86_400,
    })
    const decisions = await caller.run(async (ctx) => {
      const authority = await resolveAdminAuthority(ctx, 'manage_admin_membership')
      if (authority.kind !== 'allowed') throw new Error('allowed_admin_authority_expected')
      const common = {
        approval: { kind: 'execute' } satisfies AdminApprovalIntent,
        correlationId: 'corr:approval-membership',
        evidenceRefs: COMMAND_EVIDENCE,
      }
      return await Promise.all([
        resolveApprovalIntent(ctx, authority, {
          ...common, action: 'grant_admin_membership',
          input: { targetClerkUserId: 'user_new', targetTokenIdentifier: 'token_new', role: 'owner_admin' },
          reasonCode: 'onboarding',
        }, COMMAND_DIGEST, NOW),
        resolveApprovalIntent(ctx, authority, {
          ...common, action: 'grant_admin_membership',
          input: { targetClerkUserId: 'user_new', targetTokenIdentifier: 'token_new', role: 'support' },
          reasonCode: 'onboarding',
        }, COMMAND_DIGEST, NOW),
        resolveApprovalIntent(ctx, authority, {
          ...common, action: 'grant_admin_membership',
          input: { targetClerkUserId: 'user_approver', targetTokenIdentifier: 'token_approver', role: 'support' },
          reasonCode: 'role_change',
        }, COMMAND_DIGEST, NOW),
        resolveApprovalIntent(ctx, authority, {
          ...common, action: 'revoke_admin_membership',
          input: { targetClerkUserId: 'user_approver' },
          reasonCode: 'offboarding',
        }, COMMAND_DIGEST, NOW),
        resolveApprovalIntent(ctx, authority, {
          ...common, action: 'revoke_admin_membership',
          input: { targetClerkUserId: 'user_support-target' },
          reasonCode: 'offboarding',
        }, COMMAND_DIGEST, NOW),
      ])
    })
    expect(decisions.map((decision) => decision.kind === 'refused' ? decision.code : decision.kind === 'execute' ? decision.approval : 'proposed'))
      .toEqual(['approval_required', 'not_required', 'approval_required', 'approval_required', 'not_required'])
  })
})

async function seedOwner(backend: ConvexFixtureBackend, subject: string): Promise<void> {
  await ownerAdmin(backend, subject)
}

async function runResolution(
  backend: ConvexFixtureBackend,
  subject: string,
  approval: AdminApprovalIntent,
  commandDigest: string,
  now: number,
): Promise<ApprovalResolution<typeof ACTION>> {
  return await runResolutionWithCommand(backend, subject, approval, commandDigest, now)
}

async function runResolutionWithCommand(
  backend: ConvexFixtureBackend,
  subject: string,
  approval: AdminApprovalIntent,
  commandDigest: string,
  now: number,
  material: Readonly<{ input: AdminActionInput[typeof ACTION]; reasonCode: AdminReasonCodeByAction[typeof ACTION]; evidenceRefs: readonly string[]; expectedStateDigest?: string }> = {
    input: COMMAND_INPUT, reasonCode: COMMAND_REASON, evidenceRefs: COMMAND_EVIDENCE,
    expectedStateDigest: EXPECTED_STATE_DIGEST,
  },
): Promise<ApprovalResolution<typeof ACTION>> {
  const caller = backend.withIdentity({
    subject,
    issuer: ISSUER,
    tokenIdentifier: subject.replace(/^user_/u, 'token_'),
    exp: Math.floor(Date.now() / 1_000) + 86_400,
  })
  return await caller.run(async (ctx) => {
    const authority = await resolveAdminAuthority(ctx, 'suppress_business')
    if (authority.kind !== 'allowed') throw new Error('allowed_admin_authority_expected')
    return await resolveApprovalIntent(ctx, authority, {
      action: ACTION, ...material, correlationId: 'corr:approval-test', approval,
    }, commandDigest, now)
  })
}

async function createProposal(
  backend: ConvexFixtureBackend,
  proposerSubject: string,
): Promise<ApprovalResolution<typeof ACTION>> {
  return await runResolution(
    backend,
    proposerSubject,
    { kind: 'propose' },
    COMMAND_DIGEST,
    NOW,
  )
}

function proposalRefFrom(result: ApprovalResolution<typeof ACTION>): string {
  if (result.kind !== 'proposed') throw new Error('proposal_expected')
  return result.receipt.proposalRef
}
