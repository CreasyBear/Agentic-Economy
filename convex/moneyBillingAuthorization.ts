import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Doc } from './_generated/dataModel'
import { resolveBusinessActor } from './authz'
import { requireSourceWrite } from './sourceWriteAdmission'
import { MARKET_OPERATIONS_INVOKE_SCOPE } from '../src/modules/agent-access/contract'
import { DELEGATION_MAX_ANCESTRY_GRANTS } from '../src/modules/authority/delegation/public'

export type BillingSourceWriteArgs = {
  operationKey: string
  correlationId: string
  sourceWrite?: unknown
  sourceWriteRequest?: unknown
}

export function principalAllowed(
  identity: { tokenIdentifier?: string } | null,
  principalId: string,
): boolean {
  if (identity === null || identity.tokenIdentifier === undefined) return false
  return (
    identity.tokenIdentifier === principalId ||
    `clerk_api_key:${identity.tokenIdentifier}` === principalId
  )
}

export async function ownerPrincipalAllowed(
  identity: {
    issuer?: string
    subject?: string
    tokenIdentifier?: string
  } | null,
  principalId: string,
  loadPrincipal: () => Promise<Readonly<{
    ownerId: string
    ownerTokenIdentifier?: string
  }> | null>,
): Promise<boolean> {
  if (principalAllowed(identity, principalId)) return true
  if (identity?.subject === undefined) return false
  const principal = await loadPrincipal()
  if (principal === null || principal.ownerId !== identity.subject) return false
  if (principal.ownerTokenIdentifier === undefined) return true
  const identityRefs = [
    identity.tokenIdentifier,
    identity.issuer === undefined
      ? undefined
      : `${identity.issuer}|${identity.subject}`,
  ].filter((value): value is string => value !== undefined)
  return identityRefs.includes(principal.ownerTokenIdentifier)
}

/**
 * Rebinds legacy billing handlers to the current canonical account only after
 * the interactive Principal + Account authority has been resolved and the
 * durable agent principal has been rechecked. The adapted subject is a local
 * compatibility input for legacy handler comparisons; it never comes from a
 * request, credential locator, or provider identifier.
 */
export async function canonicalBillingPrincipalContext<
  Context extends MutationCtx | QueryCtx,
>(
  ctx: Context,
  principalId: string,
  credentialId?: string,
): Promise<Context | null> {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return null
  // Public queries are authorized by the materialized interactive credential
  // lifecycle resolved above. Reading wall-clock time inside a cached query
  // can freeze a once-valid result, so the agent's time window is rechecked
  // only by mutation consequence contexts. Lifecycle revocation remains a DB
  // fact and therefore denies both reads and consequences immediately.
  const consequenceNow = 'scheduler' in ctx ? Date.now() : undefined
  const [agentPrincipal, principal, account] = await Promise.all([
    ctx.db
      .query('agentAccessPrincipals')
      .withIndex('by_principalId', (query) => query.eq('principalId', principalId))
      .unique(),
    ctx.db
      .query('principals')
      .withIndex('by_principalRef', (query) => query.eq('principalRef', principalId))
      .unique(),
    ctx.db
      .query('accounts')
      .withIndex('by_accountRef', (query) =>
        query.eq('accountRef', actor.canonicalAccountRef),
      )
      .unique(),
  ])
  if (
    agentPrincipal === null ||
    agentPrincipal.principalId !== principalId ||
    agentPrincipal.ownerId !== actor.canonicalAccountRef ||
    (credentialId !== undefined && agentPrincipal.credentialId !== credentialId) ||
    agentPrincipal.lifecycle !== 'active' ||
    (consequenceNow !== undefined &&
      agentPrincipal.expiresAt !== undefined &&
      agentPrincipal.expiresAt <= consequenceNow) ||
    principal === null ||
    principal.principalRef !== principalId ||
    principal.kind !== 'agent' ||
    principal.lifecycle !== 'active' ||
    account === null ||
    account.accountRef !== actor.canonicalAccountRef ||
    account.lifecycle !== 'active'
  ) {
    return null
  }
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) return null
  return {
    ...ctx,
    auth: {
      ...ctx.auth,
      getUserIdentity: async () => ({
        ...identity,
        subject: actor.canonicalAccountRef,
      }),
    },
  } as Context
}

export async function canonicalBillingTopupContext<
  Context extends MutationCtx | QueryCtx,
