import type { MutationCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'
import { MARKET_TOOLS_CALL_SCOPE } from '../../../../src/modules/agent-access/contract'
import { DELEGATION_MAX_ANCESTRY_GRANTS } from '../../../../src/modules/authority/delegation/public'

export const allAuthorityFacts = (facts: readonly boolean[]): boolean =>
  facts.every(Boolean)

export async function currentCallDelegationAncestryIsValid(
  ctx: Pick<MutationCtx, 'db'>,
  input: Readonly<{
    leafGrantRef: string
    expectedGeneration: number
    accountRef: string
    principalRef: string
    toolRef: string
    now: number
  }>,
): Promise<boolean> {
  const reverse: DelegationGrantRow[] = []
  const visited = new Set<string>()
  let nextRef: string | undefined = input.leafGrantRef
  while (nextRef !== undefined) {
    if (reverse.length >= DELEGATION_MAX_ANCESTRY_GRANTS || visited.has(nextRef)) return false
    visited.add(nextRef)
    const row = await ctx.db
      .query('authorityDelegationGrants')
      .withIndex('by_grantRef', (query) => query.eq('grantRef', nextRef as string))
      .unique()
    if (row === null || !delegationGrantRowIsCurrent(row, nextRef, input)) {
      return false
    }
    reverse.push(row)
    nextRef = row.parentGrantRef
  }
  const ancestry = reverse.reverse()
  const root = ancestry[0]
  const leaf = ancestry[ancestry.length - 1]
  if (root === undefined || leaf === undefined || !delegationLeafIsCurrent(leaf, input)) {
    return false
  }
  const [rootPrincipal, rootAccount, rootMembership] = await Promise.all([
    ctx.db
      .query('principals')
      .withIndex('by_principalRef', (query) =>
        query.eq('principalRef', root.actorPrincipalRef),
      )
      .unique(),
    ctx.db
      .query('accounts')
      .withIndex('by_accountRef', (query) =>
        query.eq('accountRef', input.accountRef),
      )
      .unique(),
    ctx.db
      .query('memberships')
      .withIndex(
        'by_accountRef_and_memberPrincipalRef_and_lifecycle',
        (query) =>
          query
            .eq('accountRef', input.accountRef)
            .eq('memberPrincipalRef', root.actorPrincipalRef)
            .eq('lifecycle', 'active'),
      )
      .unique(),
  ])
  const rootOwnership = rootAccount === null
    ? null
    : await ctx.db
        .query('accountOwnerships')
        .withIndex('by_ownershipRef', (query) =>
          query.eq('ownershipRef', rootAccount.currentOwnershipRef),
        )
        .unique()
  if (!delegationRootIsCurrent({
    root,
    rootPrincipal,
    rootAccount,
    rootMembership,
    rootOwnership,
    accountRef: input.accountRef,
  })) {
    return false
  }
  for (let index = 1; index < ancestry.length; index += 1) {
    const parent = ancestry[index - 1]
    const child = ancestry[index]
    if (parent === undefined || child === undefined || !delegationEdgeIsCurrent(parent, child)) {
      return false
    }
  }
  return true
}

type DelegationGrantRow = Doc<'authorityDelegationGrants'>

function delegationGrantRowIsCurrent(
  row: DelegationGrantRow,
  expectedRef: string,
  input: Readonly<{ accountRef: string; now: number }>,
): boolean {
  return allAuthorityFacts([
    row.grantRef === expectedRef,
    row.accountRef === input.accountRef,
    row.lifecycle === 'active',
    row.expiresAt > input.now,
    Number.isSafeInteger(row.generation),
    row.generation >= 1,
    Number.isSafeInteger(row.budgetLimit),
    row.budgetLimit >= 1,
    row.budgetUsed >= 0,
    row.budgetUsed <= row.budgetLimit,
    new Set(row.scopes).size === row.scopes.length,
    new Set(row.resourceRefs).size === row.resourceRefs.length,
  ])
}

function delegationLeafIsCurrent(
  leaf: DelegationGrantRow,
  input: Readonly<{
    leafGrantRef: string
    expectedGeneration: number
    principalRef: string
    toolRef: string
  }>,
): boolean {
  return allAuthorityFacts([
    leaf.grantRef === input.leafGrantRef,
    leaf.generation === input.expectedGeneration,
    leaf.subjectPrincipalRef === input.principalRef,
    leaf.scopes.includes(MARKET_TOOLS_CALL_SCOPE),
    leaf.resourceRefs.includes('*') || leaf.resourceRefs.includes(input.toolRef),
  ])
}

function delegationRootIsCurrent(input: Readonly<{
  root: DelegationGrantRow
  rootPrincipal: Doc<'principals'> | null
  rootAccount: Doc<'accounts'> | null
  rootMembership: Doc<'memberships'> | null
  rootOwnership: Doc<'accountOwnerships'> | null
  accountRef: string
}>): boolean {
  const {
    root,
    rootPrincipal,
    rootAccount,
    rootMembership,
    rootOwnership,
    accountRef,
  } = input
  if (rootPrincipal === null || rootAccount === null) return false
  const membershipIsCurrent = rootMembership !== null && allAuthorityFacts([
    rootMembership.accountRef === accountRef,
    rootMembership.memberPrincipalRef === root.actorPrincipalRef,
    rootMembership.lifecycle === 'active',
  ])
  const ownershipIsCurrent = rootOwnership !== null && allAuthorityFacts([
    rootOwnership.accountRef === accountRef,
    rootOwnership.ownerPrincipalRef === root.actorPrincipalRef,
    rootOwnership.lifecycle === 'active',
  ])
  return allAuthorityFacts([
    rootPrincipal.principalRef === root.actorPrincipalRef,
    rootPrincipal.lifecycle === 'active',
    rootAccount.lifecycle === 'active',
    membershipIsCurrent || ownershipIsCurrent,
  ])
}

function delegationEdgeIsCurrent(
  parent: DelegationGrantRow,
  child: DelegationGrantRow,
): boolean {
  return allAuthorityFacts([
    child.parentGrantRef === parent.grantRef,
    child.parentGeneration === parent.generation,
    child.actorPrincipalRef === parent.subjectPrincipalRef,
    child.createdAt >= parent.createdAt,
    child.expiresAt < parent.expiresAt,
    child.budgetLimit <= parent.budgetLimit,
    authoritySubset(child.scopes, parent.scopes),
    authoritySubset(child.resourceRefs, parent.resourceRefs),
  ])
}

function authoritySubset(
  requested: readonly string[],
  permitted: readonly string[],
): boolean {
  if (permitted.includes('*')) return true
  const allowed = new Set(permitted)
  return requested.every((value) => allowed.has(value))
}
