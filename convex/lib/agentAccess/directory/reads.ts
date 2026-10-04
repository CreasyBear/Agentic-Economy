import type { Doc } from '../../../_generated/dataModel'
import type { QueryCtx } from '../../../_generated/server'
import { v, type ObjectType } from 'convex/values'
import { resolveBusinessActor } from '../../../authz'
import type { listOwnedArgs, listOwnedPageArgs } from './contracts'

export const findOwnedByCredentialArgs = { credentialId: v.string() }
export const findOwnedByCredentialResult = v.union(v.string(), v.null())
/** Requires owner authentication. Ensures a credential maps to its durable,
 * owned Agent even after rotation or revocation. Invariant: credential IDs are
 * filters, not authority. On missing/foreign binding: null. One indexed binding
 * and membership read avoid scanning every directory page. */
export async function findOwnedByCredentialHandler(ctx: QueryCtx, args: ObjectType<typeof findOwnedByCredentialArgs>) {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner' || args.credentialId.length === 0 || args.credentialId.length > 300) return null
  const binding = await ctx.db.query('externalIdentityBindings').withIndex('by_providerNamespace_and_providerIdentifier', index => index
    .eq('providerNamespace', 'clerk/api-key').eq('providerIdentifier', args.credentialId)).unique()
  if (binding === null) return null
  const membership = await ctx.db.query('memberships').withIndex('by_accountRef_and_memberPrincipalRef_and_lifecycle', index => index
    .eq('accountRef', actor.canonicalAccountRef).eq('memberPrincipalRef', binding.principalRef).eq('lifecycle', 'active')).unique()
  if (membership === null) return null
  const principal = await ctx.db.query('principals').withIndex('by_principalRef', index => index.eq('principalRef', binding.principalRef)).unique()
  return principal?.kind === 'agent' && principal.lifecycle === 'active' ? binding.principalRef : null
}

/**
 * Canonical owner-only source for the agent directory. Membership proves that
 * the agent belongs to the active Account; principal, binding, credential and
 * admission rows must all agree before an agent is returned.
 */
export const listOwnedHandler = async (ctx: QueryCtx, args: ObjectType<typeof listOwnedArgs>) => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') return []

    const memberships = await ctx.db.query('memberships')
      .withIndex('by_accountRef_and_lifecycle', (index) => index
        .eq('accountRef', actor.canonicalAccountRef)
        .eq('lifecycle', 'active'))
      .take(50)
    return await projectMemberships(ctx, memberships, actor.canonicalAccountRef, args.now)
  }

export const listOwnedPageHandler = async (ctx: QueryCtx, args: ObjectType<typeof listOwnedPageArgs>) => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') {
      return { page: [], isDone: true, continueCursor: '' }
    }
    // Requires the authenticated Account; a requested Principal is a filter,
    // never authority. Ensures the exact owned Agent can be refreshed without
    // scanning earlier pages. Missing/foreign Agents return an empty page.
    // Cost: one optional filter; benefit: bounded live reads after pagination.
    const principalRef = args.principalRef
    if (principalRef !== undefined && (principalRef.length === 0 || principalRef.length > 500)) throw new Error('agent_directory_principal_invalid')
    const query = principalRef === undefined
      ? ctx.db.query('memberships').withIndex('by_accountRef_and_lifecycle', (index) => index
          .eq('accountRef', actor.canonicalAccountRef).eq('lifecycle', 'active'))
      : ctx.db.query('memberships').withIndex('by_accountRef_and_memberPrincipalRef_and_lifecycle', (index) => index
          .eq('accountRef', actor.canonicalAccountRef).eq('memberPrincipalRef', principalRef).eq('lifecycle', 'active'))
    const memberships = await query.paginate(args.paginationOpts)
    return {
      ...memberships,
      page: await projectMemberships(ctx, memberships.page, actor.canonicalAccountRef, args.now),
    }
  }

