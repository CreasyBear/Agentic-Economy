import type { UserIdentity } from 'convex/server'

import { degradeBackend } from '@/lib/observability/degrade-backend'

import type { PrincipalRef } from '../../../../src/modules/principal-account/public'
import {
  ACCESS_FACT_QUERY_LIMIT,
  CLERK_ORGANIZATION_PROVIDER_NAMESPACE,
} from './constants'
import { clerkActiveOrganizationId, type InteractiveAccountSelectionState } from './clerk'
import { InteractiveAuthorityError } from './errors'
import type { AuthorityDb } from './shared'

async function resolveClosedWorkspaceActorAccountRef(
  db: AuthorityDb,
  canonicalPrincipalRef: PrincipalRef,
): Promise<string | null> {
  const closedAccounts = await db
    .query('accounts')
    .filter((filter) => filter.and(
      filter.eq(filter.field('lifecycle'), 'closed'),
      filter.eq(filter.field('lastAction.actorPrincipalRef'), canonicalPrincipalRef),
    ))
    .collect()
  if (closedAccounts.length !== 1) return null
  const [account] = closedAccounts
  return account?.accountRef ?? null
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
): Promise<Readonly<{
  activeAccountRef: string
  selectionState: InteractiveAccountSelectionState
}>> {
  const accounts = await collectAccessibleAccountRefs(db, canonicalPrincipalRef)
  if (accounts.length === 0) {
    const closedAccountRef = await resolveClosedWorkspaceActorAccountRef(db, canonicalPrincipalRef)
    if (closedAccountRef !== null) {
      return { activeAccountRef: closedAccountRef, selectionState: 'unique' }
    }
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
      && accounts.includes(orgBinding.accountRef)) {
      return { activeAccountRef: orgBinding.accountRef, selectionState: 'org_bound' }
    }
  }

  if (accounts.length === 1) {
    const [activeAccountRef] = accounts
    if (activeAccountRef === undefined) {
      throw new InteractiveAuthorityError('account_access_missing')
    }
    return { activeAccountRef, selectionState: 'unique' }
  }

  const candidates = await Promise.all(accounts.map(async (accountRef) => {
    const accountRows = await db
      .query('accounts')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', accountRef))
      .take(2)
    if (accountRows.length > 1) {
      throw new InteractiveAuthorityError('account_ambiguous')
    }
    const [account] = accountRows
    if (account === undefined) {
      throw new InteractiveAuthorityError('account_missing')
    }
    const activeOrgBindings = await db
      .query('accountExternalOrganizationBindings')
      .withIndex('by_accountRef_and_lifecycle', (query) =>
        query.eq('accountRef', accountRef).eq('lifecycle', 'active'))
      .take(1)
    return {
      accountRef,
      hasActiveOrgBinding: activeOrgBindings.length > 0,
      createdByPrincipal: account.creationActorPrincipalRef === canonicalPrincipalRef,
      createdAt: account.createdAt,
    }
  }))
  candidates.sort((left, right) =>
    Number(left.hasActiveOrgBinding) - Number(right.hasActiveOrgBinding)
    || Number(!left.createdByPrincipal) - Number(!right.createdByPrincipal)
    || left.createdAt - right.createdAt
    || (left.accountRef < right.accountRef ? -1 : left.accountRef > right.accountRef ? 1 : 0))

  degradeBackend(new Error('ambiguous_account'), undefined, {
    site: 'resolveActiveAccount',
    reason: 'invalid_response',
  })
  const [selectedAccount] = candidates
  if (selectedAccount === undefined) {
    throw new InteractiveAuthorityError('account_access_missing')
  }
  return { activeAccountRef: selectedAccount.accountRef, selectionState: 'personal' }
}
