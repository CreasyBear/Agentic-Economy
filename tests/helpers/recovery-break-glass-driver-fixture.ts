import { convexTest } from 'convex-test'
import { vi } from 'vitest'

import { api } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import { authorizeRecoveryHandler } from '../../convex/lib/authority/breakGlass/authorization'
import { createConvexRecoveryPersistence } from '../../convex/lib/authority/breakGlass/persistence'
import {
  accountRef,
  principalRef,
} from '../../src/modules/principal-account/public'
import { delegationGrantRef } from '../../src/modules/authority/delegation/public'
import type {
  DurableRecoverySession,
  VerifiedBreakGlassApproval,
} from '../../src/modules/authority/recovery/public'
import { convexModules } from './convex-fixtures'

export function createRecoveryDriverBackend() {
  return convexTest(schema, convexModules)
}

export type RecoveryDriverBackend = ReturnType<typeof createRecoveryDriverBackend>
type Ctx = Parameters<Parameters<RecoveryDriverBackend['run']>[0]>[0]

export const RECOVERY_DRIVER_NOW = 1_100
export const RECOVERY_DRIVER_ACCOUNT = accountRef('acc_00000000000040008000000000000041')
export const RECOVERY_DRIVER_OWNER = principalRef('prn_00000000000040008000000000000041')
export const RECOVERY_DRIVER_OPERATOR_ONE = principalRef('prn_00000000000040008000000000000042')
export const RECOVERY_DRIVER_OPERATOR_TWO = principalRef('prn_00000000000040008000000000000043')
export const RECOVERY_DRIVER_WORKLOAD = principalRef('prn_00000000000040008000000000000044')
export const RECOVERY_DRIVER_GRANT = delegationGrantRef('grt_00000000000040008000000000000041')
export const RECOVERY_DRIVER_APPROVAL_REFS = ['approval:one', 'approval:two'] as const

export const RECOVERY_DRIVER_UUID = {
  isolate: '00000000-0000-4000-8000-000000000041',
  hostile: '00000000-0000-4000-8000-000000000042',
  registered: '00000000-0000-4000-8000-000000000043',
  freeze: '00000000-0000-4000-8000-000000000044',
  conflict: '00000000-0000-4000-8000-000000000045',
  freezeRegistered: '00000000-0000-4000-8000-000000000046',
  canary: '00000000-0000-4000-8000-000000000047',
  grantLimit: '00000000-0000-4000-8000-000000000048',
  isolationMatrix: '00000000-0000-4000-8000-000000000049',
} as const

export const recoveryDriverActionContext = (
  actorPrincipalRef: typeof RECOVERY_DRIVER_OPERATOR_ONE | typeof RECOVERY_DRIVER_OWNER,
  correlationRef: string,
  idempotencyRef: string,
) => ({
  actorPrincipalRef,
  activeAccountRef: RECOVERY_DRIVER_ACCOUNT,
  correlationRef,
  idempotencyRef,
})

export function mockRecoveryDriverClock(randomUuid?: string) {
  vi.spyOn(Date, 'now').mockReturnValue(RECOVERY_DRIVER_NOW)
  if (randomUuid !== undefined) {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      randomUuid as `${string}-${string}-${string}-${string}-${string}`,
    )
  }
}

