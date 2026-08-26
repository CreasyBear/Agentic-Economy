import { convexTest, type TestConvex } from 'convex-test'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api } from '../../../convex/_generated/api'
import schema from '../../../convex/schema'
import {
  authorizeRecoveryHandler,
  createConvexRecoveryPersistence,
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
    await ctx.db.insert('memberships', {
      membershipRef: 'mem_00000000000040008000000000000042',
      accountRef: ACCOUNT,
      memberPrincipalRef: OPERATOR_TWO,
      lifecycle: 'active',
      revision: 1,
      createdAt: 900,
      createdBy: {
        actorPrincipalRef: OWNER,
        activeAccountRef: ACCOUNT,
        correlationRef: 'operator:add:two',
        idempotencyRef: 'operator:add:two',
      },
    })
    for (const [suffix, operator] of [['41', OPERATOR_ONE], ['42', OPERATOR_TWO]] as const) {
      const bindingRef = `ext_000000000000400080000000000000${suffix}`
      const credentialRef = `crd_000000000000400080000000000000${suffix}`
      await ctx.db.insert('externalIdentityBindings', {
        bindingRef,
        providerNamespace: 'clerk/user',
        providerIdentifier: `recovery|operator:${suffix}`,
        principalRef: operator,
        providerState: { kind: 'known', value: 'active' },
        lifecycle: 'active',
        credentialGeneration: 1,
        revision: 1,
        bindIdempotencyRef: `binding:${suffix}`,
        createdAt: 900,
        updatedAt: 900,
      })
      await ctx.db.insert('credentials', {
        credentialRef,
        bindingRef,
        principalRef: operator,
        type: 'provider_token',
        generation: 1,
        lifecycle: 'active',
        issueIdempotencyRef: `credential:${suffix}`,
        issuedAt: 900,
        expiresAt: 2_000,
        expiryMaterialization: {
          state: 'scheduled',
          credentialGeneration: 1,
          credentialExpiresAt: 2_000,
          scheduleNonce: `nonce:${suffix}`,
          scheduleRef: `schedule:${suffix}`,
          materializedAt: 900,
        },
        revision: 1,
        updatedAt: 900,
      })
    }
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

async function seedTrustedApprovals(
  backend: TestConvex<typeof schema>,
  action: VerifiedBreakGlassApproval['action'] = 'isolate',
) {
  await backend.run(async (ctx) => {
    await createConvexRecoveryPersistence(ctx).transact(async (session) => {
      await session.insertVerifiedApproval(approval('approval:one', OPERATOR_ONE, action))
      await session.insertVerifiedApproval(approval('approval:two', OPERATOR_TWO, action))
    })
  })
}

async function submitRegisteredApprovals(
  backend: TestConvex<typeof schema>,
  action: VerifiedBreakGlassApproval['action'],
) {
  await backend.withIdentity(identity('41')).mutation(api.recoveryBreakGlass.submitRecoveryApproval, {
    approvalRef: 'approval:one', accountRef: ACCOUNT, action,
  })
  await backend.withIdentity(identity('42')).mutation(api.recoveryBreakGlass.submitRecoveryApproval, {
    approvalRef: 'approval:two', accountRef: ACCOUNT, action,
  })
}

async function configureRegisteredAction(
  backend: TestConvex<typeof schema>,
  action: VerifiedBreakGlassApproval['action'],
) {
  await backend.run(async (ctx) => {
    const account = await ctx.db.query('accounts')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', ACCOUNT)).unique()
    const grant = await ctx.db.query('authorityDelegationGrants')
      .withIndex('by_grantRef', (query) => query.eq('grantRef', GRANT)).unique()
    if (account === null || grant === null) throw new Error('seed_rows_missing')
    await ctx.db.patch(account._id, { lifecycle: action === 'freeze' ? 'active' : 'suspended' })
    await ctx.db.patch(grant._id, { scopes: [`recovery:${action}`] })
  })
}

async function runRegisteredRecovery(
  backend: TestConvex<typeof schema>,
  action: VerifiedBreakGlassApproval['action'],
  suffix: string,
) {
  return await backend.withIdentity(identity('41')).mutation(
    api.recoveryBreakGlass.authorizeRecoveryOperation,
    {
      action,
      accountRef: ACCOUNT,
      grantRef: GRANT,
      expectedGrantGeneration: 4,
      approvalRefs: ['approval:one', 'approval:two'],
      correlationRef: `recovery:${action}`,
      idempotencyRef: `recovery:${action}:${suffix}`,
    },
  )
}

async function seedPersistedReplay(
  backend: TestConvex<typeof schema>,
  action: VerifiedBreakGlassApproval['action'],
  suffix: string,
) {
  await backend.run(async (ctx) => {
    await ctx.db.insert('recoveryBreakGlassAdmissions', {
      admissionRef: `rcv_000000000000400080000000000000${suffix}`,
      accountRef: ACCOUNT,
      subjectPrincipalRef: OWNER,
      operatorPrincipalRef: OPERATOR_ONE,
      action,
      recoveryPolicyKind: 'threshold',
      recoveryPolicyRevision: 7,
      frozenAccountRevision: 12,
      authoritySnapshotRef: `das_000000000000400080000000000000${suffix}`,
      grantRef: GRANT,
      grantGeneration: 4,
      approvalRefs: ['approval:one', 'approval:two'],
      verificationRefs: ['verification:approval:one', 'verification:approval:two'],
      availableAt: 1_000,
      admittedAt: NOW,
      expiresAt: 1_900,
      lifecycle: 'consumed',
      context: {
        actorPrincipalRef: OPERATOR_ONE,
        activeAccountRef: ACCOUNT,
        correlationRef: `recovery:${action}`,
        idempotencyRef: `recovery:${action}:${suffix}`,
      },
    })
  })
}

const identity = (suffix: '41' | '42') => ({
  subject: `operator:${suffix}`,
  issuer: 'https://recovery.test',
  tokenIdentifier: `recovery|operator:${suffix}`,
})

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
    await seedTrustedApprovals(backend)
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
    await seedTrustedApprovals(backend)
    await backend.run(async (ctx) => {
      await expect(createConvexRecoveryPersistence(ctx).transact(async (session) =>
        await session.insertVerifiedApproval({
          ...approval('approval:other', OPERATOR_TWO),
          verificationRef: 'verification:approval:one',
        }))).rejects.toMatchObject({ code: 'recovery_approval_duplicate' })
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

    await expect(backend.withIdentity(identity('41')).mutation(api.recoveryBreakGlass.submitRecoveryApproval, {
      approvalRef: 'approval:one', accountRef: ACCOUNT, action: 'isolate',
    })).resolves.toMatchObject({ lifecycle: 'verified' })
    await expect(backend.withIdentity(identity('42')).mutation(api.recoveryBreakGlass.submitRecoveryApproval, {
      approvalRef: 'approval:two', accountRef: ACCOUNT, action: 'isolate',
    })).resolves.toMatchObject({ lifecycle: 'verified' })

    const admitted = await backend.withIdentity(identity('41')).mutation(
      api.recoveryBreakGlass.authorizeRecoveryOperation,
      {
        action: 'isolate', accountRef: ACCOUNT, grantRef: GRANT,
        expectedGrantGeneration: 4, approvalRefs: ['approval:one', 'approval:two'],
        correlationRef: 'recovery:isolate', idempotencyRef: 'recovery:isolate:one',
      },
    )
    expect(admitted).toMatchObject({
      accountRef: ACCOUNT,
      lifecycle: 'consumed',
      context: { actorPrincipalRef: OPERATOR_ONE, activeAccountRef: ACCOUNT },
    })

    const revokedGrant = await backend.run(async (ctx) => await ctx.db.query('authorityDelegationGrants')
      .withIndex('by_grantRef', (query) => query.eq('grantRef', GRANT)).unique())
    expect(revokedGrant).toMatchObject({
      lifecycle: 'revoked',
      generation: 5,
      revision: 6,
      revokedAt: NOW,
      revokedBy: {
        actorPrincipalRef: OPERATOR_ONE,
        activeAccountRef: ACCOUNT,
        correlationRef: 'recovery:isolate',
        idempotencyRef: 'recovery:isolate:one',
      },
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
        const byVerification = await session.getApprovalByVerification(consumed?.verificationRef ?? '')
        expect(byVerification).toEqual(consumed)
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
    })
    await seedTrustedApprovals(backend, 'freeze')

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

  it('rejects a missing or invalid authenticated operator through the registered approval mutation', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    const backend = convexTest(schema, convexModules)
    await seed(backend)

    const intent = { approvalRef: 'approval:missing-operator', accountRef: ACCOUNT, action: 'isolate' as const }
    await expect(backend.mutation(api.recoveryBreakGlass.submitRecoveryApproval, intent))
      .rejects.toMatchObject({ code: 'recovery_approval_unavailable' })
    await expect(backend.withIdentity({
      subject: 'unknown',
      issuer: 'https://recovery.test',
      tokenIdentifier: 'recovery|operator:unknown',
    }).mutation(api.recoveryBreakGlass.submitRecoveryApproval, {
      ...intent,
      approvalRef: 'approval:unknown-operator',
    })).rejects.toMatchObject({ code: 'recovery_approval_unavailable' })

    await backend.run(async (ctx) => {
      const credential = await ctx.db.query('credentials')
        .withIndex('by_credentialRef', (query) => query
          .eq('credentialRef', 'crd_00000000000040008000000000000041'))
        .unique()
      if (credential === null || credential.expiryMaterialization === undefined) {
        throw new Error('seeded_credential_missing')
      }
      await ctx.db.patch(credential._id, {
        expiresAt: NOW,
        expiryMaterialization: {
          state: 'scheduled',
          credentialGeneration: credential.expiryMaterialization.credentialGeneration,
          credentialExpiresAt: NOW,
          scheduleNonce: credential.expiryMaterialization.scheduleNonce,
          ...(credential.expiryMaterialization.scheduleRef === undefined
            ? {}
            : { scheduleRef: credential.expiryMaterialization.scheduleRef }),
          materializedAt: credential.expiryMaterialization.materializedAt,
        },
      })
    })
    await expect(backend.withIdentity(identity('41')).mutation(
      api.recoveryBreakGlass.submitRecoveryApproval,
      { ...intent, approvalRef: 'approval:expired-operator' },
    )).rejects.toMatchObject({ code: 'recovery_approval_unavailable' })

    await expect(backend.run(async (ctx) => ctx.db.query('recoveryBreakGlassApprovals').collect()))
      .resolves.toHaveLength(0)
  })

  it('rejects an invalid delegation context with no active operator membership', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    const backend = convexTest(schema, convexModules)
    await seed(backend)
    await seedTrustedApprovals(backend)
    await backend.run(async (ctx) => {
      const membership = await ctx.db.query('memberships')
        .withIndex('by_accountRef_and_memberPrincipalRef_and_lifecycle', (query) => query
          .eq('accountRef', ACCOUNT)
          .eq('memberPrincipalRef', OPERATOR_ONE)
          .eq('lifecycle', 'active'))
        .unique()
      if (membership === null) throw new Error('seeded_membership_missing')
      await ctx.db.delete(membership._id)
    })

    await expect(backend.run(async (ctx) => await authorizeRecoveryHandler(
      ctx,
      recoveryRequest({ context: {
        ...recoveryRequest().context,
        idempotencyRef: 'recovery:delegation-context:missing-membership',
      } }),
    ))).rejects.toMatchObject({ code: 'recovery_approval_unavailable' })
    await expect(backend.run(async (ctx) => ctx.db.query('recoveryBreakGlassAdmissions').collect()))
      .resolves.toHaveLength(0)
  })

  it('applies a registered freeze exactly once to the current active account', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    vi.spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValue('00000000-0000-4000-8000-000000000046')
    const backend = convexTest(schema, convexModules)
    await seed(backend)
    await configureRegisteredAction(backend, 'freeze')
    await submitRegisteredApprovals(backend, 'freeze')

    await expect(runRegisteredRecovery(backend, 'freeze', 'registered'))
      .resolves.toMatchObject({ action: 'freeze', lifecycle: 'consumed' })
    const account = await backend.run(async (ctx) => await ctx.db.query('accounts')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', ACCOUNT)).unique())
    expect(account).toMatchObject({ lifecycle: 'suspended', revision: 13, updatedAt: NOW })
  })

  it('keeps registered inspect-secret-canary recovery side-effect free on a suspended account', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    vi.spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValue('00000000-0000-4000-8000-000000000047')
    const backend = convexTest(schema, convexModules)
    await seed(backend)
    await configureRegisteredAction(backend, 'inspect_secret_canary')
    await submitRegisteredApprovals(backend, 'inspect_secret_canary')

    await expect(runRegisteredRecovery(backend, 'inspect_secret_canary', 'registered'))
      .resolves.toMatchObject({ action: 'inspect_secret_canary', lifecycle: 'consumed' })
    const state = await backend.run(async (ctx) => ({
      account: await ctx.db.query('accounts')
        .withIndex('by_accountRef', (query) => query.eq('accountRef', ACCOUNT)).unique(),
      grant: await ctx.db.query('authorityDelegationGrants')
        .withIndex('by_grantRef', (query) => query.eq('grantRef', GRANT)).unique(),
    }))
    expect(state.account).toMatchObject({ lifecycle: 'suspended', revision: 12, updatedAt: 1_000 })
    expect(state.grant).toMatchObject({ lifecycle: 'active', generation: 4, revision: 5 })
  })

  it('rejects registered isolation with more than 64 active grants and rolls back every effect', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    vi.spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValue('00000000-0000-4000-8000-000000000048')
    const backend = convexTest(schema, convexModules)
    await seed(backend)
    await seedTrustedApprovals(backend)
    await backend.run(async (ctx) => {
      for (let index = 0; index < 64; index += 1) {
        const grantRef = delegationGrantRef(`grt_${(index + 100).toString(16).padStart(32, '0')}`)
        await ctx.db.insert('authorityDelegationGrants', {
          grantRef,
          accountRef: ACCOUNT,
          actorPrincipalRef: OPERATOR_ONE,
          subjectPrincipalRef: OPERATOR_ONE,
          scopes: ['recovery:isolate'],
          resourceRefs: [`account:${ACCOUNT}`],
          budgetLimit: 1,
          budgetUsed: 0,
          expiresAt: 1_900,
          generation: 1,
          revision: 1,
          lifecycle: 'active',
          createdAt: 900,
          createdBy: {
            actorPrincipalRef: OPERATOR_ONE,
            activeAccountRef: ACCOUNT,
            correlationRef: `grant:create:${index}`,
            idempotencyRef: `grant:create:${index}`,
          },
        })
      }
    })

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
      vi.spyOn(Date, 'now').mockReturnValue(NOW)
      const backend = convexTest(schema, convexModules)
      await seed(backend)
      await backend.run(async (ctx) => {
        const account = await ctx.db.query('accounts')
          .withIndex('by_accountRef', (query) => query.eq('accountRef', ACCOUNT)).unique()
        if (account === null) throw new Error('seeded_account_missing')
        await ctx.db.patch(account._id, { lifecycle })
      })
      await seedPersistedReplay(backend, action, suffix)

      await expect(runRegisteredRecovery(backend, action, suffix))
        .rejects.toMatchObject({ code: 'recovery_account_facts_invalid' })
      const account = await backend.run(async (ctx) => await ctx.db.query('accounts')
        .withIndex('by_accountRef', (query) => query.eq('accountRef', ACCOUNT)).unique())
      expect(account).toMatchObject({ lifecycle, revision: 12, updatedAt: 1_000 })
    },
  )

  it('rejects atomic persistence conflicts without partial approval replacement', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    vi.spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValue('00000000-0000-4000-8000-000000000045')
    const backend = convexTest(schema, convexModules)
    await seed(backend)
    await seedTrustedApprovals(backend)
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

  it('rejects unresolvable recovery principals and accounts through the registered production composition with zero effects', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)

    const consequenceState = async (backend: TestConvex<typeof schema>) => await backend.run(
      async (ctx) => ({
        accounts: await ctx.db.query('accounts').collect(),
        grants: await ctx.db.query('authorityDelegationGrants').collect(),
        approvals: await ctx.db.query('recoveryBreakGlassApprovals').collect(),
        admissions: await ctx.db.query('recoveryBreakGlassAdmissions').collect(),
        snapshots: await ctx.db.query('authorityDelegationSnapshots').collect(),
      }),
    )

    const missingPrincipalBackend = convexTest(schema, convexModules)
    await seed(missingPrincipalBackend)
    await missingPrincipalBackend.run(async (ctx) => {
      const operator = await ctx.db.query('principals')
        .withIndex('by_principalRef', (query) => query.eq('principalRef', OPERATOR_ONE))
        .unique()
      if (operator === null) throw new Error('seeded_operator_missing')
      await ctx.db.delete(operator._id)
    })
    const beforeMissingPrincipal = await consequenceState(missingPrincipalBackend)
    await expect(missingPrincipalBackend.withIdentity(identity('41')).mutation(
      api.recoveryBreakGlass.submitRecoveryApproval,
      { approvalRef: 'approval:missing-principal', accountRef: ACCOUNT, action: 'isolate' },
    )).rejects.toMatchObject({ code: 'recovery_approval_unavailable' })
    await expect(consequenceState(missingPrincipalBackend)).resolves.toEqual(beforeMissingPrincipal)

    const missingAccountBackend = convexTest(schema, convexModules)
    await seed(missingAccountBackend)
    await missingAccountBackend.run(async (ctx) => {
      const account = await ctx.db.query('accounts')
        .withIndex('by_accountRef', (query) => query.eq('accountRef', ACCOUNT))
        .unique()
      if (account === null) throw new Error('seeded_account_missing')
      await ctx.db.delete(account._id)
    })
    const beforeMissingAccount = await consequenceState(missingAccountBackend)
    await expect(missingAccountBackend.withIdentity(identity('41')).mutation(
      api.recoveryBreakGlass.authorizeRecoveryOperation,
      {
        action: 'isolate',
        accountRef: ACCOUNT,
        grantRef: GRANT,
        expectedGrantGeneration: 4,
        approvalRefs: ['approval:one', 'approval:two'],
        correlationRef: 'recovery:missing-account',
        idempotencyRef: 'recovery:missing-account',
      },
    )).rejects.toMatchObject({ code: 'recovery_account_facts_invalid' })
    await expect(consequenceState(missingAccountBackend)).resolves.toEqual(beforeMissingAccount)
  })

  it('rejects a conflicting recovery journal replay through the registered production composition with zero effects', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    const backend = convexTest(schema, convexModules)
    await seed(backend)
    await seedPersistedReplay(backend, 'isolate', '64')
    await submitRegisteredApprovals(backend, 'isolate')

    const consequenceState = async () => await backend.run(async (ctx) => ({
      account: await ctx.db.query('accounts')
        .withIndex('by_accountRef', (query) => query.eq('accountRef', ACCOUNT)).unique(),
      grant: await ctx.db.query('authorityDelegationGrants')
        .withIndex('by_grantRef', (query) => query.eq('grantRef', GRANT)).unique(),
      approvals: await ctx.db.query('recoveryBreakGlassApprovals').collect(),
      admissions: await ctx.db.query('recoveryBreakGlassAdmissions').collect(),
      snapshots: await ctx.db.query('authorityDelegationSnapshots').collect(),
    }))
    const before = await consequenceState()

    await expect(backend.withIdentity(identity('41')).mutation(
      api.recoveryBreakGlass.authorizeRecoveryOperation,
      {
        action: 'isolate',
        accountRef: ACCOUNT,
        grantRef: GRANT,
        expectedGrantGeneration: 3,
        approvalRefs: ['approval:one', 'approval:two'],
        correlationRef: 'recovery:isolate',
        idempotencyRef: 'recovery:isolate:64',
      },
    ))
      .rejects.toMatchObject({ code: 'recovery_idempotency_conflict' })
    await expect(consequenceState()).resolves.toEqual(before)
    expect(before.account).toMatchObject({ lifecycle: 'suspended', revision: 12 })
    expect(before.grant).toMatchObject({ lifecycle: 'active', generation: 4, revision: 4 })
    expect(before.approvals.map(({ lifecycle }) => lifecycle)).toEqual(['verified', 'verified'])
    expect(before.admissions).toHaveLength(1)
    expect(before.snapshots).toHaveLength(0)
  })
})
