import { z } from 'zod'

import { defineAction, type ActionParameter } from '@/modules/common/action'
import {
  readPublicRegistryBusinessDetail,
  readPublicRegistrySearchPage,
} from '@/modules/registry/registry.functions'
import type {
  PublicBusinessCatalogApiPage,
  PublicBusinessCatalogDetailResult,
} from '@/modules/registry/public'

/**
 * Read-only AE actions over the public business catalog.
 *
 * `registry.search` and `registry.detail` are the machine counterparts to the
 * human `/api/businesses/search` and `/api/businesses/$slug` surfaces. They
 * return the same public DTO subset and stay literal: the registry does not
 * typo-correct suburbs or rewrite queries. Misspelling recovery is the caller's
 * job - it chooses better tool arguments, and the chosen input is persisted as
 * tool evidence by the answer-thread turn orchestrator.
 *
 * These actions power the quiet agent-tools door, the Phase 7 answer agent
 * tool-use loop, and any future agent JSON action descriptors. They never
 * expose private owner fields, raw DB rows, or booking/payment/dispatch claims.
 */

const registrySearchInputSchema = z.object({
  query: z.string().max(200).describe('Search query for listed businesses'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe('Maximum providers to return'),
})

const registryDetailInputSchema = z.object({
  slug: z.string().min(1).max(200).describe('Published business slug'),
})

const searchParameters: readonly ActionParameter[] = [
  {
    name: 'query',
    type: 'string',
    description: 'Search query for listed businesses. Plain text, max 200 characters.',
    required: true,
  },
  {
    name: 'limit',
    type: 'number',
    description: 'Maximum providers to return (1-20). Defaults to 10.',
    required: false,
  },
]

const detailParameters: readonly ActionParameter[] = [
  {
    name: 'slug',
    type: 'string',
    description: 'Published business slug to read in full.',
    required: true,
  },
]

export const registrySearchAction = defineAction({
  id: 'registry.search',
  name: 'Search listed businesses',
  summary:
    'Search the Agentic Economy catalog for published local service businesses. ' +
    'Returns the same public catalog subset as /api/businesses/search. ' +
    'Read-only and public-fact-only; always use this before naming providers in an answer.',
  boundaries: [
    'Read-only. Does not book, charge, dispatch, or send inquiries.',
    'Returns only public catalog facts: slug, name, category, suburb, services, and published contact capabilities.',
    'The registry is literal. Misspelled suburbs (e.g. "paramata") do not auto-correct; choose better search arguments instead.',
    'Availability, quotes, and job acceptance still need a human reply through the listing or qualified inquiry path.',
  ],
  schema: registrySearchInputSchema,
  parameters: searchParameters,
  readOnly: true,
  surfaces: ['http', 'agentJson', 'agentTools'],
  run: async ({ data }) => {
    const page = await readPublicRegistrySearchPage({
      query: data.query.trim(),
      ...(data.limit === undefined ? {} : { limit: data.limit }),
    })
    return page as PublicBusinessCatalogApiPage
  },
})

export const registryDetailAction = defineAction({
  id: 'registry.detail',
  name: 'Read a listed business',
  summary:
    'Read one published business catalog by slug. ' +
    'Returns the same public catalog subset as /api/businesses/$slug, or a not_found result.',
  boundaries: [
    'Read-only. Does not book, charge, dispatch, or send inquiries.',
    'Returns only public catalog facts for the requested slug.',
    'A not_found result means no public listing exists for that slug; do not invent provider details.',
  ],
  schema: registryDetailInputSchema,
  parameters: detailParameters,
  readOnly: true,
  surfaces: ['http', 'agentJson', 'agentTools'],
  run: async ({ data }) => {
    const result = await readPublicRegistryBusinessDetail({ slug: data.slug.trim() })
    return result as PublicBusinessCatalogDetailResult
  },
})
