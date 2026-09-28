import { z } from 'zod'
import { idempotencyKeySchema } from '@/modules/common/action'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { toolCatalogFiltersSchema } from '@/modules/registry/tool-choice-contracts'
export { toolCatalogFiltersValidator, toConvexToolCatalogFilters } from './internal/tool-catalog-filters-validator'

export const MARKET_REQUEST_ACTIVE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

export const marketRequestScopeSchema = z.strictObject({
  query: z.string().trim().min(1).max(200),
  source: z.enum(['current', 'coinbase']).optional(),
  filters: toolCatalogFiltersSchema.optional(),
})

export const marketRequestCreateInputSchema = marketRequestScopeSchema.extend({
  idempotencyKey: idempotencyKeySchema,
})

export type MarketRequestScope = z.infer<typeof marketRequestScopeSchema>

// Shared by the write and retry-read paths. Preserve the existing opaque
// identity material; a query change must conflict rather than produce a new ID.
export function marketRequestRef(input: Readonly<{
  principalId: string
  credentialId: string
  idempotencyKey: string
}>): string {
  return `market-request:v1:${canonicalDigest({
    principalId: input.principalId,
    credentialId: input.credentialId,
    idempotencyKey: input.idempotencyKey.trim(),
  }).replace('sha256:', '')}`
}

export function ownerMarketRequestRef(input: Readonly<{ ownerId: string; idempotencyKey: string }>): string {
  return `market-request:v1:${canonicalDigest({
    ownerId: input.ownerId,
    idempotencyKey: input.idempotencyKey.trim(),
  }).replace('sha256:', '')}`
}
