'use client'

/**
 * Browser seam for the public operation market search.
 *
 * Goes through the canonical anonymous HTTP surface
 * `POST /api/v1/market-operations/search`. No second domain vocabulary is
 * invented here: responses are validated against the exported registry
 * contract and failures are thrown, never fabricated into fake results.
 */

import { z } from 'zod'

import { OPERATION_MARKET_SEARCH_PATH } from '@/modules/registry/operation-paths'
import { operationChoiceSearchOutputSchema } from '@/modules/registry/operation-choice-contracts'

export type OperationChoiceSearchResult = z.infer<typeof operationChoiceSearchOutputSchema>

export type MarketOperationSearchInput = Readonly<{
  query: string
  limit?: number
}>

export const OPERATION_SEARCH_RESULT_LIMIT = 12

export async function searchMarketOperations(
  input: MarketOperationSearchInput,
): Promise<OperationChoiceSearchResult> {
  const response = await fetch(OPERATION_MARKET_SEARCH_PATH, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      query: input.query,
      ...(input.limit === undefined ? {} : { limit: input.limit }),
    }),
  })
  if (!response.ok) throw new Error('catalog_search_unavailable')

  const parsed = operationChoiceSearchOutputSchema.safeParse(await response.json())
  if (!parsed.success) throw new Error('catalog_search_result_invalid')
  return parsed.data
}
