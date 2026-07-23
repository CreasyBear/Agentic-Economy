import { z } from 'zod'

import { defineAction, type ActionParameter } from '@/modules/common/action'
import {
  readPublicOfferingRegistryBusinessDetail,
  readPublicOfferingRegistryPage,
  readPublicOfferingRegistrySearchPage,
} from '@/modules/registry/registry.functions'
import {
  publicBusinessCatalogApiV2PageSchema,
  publicBusinessCatalogV2DetailResultSchema,
} from '@/modules/registry/public'

/**
 * Read-only AE actions over the public business catalog.
 *
 * `registry.search` and `registry.detail` are the machine counterparts to the
 * human `/api/businesses/search` and `/api/businesses/$slug` surfaces. They
 * return the same public catalog subset and stay literal: the registry does not
 * typo-correct suburbs or rewrite queries. Misspelling recovery is the caller's
 * job - it chooses better tool arguments, and the chosen input is persisted as
 * tool evidence by the answer-thread turn orchestrator.
 *
 * These actions power the quiet agent-tools door, the Phase 7 answer agent
 * tool-use loop, and any future agent JSON action descriptors. They never
 * expose private owner fields, raw DB rows, or booking/payment/dispatch claims.
 */

const registryListInputSchema = z.strictObject({
  cursor: z.string().max(200).optional().describe('Pagination cursor from a previous catalog page'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe('Maximum listings to return'),
})

const registrySearchInputSchema = z.strictObject({
  query: z.string().max(200).describe('Search query for listed businesses'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe('Maximum providers to return'),
  cursor: z.string().max(200).optional().describe('Pagination cursor from a previous search page'),
  mode: z
    .enum(['near_me', 'whole_catalogue'])
    .optional()
    .describe('Search scope: near a supplied place or across the whole catalog'),
  location: z
    .string()
    .trim()
    .max(80)
    .optional()
    .describe('Place to search around when mode is near_me'),
})

const registryDetailInputSchema = z.strictObject({
  slug: z.string().min(1).max(200).describe('Published business slug'),
})

const listParameters: readonly ActionParameter[] = [
  {
    name: 'cursor',
    type: 'string',
    description: 'Pagination cursor returned by a previous catalog page.',
    required: false,
  },
  {
    name: 'limit',
    type: 'number',
    description: 'Maximum listings to return (1-50). Defaults to the catalog page size.',
    required: false,
  },
]

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
    description: 'Maximum providers to return (1-50). Defaults to 10.',
    required: false,
  },
  {
    name: 'cursor',
    type: 'string',
    description: 'Pagination cursor returned by a previous search page.',
    required: false,
  },
  {
    name: 'mode',
    type: 'enum',
    enum: ['near_me', 'whole_catalogue'],
    description: 'Search scope. Use near_me with location for the active place, or whole_catalogue for all listings.',
    required: false,
  },
  {
    name: 'location',
    type: 'string',
    description: 'Place to search around when mode is near_me, for example "Perth" or "Brunswick".',
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

export const registryListAction = defineAction({
  id: 'registry.list',
  name: 'List published businesses',
  summary:
    'List published Agentic Economy business catalog entries. ' +
    'Returns the same public catalog subset as /api/businesses.',
  boundaries: [
    'Read-only. Does not book, charge, dispatch, or send inquiries.',
    'Returns only public catalog facts for published listings.',
    'Availability, quotes, and job acceptance still need a human reply through the listing or qualified inquiry path.',
  ],
  schema: registryListInputSchema,
  outputSchema: publicBusinessCatalogApiV2PageSchema,
  parameters: listParameters,
  readOnly: true,
  surfaces: ['http', 'agentJson'],
  invocationContract: {
    version: 'registry.list:v2',
    consequenceClass: 'read_only',
    materialInputPaths: ['cursor', 'limit'],
    authorityRequirement: 'none',
    retryClass: 'replayable',
    expectedEvidence: ['public_registry_list_result'],
    safeContinuations: ['inspect_result'],
    invalidationConditions: ['action_contract_version_changed', 'cursor_changed', 'limit_changed'],
  },
  run: async ({ data }) => {
    return publicBusinessCatalogApiV2PageSchema.parse(await readPublicOfferingRegistryPage({
      ...(data.cursor === undefined ? {} : { cursor: data.cursor.trim() }),
      ...(data.limit === undefined ? {} : { limit: data.limit }),
    }))
  },
})

export const registrySearchAction = defineAction({
  id: 'registry.search',
  name: 'Search listed businesses',
  summary:
    'Search the Agentic Economy catalog for published businesses and Offerings. ' +
    'Returns the same public catalog subset as /api/businesses/search. ' +
    'Read-only and public-fact-only; always use this before naming providers in an answer.',
  boundaries: [
    'Read-only. Does not book, charge, dispatch, or send inquiries.',
    'Returns only public business and Offering facts, exact revisions, public access paths, and named AE support posture.',
    'The registry is literal. Misspelled suburbs (e.g. "paramata") do not auto-correct; choose better search arguments instead.',
    'Availability, quotes, and job acceptance still need a human reply through the listing or qualified inquiry path.',
  ],
  schema: registrySearchInputSchema,
  outputSchema: publicBusinessCatalogApiV2PageSchema,
  parameters: searchParameters,
  readOnly: true,
  surfaces: ['http', 'agentJson'],
  invocationContract: {
    version: 'registry.search:v2',
    consequenceClass: 'read_only',
    materialInputPaths: ['query', 'cursor', 'limit', 'mode', 'location'],
    authorityRequirement: 'none',
    retryClass: 'replayable',
    expectedEvidence: ['public_registry_search_result'],
    safeContinuations: ['inspect_result'],
    invalidationConditions: ['action_contract_version_changed', 'search_input_changed'],
  },
  run: async ({ data }) => {
    return publicBusinessCatalogApiV2PageSchema.parse(await readPublicOfferingRegistrySearchPage({
      query: data.query.trim(),
      ...(data.limit === undefined ? {} : { limit: data.limit }),
      ...(data.cursor === undefined ? {} : { cursor: data.cursor.trim() }),
      ...(data.mode === undefined ? {} : { mode: data.mode }),
      ...(data.location === undefined ? {} : { location: data.location.trim() }),
    }))
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
  outputSchema: publicBusinessCatalogV2DetailResultSchema,
  parameters: detailParameters,
  readOnly: true,
  surfaces: ['http', 'agentJson'],
  invocationContract: {
    version: 'registry.detail:v2',
    consequenceClass: 'read_only',
    materialInputPaths: ['slug'],
    authorityRequirement: 'none',
    retryClass: 'replayable',
    expectedEvidence: ['public_registry_detail_result'],
    safeContinuations: ['inspect_result'],
    invalidationConditions: ['action_contract_version_changed', 'slug_changed'],
  },
  run: async ({ data, context }) => {
    if (context.developmentOnlyRegistryDetailAdapter !== undefined) {
      return publicBusinessCatalogV2DetailResultSchema.parse(
        await context.developmentOnlyRegistryDetailAdapter({ slug: data.slug.trim() }),
      )
    }
    return publicBusinessCatalogV2DetailResultSchema.parse(
      await readPublicOfferingRegistryBusinessDetail({ slug: data.slug.trim() }),
    )
  },
})
