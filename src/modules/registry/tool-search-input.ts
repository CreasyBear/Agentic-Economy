import { z } from 'zod'

import { exactAmountSchema } from '@/modules/money/public'
import { SEARCH_QUERY_MAX_LENGTH } from '@/modules/common/search-query'

export const toolHealthStatusSchema = z.enum([
  'operational',
  'degraded',
  'unverified',
])
export const toolCatalogFiltersSchema = z.strictObject({
  actionClass: z.enum(['retrieve', 'transform', 'analyze', 'create', 'mutate', 'other', 'unclassified']).optional(),
  objectClass: z.enum(['web', 'document', 'image', 'location', 'chain', 'data', 'other', 'unclassified']).optional(),
  category: z.string().max(80).optional(),
  provider: z.string().max(200).optional(),
  access: z.enum(['ae_callable', 'external_listing']).optional(),
  priceBand: z.enum(['lt_0_01', '0_01_to_0_03', '0_03_to_0_10', '0_10_to_1', '1_to_10', '10_plus', 'unknown']).optional(),
  networkId: z.string().trim().min(1).max(200).optional(),
  location: z.string().trim().min(1).max(200).optional().describe('Requires qualified geographic evidence. Current public sources do not provide it; unknown location cannot satisfy this filter.'),
  effects: z.array(z.enum(['data_release', 'financial_exposure', 'external_state_change'])).max(3).optional().describe('Match at least one declared effect class. This is a positive catalogue facet, not an allowed-effects policy. An empty array matches nothing; unknown facts do not match.'),
  dataUse: z.array(z.enum(['public', 'personal', 'sensitive', 'credential'])).max(4).optional().describe('Match at least one declared data-use class; a Tool may declare additional classes. This filter does not grant data-release permission. An empty array matches nothing; unknown facts do not match.'),
  healthStatus: z.array(toolHealthStatusSchema).min(1).max(3).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  maximumPrice: exactAmountSchema.optional(),
})

export const toolCatalogSearchInputSchema = z.strictObject({
  source: z.enum(['current', 'coinbase']).optional(),
  query: z.string().trim().min(1).max(SEARCH_QUERY_MAX_LENGTH),
  limit: z.number().int().min(1).max(12).default(8),
  cursor: z.string().max(8192).optional(),
  filters: toolCatalogFiltersSchema.optional(),
})
