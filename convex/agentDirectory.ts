import { v } from 'convex/values'

import { query } from './_generated/server'
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
      .collect()
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
          .collect(),
        ctx.db.query('credentials')
          .withIndex('by_principalRef_and_lifecycle', (index) => index.eq('principalRef', membership.memberPrincipalRef))
          .collect(),
      ])
      if (principal === null
        || principal.kind !== 'agent'
        || principal.lifecycle !== 'active'
        || admission === null
        || admission.ownerId !== actor.canonicalAccountRef) return undefined

      const providerByBinding = new Map(bindings
        .filter((binding) => binding.providerNamespace === 'clerk/api-key')
        .map((binding) => [binding.bindingRef, binding.providerIdentifier]))
      const projectedCredentials = credentials.flatMap((credential) => {
        const providerCredentialId = providerByBinding.get(credential.bindingRef)
        return providerCredentialId === undefined ? [] : [{
          credentialRef: credential.credentialRef,
          providerCredentialId,
          generation: credential.generation,
          lifecycle: credential.lifecycle === 'active' && credential.expiresAt <= args.now
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
      const currentBinding = bindings.find(({ providerIdentifier }) => providerIdentifier === admission.credentialId)
      const providerCleanupPending = bindings.some((binding) => (
        binding.providerNamespace === 'clerk/api-key'
        && binding.lifecycle === 'revoked'
        && (binding.providerState.kind !== 'known' || binding.providerState.value !== 'revoked')
      ))
      const status = providerCleanupPending
        ? 'attention' as const
        : admission.lifecycle !== 'active' || currentCredential?.lifecycle === 'revoked' || currentBinding?.lifecycle === 'revoked'
          ? 'disconnected' as const
          : currentCredential !== undefined && currentCredential.expiresAt <= args.now
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
        credentials: projectedCredentials,
      }
    }))

    return records.flatMap((record) => record === undefined ? [] : [record])
  },
})
