import { convexTest, type TestConvex } from 'convex-test'
import { afterEach, describe, expect, it, vi } from 'vitest'

import schema from '../../../convex/schema'
import {
  authorizeRecoveryHandler,
  recordVerifiedRecoveryApprovalHandler,
} from '../../../convex/recoveryBreakGlass'
import {
  accountRef,
  principalRef,
} from '../../../src/modules/principal-account/public'
import {
  delegationGrantRef,
} from '../../../src/modules/authority/delegation/public'
import type { VerifiedBreakGlassApproval } from '../../../src/modules/authority/recovery/public'
import { convexModules } from '../../helpers/convex-fixtures'

const NOW = 1_100
const ACCOUNT = accountRef('acc_00000000000040008000000000000041')
const OWNER = principalRef('prn_00000000000040008000000000000041')
const OPERATOR_ONE = principalRef('prn_00000000000040008000000000000042')
const OPERATOR_TWO = principalRef('prn_00000000000040008000000000000043')
const GRANT = delegationGrantRef('grt_00000000000040008000000000000041')

function approval(
  approvalRef: string,
  operatorPrincipalRef: typeof OPERATOR_ONE | typeof OPERATOR_TWO,
): VerifiedBreakGlassApproval {
  return Object.freeze({
    approvalRef,
    accountRef: ACCOUNT,
    subjectPrincipalRef: OWNER,
    operatorPrincipalRef,
    action: 'isolate',
    recoveryPolicyRevision: 7,
    frozenAccountRevision: 12,
    verificationRef: `verification:${approvalRef}`,
    lifecycle: 'verified',
    verifiedAt: 1_050,
    expiresAt: 2_000,
  })
}

