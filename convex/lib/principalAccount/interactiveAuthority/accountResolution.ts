import type { UserIdentity } from 'convex/server'

import type { PrincipalRef } from '../../../../src/modules/principal-account/public'
import {
  ACCESS_FACT_QUERY_LIMIT,
  CLERK_ORGANIZATION_PROVIDER_NAMESPACE,
} from './constants'
import { clerkActiveOrganizationId } from './clerk'
import { InteractiveAuthorityError } from './errors'
import type { AuthorityDb } from './shared'

/** The one Account a principal last acted on after it was closed, or null when that is ambiguous. */
export async function resolveClosedWorkspaceActorAccountRef(
  db: AuthorityDb,
  canonicalPrincipalRef: PrincipalRef,
): Promise<string | null> {
  const closedAccounts = await db
    .query('accounts')
    .withIndex('by_lastAction_actorPrincipalRef_and_lifecycle', (query) => query
      .eq('lastAction.actorPrincipalRef', canonicalPrincipalRef)
      .eq('lifecycle', 'closed'))
    .take(2)
  const [account] = closedAccounts
  return closedAccounts.length === 1 ? account?.accountRef ?? null : null
}

async function collectAccessibleAccountRefs(
  db: AuthorityDb,
  canonicalPrincipalRef: PrincipalRef,
): Promise<string[]> {
  const ownerships = await db
    .query('accountOwnerships')
    .withIndex('by_ownerPrincipalRef_and_lifecycle', (query) =>
      query.eq('ownerPrincipalRef', canonicalPrincipalRef).eq('lifecycle', 'active'))
    .take(ACCESS_FACT_QUERY_LIMIT)
  const memberships = await db
    .query('memberships')
    .withIndex('by_memberPrincipalRef_and_lifecycle', (query) =>
      query.eq('memberPrincipalRef', canonicalPrincipalRef).eq('lifecycle', 'active'))
    .take(ACCESS_FACT_QUERY_LIMIT)
  return Array.from(new Set([
    ...ownerships.map((row) => row.accountRef),
    ...memberships.map((row) => row.accountRef),
  ]))
}

export async function resolveActiveAccountRefForPrincipal(
  db: AuthorityDb,
  canonicalPrincipalRef: PrincipalRef,
  identity: UserIdentity | undefined,
): Promise<Readonly<{ activeAccountRef: string }>> {
  const accountRefs = await collectAccessibleAccountRefs(db, canonicalPrincipalRef)
  if (accountRefs.length === 0) {
    const closedAccountRef = await resolveClosedWorkspaceActorAccountRef(db, canonicalPrincipalRef)
    if (closedAccountRef !== null) return { activeAccountRef: closedAccountRef }
    throw new InteractiveAuthorityError('account_access_missing')
  }

  const orgId = identity === undefined ? null : clerkActiveOrganizationId(identity)
  if (orgId !== null) {
    const orgBindings = await db
      .query('accountExternalOrganizationBindings')
      .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
        .eq('providerNamespace', CLERK_ORGANIZATION_PROVIDER_NAMESPACE)
        .eq('providerIdentifier', orgId))
      .take(2)
    if (orgBindings.length > 1) {
      throw new InteractiveAuthorityError('authority_fact_invalid')
    }
    const [orgBinding] = orgBindings
    if (orgBinding !== undefined
      && orgBinding.lifecycle === 'active'
      && accountRefs.includes(orgBinding.accountRef)) {
      return { activeAccountRef: orgBinding.accountRef }
    }
  }

  const [onlyAccountRef] = accountRefs
  if (accountRefs.length === 1 && onlyAccountRef !== undefined) return { activeAccountRef: onlyAccountRef }

  // Two or more Accounts and no usable organization claim: a total order, never an error.
  // Active Accounts win over suspended or pending ones; then personal before organization-bound,
  // then the Account this principal created, then the oldest.
  const accounts = await Promise.all(accountRefs.map(async (accountRef) => {
    const rows = await db
      .query('accounts')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', accountRef))
      .take(2)
    if (rows.length > 1) throw new InteractiveAuthorityError('account_ambiguous')
    const [account] = rows
    if (account === undefined) throw new InteractiveAuthorityError('account_missing')
    return account
  }))
  const active = accounts.filter((account) => account.lifecycle === 'active')
  const candidates = await Promise.all((active.length > 0 ? active : accounts).map(async (account) => {
    const activeOrgBindings = await db
      .query('accountExternalOrganizationBindings')
      .withIndex('by_accountRef_and_lifecycle', (query) =>
        query.eq('accountRef', account.accountRef).eq('lifecycle', 'active'))
      .take(1)
    return { account, hasActiveOrgBinding: activeOrgBindings.length > 0 }
  }))
  candidates.sort((left, right) =>
    Number(left.hasActiveOrgBinding) - Number(right.hasActiveOrgBinding)
    || Number(left.account.creationActorPrincipalRef !== canonicalPrincipalRef)
      - Number(right.account.creationActorPrincipalRef !== canonicalPrincipalRef)
    || left.account.createdAt - right.account.createdAt
    || (left.account.accountRef < right.account.accountRef ? -1 : left.account.accountRef > right.account.accountRef ? 1 : 0))
  const [selected] = candidates
  if (selected === undefined) throw new InteractiveAuthorityError('account_access_missing')
  return { activeAccountRef: selected.account.accountRef }
}
