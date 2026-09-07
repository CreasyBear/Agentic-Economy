'use client'

/**
 * Browser seam for the public Tool market search.
 *
 * Goes through the canonical anonymous HTTP surface
 * `POST /api/v1/market-tools/search`. No second domain vocabulary is
 * invented here: responses are validated against the exported registry
 * contract and failures are thrown, never fabricated into fake results.
 */

import { z } from 'zod'

import { TOOL_MARKET_SEARCH_PATH } from '@/modules/registry/tool-paths'
import { toolChoiceSearchOutputSchema } from '@/modules/registry/tool-choice-contracts'

export type ToolChoiceSearchResult = z.infer<typeof toolChoiceSearchOutputSchema>

export type MarketToolSearchInput = Readonly<{
  query: string
  limit?: number
}>

export const TOOL_SEARCH_RESULT_LIMIT = 12

export async function searchMarketTools(
  input: MarketToolSearchInput,
): Promise<ToolChoiceSearchResult> {
  const response = await fetch(TOOL_MARKET_SEARCH_PATH, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      query: input.query,
      ...(input.limit === undefined ? {} : { limit: input.limit }),
    }),
  })
  if (!response.ok) throw new Error('catalog_search_unavailable')

  const parsed = toolChoiceSearchOutputSchema.safeParse(await response.json())
  if (!parsed.success) throw new Error('catalog_search_result_invalid')
  return parsed.data
}
