import type { Doc } from '../../../_generated/dataModel'
import type { QueryCtx } from '../../../_generated/server'
import type { PaymentEnvironment } from '@/lib/deployment/environment'
import { DELEGATION_MAX_ANCESTRY_GRANTS } from '@/modules/authority/delegation/public'

export type PaymentAdmissionResult =
  | Readonly<{ kind: 'allowed' }>
  | Readonly<{ kind: 'refused'; code: 'payments_paused' | 'payments_admins_only' }>

type AgentPaymentAuthority = Readonly<{
  environment: PaymentEnvironment
  accountRef: string
  grantRef: string
  /** Agent-access generation; canonical delegation generations can differ after replacement. */
  grantGeneration: number
}>

export async function readPaymentsAudience(ctx: Pick<QueryCtx, 'db'>, environment: PaymentEnvironment) {
  const row = await ctx.db.query('platformLaunch')
    .withIndex('by_environment', (q) => q.eq('environment', environment)).unique()
  return row?.paymentsOpenTo ?? (environment === 'production' ? 'admins' : 'everyone')
}

/** An active canonical human identity and active Admin membership establish the launch role. */
export async function rootIssuerIsActiveAdmin(ctx: Pick<QueryCtx, 'db'>, principalRef: string): Promise<boolean> {
  const principal = await ctx.db.query('principals')
    .withIndex('by_principalRef', (q) => q.eq('principalRef', principalRef)).unique()
  if (principal?.lifecycle !== 'active' || principal.kind !== 'human') return false
  const bindings = await ctx.db.query('externalIdentityBindings')
    .withIndex('by_principalRef_and_lifecycle', (q) => q.eq('principalRef', principalRef).eq('lifecycle', 'active'))
    .filter((q) => q.eq(q.field('providerNamespace'), 'clerk/user')).take(2)
  const binding = bindings[0]
  if (bindings.length !== 1 || binding === undefined
    || binding.providerState.kind !== 'known' || binding.providerState.value !== 'active') return false
  const memberships = await ctx.db.query('adminMemberships')
    .withIndex('by_tokenIdentifier_and_state', (q) => q.eq('tokenIdentifier', binding.providerIdentifier).eq('state', 'active')).take(2)
  return memberships.length === 1
}

/**
 * Requires: the caller has validated canonical Agent authority; now is that admission's server timestamp.
 * Ensures: none refuses; everyone allows; admins allows only a live root issuer with an active Clerk/Admin identity.
 * Invariant: ancestor traversal is bounded, in-account, generation-pinned and cycle-free; no legacy owner token authorizes.
 * On violation: payments_admins_only, with no writes, credentials or purchase effects.
 */
export async function readAgentPaymentAdmission(
  ctx: Pick<QueryCtx, 'db'>,
  input: AgentPaymentAuthority,
  now: number,
): Promise<PaymentAdmissionResult> {
  const audience = await readPaymentsAudience(ctx, input.environment)
  if (audience === 'none') return { kind: 'refused', code: 'payments_paused' }
  if (audience === 'everyone') return { kind: 'allowed' }
  const refuse: PaymentAdmissionResult = { kind: 'refused', code: 'payments_admins_only' }
  if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(input.grantGeneration) || input.grantGeneration < 1) return refuse
  const access = await ctx.db.query('agentAccessGrants')
    .withIndex('by_grantRef', (q) => q.eq('grantRef', input.grantRef)).unique()
  if (access === null || access.lifecycle !== 'active' || access.ownerId !== input.accountRef
    || access.environment !== input.environment || access.generation !== input.grantGeneration || access.expiresAt <= now) return refuse
  const account = await ctx.db.query('accounts')
    .withIndex('by_accountRef', (q) => q.eq('accountRef', input.accountRef)).unique()
  if (account?.lifecycle !== 'active') return refuse
  const ownership = await ctx.db.query('accountOwnerships')
    .withIndex('by_ownershipRef', (q) => q.eq('ownershipRef', account.currentOwnershipRef)).unique()
  if (ownership?.lifecycle !== 'active' || ownership.accountRef !== input.accountRef) return refuse
  const visited = new Set<string>()
  let nextRef: string | undefined = input.grantRef
  let child: Doc<'authorityDelegationGrants'> | undefined
  for (let depth = 0; depth < DELEGATION_MAX_ANCESTRY_GRANTS && nextRef !== undefined; depth += 1) {
    if (visited.has(nextRef)) return refuse
    visited.add(nextRef)
    const lookupRef: string = nextRef
    const grant: Doc<'authorityDelegationGrants'> | null = await ctx.db.query('authorityDelegationGrants')
      .withIndex('by_grantRef', (q) => q.eq('grantRef', lookupRef)).unique()
    if (grant === null || grant.lifecycle !== 'active' || grant.accountRef !== input.accountRef
      || !Number.isSafeInteger(grant.expiresAt) || grant.expiresAt <= now
      || !Number.isSafeInteger(grant.generation) || grant.generation < 1
      || grant.createdBy.actorPrincipalRef !== grant.actorPrincipalRef
      || grant.createdBy.activeAccountRef !== input.accountRef) return refuse
    if (child === undefined && grant.subjectPrincipalRef !== access.principalId) return refuse
    if (child !== undefined && (child.parentGeneration !== grant.generation
      || child.actorPrincipalRef !== grant.subjectPrincipalRef)) return refuse
    if (grant.parentGrantRef === undefined) {
      if (grant.parentGeneration !== undefined || grant.actorPrincipalRef !== ownership.ownerPrincipalRef) return refuse
      return await rootIssuerIsActiveAdmin(ctx, grant.actorPrincipalRef) ? { kind: 'allowed' } : refuse
    }
    if (grant.parentGeneration === undefined) return refuse
    child = grant
    nextRef = grant.parentGrantRef
  }
  return refuse
}
