import { type Infer, v } from 'convex/values'
import type { z } from 'zod'

import type { toolCatalogFiltersSchema } from '@/modules/registry/tool-choice-contracts'

// Structural counterpart to toolCatalogFiltersSchema; Zod checks lengths, ranges, and patterns.
export const toolCatalogFiltersValidator = v.object({
  actionClass: v.optional(v.union(
    v.literal('retrieve'), v.literal('transform'), v.literal('analyze'), v.literal('create'),
    v.literal('mutate'), v.literal('other'), v.literal('unclassified'),
  )),
  objectClass: v.optional(v.union(
    v.literal('web'), v.literal('document'), v.literal('image'), v.literal('location'),
    v.literal('chain'), v.literal('data'), v.literal('other'), v.literal('unclassified'),
  )),
  category: v.optional(v.string()),
  provider: v.optional(v.string()),
  access: v.optional(v.literal('ae_callable')),
  priceBand: v.optional(v.union(
    v.literal('lt_0_01'), v.literal('0_01_to_0_03'), v.literal('0_03_to_0_10'),
    v.literal('0_10_to_1'), v.literal('1_to_10'), v.literal('10_plus'), v.literal('unknown'),
  )),
  networkId: v.optional(v.string()),
  location: v.optional(v.string()),
  effects: v.optional(v.array(v.union(
    v.literal('data_release'), v.literal('financial_exposure'), v.literal('external_state_change'),
  ))),
  dataUse: v.optional(v.array(v.union(
    v.literal('public'), v.literal('personal'), v.literal('sensitive'), v.literal('credential'),
  ))),
  healthStatus: v.optional(v.array(v.union(
    v.literal('operational'), v.literal('degraded'), v.literal('unverified'),
  ))),
  currency: v.optional(v.string()),
  maximumPrice: v.optional(v.object({
    currency: v.string(),
    units: v.string(),
    exponent: v.number(),
  })),
})

/** Keep Zod-normalized values while omitting explicit undefined properties from Convex documents. */
export function toConvexToolCatalogFilters(
  filters: z.infer<typeof toolCatalogFiltersSchema>,
): Infer<typeof toolCatalogFiltersValidator> {
  const result: Infer<typeof toolCatalogFiltersValidator> = {}
  if (filters.actionClass !== undefined) result.actionClass = filters.actionClass
  if (filters.objectClass !== undefined) result.objectClass = filters.objectClass
  if (filters.category !== undefined) result.category = filters.category
  if (filters.provider !== undefined) result.provider = filters.provider
  if (filters.access !== undefined) result.access = filters.access
  if (filters.priceBand !== undefined) result.priceBand = filters.priceBand
  if (filters.networkId !== undefined) result.networkId = filters.networkId
  if (filters.location !== undefined) result.location = filters.location
  if (filters.effects !== undefined) result.effects = filters.effects
  if (filters.dataUse !== undefined) result.dataUse = filters.dataUse
  if (filters.healthStatus !== undefined) result.healthStatus = filters.healthStatus
  if (filters.currency !== undefined) result.currency = filters.currency
  if (filters.maximumPrice !== undefined) {
    result.maximumPrice = {
      currency: filters.maximumPrice.currency,
      units: filters.maximumPrice.units,
      exponent: filters.maximumPrice.exponent,
    }
  }
  return result
}
