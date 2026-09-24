import { v } from 'convex/values'

import type { InteractiveBusinessAuthorityContext } from '../../../../src/modules/business/public'
import { CLERK_USER_PROVIDER_NAMESPACE } from './constants'

export const interactiveAuthorityContextValue = v.object({
  principalRef: v.string(),
  accountRef: v.string(),
  revision: v.object({
    binding: v.number(),
    credential: v.number(),
    principal: v.number(),
    account: v.number(),
    access: v.number(),
    currentOwnership: v.number(),
    currentOwnerPrincipal: v.number(),
  }),
  provenance: v.object({
    providerNamespace: v.literal(CLERK_USER_PROVIDER_NAMESPACE),
    bindingRef: v.string(),
    credentialRef: v.string(),
    credentialGeneration: v.number(),
    accessKind: v.union(v.literal('ownership'), v.literal('membership')),
    accessRef: v.string(),
    currentOwnershipRef: v.string(),
    resolvedAt: v.number(),
  }),
})

export const interactiveAuthorityFactsValue = v.object({
  context: interactiveAuthorityContextValue,
  credentialIssuedAt: v.number(),
  credentialExpiresAt: v.number(),
  authorityMaterializedAt: v.number(),
})

export type InteractiveAuthorityFacts = Readonly<{
  context: InteractiveBusinessAuthorityContext
  credentialIssuedAt: number
  credentialExpiresAt: number
  authorityMaterializedAt: number
}>
