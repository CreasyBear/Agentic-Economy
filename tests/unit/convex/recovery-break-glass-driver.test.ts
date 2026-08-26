import { convexTest, type TestConvex } from 'convex-test'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { internal } from '../../../convex/_generated/api'
import schema from '../../../convex/schema'
import {
  authorizeRecoveryHandler,
  createConvexRecoveryPersistence,
  recordVerifiedRecoveryApprovalHandler,
} from '../../../convex/recoveryBreakGlass'
import {
  accountRef,
  principalRef,
} from '../../../src/modules/principal-account/public'
import {
  delegationGrantRef,
} from '../../../src/modules/authority/delegation/public'
import {
  recoveryAdmissionRef,
  type RecoveryAdmission,
  type VerifiedBreakGlassApproval,
} from '../../../src/modules/authority/recovery/public'
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
  action: VerifiedBreakGlassApproval['action'] = 'isolate',
): VerifiedBreakGlassApproval {
  return Object.freeze({
    approvalRef,
    accountRef: ACCOUNT,
    subjectPrincipalRef: OWNER,
    operatorPrincipalRef,
    action,
    recoveryPolicyRevision: 7,
    frozenAccountRevision: 12,
    verificationRef: `verification:${approvalRef}`,
    lifecycle: 'verified',
    verifiedAt: 1_050,
    expiresAt: 2_000,
  })
}

