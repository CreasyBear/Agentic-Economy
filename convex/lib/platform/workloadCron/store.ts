import { accountRef, membershipRef, ownershipRef, principalRef, type Account, type AccountActionContext, type AccountOwnership, type AccountRef, type Membership, type Principal, type PrincipalRef, type WorkloadContextStore } from '@/modules/principal-account/public'
import type { Doc } from '../../../_generated/dataModel'
import type { QueryCtx } from '../../../_generated/server'

export class ConvexWorkloadContextStore implements WorkloadContextStore {
  constructor(private readonly ctx: Pick<QueryCtx, 'db'>) {}

  async getPrincipal(principalRef: PrincipalRef): Promise<Principal | undefined> {
    const row = await this.ctx.db
      .query('principals')
      .withIndex('by_principalRef', (query) => query.eq('principalRef', principalRef))
      .unique()
    return row === null ? undefined : principalFromRow(row)
  }

  async getAccount(accountRef: AccountRef): Promise<Account | undefined> {
    const row = await this.ctx.db
      .query('accounts')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', accountRef))
      .unique()
    return row === null ? undefined : accountFromRow(row)
  }

  async getOwnership(account: Account): Promise<AccountOwnership | undefined> {
    const row = await this.ctx.db
      .query('accountOwnerships')
      .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', account.currentOwnershipRef))
      .unique()
    return row === null ? undefined : ownershipFromRow(row)
  }

  async getActiveMembership(accountRef: AccountRef, principalRef: PrincipalRef): Promise<Membership | undefined> {
    const row = await this.ctx.db
      .query('memberships')
      .withIndex('by_accountRef_and_memberPrincipalRef_and_lifecycle', (query) => (
        query
          .eq('accountRef', accountRef)
          .eq('memberPrincipalRef', principalRef)
          .eq('lifecycle', 'active')
      ))
      .unique()
    return row === null ? undefined : membershipFromRow(row)
  }
}

export function actionContextFromRow(value: Doc<'accounts'>['lastAction']): AccountActionContext {
  return Object.freeze({
    actorPrincipalRef: principalRef(value.actorPrincipalRef),
    activeAccountRef: accountRef(value.activeAccountRef),
    correlationRef: value.correlationRef,
    idempotencyRef: value.idempotencyRef,
  })
}

export function principalFromRow(row: Doc<'principals'>): Principal {
  return Object.freeze({
    principalRef: principalRef(row.principalRef),
    kind: row.kind,
    displayName: row.displayName,
    lifecycle: row.lifecycle,
    revision: row.revision,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.mergedIntoPrincipalRef === undefined
      ? {}
      : { mergedIntoPrincipalRef: principalRef(row.mergedIntoPrincipalRef) }),
  })
}

export function accountFromRow(row: Doc<'accounts'>): Account {
  return Object.freeze({
    accountRef: accountRef(row.accountRef),
    displayName: row.displayName,
    lifecycle: row.lifecycle,
    recoveryPolicy: row.recoveryPolicy,
    creationActorPrincipalRef: principalRef(row.creationActorPrincipalRef),
    creationIdempotencyRef: row.creationIdempotencyRef,
    initialOwnershipRef: ownershipRef(row.initialOwnershipRef),
    currentOwnershipRef: ownershipRef(row.currentOwnershipRef),
    revision: row.revision,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastAction: actionContextFromRow(row.lastAction),
  })
}

export function ownershipFromRow(row: Doc<'accountOwnerships'>): AccountOwnership {
  return Object.freeze({
    ownershipRef: ownershipRef(row.ownershipRef),
    accountRef: accountRef(row.accountRef),
    ownerPrincipalRef: principalRef(row.ownerPrincipalRef),
    lifecycle: row.lifecycle,
    changeKind: row.changeKind,
    revision: row.revision,
    createdAt: row.createdAt,
    createdBy: actionContextFromRow(row.createdBy),
    ...(row.predecessorOwnershipRef === undefined
      ? {}
      : { predecessorOwnershipRef: ownershipRef(row.predecessorOwnershipRef) }),
    ...(row.successionAuthorizationRef === undefined
      ? {}
      : { successionAuthorizationRef: row.successionAuthorizationRef }),
    ...(row.endedAt === undefined ? {} : { endedAt: row.endedAt }),
    ...(row.endedBy === undefined ? {} : { endedBy: actionContextFromRow(row.endedBy) }),
    ...(row.successorOwnershipRef === undefined
      ? {}
      : { successorOwnershipRef: ownershipRef(row.successorOwnershipRef) }),
  })
}

export function membershipFromRow(row: Doc<'memberships'>): Membership {
  return Object.freeze({
    membershipRef: membershipRef(row.membershipRef),
    accountRef: accountRef(row.accountRef),
    memberPrincipalRef: principalRef(row.memberPrincipalRef),
    lifecycle: row.lifecycle,
    revision: row.revision,
    createdAt: row.createdAt,
    createdBy: actionContextFromRow(row.createdBy),
    ...(row.endedAt === undefined ? {} : { endedAt: row.endedAt }),
    ...(row.endedBy === undefined ? {} : { endedBy: actionContextFromRow(row.endedBy) }),
  })
}
