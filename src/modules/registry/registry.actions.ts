import { z } from 'zod'

import { defineAction, type ActionParameter } from '@/modules/common/action'
import {
  readPublicRegistryBusinessDetail,
  readPublicRegistrySearchPage,
} from '@/modules/registry/registry.functions'
import type {
  PublicBusinessCatalogApiDto,
  PublicBusinessCatalogApiPage,
  PublicBusinessCatalogDetailResult,
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

const registrySearchInputSchema = z.object({
  query: z.string().max(200).describe('Search query for listed businesses'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe('Maximum providers to return'),
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

const registryDetailInputSchema = z.object({
  slug: z.string().min(1).max(200).describe('Published business slug'),
})

const publicBusinessCatalogApiDtoOutputSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    category: z.string(),
    suburb: z.string(),
    stateTerritory: z.string(),
    postcode: z.string().optional(),
    publicUrl: z.string(),
    trustTier: z.string(),
    publicStatus: z.literal('published'),
    indexStatus: z.string(),
    discoveryStatus: z.string(),
    schemaVersion: z.string(),
    updatedAt: z.number(),
    photos: z.array(z.object({ url: z.string(), alt: z.string() }).passthrough()),
    responseTimeMinutes: z.number().optional(),
    services: z.array(
      z
        .object({
          slug: z.string(),
          name: z.string(),
          category: z.string(),
          summary: z.string(),
          serviceArea: z.string(),
          hoursOrUnknown: z.string(),
          firstRequest: z
            .object({
              mode: z.string(),
              publicDisclosure: z.string(),
              publicChannel: z.string(),
              noContactReason: z.string().optional(),
            })
            .passthrough(),
          status: z.literal('published'),
          capabilities: z.array(
            z.object({ kind: z.string(), status: z.string() }).passthrough()
          ),
        })
        .passthrough()
    ),
  })
  .passthrough() as z.ZodType<PublicBusinessCatalogApiDto>

const registrySearchOutputSchema = z
  .object({
    kind: z.literal('ok'),
    schemaVersion: z.string(),
    query: z.string().optional(),
    items: z.array(publicBusinessCatalogApiDtoOutputSchema),
    pagination: z
      .object({
        cursor: z.string().optional(),
        nextCursor: z.string().optional(),
        limit: z.number().int().nonnegative(),
        total: z.number().int().nonnegative(),
        hasMore: z.boolean(),
      })
      .passthrough(),
  })
  .passthrough() as z.ZodType<PublicBusinessCatalogApiPage>

const registryDetailOutputSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('found'),
      schemaVersion: z.string(),
      business: publicBusinessCatalogApiDtoOutputSchema,
    })
    .passthrough(),
  z
    .object({
      kind: z.literal('not_found'),
      code: z.literal('business_not_found'),
      reason: z.string(),
    })
    .passthrough(),
]) as z.ZodType<PublicBusinessCatalogDetailResult>

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
  outputSchema: registrySearchOutputSchema,
  parameters: searchParameters,
  readOnly: true,
  surfaces: ['http', 'agentJson', 'agentTools'],
  run: async ({ data, context }) => {
    const page = await readPublicRegistrySearchPage({
      query: data.query.trim(),
      ...(data.limit === undefined ? {} : { limit: data.limit }),
      ...(data.mode === undefined ? {} : { mode: data.mode }),
      ...(data.location === undefined ? {} : { location: data.location.trim() }),
    }, context.timing === undefined ? {} : { timing: context.timing })
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
  outputSchema: registryDetailOutputSchema,
  parameters: detailParameters,
  readOnly: true,
  surfaces: ['http', 'agentJson', 'agentTools'],
  run: async ({ data }) => {
    const result = await readPublicRegistryBusinessDetail({ slug: data.slug.trim() })
    return result as PublicBusinessCatalogDetailResult
  },
})
