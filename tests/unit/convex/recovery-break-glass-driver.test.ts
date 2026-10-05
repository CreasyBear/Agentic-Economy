import { afterEach, describe, expect, it, vi } from 'vitest'

import { internal } from '../../../convex/_generated/api'
import { authorizeRecoveryHandler } from '../../../convex/lib/authority/breakGlass/authorization'
import { createConvexRecoveryPersistence } from '../../../convex/lib/authority/breakGlass/persistence'
import { accountRef } from '../../../src/modules/principal-account/public'
import {
  recoveryAdmissionRef,
  type RecoveryAdmission,
  type VerifiedBreakGlassApproval,
} from '../../../src/modules/authority/recovery/public'
import {
  RECOVERY_DRIVER_ACCOUNT as ACCOUNT,
  RECOVERY_DRIVER_APPROVAL_REFS as APPROVAL_REFS,
  RECOVERY_DRIVER_GRANT as GRANT,
  RECOVERY_DRIVER_ISOLATION_SETUP as ISOLATION_SETUP,
  RECOVERY_DRIVER_NOW as NOW,
  RECOVERY_DRIVER_OPERATOR_ONE as OPERATOR_ONE,
  RECOVERY_DRIVER_OPERATOR_TWO as OPERATOR_TWO,
  RECOVERY_DRIVER_OWNER as OWNER,
  RECOVERY_DRIVER_UUID as RECOVERY_UUID,
  configureRecoveryDriverRegisteredAction as configureRegisteredAction,
  corruptRecoveryDriverAccountFacts as corruptAccountFacts,
  createRecoveryDriverBackend,
  expireRecoveryDriverOperatorOneCredential as expireOperatorOneCredential,
  getRecoveryDriverAccount as getAccount,
  getRecoveryDriverGrant as getGrant,
  mockRecoveryDriverClock as mockRecoveryClock,
  patchRecoveryDriverAccountLifecycle as patchAccountLifecycle,
  queryRecoveryDriverAdmissions as queryAdmissions,
  queryRecoveryDriverApprovalLifecycles as queryApprovalLifecycles,
  queryRecoveryDriverConsequenceState as queryConsequenceState,
  recoveryDriverActionContext as actionContext,
  recoveryDriverApproval as approval,
  recoveryDriverIdentity as identity,
  recoveryDriverRegisteredAuthorizePayload as registeredAuthorizePayload,
  recoveryDriverRequest as recoveryRequest,
  recoveryDriverRequestContext as recoveryRequestContext,
  removeRecoveryDriverOperatorOneMembership as removeOperatorOneMembership,
  runRecoveryDriverAuthorizeHandler as runAuthorizeHandler,
  runRecoveryDriverRegisteredRecovery as runRegisteredRecovery,
  seedRecoveryDriver as seed,
  seedRecoveryDriverGrantBurst as seedGrantBurst,
  seedRecoveryDriverPersistedReplay as seedPersistedReplay,
  seedRecoveryDriverTrustedApprovals as seedTrustedApprovals,
  submitRecoveryDriverRegisteredApprovals as submitRegisteredApprovals,
  withRecoveryDriverPersistence as withPersistence,
} from '../../helpers/recovery-break-glass-driver-fixture'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('recovery break-glass Convex driver', () => {
  it('binds current account ownership and delegation authority, consumes two operators atomically, and replays exactly', async () => {
    mockRecoveryClock(RECOVERY_UUID.isolate)
    const backend = createRecoveryDriverBackend()
    await seed(backend)
    await seedTrustedApprovals(backend)
    const request = recoveryRequest()
    const first = await runAuthorizeHandler(backend)
    const replay = await backend.run(async (ctx) => await authorizeRecoveryHandler(ctx, request))
    expect(replay).toEqual(first)
    expect(first).toMatchObject({
      accountRef: ACCOUNT,
      subjectPrincipalRef: OWNER,
      operatorPrincipalRef: OPERATOR_ONE,
      authoritySnapshotRef: expect.stringMatching(/^das_/),
      approvalRefs: [...APPROVAL_REFS],
      lifecycle: 'consumed',
    })
    expect(first.subjectPrincipalRef).not.toBe(first.operatorPrincipalRef)
    await expect(queryAdmissions(backend)).resolves.toHaveLength(1)
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
    mockRecoveryClock(RECOVERY_UUID.hostile)
    const backend = createRecoveryDriverBackend()
    await seed(backend)
    await seedTrustedApprovals(backend)
    await backend.run(async (ctx) => {
      await expect(createConvexRecoveryPersistence(ctx).transact(async (session) =>
        await session.insertVerifiedApproval({
          ...approval('approval:other', OPERATOR_TWO),
          verificationRef: 'verification:approval:one',
        }))).rejects.toMatchObject({ code: 'recovery_approval_duplicate' })
    })
    const hostileContext = recoveryRequestContext({ idempotencyRef: 'recovery:hostile' }).context
    const hostileCases = [
      [{ approvalRefs: ['approval:one'] }, { code: 'recovery_threshold_unmet' }],
      [{ subjectPrincipalRef: OPERATOR_ONE }, { code: 'recovery_operator_impersonation' }],
      [{ expectedGrantGeneration: 3 }, 'throw'],
      [{ context: { ...hostileContext, actorPrincipalRef: OPERATOR_TWO } }, 'throw'],
    ] as const
    for (const [overrides, outcome] of hostileCases) {
      const attempt = runAuthorizeHandler(backend, overrides)
      if (outcome === 'throw') await expect(attempt).rejects.toThrow()
      else await expect(attempt).rejects.toMatchObject(outcome)
    }
    await expect(queryAdmissions(backend)).resolves.toHaveLength(0)
    expect(await queryApprovalLifecycles(backend)).toEqual(['verified', 'verified'])
  })

  it('runs the registered mutation wrappers and preserves canonical consumed values', async () => {
    mockRecoveryClock(RECOVERY_UUID.registered)
    const backend = createRecoveryDriverBackend()
    await seed(backend)

    await expect(backend.withIdentity(identity('41')).mutation(internal.recoveryBreakGlass.submitRecoveryApproval, {
      approvalRef: 'approval:one', accountRef: ACCOUNT, action: 'isolate',
    })).resolves.toMatchObject({ lifecycle: 'verified' })
    await expect(backend.withIdentity(identity('42')).mutation(internal.recoveryBreakGlass.submitRecoveryApproval, {
      approvalRef: 'approval:two', accountRef: ACCOUNT, action: 'isolate',
    })).resolves.toMatchObject({ lifecycle: 'verified' })

    const admitted = await runRegisteredRecovery(backend, 'isolate', 'one')
    expect(admitted).toMatchObject({
      accountRef: ACCOUNT,
      lifecycle: 'consumed',
      context: { actorPrincipalRef: OPERATOR_ONE, activeAccountRef: ACCOUNT },
    })

    const revokedGrant = await backend.run(async (ctx) => await getGrant(ctx))
    expect(revokedGrant).toMatchObject({
      lifecycle: 'revoked',
      generation: 5,
      revision: 6,
      revokedAt: NOW,
      revokedBy: actionContext(OPERATOR_ONE, 'recovery:isolate', 'recovery:isolate:one'),
    })

    await withPersistence(backend, async (session) => {
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
      const byVerification = await session.getApprovalByVerification(consumed?.verificationRef ?? '')
      expect(byVerification).toEqual(consumed)
      await expect(session.getAdmission(admitted.admissionRef)).resolves.toEqual(admitted)
    })
  })

  it.each(['missing', 'support', 'revoked'] as const)(
    'rejects both internal recovery mutations when the operator admin membership is %s',
    async (adminState) => {
      mockRecoveryClock()
      const backend = createRecoveryDriverBackend()
      await seed(backend)
      await seedTrustedApprovals(backend)
      await backend.run(async (ctx) => {
        const admin = await ctx.db.query('adminMemberships')
          .withIndex('by_tokenIdentifier_and_state', (query) => query
            .eq('tokenIdentifier', identity('41').tokenIdentifier)
            .eq('state', 'active'))
          .unique()
        if (admin === null) throw new Error('seeded_admin_missing')
        if (adminState === 'missing') await ctx.db.delete(admin._id)
        else if (adminState === 'support') await ctx.db.patch(admin._id, { role: 'support' })
        else await ctx.db.patch(admin._id, { state: 'revoked', revokedBy: 'test', revokedAt: NOW })
      })

      const before = await queryConsequenceState(backend, 'production')
      await expect(backend.withIdentity(identity('41')).mutation(
        internal.recoveryBreakGlass.submitRecoveryApproval,
        { approvalRef: `approval:denied:${adminState}`, accountRef: ACCOUNT, action: 'isolate' },
      )).rejects.toMatchObject({ code: 'recovery_approval_unavailable' })
      await expect(runRegisteredRecovery(backend, 'isolate', `denied:${adminState}`))
        .rejects.toMatchObject({ code: 'recovery_approval_unavailable' })
      if (adminState === 'missing') {
        const unknownAccount = accountRef('acc_00000000000040008000000000000999')
        await expect(backend.withIdentity(identity('41')).mutation(
          internal.recoveryBreakGlass.submitRecoveryApproval,
          { approvalRef: 'approval:unknown-account', accountRef: unknownAccount, action: 'isolate' },
        )).rejects.toMatchObject({ code: 'recovery_approval_unavailable' })
        await expect(runRegisteredRecovery(backend, 'isolate', 'unknown-account', {
          accountRef: unknownAccount,
        })).rejects.toMatchObject({ code: 'recovery_approval_unavailable' })
      }
      await expect(queryConsequenceState(backend, 'production')).resolves.toEqual(before)
    },
  )

  it('still requires workspace membership when admin permission is present', async () => {
    mockRecoveryClock()
    const backend = createRecoveryDriverBackend()
    await seed(backend)
    await seedTrustedApprovals(backend)
    await removeOperatorOneMembership(backend)
    const before = await queryConsequenceState(backend, 'production')

    await expect(backend.withIdentity(identity('41')).mutation(
      internal.recoveryBreakGlass.submitRecoveryApproval,
      { approvalRef: 'approval:admin-without-workspace', accountRef: ACCOUNT, action: 'isolate' },
    )).rejects.toMatchObject({ code: 'recovery_approval_unavailable' })
    await expect(runRegisteredRecovery(backend, 'isolate', 'admin-without-workspace'))
      .rejects.toMatchObject({ code: 'recovery_approval_unavailable' })
    await expect(queryConsequenceState(backend, 'production')).resolves.toEqual(before)
  })

  it.each([
    ['owner', false, { subject: 'protected-owner', issuer: 'https://recovery.test', tokenIdentifier: 'recovery|owner' }, ACCOUNT, 4, 'owner'],
    ['member', true, identity('41'), ACCOUNT, 4, null],
    ['workload', false, { subject: 'recovery-workload', issuer: 'https://recovery.test', tokenIdentifier: 'recovery|workload' }, ACCOUNT, 4, 'workload'],
    ['missing_workload', false, null, ACCOUNT, 4, null],
    ['stranger', false, { subject: 'recovery-stranger', issuer: 'https://recovery.test', tokenIdentifier: 'recovery|stranger' }, ACCOUNT, 4, null],
    ['wrong_account', false, identity('41'), accountRef('acc_00000000000040008000000000000999'), 4, null],
    ['stale_generation', false, identity('41'), ACCOUNT, 3, null],
  ] as const)(
    'evaluates %s through the registered recovery operation with atomic denial',
    async (caseKind, allowed, presentedIdentity, selectedAccount, generation, setupKey) => {
      mockRecoveryClock(RECOVERY_UUID.isolationMatrix)
      const backend = createRecoveryDriverBackend()
      await seed(backend)
      if (setupKey !== null) await ISOLATION_SETUP[setupKey](backend)
      await seedTrustedApprovals(backend)
      const before = await queryConsequenceState(backend, 'isolation-matrix')
      const client = presentedIdentity === null ? backend : backend.withIdentity(presentedIdentity)
      const consequence = client.mutation(internal.recoveryBreakGlass.authorizeRecoveryOperation, {
        action: 'isolate',
        accountRef: selectedAccount,
        grantRef: GRANT,
        expectedGrantGeneration: generation,
        approvalRefs: [...APPROVAL_REFS],
        correlationRef: `recovery:isolation-matrix:${caseKind}`,
        idempotencyRef: `recovery:isolation-matrix:${caseKind}`,
      })

      if (allowed) {
        await expect(consequence).resolves.toMatchObject({
          lifecycle: 'consumed',
          accountRef: ACCOUNT,
          operatorPrincipalRef: OPERATOR_ONE,
        })
      } else {
        await expect(consequence).rejects.toThrow()
        await expect(queryConsequenceState(backend, 'isolation-matrix')).resolves.toEqual(before)
      }
    },
  )

  it('fails closed on missing account ownership facts before consulting approvals', async () => {
    mockRecoveryClock()

    for (const corruption of ['missing-account', 'empty-ownership-ref', 'missing-ownership'] as const) {
      const backend = createRecoveryDriverBackend()
      await seed(backend)
      await corruptAccountFacts(backend, corruption)

      await expect(runAuthorizeHandler(backend, recoveryRequestContext({
        idempotencyRef: `recovery:facts:${corruption}`,
      }))).rejects.toMatchObject({ code: 'recovery_account_facts_invalid' })
      await expect(queryAdmissions(backend)).resolves.toHaveLength(0)
    }
  })

  it('authorizes freeze only against an active account with matching freeze scope', async () => {
    mockRecoveryClock(RECOVERY_UUID.freeze)
    const backend = createRecoveryDriverBackend()
    await seed(backend)
    await configureRegisteredAction(backend, 'freeze')
    await seedTrustedApprovals(backend, 'freeze')

    await expect(runAuthorizeHandler(backend, {
      action: 'freeze',
      context: actionContext(OPERATOR_ONE, 'recovery:freeze', 'recovery:freeze:one'),
    })).resolves.toMatchObject({ action: 'freeze', availableAt: 1_000 })
  })

  it('rejects a missing or invalid authenticated operator through the registered approval mutation', async () => {
    mockRecoveryClock()
    const backend = createRecoveryDriverBackend()
    await seed(backend)

    const intent = { approvalRef: 'approval:missing-operator', accountRef: ACCOUNT, action: 'isolate' as const }
    await expect(backend.mutation(internal.recoveryBreakGlass.submitRecoveryApproval, intent))
      .rejects.toMatchObject({ code: 'recovery_approval_unavailable' })
    await expect(backend.withIdentity({
      subject: 'unknown',
      issuer: 'https://recovery.test',
      tokenIdentifier: 'recovery|operator:unknown',
    }).mutation(internal.recoveryBreakGlass.submitRecoveryApproval, {
      ...intent,
      approvalRef: 'approval:unknown-operator',
    })).rejects.toMatchObject({ code: 'recovery_approval_unavailable' })

    await expireOperatorOneCredential(backend)
    await expect(backend.withIdentity(identity('41')).mutation(
      internal.recoveryBreakGlass.submitRecoveryApproval,
      { ...intent, approvalRef: 'approval:expired-operator' },
    )).rejects.toMatchObject({ code: 'recovery_approval_unavailable' })

    await expect(backend.run(async (ctx) => ctx.db.query('recoveryBreakGlassApprovals').collect()))
      .resolves.toHaveLength(0)
  })

  it('rejects an invalid delegation context with no active operator membership', async () => {
    mockRecoveryClock()
    const backend = createRecoveryDriverBackend()
    await seed(backend)
    await seedTrustedApprovals(backend)
    await removeOperatorOneMembership(backend)

    await expect(runAuthorizeHandler(backend, recoveryRequestContext({
      idempotencyRef: 'recovery:delegation-context:missing-membership',
    }))).rejects.toMatchObject({ code: 'recovery_approval_unavailable' })
    await expect(queryAdmissions(backend)).resolves.toHaveLength(0)
  })

  it('applies a registered freeze exactly once to the current active account', async () => {
    mockRecoveryClock(RECOVERY_UUID.freezeRegistered)
    const backend = createRecoveryDriverBackend()
    await seed(backend)
    await configureRegisteredAction(backend, 'freeze')
    await submitRegisteredApprovals(backend, 'freeze')

    await expect(runRegisteredRecovery(backend, 'freeze', 'registered'))
      .resolves.toMatchObject({ action: 'freeze', lifecycle: 'consumed' })
    const account = await backend.run(async (ctx) => await getAccount(ctx))
    expect(account).toMatchObject({ lifecycle: 'suspended', revision: 13, updatedAt: NOW })
  })

  it('keeps registered inspect-secret-canary recovery side-effect free on a suspended account', async () => {
    mockRecoveryClock(RECOVERY_UUID.canary)
    const backend = createRecoveryDriverBackend()
    await seed(backend)
    await configureRegisteredAction(backend, 'inspect_secret_canary')
    await submitRegisteredApprovals(backend, 'inspect_secret_canary')

    await expect(runRegisteredRecovery(backend, 'inspect_secret_canary', 'registered'))
      .resolves.toMatchObject({ action: 'inspect_secret_canary', lifecycle: 'consumed' })
    const state = await backend.run(async (ctx) => ({
      account: await getAccount(ctx),
      grant: await getGrant(ctx),
    }))
    expect(state.account).toMatchObject({ lifecycle: 'suspended', revision: 12, updatedAt: 1_000 })
    expect(state.grant).toMatchObject({ lifecycle: 'active', generation: 4, revision: 5 })
  })

  it('rejects registered isolation with more than 64 active grants and rolls back every effect', async () => {
    mockRecoveryClock(RECOVERY_UUID.grantLimit)
    const backend = createRecoveryDriverBackend()
    await seed(backend)
    await seedTrustedApprovals(backend)
    await seedGrantBurst(backend, 64)

    await expect(runRegisteredRecovery(backend, 'isolate', 'grant-limit'))
      .rejects.toMatchObject({ code: 'recovery_approval_unavailable' })
    const state = await backend.run(async (ctx) => ({
      grants: await ctx.db.query('authorityDelegationGrants')
        .withIndex('by_accountRef_and_lifecycle', (query) => query
          .eq('accountRef', ACCOUNT)
          .eq('lifecycle', 'active'))
        .collect(),
      admissions: await ctx.db.query('recoveryBreakGlassAdmissions').collect(),
      approvals: await ctx.db.query('recoveryBreakGlassApprovals').collect(),
    }))
    expect(state.grants).toHaveLength(65)
    expect(state.admissions).toHaveLength(0)
    expect(state.approvals.map(({ lifecycle }) => lifecycle)).toEqual(['verified', 'verified'])
  })

  it.each([
    ['freeze', 'suspended', '61'],
    ['isolate', 'active', '62'],
  ] as const)(
    'revalidates a persisted %s replay against the current %s account before applying effects',
    async (action, lifecycle, suffix) => {
      mockRecoveryClock()
      const backend = createRecoveryDriverBackend()
      await seed(backend)
      await patchAccountLifecycle(backend, lifecycle)
      await seedPersistedReplay(backend, action, suffix)

      await expect(runRegisteredRecovery(backend, action, suffix))
        .rejects.toMatchObject({ code: 'recovery_account_facts_invalid' })
      const account = await backend.run(async (ctx) => await getAccount(ctx))
      expect(account).toMatchObject({ lifecycle, revision: 12, updatedAt: 1_000 })
    },
  )

  it('rejects atomic persistence conflicts without partial approval replacement', async () => {
    mockRecoveryClock(RECOVERY_UUID.conflict)
    const backend = createRecoveryDriverBackend()
    await seed(backend)
    await seedTrustedApprovals(backend)
    const admitted = await runAuthorizeHandler(backend)

    const refs = {
      duplicate: recoveryAdmissionRef('rcv_00000000000040008000000000000051'),
      missing: recoveryAdmissionRef('rcv_00000000000040008000000000000052'),
      cardinality: recoveryAdmissionRef('rcv_00000000000040008000000000000053'),
      membership: recoveryAdmissionRef('rcv_00000000000040008000000000000054'),
    } as const
    await withPersistence(backend, async (session) => {
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

      const atomicCases = [
        {
          code: 'recovery_admission_ref_conflict',
          payload: {
            admissionInsert: admitted,
            approvalReplacements: [],
          },
        },
        {
          code: 'recovery_approval_duplicate',
          payload: (() => {
            const duplicate = changedConsumed(consumedOne, refs.duplicate)
            return {
              admissionInsert: changedAdmission(refs.duplicate),
              approvalReplacements: [replacement(duplicate), replacement(duplicate)],
            }
          })(),
        },
        {
          code: 'recovery_approval_unavailable',
          payload: {
            admissionInsert: changedAdmission(refs.missing, {
              approvalRefs: ['approval:missing', 'approval:two'],
              verificationRefs: [
                'verification:approval:missing',
                'verification:approval:two',
              ],
            }),
            approvalReplacements: [
              replacement({
                ...approval('approval:missing', OPERATOR_ONE),
                lifecycle: 'consumed',
                consumedAt: NOW,
                consumedByAdmissionRef: refs.missing,
              }),
              replacement(changedConsumed(consumedTwo, refs.missing)),
            ],
          },
        },
        {
          code: 'recovery_approval_unavailable',
          payload: {
            admissionInsert: changedAdmission(refs.cardinality),
            approvalReplacements: [],
          },
        },
        {
          code: 'recovery_approval_unavailable',
          payload: {
            admissionInsert: changedAdmission(refs.membership, {
              approvalRefs: ['approval:one', 'approval:unknown'],
              verificationRefs: ['verification:approval:one', 'verification:approval:unknown'],
            }),
            approvalReplacements: [
              replacement(changedConsumed(consumedOne, refs.membership)),
              replacement(changedConsumed(consumedTwo, refs.membership)),
            ],
          },
        },
      ] as const

      for (const { code, payload } of atomicCases) {
        await expect(session.commitRecoveryAtomically(payload)).rejects.toMatchObject({ code })
      }
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

  it('rejects unresolvable recovery principals and accounts through the registered production composition with zero effects', async () => {
    mockRecoveryClock()

    const missingPrincipalBackend = createRecoveryDriverBackend()
    await seed(missingPrincipalBackend)
    await missingPrincipalBackend.run(async (ctx) => {
      const operator = await ctx.db.query('principals')
        .withIndex('by_principalRef', (query) => query.eq('principalRef', OPERATOR_ONE))
        .unique()
      if (operator === null) throw new Error('seeded_operator_missing')
      await ctx.db.delete(operator._id)
    })
    const beforeMissingPrincipal = await queryConsequenceState(missingPrincipalBackend, 'production')
    await expect(missingPrincipalBackend.withIdentity(identity('41')).mutation(
      internal.recoveryBreakGlass.submitRecoveryApproval,
      { approvalRef: 'approval:missing-principal', accountRef: ACCOUNT, action: 'isolate' },
    )).rejects.toMatchObject({ code: 'recovery_approval_unavailable' })
    await expect(queryConsequenceState(missingPrincipalBackend, 'production')).resolves.toEqual(beforeMissingPrincipal)

    const missingAccountBackend = createRecoveryDriverBackend()
    await seed(missingAccountBackend)
    await missingAccountBackend.run(async (ctx) => {
      const account = await getAccount(ctx)
      if (account === null) throw new Error('seeded_account_missing')
      await ctx.db.delete(account._id)
    })
    const beforeMissingAccount = await queryConsequenceState(missingAccountBackend, 'production')
    await expect(missingAccountBackend.withIdentity(identity('41')).mutation(
      internal.recoveryBreakGlass.authorizeRecoveryOperation,
      registeredAuthorizePayload('isolate', 'missing-account', {
        correlationRef: 'recovery:missing-account',
        idempotencyRef: 'recovery:missing-account',
      }),
    )).rejects.toMatchObject({ code: 'recovery_account_facts_invalid' })
    await expect(queryConsequenceState(missingAccountBackend, 'production')).resolves.toEqual(beforeMissingAccount)
  })

  it('rejects a conflicting recovery journal replay through the registered production composition with zero effects', async () => {
    mockRecoveryClock()
    const backend = createRecoveryDriverBackend()
    await seed(backend)
    await seedPersistedReplay(backend, 'isolate', '64')
    await submitRegisteredApprovals(backend, 'isolate')

    const before = await queryConsequenceState(backend, 'journal-replay')

    await expect(runRegisteredRecovery(backend, 'isolate', '64', {
      expectedGrantGeneration: 3,
      correlationRef: 'recovery:isolate',
    })).rejects.toMatchObject({ code: 'recovery_idempotency_conflict' })
    await expect(queryConsequenceState(backend, 'journal-replay')).resolves.toEqual(before)
    expect(before.account).toMatchObject({ lifecycle: 'suspended', revision: 12 })
    expect(before.grant).toMatchObject({ lifecycle: 'active', generation: 4, revision: 4 })
    expect(before.approvals.map(({ lifecycle }) => lifecycle)).toEqual(['verified', 'verified'])
    expect(before.admissions).toHaveLength(1)
    expect(before.snapshots).toHaveLength(0)
  })
})
