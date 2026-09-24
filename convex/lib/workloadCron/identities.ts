import type { MutationCtx } from '../../_generated/server'
import { SYSTEM_WORKLOAD_ACCOUNT_REF, SYSTEM_WORKLOAD_MEMBERSHIP_REF, SYSTEM_WORKLOAD_OWNER_PRINCIPAL_REF, SYSTEM_WORKLOAD_OWNERSHIP_REF, SYSTEM_WORKLOAD_PRINCIPAL_REF } from './context'

type EnsurePlatformWorkloadIdentitiesResult = Readonly<{
  kind: 'ensured'
  created: string[]
}>

// Self-healing bootstrap keeps the cron fleet's fixed machine identity present.
export async function ensurePlatformWorkloadIdentitiesHandler(
  ctx: MutationCtx,
): Promise<EnsurePlatformWorkloadIdentitiesResult> {
  const now = Date.now()
  const created: string[] = []
  const action = Object.freeze({
    actorPrincipalRef: SYSTEM_WORKLOAD_OWNER_PRINCIPAL_REF,
    activeAccountRef: SYSTEM_WORKLOAD_ACCOUNT_REF,
    correlationRef: 'platform-identity:cron',
    idempotencyRef: 'platform-identity:cron',
  })
  const principal = await ctx.db.query('principals')
    .withIndex('by_principalRef', (query) => query.eq('principalRef', SYSTEM_WORKLOAD_PRINCIPAL_REF))
    .unique()
  if (principal === null) {
    await ctx.db.insert('principals', {
      principalRef: SYSTEM_WORKLOAD_PRINCIPAL_REF,
      kind: 'workload',
      displayName: 'System scheduled workload',
      lifecycle: 'active',
      revision: 1,
      createdAt: now,
      updatedAt: now,
    })
    created.push('principal')
  }
  const account = await ctx.db.query('accounts')
    .withIndex('by_accountRef', (query) => query.eq('accountRef', SYSTEM_WORKLOAD_ACCOUNT_REF))
    .unique()
  if (account === null) {
    await ctx.db.insert('accounts', {
      accountRef: SYSTEM_WORKLOAD_ACCOUNT_REF,
      displayName: 'System operations',
      lifecycle: 'active',
      recoveryPolicy: { kind: 'no_transfer', revision: 1 },
      creationActorPrincipalRef: SYSTEM_WORKLOAD_OWNER_PRINCIPAL_REF,
      creationIdempotencyRef: 'platform-identity:cron:account',
      initialOwnershipRef: SYSTEM_WORKLOAD_OWNERSHIP_REF,
      currentOwnershipRef: SYSTEM_WORKLOAD_OWNERSHIP_REF,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      lastAction: action,
    })
    created.push('account')
  }
  const ownership = await ctx.db.query('accountOwnerships')
    .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', SYSTEM_WORKLOAD_OWNERSHIP_REF))
    .unique()
  if (ownership === null) {
    await ctx.db.insert('accountOwnerships', {
      ownershipRef: SYSTEM_WORKLOAD_OWNERSHIP_REF,
      accountRef: SYSTEM_WORKLOAD_ACCOUNT_REF,
      ownerPrincipalRef: SYSTEM_WORKLOAD_OWNER_PRINCIPAL_REF,
      lifecycle: 'active',
      changeKind: 'creation',
      revision: 1,
      createdAt: now,
      createdBy: action,
    })
    created.push('ownership')
  }
  const membership = await ctx.db.query('memberships')
    .withIndex('by_membershipRef', (query) => query.eq('membershipRef', SYSTEM_WORKLOAD_MEMBERSHIP_REF))
    .unique()
  if (membership === null) {
    await ctx.db.insert('memberships', {
      membershipRef: SYSTEM_WORKLOAD_MEMBERSHIP_REF,
      accountRef: SYSTEM_WORKLOAD_ACCOUNT_REF,
      memberPrincipalRef: SYSTEM_WORKLOAD_PRINCIPAL_REF,
      lifecycle: 'active',
      revision: 1,
      createdAt: now,
      createdBy: action,
    })
    created.push('membership')
  }
  return { kind: 'ensured', created }
}