>(
  ctx: Context,
  locator: Readonly<{
    commandRef?: string
    externalRef?: string
    idempotencyKey?: string
  }>,
): Promise<Context | null> {
  const commandRef = locator.commandRef
  const externalRef = locator.externalRef
  const command =
    commandRef !== undefined
      ? await ctx.db
          .query('moneyTopupCommands')
          .withIndex('by_commandRef', (query) =>
            query.eq('commandRef', commandRef),
          )
          .unique()
      : externalRef !== undefined
        ? await ctx.db
            .query('moneyTopupCommands')
            .withIndex('by_externalRef', (query) =>
              query.eq('externalRef', externalRef),
            )
            .unique()
        : null
  if (
    command === null ||
    (locator.idempotencyKey !== undefined &&
      command.idempotencyKey !== locator.idempotencyKey)
  ) {
    return null
  }
  return await canonicalBillingPrincipalContext(ctx, command.principalId)
}

export type PersistedInvocationAuthorityExpectation = Readonly<{
  invocationRef: string
  principalId?: string
  credentialId?: string
  grantRef?: string
  grantGeneration?: number
  operationRef?: string
  inputDigest?: string
  attemptRef?: string
}>

const allAuthorityFacts = (facts: readonly boolean[]): boolean =>
  facts.every(Boolean)

function optionalAuthorityExpectationMatches<T>(
  expected: T | undefined,
  actual: T,
): boolean {
  return expected === undefined || expected === actual
}

function invocationMatchesAuthorityExpectation(
  invocation: Doc<'capabilityOperationInvocations'>,
  expected: PersistedInvocationAuthorityExpectation,
): boolean {
  return allAuthorityFacts([
    invocation.invocationRef === expected.invocationRef,
    optionalAuthorityExpectationMatches(expected.principalId, invocation.principalId),
    optionalAuthorityExpectationMatches(expected.credentialId, invocation.credentialId),
    optionalAuthorityExpectationMatches(expected.grantRef, invocation.grantRef),
    optionalAuthorityExpectationMatches(expected.grantGeneration, invocation.grantGeneration),
    optionalAuthorityExpectationMatches(expected.operationRef, invocation.operationRef),
    optionalAuthorityExpectationMatches(expected.inputDigest, invocation.inputDigest),
    optionalAuthorityExpectationMatches(expected.attemptRef, invocation.attemptRef),
    invocation.state !== 'refused',
    invocation.state !== 'cancelled',
  ])
}

function bindingIsCurrent(
  binding: Doc<'externalIdentityBindings'> | null,
  invocation: Doc<'capabilityOperationInvocations'>,
): binding is Doc<'externalIdentityBindings'> {
  if (binding === null) return false
  return allAuthorityFacts([
    binding.principalRef === invocation.principalId,
    binding.lifecycle === 'active',
    binding.providerState.kind === 'known',
    binding.providerState.kind === 'known'
      && binding.providerState.value === 'active',
    Number.isSafeInteger(binding.credentialGeneration),
    binding.credentialGeneration >= 0,
  ])
}

function credentialIsCurrent(
  credential: Doc<'credentials'> | null,
  binding: Doc<'externalIdentityBindings'>,
  invocation: Doc<'capabilityOperationInvocations'>,
  now: number,
): boolean {
  if (credential === null) return false
  const expiry = credential.expiryMaterialization
  const expiryIsCurrent = expiry === undefined
    ? true
    : allAuthorityFacts([
        expiry.credentialGeneration === credential.generation,
        expiry.credentialExpiresAt === credential.expiresAt,
        expiry.state === 'scheduled',
      ])
  return allAuthorityFacts([
    credential.bindingRef === binding.bindingRef,
    credential.principalRef === invocation.principalId,
    credential.generation === binding.credentialGeneration,
    credential.type === 'api_key',
    credential.expiresAt > now,
    expiryIsCurrent,
  ])
}

function accountAuthorityIsCurrent(input: Readonly<{
  invocation: Doc<'capabilityOperationInvocations'>
  account: Doc<'accounts'> | null
  membership: Doc<'memberships'> | null
  ownership: Doc<'accountOwnerships'> | null
}>): boolean {
  const { invocation, account, membership, ownership } = input
  if (account === null) return false
  const membershipIsCurrent = membership !== null && allAuthorityFacts([
    membership.accountRef === invocation.ownerId,
    membership.memberPrincipalRef === invocation.principalId,
    membership.lifecycle === 'active',
  ])
  const ownershipIsCurrent = ownership !== null && allAuthorityFacts([
    ownership.accountRef === invocation.ownerId,
    ownership.ownerPrincipalRef === invocation.principalId,
    ownership.lifecycle === 'active',
  ])
  return allAuthorityFacts([
    account.accountRef === invocation.ownerId,
    account.lifecycle === 'active',
    membershipIsCurrent || ownershipIsCurrent,
  ])
}

