import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import { agentAccessPrincipalValue } from '../../../agentAccessPrincipals'
import { sourceWriteArgs } from '../../security/sourceWrite/contracts'

export const readAgentResult = v.union(
  v.object({ kind: v.literal('available'), statusJson: v.string() }),
  v.object({ kind: v.literal('not_found') }),
)

export const readOwnerResult = v.union(
  v.object({
    kind: v.literal('available'),
    statusJson: v.string(),
    tool: v.object({
      offeringRef: v.string(),
      currentRevision: v.number(),
      name: v.string(),
      category: v.string(),
      summary: v.string(),
      status: v.union(v.literal('draft'), v.literal('published'), v.literal('paused'), v.literal('retired')),
      accessPathCount: v.number(),
      // Well 8 Lane C: the canonical `/tools/<providerKey>/<slug>` slug, when
      // this Tool's current publication has one - see canonicalSlugForToolRef.
      slug: v.optional(v.string()),
      pricingLabel: v.optional(v.string()),
    }),
    maintenance: v.optional(v.object({
      offeringRef: v.string(),
      offeringRevision: v.number(),
      offeringSourceHash: v.string(),
      publicationRef: v.string(),
      publicationRevision: v.number(),
    })),
    resumeCandidateRef: v.optional(v.string()),
  }),
  v.object({ kind: v.literal('not_found') }),
)

export const listAgentResult = v.union(
  v.object({
    kind: v.literal('available'),
    page: v.array(v.object({ statusJson: v.string() })),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  v.object({ kind: v.literal('not_found') }),
)

export const listOwnerResult = v.union(
  v.object({
    kind: v.literal('available'),
    page: v.array(v.object({
      offeringRef: v.string(),
      currentRevision: v.number(),
      name: v.string(),
      category: v.string(),
      summary: v.string(),
      status: v.union(v.literal('draft'), v.literal('published'), v.literal('paused'), v.literal('retired')),
      accessPathCount: v.number(),
      slug: v.optional(v.string()),
      statusJson: v.string(),
    })),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  v.object({ kind: v.literal('not_found') }),
  v.object({ kind: v.literal('index_pending') }),
)

const agentReadArgs = {
  businessId: v.id('businesses'),
  agentPrincipal: agentAccessPrincipalValue,
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
} as const

export const listAgentArgs = v.object({ ...agentReadArgs, paginationOpts: paginationOptsValidator })
export const readAgentArgs = v.object({ ...agentReadArgs, toolRef: v.string() })
export const readOwnerArgs = v.object({ businessId: v.id('businesses'), offeringRef: v.string(), now: v.number() })
export const ownerInventorySortValue = v.union(v.literal('updated_desc'), v.literal('updated_asc'), v.literal('name_asc'), v.literal('name_desc'), v.literal('relevance'))
export const listOwnerArgs = v.object({ businessId: v.id('businesses'), paginationOpts: paginationOptsValidator, now: v.number(), search: v.optional(v.string()), sort: v.optional(ownerInventorySortValue) })