const recoveryRequest = (overrides: Record<string, unknown> = {}) => ({
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
  ...overrides,
})

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

  it('runs the registered mutation wrappers and preserves canonical consumed values', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    vi.spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValue('00000000-0000-4000-8000-000000000043')
    const backend = convexTest(schema, convexModules)
    await seed(backend)

    await expect(backend.mutation(internal.recoveryBreakGlass.recordVerifiedRecoveryApproval, {
      approval: approval('approval:one', OPERATOR_ONE),
    })).resolves.toMatchObject({ lifecycle: 'verified' })
    await expect(backend.mutation(internal.recoveryBreakGlass.recordVerifiedRecoveryApproval, {
      approval: approval('approval:two', OPERATOR_TWO),
    })).resolves.toMatchObject({ lifecycle: 'verified' })

    const admitted = await backend.mutation(
      internal.recoveryBreakGlass.authorizeRecovery,
      recoveryRequest(),
    )
    expect(admitted).toMatchObject({
      accountRef: ACCOUNT,
      lifecycle: 'consumed',
      context: { actorPrincipalRef: OPERATOR_ONE, activeAccountRef: ACCOUNT },
    })

    await backend.run(async (ctx) => {
      await createConvexRecoveryPersistence(ctx).transact(async (session) => {
        await expect(session.getApproval('approval:missing')).resolves.toBeUndefined()
        await expect(session.getAdmission(recoveryAdmissionRef(
          'rcv_00000000000040008000000000000999',
        ))).resolves.toBeUndefined()
        const consumed = await session.getApproval('approval:one')
        expect(consumed).toMatchObject({
          lifecycle: 'consumed',
          consumedAt: NOW,
          consumedByAdmissionRef: admitted.admissionRef,
        })
        await expect(session.getApprovalByVerification('verification:approval:one'))
          .resolves.toEqual(consumed)
        await expect(session.getAdmission(admitted.admissionRef)).resolves.toEqual(admitted)
      })
    })
  })

  it('fails closed on missing account ownership facts before consulting approvals', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)

    for (const corruption of ['missing-account', 'empty-ownership-ref', 'missing-ownership'] as const) {
      const backend = convexTest(schema, convexModules)
      await seed(backend)
      await backend.run(async (ctx) => {
        const account = await ctx.db.query('accounts')
          .withIndex('by_accountRef', (query) => query.eq('accountRef', ACCOUNT)).unique()
        if (account === null) throw new Error('seeded_account_missing')
        if (corruption === 'missing-account') await ctx.db.delete(account._id)
        if (corruption === 'empty-ownership-ref') {
          await ctx.db.patch(account._id, { currentOwnershipRef: '' })
        }
        if (corruption === 'missing-ownership') {
          await ctx.db.patch(account._id, {
            currentOwnershipRef: 'own_00000000000040008000000000000999',
          })
        }
      })

      await expect(backend.run(async (ctx) => await authorizeRecoveryHandler(
        ctx,
        recoveryRequest({ context: {
          ...recoveryRequest().context,
          idempotencyRef: `recovery:facts:${corruption}`,
        } }),
      ))).rejects.toMatchObject({ code: 'recovery_account_facts_invalid' })
      await expect(backend.run(async (ctx) => ctx.db.query('recoveryBreakGlassAdmissions').collect()))
        .resolves.toHaveLength(0)
    }
  })

  it('authorizes freeze only against an active account with matching freeze scope', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    vi.spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValue('00000000-0000-4000-8000-000000000044')
    const backend = convexTest(schema, convexModules)
    await seed(backend)
    await backend.run(async (ctx) => {
      const account = await ctx.db.query('accounts')
        .withIndex('by_accountRef', (query) => query.eq('accountRef', ACCOUNT)).unique()
      const grant = await ctx.db.query('authorityDelegationGrants')
        .withIndex('by_grantRef', (query) => query.eq('grantRef', GRANT)).unique()
      if (account === null || grant === null) throw new Error('seed_rows_missing')
      await ctx.db.patch(account._id, { lifecycle: 'active' })
      await ctx.db.patch(grant._id, { scopes: ['recovery:freeze'] })
      await recordVerifiedRecoveryApprovalHandler(ctx, approval('approval:one', OPERATOR_ONE, 'freeze'))
      await recordVerifiedRecoveryApprovalHandler(ctx, approval('approval:two', OPERATOR_TWO, 'freeze'))
    })

    await expect(backend.run(async (ctx) => await authorizeRecoveryHandler(ctx, {
      ...recoveryRequest(),
      action: 'freeze',
      context: {
        ...recoveryRequest().context,
        correlationRef: 'recovery:freeze',
        idempotencyRef: 'recovery:freeze:one',
      },
    }))).resolves.toMatchObject({ action: 'freeze', availableAt: 1_000 })
  })

  it('rejects atomic persistence conflicts without partial approval replacement', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    vi.spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValue('00000000-0000-4000-8000-000000000045')
    const backend = convexTest(schema, convexModules)
    await seed(backend)
    await backend.run(async (ctx) => {
      await recordVerifiedRecoveryApprovalHandler(ctx, approval('approval:one', OPERATOR_ONE))
      await recordVerifiedRecoveryApprovalHandler(ctx, approval('approval:two', OPERATOR_TWO))
    })
    const admitted = await backend.run(async (ctx) => await authorizeRecoveryHandler(
      ctx,
      recoveryRequest(),
    ))

    const refs = {
      duplicate: recoveryAdmissionRef('rcv_00000000000040008000000000000051'),
      missing: recoveryAdmissionRef('rcv_00000000000040008000000000000052'),
      cardinality: recoveryAdmissionRef('rcv_00000000000040008000000000000053'),
      membership: recoveryAdmissionRef('rcv_00000000000040008000000000000054'),
    } as const
    await backend.run(async (ctx) => {
      await createConvexRecoveryPersistence(ctx).transact(async (session) => {
        const consumedOne = await session.getApproval('approval:one')
        const consumedTwo = await session.getApproval('approval:two')
        if (consumedOne === undefined || consumedTwo === undefined) {
          throw new Error('consumed_approvals_missing')
        }
        await expect(session.insertVerifiedApproval(approval('approval:one', OPERATOR_ONE)))
          .rejects.toMatchObject({ code: 'recovery_approval_duplicate' })
        const replacement = (value: VerifiedBreakGlassApproval) => ({
          expectedLifecycle: 'verified' as const,
          value,
        })
        const changedAdmission = (
          admissionRef: (typeof refs)[keyof typeof refs],
          overrides: Partial<RecoveryAdmission> = {},
        ): RecoveryAdmission => ({ ...admitted, admissionRef, ...overrides })
        const changedConsumed = (
          value: VerifiedBreakGlassApproval,
          admissionRef: (typeof refs)[keyof typeof refs],
        ): VerifiedBreakGlassApproval => ({ ...value, consumedByAdmissionRef: admissionRef })

        await expect(session.commitRecoveryAtomically({
          admissionInsert: admitted,
          approvalReplacements: [],
        })).rejects.toMatchObject({ code: 'recovery_admission_ref_conflict' })

        const duplicate = changedConsumed(consumedOne, refs.duplicate)
        await expect(session.commitRecoveryAtomically({
          admissionInsert: changedAdmission(refs.duplicate),
          approvalReplacements: [replacement(duplicate), replacement(duplicate)],
        })).rejects.toMatchObject({ code: 'recovery_approval_duplicate' })

        const missing = {
          ...approval('approval:missing', OPERATOR_ONE),
          lifecycle: 'consumed' as const,
          consumedAt: NOW,
          consumedByAdmissionRef: refs.missing,
        }
        await expect(session.commitRecoveryAtomically({
          admissionInsert: changedAdmission(refs.missing, {
            approvalRefs: ['approval:missing', 'approval:two'],
            verificationRefs: [
              'verification:approval:missing',
              'verification:approval:two',
            ],
          }),
          approvalReplacements: [
            replacement(missing),
            replacement(changedConsumed(consumedTwo, refs.missing)),
          ],
        })).rejects.toMatchObject({ code: 'recovery_approval_unavailable' })

        await expect(session.commitRecoveryAtomically({
          admissionInsert: changedAdmission(refs.cardinality),
          approvalReplacements: [],
        })).rejects.toMatchObject({ code: 'recovery_approval_unavailable' })

        await expect(session.commitRecoveryAtomically({
          admissionInsert: changedAdmission(refs.membership, {
            approvalRefs: ['approval:one', 'approval:unknown'],
            verificationRefs: ['verification:approval:one', 'verification:approval:unknown'],
          }),
          approvalReplacements: [
            replacement(changedConsumed(consumedOne, refs.membership)),
            replacement(changedConsumed(consumedTwo, refs.membership)),
          ],
        })).rejects.toMatchObject({ code: 'recovery_approval_unavailable' })
      })
    })

    const state = await backend.run(async (ctx) => ({
      admissions: await ctx.db.query('recoveryBreakGlassAdmissions').collect(),
      approvals: await ctx.db.query('recoveryBreakGlassApprovals').collect(),
    }))
    expect(state.admissions).toHaveLength(1)
    expect(state.approvals).toHaveLength(2)
    expect(state.approvals.every(({ consumedByAdmissionRef }) =>
      consumedByAdmissionRef === admitted.admissionRef)).toBe(true)
  })
})
