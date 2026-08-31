import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v } from 'convex/values'

import { query, type QueryCtx } from './_generated/server'
import type { Doc } from './_generated/dataModel'
import { resolveBusinessActor } from './authz'

const credentialLifecycle = v.union(
  v.literal('active'),
  v.literal('stale'),
  v.literal('revoked'),
)

const directoryRecord = v.object({
  principalRef: v.string(),
  displayName: v.string(),
  applicationRef: v.string(),
  environment: v.union(v.literal('sandbox'), v.literal('production')),
  currentProviderCredentialId: v.string(),
  lastSeenAt: v.number(),
  status: v.union(v.literal('connected'), v.literal('attention'), v.literal('expired'), v.literal('disconnected')),
  admissionLifecycle: v.union(v.literal('active'), v.literal('revoked'), v.literal('expired')),
  authorityMode: v.union(v.literal('inspect_only'), v.literal('approve_each'), v.literal('bounded_mandate'), v.literal('full_yolo')),
  scopes: v.array(v.string()),
  credentialHistoryTruncated: v.boolean(),
  credentials: v.array(v.object({
    credentialRef: v.string(),
    providerCredentialId: v.string(),
    generation: v.number(),
    lifecycle: credentialLifecycle,
    predecessorCredentialRef: v.optional(v.string()),
    issuedAt: v.number(),
    expiresAt: v.number(),
  })),
})

/**
 * Canonical owner-only source for the agent directory. Membership proves that
 * the agent belongs to the active Account; principal, binding, credential and
 * admission rows must all agree before an agent is returned.
 */
export const listOwned = query({
  args: { now: v.number() },
  returns: v.array(directoryRecord),
  handler: async (ctx, args) => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') return []

    const memberships = await ctx.db.query('memberships')
      .withIndex('by_accountRef_and_lifecycle', (index) => index
        .eq('accountRef', actor.canonicalAccountRef)
        .eq('lifecycle', 'active'))
      .take(50)
    return await projectMemberships(ctx, memberships, actor.canonicalAccountRef, args.now)
  },
})

export const listOwnedPage = query({
  args: { now: v.number(), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(directoryRecord),
  handler: async (ctx, args) => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') {
      return { page: [], isDone: true, continueCursor: '' }
    }
    const memberships = await ctx.db.query('memberships')
      .withIndex('by_accountRef_and_lifecycle', (index) => index
        .eq('accountRef', actor.canonicalAccountRef)
        .eq('lifecycle', 'active'))
      .paginate(args.paginationOpts)
    return {
      ...memberships,
      page: await projectMemberships(ctx, memberships.page, actor.canonicalAccountRef, args.now),
    }
  },
})

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
