import { v } from 'convex/values'

const localHumanBusinessContext = v.object({
  kind: v.literal('local_human'),
  suburb: v.string(),
  stateTerritory: v.string(),
  postcode: v.optional(v.string()),
  publishedPhone: v.optional(v.string()),
})

const programmableProviderBusinessContext = v.object({
  kind: v.literal('programmable_provider'),
  website: v.string(),
  providerIdentifier: v.string(),
})

export const businessContext = v.union(localHumanBusinessContext, programmableProviderBusinessContext)
