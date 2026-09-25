import type { UserIdentity } from 'convex/server'

import { accountRef } from '../../../../src/modules/principal-account/account/public'
import { principalRef } from '../../../../src/modules/principal-account/principal/public'
import type { Doc } from '../../../_generated/dataModel'
import { InteractiveAuthorityError, requireAccessFactForAccount, resolveActiveAccountRefForPrincipal } from '../../../interactiveAuthority'
import { requireAccountInteractiveHumanPrincipal, type WorkspaceDb } from './identity'

export type AccountActionContext = Readonly<{
  actorPrincipalRef: string
  activeAccountRef: string
  correlationRef: string
  idempotencyRef: string
}>

export async function resolveClosedWorkspaceActorAccountRef(
  db: WorkspaceDb,
  canonicalPrincipalRef: ReturnType<typeof principalRef>,
): Promise<ReturnType<typeof accountRef> | null> {
  const closedAccounts = await db
    .query('accounts')
    .filter((filter) => filter.and(
      filter.eq(filter.field('lifecycle'), 'closed'),
      filter.eq(filter.field('lastAction.actorPrincipalRef'), canonicalPrincipalRef),
    ))
    .collect()
  if (closedAccounts.length !== 1) return null
  const [row] = closedAccounts
  return row === undefined ? null : accountRef(row.accountRef)
}

export async function requireAuthenticatedAccountContext(
  db: WorkspaceDb,
  identity: UserIdentity,
): Promise<{
  principal: Doc<'principals'>
  canonicalPrincipalRef: ReturnType<typeof principalRef>
  canonicalAccountRef: ReturnType<typeof accountRef>
  account: Doc<'accounts'>
}> {
  const principal = await requireAccountInteractiveHumanPrincipal(db, identity)
  const canonicalPrincipalRef = principalRef(principal.principalRef)
  const { activeAccountRef } = await resolveActiveAccountRefForPrincipal(
    db,
    canonicalPrincipalRef,
    identity,
    'require',
  )
  const canonicalAccountRef = accountRef(activeAccountRef)
  await requireAccessFactForAccount(db, canonicalPrincipalRef, canonicalAccountRef)
  const account = await db
    .query('accounts')
    .withIndex('by_accountRef', (query) => query.eq('accountRef', canonicalAccountRef))
    .unique()
  if (account === null) throw new InteractiveAuthorityError('account_missing')
  if (account.lifecycle !== 'active') throw new InteractiveAuthorityError('account_inactive')
  return { principal, canonicalPrincipalRef, canonicalAccountRef, account }
}

export async function requireCurrentOwnership(
  db: WorkspaceDb,
  account: Doc<'accounts'>,
): Promise<Doc<'accountOwnerships'>> {
  const ownership = await db
    .query('accountOwnerships')
    .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', account.currentOwnershipRef))
    .unique()
  if (ownership === null
    || ownership.accountRef !== account.accountRef
    || ownership.lifecycle !== 'active') {
    throw new InteractiveAuthorityError('ownership_mismatch')
  }
  return ownership
}

export async function callerIsAccountOwner(
  db: WorkspaceDb,
  account: Doc<'accounts'>,
  canonicalPrincipalRef: ReturnType<typeof principalRef>,
): Promise<boolean> {
  const ownership = await db
    .query('accountOwnerships')
    .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', account.currentOwnershipRef))
    .unique()
  return ownership !== null
    && ownership.lifecycle === 'active'
    && ownership.ownerPrincipalRef === canonicalPrincipalRef
}