export function recoveryDriverApproval(
  approvalRef: string,
  operatorPrincipalRef: typeof RECOVERY_DRIVER_OPERATOR_ONE | typeof RECOVERY_DRIVER_OPERATOR_TWO,
  action: VerifiedBreakGlassApproval['action'] = 'isolate',
): VerifiedBreakGlassApproval {
  return Object.freeze({
    approvalRef,
    accountRef: RECOVERY_DRIVER_ACCOUNT,
    subjectPrincipalRef: RECOVERY_DRIVER_OWNER,
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

export const recoveryDriverRequest = (overrides: Record<string, unknown> = {}) => ({
  action: 'isolate' as const,
  accountRef: RECOVERY_DRIVER_ACCOUNT,
  subjectPrincipalRef: RECOVERY_DRIVER_OWNER,
  grantRef: RECOVERY_DRIVER_GRANT,
  expectedGrantGeneration: 4,
  approvalRefs: [...RECOVERY_DRIVER_APPROVAL_REFS],
  context: recoveryDriverActionContext(
    RECOVERY_DRIVER_OPERATOR_ONE,
    'recovery:isolate',
    'recovery:isolate:one',
  ),
  ...overrides,
})

export const recoveryDriverRequestContext = (
  contextOverrides: Partial<ReturnType<typeof recoveryDriverActionContext>>,
  overrides: Record<string, unknown> = {},
) => recoveryDriverRequest({
  ...overrides,
  context: { ...recoveryDriverRequest().context, ...contextOverrides },
})

export const recoveryDriverIdentity = (suffix: '41' | '42') => ({
  subject: `operator:${suffix}`,
  issuer: 'https://recovery.test',
  tokenIdentifier: `recovery|operator:${suffix}`,
})

export async function withRecoveryDriverPersistence(
  backend: RecoveryDriverBackend,
  run: (session: DurableRecoverySession) => Promise<void>,
) {
  await backend.run(async (ctx) => {
    await createConvexRecoveryPersistence(ctx).transact(async (session) => {
      await run(session)
    })
  })
}

export async function runRecoveryDriverAuthorizeHandler(
  backend: RecoveryDriverBackend,
  overrides: Record<string, unknown> = {},
) {
  return await backend.run(async (ctx) =>
    await authorizeRecoveryHandler(ctx, recoveryDriverRequest(overrides)),
  )
}

export async function getRecoveryDriverAccount(ctx: Ctx) {
  return await ctx.db.query('accounts')
    .withIndex('by_accountRef', (query) => query.eq('accountRef', RECOVERY_DRIVER_ACCOUNT))
    .unique()
}

export async function getRecoveryDriverGrant(ctx: Ctx) {
  return await ctx.db.query('authorityDelegationGrants')
    .withIndex('by_grantRef', (query) => query.eq('grantRef', RECOVERY_DRIVER_GRANT))
    .unique()
}

async function requireRecoveryDriverAccountAndGrant(ctx: Ctx) {
  const account = await getRecoveryDriverAccount(ctx)
  const grant = await getRecoveryDriverGrant(ctx)
  if (account === null || grant === null) throw new Error('seed_rows_missing')
  return { account, grant }
}

async function insertRecoveryDriverBindingAndCredential(
  ctx: Ctx,
  input: Readonly<{
    suffix: string
    principalRef:
      | typeof RECOVERY_DRIVER_OWNER
      | typeof RECOVERY_DRIVER_OPERATOR_ONE
      | typeof RECOVERY_DRIVER_OPERATOR_TWO
      | typeof RECOVERY_DRIVER_WORKLOAD
    tokenIdentifier: string
  }>,
) {
  const bindingRef = `ext_000000000000400080000000000000${input.suffix}`
  const credentialRef = `crd_000000000000400080000000000000${input.suffix}`
  await ctx.db.insert('externalIdentityBindings', {
    bindingRef,
    providerNamespace: 'clerk/user',
    providerIdentifier: input.tokenIdentifier,
    principalRef: input.principalRef,
    providerState: { kind: 'known', value: 'active' },
    lifecycle: 'active',
    credentialGeneration: 1,
    revision: 1,
    bindIdempotencyRef: `binding:${input.suffix}`,
    createdAt: 900,
    updatedAt: 900,
  })
  await ctx.db.insert('credentials', {
    credentialRef,
    bindingRef,
    principalRef: input.principalRef,
    type: 'provider_token',
    generation: 1,
    lifecycle: 'active',
    issueIdempotencyRef: `credential:${input.suffix}`,
    issuedAt: 900,
    expiresAt: 2_000,
    expiryMaterialization: {
      state: 'scheduled',
      credentialGeneration: 1,
      credentialExpiresAt: 2_000,
      scheduleNonce: `nonce:${input.suffix}`,
      scheduleRef: `schedule:${input.suffix}`,
      materializedAt: 900,
    },
    revision: 1,
    updatedAt: 900,
  })
}

export async function seedRecoveryDriver(backend: RecoveryDriverBackend) {
  await backend.run(async (ctx) => {
    for (const [principal, displayName] of [
      [RECOVERY_DRIVER_OWNER, 'Protected owner'],
      [RECOVERY_DRIVER_OPERATOR_ONE, 'Operator one'],
      [RECOVERY_DRIVER_OPERATOR_TWO, 'Operator two'],
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
      accountRef: RECOVERY_DRIVER_ACCOUNT,
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
      creationActorPrincipalRef: RECOVERY_DRIVER_OWNER,
      creationIdempotencyRef: 'account:create:recovery',
      initialOwnershipRef: 'own_00000000000040008000000000000041',
      currentOwnershipRef: 'own_00000000000040008000000000000041',
      revision: 12,
      createdAt: 800,
      updatedAt: 1_000,
      lastAction: recoveryDriverActionContext(RECOVERY_DRIVER_OWNER, 'account:suspend', 'account:suspend'),
    })
    await ctx.db.insert('accountOwnerships', {
      ownershipRef: 'own_00000000000040008000000000000041',
      accountRef: RECOVERY_DRIVER_ACCOUNT,
      ownerPrincipalRef: RECOVERY_DRIVER_OWNER,
      lifecycle: 'active',
      changeKind: 'creation',
      revision: 1,
      createdAt: 800,
      createdBy: recoveryDriverActionContext(RECOVERY_DRIVER_OWNER, 'account:create', 'account:create'),
    })
    for (const [suffix, operator, idempotencySuffix] of [
      ['41', RECOVERY_DRIVER_OPERATOR_ONE, ''],
      ['42', RECOVERY_DRIVER_OPERATOR_TWO, ':two'],
    ] as const) {
      await ctx.db.insert('memberships', {
        membershipRef: `mem_000000000000400080000000000000${suffix}`,
        accountRef: RECOVERY_DRIVER_ACCOUNT,
        memberPrincipalRef: operator,
        lifecycle: 'active',
        revision: 1,
        createdAt: 900,
        createdBy: recoveryDriverActionContext(
          RECOVERY_DRIVER_OWNER,
          `operator:add${idempotencySuffix}`,
          `operator:add${idempotencySuffix}`,
        ),
      })
      await insertRecoveryDriverBindingAndCredential(ctx, {
        suffix,
        principalRef: operator,
        tokenIdentifier: `recovery|operator:${suffix}`,
      })
    }
    await ctx.db.insert('authorityDelegationGrants', {
      grantRef: RECOVERY_DRIVER_GRANT,
      accountRef: RECOVERY_DRIVER_ACCOUNT,
      actorPrincipalRef: RECOVERY_DRIVER_OPERATOR_ONE,
      subjectPrincipalRef: RECOVERY_DRIVER_OPERATOR_ONE,
      scopes: ['recovery:isolate'],
      resourceRefs: [`account:${RECOVERY_DRIVER_ACCOUNT}`],
      budgetLimit: 1,
      budgetUsed: 0,
      expiresAt: 1_900,
      generation: 4,
      revision: 4,
      lifecycle: 'active',
      createdAt: 900,
      createdBy: recoveryDriverActionContext(
        RECOVERY_DRIVER_OPERATOR_ONE,
        'grant:create',
        'grant:create',
      ),
    })
  })
}

export async function seedRecoveryDriverTrustedApprovals(
  backend: RecoveryDriverBackend,
  action: VerifiedBreakGlassApproval['action'] = 'isolate',
) {
  await withRecoveryDriverPersistence(backend, async (session) => {
    await session.insertVerifiedApproval(recoveryDriverApproval('approval:one', RECOVERY_DRIVER_OPERATOR_ONE, action))
    await session.insertVerifiedApproval(recoveryDriverApproval('approval:two', RECOVERY_DRIVER_OPERATOR_TWO, action))
  })
}

export async function seedRecoveryDriverIdentity(
  backend: RecoveryDriverBackend,
  input: Readonly<{
    principal: typeof RECOVERY_DRIVER_OWNER | typeof RECOVERY_DRIVER_WORKLOAD
    principalKind: 'human' | 'workload'
    tokenIdentifier: string
    suffix: '43' | '44'
    includeMembership: boolean
  }>,
) {
  await backend.run(async (ctx) => {
    if (input.principal === RECOVERY_DRIVER_WORKLOAD) {
      await ctx.db.insert('principals', {
        principalRef: input.principal,
        kind: input.principalKind,
        displayName: 'Recovery workload',
        lifecycle: 'active',
        revision: 1,
        createdAt: 900,
        updatedAt: 900,
      })
    }
    await insertRecoveryDriverBindingAndCredential(ctx, {
      suffix: input.suffix,
      principalRef: input.principal,
      tokenIdentifier: input.tokenIdentifier,
    })
    if (input.includeMembership) {
      await ctx.db.insert('memberships', {
        membershipRef: `mem_000000000000400080000000000000${input.suffix}`,
        accountRef: RECOVERY_DRIVER_ACCOUNT,
        memberPrincipalRef: input.principal,
        lifecycle: 'active',
        revision: 1,
        createdAt: 900,
        createdBy: recoveryDriverActionContext(
          RECOVERY_DRIVER_OWNER,
          `operator:add:${input.suffix}`,
          `operator:add:${input.suffix}`,
        ),
      })
    }
  })
}

export async function submitRecoveryDriverRegisteredApprovals(
  backend: RecoveryDriverBackend,
  action: VerifiedBreakGlassApproval['action'],
) {
  for (const [suffix, approvalRef] of [['41', 'approval:one'], ['42', 'approval:two']] as const) {
    await backend.withIdentity(recoveryDriverIdentity(suffix)).mutation(
      api.recoveryBreakGlass.submitRecoveryApproval,
      { approvalRef, accountRef: RECOVERY_DRIVER_ACCOUNT, action },
    )
  }
}

export async function configureRecoveryDriverRegisteredAction(
  backend: RecoveryDriverBackend,
  action: VerifiedBreakGlassApproval['action'],
) {
  await backend.run(async (ctx) => {
    const { account, grant } = await requireRecoveryDriverAccountAndGrant(ctx)
    await ctx.db.patch(account._id, { lifecycle: action === 'freeze' ? 'active' : 'suspended' })
    await ctx.db.patch(grant._id, { scopes: [`recovery:${action}`] })
  })
}

export const recoveryDriverRegisteredAuthorizePayload = (
  action: VerifiedBreakGlassApproval['action'],
  suffix: string,
  overrides: Record<string, unknown> = {},
) => ({
  action,
  accountRef: RECOVERY_DRIVER_ACCOUNT,
  grantRef: RECOVERY_DRIVER_GRANT,
  expectedGrantGeneration: 4,
  approvalRefs: [...RECOVERY_DRIVER_APPROVAL_REFS],
  correlationRef: `recovery:${action}`,
  idempotencyRef: `recovery:${action}:${suffix}`,
  ...overrides,
})

export async function runRecoveryDriverRegisteredRecovery(
  backend: RecoveryDriverBackend,
  action: VerifiedBreakGlassApproval['action'],
  suffix: string,
  overrides: Record<string, unknown> = {},
) {
  return await backend.withIdentity(recoveryDriverIdentity('41')).mutation(
    api.recoveryBreakGlass.authorizeRecoveryOperation,
    recoveryDriverRegisteredAuthorizePayload(action, suffix, overrides),
  )
}

export async function seedRecoveryDriverPersistedReplay(
  backend: RecoveryDriverBackend,
  action: VerifiedBreakGlassApproval['action'],
  suffix: string,
) {
  await backend.run(async (ctx) => {
    await ctx.db.insert('recoveryBreakGlassAdmissions', {
      admissionRef: `rcv_000000000000400080000000000000${suffix}`,
      accountRef: RECOVERY_DRIVER_ACCOUNT,
      subjectPrincipalRef: RECOVERY_DRIVER_OWNER,
      operatorPrincipalRef: RECOVERY_DRIVER_OPERATOR_ONE,
      action,
      recoveryPolicyKind: 'threshold',
      recoveryPolicyRevision: 7,
      frozenAccountRevision: 12,
      authoritySnapshotRef: `das_000000000000400080000000000000${suffix}`,
      grantRef: RECOVERY_DRIVER_GRANT,
      grantGeneration: 4,
      approvalRefs: [...RECOVERY_DRIVER_APPROVAL_REFS],
      verificationRefs: ['verification:approval:one', 'verification:approval:two'],
      availableAt: 1_000,
      admittedAt: RECOVERY_DRIVER_NOW,
      expiresAt: 1_900,
      lifecycle: 'consumed',
      context: recoveryDriverActionContext(
        RECOVERY_DRIVER_OPERATOR_ONE,
        `recovery:${action}`,
        `recovery:${action}:${suffix}`,
      ),
    })
  })
}

export async function queryRecoveryDriverAdmissions(backend: RecoveryDriverBackend) {
  return await backend.run(async (ctx) => await ctx.db.query('recoveryBreakGlassAdmissions').collect())
}

export async function queryRecoveryDriverApprovalLifecycles(backend: RecoveryDriverBackend) {
  return await backend.run(async (ctx) =>
    (await ctx.db.query('recoveryBreakGlassApprovals').collect()).map(({ lifecycle }) => lifecycle),
  )
}

export async function queryRecoveryDriverConsequenceState(
  backend: RecoveryDriverBackend,
  mode: 'production' | 'isolation-matrix' | 'journal-replay',
) {
  return await backend.run(async (ctx) => {
    const shared = {
      grants: await ctx.db.query('authorityDelegationGrants').collect(),
      approvals: await ctx.db.query('recoveryBreakGlassApprovals').collect(),
      admissions: await ctx.db.query('recoveryBreakGlassAdmissions').collect(),
      snapshots: await ctx.db.query('authorityDelegationSnapshots').collect(),
    }
    if (mode === 'production') {
      return { accounts: await ctx.db.query('accounts').collect(), ...shared }
    }
    if (mode === 'isolation-matrix') {
      return { account: await ctx.db.query('accounts').collect(), ...shared }
    }
    return {
      account: await getRecoveryDriverAccount(ctx),
      grant: await getRecoveryDriverGrant(ctx),
      approvals: shared.approvals,
      admissions: shared.admissions,
      snapshots: shared.snapshots,
    }
  })
}

export async function corruptRecoveryDriverAccountFacts(
  backend: RecoveryDriverBackend,
  corruption: 'missing-account' | 'empty-ownership-ref' | 'missing-ownership',
) {
  await backend.run(async (ctx) => {
    const account = await getRecoveryDriverAccount(ctx)
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
}

export async function patchRecoveryDriverAccountLifecycle(
  backend: RecoveryDriverBackend,
  lifecycle: 'active' | 'suspended',
) {
  await backend.run(async (ctx) => {
    const account = await getRecoveryDriverAccount(ctx)
    if (account === null) throw new Error('seeded_account_missing')
    await ctx.db.patch(account._id, { lifecycle })
  })
}

export async function removeRecoveryDriverOperatorOneMembership(backend: RecoveryDriverBackend) {
  await backend.run(async (ctx) => {
    const membership = await ctx.db.query('memberships')
      .withIndex('by_accountRef_and_memberPrincipalRef_and_lifecycle', (query) => query
        .eq('accountRef', RECOVERY_DRIVER_ACCOUNT)
        .eq('memberPrincipalRef', RECOVERY_DRIVER_OPERATOR_ONE)
        .eq('lifecycle', 'active'))
      .unique()
    if (membership === null) throw new Error('seeded_membership_missing')
    await ctx.db.delete(membership._id)
  })
}

export async function expireRecoveryDriverOperatorOneCredential(backend: RecoveryDriverBackend) {
  await backend.run(async (ctx) => {
    const credential = await ctx.db.query('credentials')
      .withIndex('by_credentialRef', (query) => query
        .eq('credentialRef', 'crd_00000000000040008000000000000041'))
      .unique()
    if (credential === null || credential.expiryMaterialization === undefined) {
      throw new Error('seeded_credential_missing')
    }
    await ctx.db.patch(credential._id, {
      expiresAt: RECOVERY_DRIVER_NOW,
      expiryMaterialization: {
        state: 'scheduled',
        credentialGeneration: credential.expiryMaterialization.credentialGeneration,
        credentialExpiresAt: RECOVERY_DRIVER_NOW,
        scheduleNonce: credential.expiryMaterialization.scheduleNonce,
        ...(credential.expiryMaterialization.scheduleRef === undefined
          ? {}
          : { scheduleRef: credential.expiryMaterialization.scheduleRef }),
        materializedAt: credential.expiryMaterialization.materializedAt,
      },
    })
  })
}

export async function seedRecoveryDriverGrantBurst(backend: RecoveryDriverBackend, count: number) {
  await backend.run(async (ctx) => {
    for (let index = 0; index < count; index += 1) {
      const grantRef = delegationGrantRef(`grt_${(index + 100).toString(16).padStart(32, '0')}`)
      await ctx.db.insert('authorityDelegationGrants', {
        grantRef,
        accountRef: RECOVERY_DRIVER_ACCOUNT,
        actorPrincipalRef: RECOVERY_DRIVER_OPERATOR_ONE,
        subjectPrincipalRef: RECOVERY_DRIVER_OPERATOR_ONE,
        scopes: ['recovery:isolate'],
        resourceRefs: [`account:${RECOVERY_DRIVER_ACCOUNT}`],
        budgetLimit: 1,
        budgetUsed: 0,
        expiresAt: 1_900,
        generation: 1,
        revision: 1,
        lifecycle: 'active',
        createdAt: 900,
        createdBy: recoveryDriverActionContext(
          RECOVERY_DRIVER_OPERATOR_ONE,
          `grant:create:${index}`,
          `grant:create:${index}`,
        ),
      })
    }
  })
}

export const RECOVERY_DRIVER_ISOLATION_SETUP = {
  owner: (backend: RecoveryDriverBackend) => seedRecoveryDriverIdentity(backend, {
    principal: RECOVERY_DRIVER_OWNER,
    principalKind: 'human',
    tokenIdentifier: 'recovery|owner',
    suffix: '43',
    includeMembership: false,
  }),
  workload: (backend: RecoveryDriverBackend) => seedRecoveryDriverIdentity(backend, {
    principal: RECOVERY_DRIVER_WORKLOAD,
    principalKind: 'workload',
    tokenIdentifier: 'recovery|workload',
    suffix: '44',
    includeMembership: true,
  }),
} as const