function principalAuthorityIsCurrent(input: Readonly<{
  invocation: Doc<'capabilityOperationInvocations'>
  agentPrincipal: Doc<'agentAccessPrincipals'> | null
  principal: Doc<'principals'> | null
  now: number
}>): boolean {
  const { invocation, agentPrincipal, principal, now } = input
  if (agentPrincipal === null || principal === null) return false
  return allAuthorityFacts([
    agentPrincipal.principalId === invocation.principalId,
    agentPrincipal.ownerId === invocation.ownerId,
    agentPrincipal.credentialId === invocation.credentialId,
    agentPrincipal.applicationRef === invocation.applicationRef,
    agentPrincipal.environment === invocation.environment,
    agentPrincipal.grantGeneration === invocation.grantGeneration,
    agentPrincipal.policyDigest === invocation.policyDigest,
    agentPrincipal.scopes.includes(MARKET_OPERATIONS_INVOKE_SCOPE),
    agentPrincipal.lifecycle === 'active',
    agentPrincipal.expiresAt === undefined || agentPrincipal.expiresAt > now,
    principal.principalRef === invocation.principalId,
    principal.kind === 'agent',
    principal.lifecycle === 'active',
  ])
}

function grantAuthorityIsCurrent(
  grant: Doc<'agentAccessGrants'> | null,
  invocation: Doc<'capabilityOperationInvocations'>,
  now: number,
): boolean {
  if (grant === null) return false
  return allAuthorityFacts([
    grant.grantRef === invocation.grantRef,
    grant.principalId === invocation.principalId,
    grant.ownerId === invocation.ownerId,
    grant.credentialId === invocation.credentialId,
    grant.applicationRef === invocation.applicationRef,
    grant.environment === invocation.environment,
    grant.generation === invocation.grantGeneration,
    grant.policyDigest === invocation.policyDigest,
    grant.lifecycle === 'active',
    grant.expiresAt === invocation.grantExpiresAt,
    grant.expiresAt > now,
  ])
}

/**
 * Rechecks the durable invocation, agent, grant, Principal, and Account rows
 * at the instant a money consequence is applied. Caller-shaped fields are
 * accepted only as exact-match expectations against those durable rows.
 */
export async function persistedInvocationAuthorityIsCurrent(
  ctx: Pick<MutationCtx, 'db'>,
  expected: PersistedInvocationAuthorityExpectation,
): Promise<boolean> {
  const invocation = await ctx.db
    .query('capabilityOperationInvocations')
    .withIndex('by_invocationRef', (query) =>
      query.eq('invocationRef', expected.invocationRef),
    )
    .unique()
  if (invocation === null || !invocationMatchesAuthorityExpectation(invocation, expected)) {
    return false
  }
  const now = Date.now()
  const binding = await ctx.db
    .query('externalIdentityBindings')
    .withIndex('by_providerNamespace_and_providerIdentifier', (query) =>
      query
        .eq('providerNamespace', 'clerk/api-key')
        .eq('providerIdentifier', invocation.credentialId),
    )
    .unique()
  if (!bindingIsCurrent(binding, invocation)) {
    return false
  }
  const [agentPrincipal, principal, account, grant, credential] = await Promise.all([
    ctx.db
      .query('agentAccessPrincipals')
      .withIndex('by_principalId', (query) =>
        query.eq('principalId', invocation.principalId),
      )
      .unique(),
    ctx.db
      .query('principals')
      .withIndex('by_principalRef', (query) =>
        query.eq('principalRef', invocation.principalId),
      )
      .unique(),
    ctx.db
      .query('accounts')
      .withIndex('by_accountRef', (query) =>
        query.eq('accountRef', invocation.ownerId),
      )
      .unique(),
    ctx.db
      .query('agentAccessGrants')
      .withIndex('by_grantRef', (query) =>
        query.eq('grantRef', invocation.grantRef),
      )
      .unique(),
    ctx.db
      .query('credentials')
      .withIndex('by_bindingRef_and_generation_and_lifecycle', (query) =>
        query
          .eq('bindingRef', binding.bindingRef)
          .eq('generation', binding.credentialGeneration)
          .eq('lifecycle', 'active'),
      )
      .unique(),
  ])
  if (!credentialIsCurrent(credential, binding, invocation, now)) {
    return false
  }
  const [membership, ownership] = account === null
    ? [null, null]
    : await Promise.all([
        ctx.db
          .query('memberships')
          .withIndex(
            'by_accountRef_and_memberPrincipalRef_and_lifecycle',
            (query) =>
              query
                .eq('accountRef', account.accountRef)
                .eq('memberPrincipalRef', invocation.principalId)
                .eq('lifecycle', 'active'),
          )
          .unique(),
        ctx.db
          .query('accountOwnerships')
          .withIndex('by_ownershipRef', (query) =>
            query.eq('ownershipRef', account.currentOwnershipRef),
          )
          .unique(),
      ])
  if (!principalAuthorityIsCurrent({ invocation, agentPrincipal, principal, now })) {
    return false
  }
  if (!accountAuthorityIsCurrent({ invocation, account, membership, ownership })) {
    return false
  }
  if (!grantAuthorityIsCurrent(grant, invocation, now)) return false
  return await currentInvocationDelegationAncestryIsValid(ctx, {
      leafGrantRef: invocation.grantRef,
      expectedGeneration: invocation.grantGeneration,
      accountRef: invocation.ownerId,
      principalRef: invocation.principalId,
      operationRef: invocation.operationRef,
      now,
    })
}

