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
  args: {},
  returns: v.array(directoryRecord),
  handler: async (ctx) => {
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
          lifecycle: credential.lifecycle,
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

      return {
        principalRef: principal.principalRef,
        displayName: principal.displayName,
        applicationRef: admission.applicationRef,
        environment: admission.environment,
        currentProviderCredentialId: admission.credentialId,
        lastSeenAt: admission.lastSeenAt,
        credentials: projectedCredentials,
      }
    }))

    return records.flatMap((record) => record === undefined ? [] : [record])
  },
})

export const resolveOwnedCredential = query({
  args: { credentialRef: v.string() },
  returns: v.union(
    v.object({
      kind: v.literal('resolved'),
      providerCredentialId: v.string(),
    }),
    v.object({ kind: v.literal('not_found') }),
  ),
  handler: async (ctx, args) => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') return { kind: 'not_found' as const }
    const credential = await ctx.db.query('credentials')
      .withIndex('by_credentialRef', (index) => index.eq('credentialRef', args.credentialRef))
      .unique()
    if (credential === null) return { kind: 'not_found' as const }
    const [membership, binding] = await Promise.all([
      ctx.db.query('memberships')
        .withIndex('by_accountRef_and_memberPrincipalRef_and_lifecycle', (index) => index
          .eq('accountRef', actor.canonicalAccountRef)
          .eq('memberPrincipalRef', credential.principalRef)
          .eq('lifecycle', 'active'))
        .unique(),
      ctx.db.query('externalIdentityBindings')
        .withIndex('by_bindingRef', (index) => index.eq('bindingRef', credential.bindingRef))
        .unique(),
    ])
    if (membership === null
      || binding === null
      || binding.principalRef !== credential.principalRef
      || binding.providerNamespace !== 'clerk/api-key') return { kind: 'not_found' as const }
    return { kind: 'resolved' as const, providerCredentialId: binding.providerIdentifier }
  },
})
