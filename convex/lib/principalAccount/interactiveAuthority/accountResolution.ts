import type { UserIdentity } from 'convex/server'

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

type ActiveAccountResolutionMode = 'require' | 'nullable'

type ActiveAccountResolution<M extends ActiveAccountResolutionMode = ActiveAccountResolutionMode> = Readonly<{
  activeAccountRef: M extends 'require' ? string : string | null
  selectionState: InteractiveAccountSelectionState
}>

export async function resolveActiveAccountRefForPrincipal<M extends ActiveAccountResolutionMode>(
  db: AuthorityDb,
  canonicalPrincipalRef: PrincipalRef,
  identity: UserIdentity | undefined,
  mode: M,
): Promise<ActiveAccountResolution<M>> {
  const accounts = await collectAccessibleAccountRefs(db, canonicalPrincipalRef)
  if (accounts.length === 0) {
    const closedAccountRef = await resolveClosedWorkspaceActorAccountRef(db, canonicalPrincipalRef)
    if (closedAccountRef !== null) {
      return { activeAccountRef: closedAccountRef, selectionState: 'unique' } as ActiveAccountResolution<M>
    }
    throw new InteractiveAuthorityError('account_access_missing')
  }
  if (accounts.length === 1) {
    const firstAccount = accounts[0]
    if (firstAccount === undefined) {
      throw new InteractiveAuthorityError('account_access_missing')
    }
    return { activeAccountRef: firstAccount, selectionState: 'unique' } as ActiveAccountResolution<M>
  }

  const selectionRows = await db
    .query('interactiveSessionSelections')
    .withIndex('by_principalRef', (query) => query.eq('principalRef', canonicalPrincipalRef))
    .take(2)
  if (selectionRows.length > 1) {
    throw new InteractiveAuthorityError('authority_fact_invalid')
  }
  const [selectionRow] = selectionRows
  if (selectionRow !== undefined) {
    if (accounts.includes(selectionRow.activeAccountRef)) {
      return { activeAccountRef: selectionRow.activeAccountRef, selectionState: 'selected' } as ActiveAccountResolution<M>
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
      return { activeAccountRef: orgBinding.accountRef, selectionState: 'org_bound' } as ActiveAccountResolution<M>
    }
  }

  if (mode === 'nullable') {
    return { activeAccountRef: null, selectionState: 'selection_required' } as ActiveAccountResolution<M>
  }
  throw new InteractiveAuthorityError('active_account_selection_required')
}