async function currentInvocationDelegationAncestryIsValid(
  ctx: Pick<MutationCtx, 'db'>,
  input: Readonly<{
    leafGrantRef: string
    expectedGeneration: number
    accountRef: string
    principalRef: string
    operationRef: string
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
    operationRef: string
  }>,
): boolean {
  return allAuthorityFacts([
    leaf.grantRef === input.leafGrantRef,
    leaf.generation === input.expectedGeneration,
    leaf.subjectPrincipalRef === input.principalRef,
    leaf.scopes.includes(MARKET_OPERATIONS_INVOKE_SCOPE),
    leaf.resourceRefs.includes('*') || leaf.resourceRefs.includes(input.operationRef),
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

/**
 * Resolves a charge journal back to its one durable invocation and rechecks
 * that invocation's current authority. Journal and provider identifiers are
 * only locators. The compatibility identity below is derived from the
 * persisted principal, never from caller-supplied proof.
 */
export async function canonicalBillingTransactionContext<
  Context extends MutationCtx,
>(
  ctx: Context,
  expected: Readonly<{ transactionRef: string; principalId: string }>,
): Promise<Context | null> {
  const [transaction, entries] = await Promise.all([
    ctx.db
      .query('moneyTransactions')
      .withIndex('by_transactionRef', (query) =>
        query.eq('transactionRef', expected.transactionRef),
      )
      .unique(),
    ctx.db
      .query('moneyLedgerEntries')
      .withIndex('by_transactionRef', (query) =>
        query.eq('transactionRef', expected.transactionRef),
      )
      .take(20),
  ])
  if (
    transaction === null ||
    transaction.kind !== 'charge' ||
    transaction.principalId !== expected.principalId ||
    transaction.credentialId === undefined
  ) {
    return null
  }
  const invocationRefs = new Set(
    entries.flatMap((entry) =>
      entry.invocationRef === undefined ? [] : [entry.invocationRef],
    ),
  )
  const attemptRefs = new Set(
    entries.flatMap((entry) =>
      entry.attemptRef === undefined ? [] : [entry.attemptRef],
    ),
  )
  if (invocationRefs.size !== 1 || attemptRefs.size !== 1) return null
  const invocationRef = [...invocationRefs][0]
  const attemptRef = [...attemptRefs][0]
  if (
    invocationRef === undefined ||
    attemptRef === undefined ||
    !(await persistedInvocationAuthorityIsCurrent(ctx, {
      invocationRef,
      principalId: transaction.principalId,
      credentialId: transaction.credentialId,
      inputDigest: transaction.inputDigest,
      attemptRef,
    }))
  ) {
    return null
  }
  const priorIdentity = await ctx.auth.getUserIdentity()
  return {
    ...ctx,
    auth: {
      ...ctx.auth,
      getUserIdentity: async () => ({
        ...(priorIdentity ?? {}),
        tokenIdentifier: transaction.principalId,
      }),
    },
  } as Context
}

export async function requireBillingSourceWrite(
  ctx: MutationCtx,
  args: BillingSourceWriteArgs,
): Promise<void> {
  const result = await requireSourceWrite(ctx, args, 'billing')
  if (result.kind === 'rejected') {
    throw new Error(`money_billing_source_write_rejected:${result.reason}`)
  }
}