async function projectMemberships(
  ctx: QueryCtx,
  memberships: readonly Doc<'memberships'>[],
  accountRef: string,
  now: number,
) {
    const records = await Promise.all(memberships.map(async (membership) => {
      const [principal, admission, bindings, credentials] = await Promise.all([
        ctx.db.query('principals')
          .withIndex('by_principalRef', (index) => index.eq('principalRef', membership.memberPrincipalRef))
          .unique(),
        ctx.db.query('agentAccessPrincipals')
          .withIndex('by_principalId', (index) => index.eq('principalId', membership.memberPrincipalRef))
          .unique(),
        ctx.db.query('externalIdentityBindings')
          .withIndex('by_principalRef_and_lifecycle', (index) => index.eq('principalRef', membership.memberPrincipalRef))
          .order('desc')
          .take(101),
        ctx.db.query('credentials')
          .withIndex('by_principalRef_and_lifecycle', (index) => index.eq('principalRef', membership.memberPrincipalRef))
          .order('desc')
          .take(101),
      ])
      if (principal === null
        || principal.kind !== 'agent'
        || principal.lifecycle !== 'active'
        || admission === null
        || admission.ownerId !== accountRef) return undefined

      const currentProviderBinding = await ctx.db.query('externalIdentityBindings')
        .withIndex('by_providerNamespace_and_providerIdentifier', (index) => index
          .eq('providerNamespace', 'clerk/api-key')
          .eq('providerIdentifier', admission.credentialId))
        .unique()

      const bindingsTruncated = bindings.length > 100
      const credentialsTruncated = credentials.length > 100
      const boundedBindings = bindings.slice(0, 100)
      if (currentProviderBinding !== null
        && !boundedBindings.some(({ _id }) => _id === currentProviderBinding._id)) {
        boundedBindings.push(currentProviderBinding)
      }
      const boundedCredentials = credentials.slice(0, 100)
      if (currentProviderBinding !== null
        && !boundedCredentials.some(({ bindingRef }) => bindingRef === currentProviderBinding.bindingRef)) {
        const currentCredential = await ctx.db.query('credentials')
          .withIndex('by_bindingRef_and_generation_and_lifecycle', (index) => index
            .eq('bindingRef', currentProviderBinding.bindingRef))
          .order('desc')
          .first()
        if (currentCredential !== null) boundedCredentials.push(currentCredential)
      }

      const providerByBinding = new Map<string, string>()
      for (const binding of boundedBindings) {
        if (binding.providerNamespace === 'clerk/api-key') {
          providerByBinding.set(binding.bindingRef, binding.providerIdentifier)
        }
      }
      const projectedCredentials = boundedCredentials.flatMap((credential) => {
        const providerCredentialId = providerByBinding.get(credential.bindingRef)
        return providerCredentialId === undefined ? [] : [{
          credentialRef: credential.credentialRef,
          providerCredentialId,
          generation: credential.generation,
          lifecycle: credential.lifecycle === 'active' && credential.expiresAt <= now
            ? 'stale' as const
            : credential.lifecycle,
          ...(credential.predecessorCredentialRef === undefined
            ? {}
            : { predecessorCredentialRef: credential.predecessorCredentialRef }),
          issuedAt: credential.issuedAt,
          expiresAt: credential.expiresAt,
          ...(credential.lastAuthenticatedAt === undefined
            ? {}
            : { lastAuthenticatedAt: credential.lastAuthenticatedAt }),
        }]
      }).toSorted((left, right) => left.generation - right.generation)
      if (!projectedCredentials.some(({ providerCredentialId }) => (
        providerCredentialId === admission.credentialId
      ))) return undefined
      const currentCredential = projectedCredentials.find(({ providerCredentialId }) => providerCredentialId === admission.credentialId)
      const currentBinding = boundedBindings.find(({ providerIdentifier }) => providerIdentifier === admission.credentialId)
      const providerCleanupPending = bindingsTruncated || boundedBindings.some((binding) => (
        binding.providerNamespace === 'clerk/api-key'
        && binding.lifecycle === 'revoked'
        && (binding.providerState.kind !== 'known' || binding.providerState.value !== 'revoked')
      ))
      const status = providerCleanupPending
        ? 'attention' as const
        : admission.lifecycle !== 'active' || currentCredential?.lifecycle === 'revoked' || currentBinding?.lifecycle === 'revoked'
          ? 'disconnected' as const
          : currentCredential !== undefined && currentCredential.expiresAt <= now
            ? 'expired' as const
            : 'connected' as const

      return {
        principalRef: principal.principalRef,
        principalRevision: principal.revision,
        displayName: principal.displayName,
        applicationRef: admission.applicationRef,
        environment: admission.environment,
        currentProviderCredentialId: admission.credentialId,
        lastSeenAt: admission.lastSeenAt,
        status,
        admissionLifecycle: admission.lifecycle,
        authorityMode: admission.authorityMode,
        scopes: admission.scopes,
        credentialHistoryTruncated: credentialsTruncated || bindingsTruncated,
        credentials: projectedCredentials,
      }
    }))

    return records.flatMap((record) => record === undefined ? [] : [record])
}