async function seed(backend: TestConvex<typeof schema>) {
  await backend.run(async (ctx) => {
    for (const [principal, displayName] of [
      [OWNER, 'Protected owner'],
      [OPERATOR_ONE, 'Operator one'],
      [OPERATOR_TWO, 'Operator two'],
    ] as const) {
      await ctx.db.insert('principals', {
        principalRef: principal,
        kind: 'human',
        displayName,
        lifecycle: 'active',
        revision: 1,
        createdAt: 900,
        updatedAt: 900,
      })
    }
    await ctx.db.insert('accounts', {
      accountRef: ACCOUNT,
      displayName: 'Recovery account',
      lifecycle: 'suspended',
      recoveryPolicy: {
        kind: 'threshold',
        threshold: 2,
        participantCount: 3,
        delayMs: 100,
        freezeRequired: true,
        revision: 7,
      },
      creationActorPrincipalRef: OWNER,
      creationIdempotencyRef: 'account:create:recovery',
      initialOwnershipRef: 'own_00000000000040008000000000000041',
      currentOwnershipRef: 'own_00000000000040008000000000000041',
      revision: 12,
      createdAt: 800,
      updatedAt: 1_000,
      lastAction: {
        actorPrincipalRef: OWNER,
        activeAccountRef: ACCOUNT,
        correlationRef: 'account:suspend',
        idempotencyRef: 'account:suspend',
      },
    })
    await ctx.db.insert('accountOwnerships', {
      ownershipRef: 'own_00000000000040008000000000000041',
      accountRef: ACCOUNT,
      ownerPrincipalRef: OWNER,
      lifecycle: 'active',
      changeKind: 'creation',
      revision: 1,
      createdAt: 800,
      createdBy: {
        actorPrincipalRef: OWNER,
        activeAccountRef: ACCOUNT,
        correlationRef: 'account:create',
        idempotencyRef: 'account:create',
      },
    })
    await ctx.db.insert('memberships', {
      membershipRef: 'mem_00000000000040008000000000000041',
      accountRef: ACCOUNT,
      memberPrincipalRef: OPERATOR_ONE,
      lifecycle: 'active',
      revision: 1,
      createdAt: 900,
      createdBy: {
        actorPrincipalRef: OWNER,
        activeAccountRef: ACCOUNT,
        correlationRef: 'operator:add',
        idempotencyRef: 'operator:add',
      },
    })
    await ctx.db.insert('authorityDelegationGrants', {
      grantRef: GRANT,
      accountRef: ACCOUNT,
      actorPrincipalRef: OPERATOR_ONE,
      subjectPrincipalRef: OPERATOR_ONE,
      scopes: ['recovery:isolate'],
      resourceRefs: [`account:${ACCOUNT}`],
      budgetLimit: 1,
      budgetUsed: 0,
      expiresAt: 1_900,
      generation: 4,
      revision: 4,
      lifecycle: 'active',
      createdAt: 900,
      createdBy: {
        actorPrincipalRef: OPERATOR_ONE,
        activeAccountRef: ACCOUNT,
        correlationRef: 'grant:create',
        idempotencyRef: 'grant:create',
      },
    })
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('recovery break-glass Convex driver', () => {
  it('binds current account ownership and delegation authority, consumes two operators atomically, and replays exactly', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    vi.spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValue('00000000-0000-4000-8000-000000000041')
    const backend = convexTest(schema, convexModules)
    await seed(backend)
    await backend.run(async (ctx) => {
      await recordVerifiedRecoveryApprovalHandler(ctx, approval('approval:one', OPERATOR_ONE))
      await recordVerifiedRecoveryApprovalHandler(ctx, approval('approval:two', OPERATOR_TWO))
    })
    const request = {
      action: 'isolate' as const,
      accountRef: ACCOUNT,
      subjectPrincipalRef: OWNER,
      grantRef: GRANT,
      expectedGrantGeneration: 4,
      approvalRefs: ['approval:one', 'approval:two'],
      context: {
        actorPrincipalRef: OPERATOR_ONE,
        activeAccountRef: ACCOUNT,
        correlationRef: 'recovery:isolate',
        idempotencyRef: 'recovery:isolate:one',
      },
    }
    const first = await backend.run(async (ctx) => await authorizeRecoveryHandler(ctx, request))
    const replay = await backend.run(async (ctx) => await authorizeRecoveryHandler(ctx, request))
    expect(replay).toEqual(first)
    expect(first).toMatchObject({
      accountRef: ACCOUNT,
      subjectPrincipalRef: OWNER,
      operatorPrincipalRef: OPERATOR_ONE,
      authoritySnapshotRef: expect.stringMatching(/^das_/),
      approvalRefs: ['approval:one', 'approval:two'],
      lifecycle: 'consumed',
    })
    expect(first.subjectPrincipalRef).not.toBe(first.operatorPrincipalRef)
    await expect(backend.run(async (ctx) => ctx.db.query('recoveryBreakGlassAdmissions').collect()))
      .resolves.toHaveLength(1)
    await expect(backend.run(async (ctx) => ctx.db.query('authorityDelegationSnapshots').collect()))
      .resolves.toHaveLength(1)
    const state = await backend.run(async (ctx) => ({
      approvals: await ctx.db.query('recoveryBreakGlassApprovals').collect(),
      ownerships: await ctx.db.query('accountOwnerships').collect(),
    }))
    expect(state.approvals.map(({ lifecycle }) => lifecycle)).toEqual(['consumed', 'consumed'])
    expect(state.ownerships).toHaveLength(1)
    expect(state.ownerships[0]).toMatchObject({ ownerPrincipalRef: OWNER, lifecycle: 'active' })
  })

  it('rejects single-operator, impersonating, duplicate-verification, stale-generation, and non-member attempts without admissions', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    vi.spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValue('00000000-0000-4000-8000-000000000042')
    const backend = convexTest(schema, convexModules)
    await seed(backend)
    await backend.run(async (ctx) => {
      await recordVerifiedRecoveryApprovalHandler(ctx, approval('approval:one', OPERATOR_ONE))
      await recordVerifiedRecoveryApprovalHandler(ctx, approval('approval:two', OPERATOR_TWO))
      await expect(recordVerifiedRecoveryApprovalHandler(ctx, {
        ...approval('approval:other', OPERATOR_TWO),
        verificationRef: 'verification:approval:one',
      })).rejects.toMatchObject({ code: 'recovery_approval_duplicate' })
    })
    const base = {
      action: 'isolate' as const,
      accountRef: ACCOUNT,
      subjectPrincipalRef: OWNER,
      grantRef: GRANT,
      expectedGrantGeneration: 4,
      approvalRefs: ['approval:one', 'approval:two'],
      context: {
        actorPrincipalRef: OPERATOR_ONE,
        activeAccountRef: ACCOUNT,
        correlationRef: 'recovery:isolate',
        idempotencyRef: 'recovery:hostile',
      },
    }
    await expect(backend.run(async (ctx) => await authorizeRecoveryHandler(ctx, {
      ...base,
      approvalRefs: ['approval:one'],
    }))).rejects.toMatchObject({ code: 'recovery_threshold_unmet' })
    await expect(backend.run(async (ctx) => await authorizeRecoveryHandler(ctx, {
      ...base,
      subjectPrincipalRef: OPERATOR_ONE,
    }))).rejects.toMatchObject({ code: 'recovery_operator_impersonation' })
    await expect(backend.run(async (ctx) => await authorizeRecoveryHandler(ctx, {
      ...base,
      expectedGrantGeneration: 3,
    }))).rejects.toThrow()
    await expect(backend.run(async (ctx) => await authorizeRecoveryHandler(ctx, {
      ...base,
      context: { ...base.context, actorPrincipalRef: OPERATOR_TWO },
    }))).rejects.toThrow()
    await expect(backend.run(async (ctx) => ctx.db.query('recoveryBreakGlassAdmissions').collect()))
      .resolves.toHaveLength(0)
    const approvals = await backend.run(async (ctx) => ctx.db.query('recoveryBreakGlassApprovals').collect())
    expect(approvals.map(({ lifecycle }) => lifecycle)).toEqual(['verified', 'verified'])
  })
})
