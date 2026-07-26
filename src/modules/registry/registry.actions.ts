import { z } from 'zod'

import { TrustTierValues } from '@/modules/business/public'
import { defineAction, type ActionParameter } from '@/modules/common/action'
import {
  readPublicOfferingRegistryBusinessDetail,
  readPublicOfferingRegistryPage,
  readPublicOfferingRegistrySearchPage,
} from '@/modules/registry/registry.functions'
import {
  projectCurrentOfferingInquiryDetail,
  projectCurrentOfferingInquiryPage,
} from '@/modules/registry/public-inquiry-projection'
import { PublicBusinessCatalogApiSchemaVersion } from '@/modules/registry/public'
import type {
  PublicBusinessCatalogApiV2Dto,
  PublicBusinessCatalogApiV2Page,
  PublicBusinessCatalogQueryInput,
  PublicBusinessCatalogV2DetailResult,
} from '@/modules/registry/public'

/**
 * Read-only AE actions over the public Offering supply projection.
 *
 * `registry.list`, `registry.search` and `registry.detail` are the machine
 * counterparts to `/api/businesses`, `/api/businesses/search` and
 * `/api/businesses/$slug`. Those routes invoke these actions, so the HTTP
 * response and the registered contract are one code path over one projection.
 * They stay literal: the registry does not typo-correct suburbs or rewrite
 * queries. Misspelling recovery is the caller's job - it chooses better tool
 * arguments, and the chosen input is persisted as tool evidence by the
 * answer-thread turn orchestrator.
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
  maxPriceMinor: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Budget ceiling in minor currency units, for example 25000 for $250'),
  hasPrice: z
    .boolean()
    .optional()
    .describe('When true, return only businesses publishing at least one comparable price'),
})

const registryDetailInputSchema = z.strictObject({
  slug: z.string().min(1).max(200).describe('Published business slug'),
})

const offeringAccessPathOutputSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    accessPathRef: z.string(),
    kind: z.literal('human_request'),
    channel: z.enum(['phone', 'website', 'ae_inquiry']),
    disclosure: z.string(),
    url: z.string().optional(),
  }),
  z.strictObject({
    accessPathRef: z.string(),
    kind: z.literal('external_operation'),
    name: z.string(),
    summary: z.string(),
    url: z.string(),
    method: z.string().optional(),
    documentationUrl: z.string().optional(),
    interfaceDescription: z.strictObject({ format: z.string(), url: z.string().optional() }).optional(),
    authenticationSummary: z.string().optional(),
    pricingSummary: z.string().optional(),
    provenance: z.enum(['business_declared', 'publicly_observed']),
  }),
])

const offeringOutputSchema = z.strictObject({
  offeringRef: z.string(),
  revision: z.number().int().nonnegative(),
  name: z.string(),
  category: z.string(),
  summary: z.string(),
  serviceAreaSummary: z.string().optional(),
  availabilitySummary: z.string().optional(),
  pricingSummary: z.string().optional(),
  accessPaths: z.array(offeringAccessPathOutputSchema),
  support: z.strictObject({
    integrated: z.boolean(),
    aeSupportedAction: z.boolean(),
    observedAt: z.number().optional(),
    validUntil: z.number().optional(),
  }),
})

const publicBusinessCatalogApiV2DtoOutputSchema = z.strictObject({
  schemaVersion: z.literal(PublicBusinessCatalogApiSchemaVersion),
  businessId: z.string(),
  slug: z.string(),
  name: z.string(),
  category: z.string(),
  suburb: z.string(),
  stateTerritory: z.string(),
  publishedPhone: z.string().optional(),
  postcode: z.string().optional(),
  publicUrl: z.string(),
  trustTier: z.enum(TrustTierValues),
  responseTimeMinutes: z.number().optional(),
  photos: z.array(z.strictObject({ url: z.string(), alt: z.string() })),
  observedAt: z.number(),
  disposition: z.enum(['current', 'partial', 'stale']),
  offerings: z.array(offeringOutputSchema),
  accessSummary: z.strictObject({
    humanRequest: z.boolean(),
    externalOperation: z.boolean(),
    aeSupportedAction: z.boolean(),
  }),
}) as z.ZodType<PublicBusinessCatalogApiV2Dto>

const registryPageOutputSchema = z.strictObject({
  kind: z.literal('ok'),
  schemaVersion: z.literal(PublicBusinessCatalogApiSchemaVersion),
  query: z.string().optional(),
  items: z.array(publicBusinessCatalogApiV2DtoOutputSchema),
  pagination: z.strictObject({
    cursor: z.string().optional(),
    nextCursor: z.string().optional(),
    limit: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    hasMore: z.boolean(),
  }),
}) as z.ZodType<PublicBusinessCatalogApiV2Page>

const registryDetailOutputSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('found'),
    schemaVersion: z.literal(PublicBusinessCatalogApiSchemaVersion),
    business: publicBusinessCatalogApiV2DtoOutputSchema,
  }),
  z.strictObject({
    kind: z.literal('not_found'),
    code: z.literal('business_not_found'),
    reason: z.string(),
  }),
]) as z.ZodType<PublicBusinessCatalogV2DetailResult>

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
  {
    name: 'maxPriceMinor',
    type: 'number',
    description:
      'Budget ceiling in minor currency units (25000 means $250.00). Keeps a business when at least one of its offerings fits. '
      + 'An offering quoted on request, or one with no published price, has no comparable ceiling and is never removed by this filter.',
    required: false,
  },
  {
    name: 'hasPrice',
    type: 'boolean',
    description:
      'When true, return only businesses where at least one offering publishes a comparable price. '
      + 'Omit it, or pass false, to search all listings.',
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
    'List published Agentic Economy business supply. ' +
    'Returns exactly what /api/businesses returns: that route runs this action.',
  boundaries: [
    'Read-only. Does not book, charge, dispatch, or send inquiries.',
    'Returns only public supply facts for published listings.',
    'Availability, quotes, and job acceptance still need a human reply through the listing or qualified inquiry path.',
  ],
  schema: registryListInputSchema as z.ZodType<PublicBusinessCatalogQueryInput>,
  outputSchema: registryPageOutputSchema,
  parameters: listParameters,
  readOnly: true,
  surfaces: ['http', 'agentJson'],
  run: async ({ data }) => projectCurrentOfferingInquiryPage(await readPublicOfferingRegistryPage({
    ...(data.cursor === undefined ? {} : { cursor: data.cursor.trim() }),
    ...(data.limit === undefined ? {} : { limit: data.limit }),
  })),
})

export const registrySearchAction = defineAction({
  id: 'registry.search',
  name: 'Search listed businesses',
  summary:
    'Search the Agentic Economy catalog for published local service businesses. ' +
    'Returns exactly what /api/businesses/search returns: that route runs this action. ' +
    'Read-only and public-fact-only; always use this before naming providers in an answer.',
  boundaries: [
    'Read-only. Does not book, charge, dispatch, or send inquiries.',
    'Returns only public supply facts: slug, name, category, suburb, trust tier, and each offering\'s summary, service area, availability, price, and published access paths.',
    'An access path is how a person can reach the business, not a bookable slot. An AE-supported offering is still not a booking, payment, or dispatch.',
    'The registry is literal. Misspelled suburbs (e.g. "paramata") do not auto-correct; choose better search arguments instead.',
    'maxPriceMinor filters on the published comparable price, in minor units. A business is kept when any one of its offerings fits the budget. An offering quoted on request has no comparable ceiling, so it is never removed by a budget: absence of a price is not evidence of an expensive one.',
    'hasPrice set to true narrows to businesses publishing at least one comparable price. Most local supply quotes on request, so this filter hides real options; use it only when a number is genuinely required.',
    'Availability, quotes, and job acceptance still need a human reply through the listing or qualified inquiry path.',
  ],
  schema: registrySearchInputSchema,
  outputSchema: registryPageOutputSchema,
  parameters: searchParameters,
  readOnly: true,
  surfaces: ['http', 'agentJson', 'answerThread'],
  run: async ({ data, context }) => projectCurrentOfferingInquiryPage(await readPublicOfferingRegistrySearchPage({
    query: data.query.trim(),
    ...(data.limit === undefined ? {} : { limit: data.limit }),
    ...(data.cursor === undefined ? {} : { cursor: data.cursor.trim() }),
    ...(data.mode === undefined ? {} : { mode: data.mode }),
    ...(data.location === undefined ? {} : { location: data.location.trim() }),
    ...(data.maxPriceMinor === undefined ? {} : { maxPriceMinor: data.maxPriceMinor }),
    ...(data.hasPrice === undefined ? {} : { hasPrice: data.hasPrice }),
  }, { ...(context.timing === undefined ? {} : { timing: context.timing }), surface: 'registry_action' })),
})

export const registryDetailAction = defineAction({
  id: 'registry.detail',
  name: 'Read a listed business',
  summary:
    'Read one published business supply record by slug. ' +
    'Returns exactly what /api/businesses/$slug returns: that route runs this action. ' +
    'A missing slug returns a not_found result.',
  boundaries: [
    'Read-only. Does not book, charge, dispatch, or send inquiries.',
    'Returns only public supply facts for the requested slug.',
    'A not_found result means no public listing exists for that slug; do not invent provider details.',
  ],
  schema: registryDetailInputSchema,
  outputSchema: registryDetailOutputSchema,
  parameters: detailParameters,
  readOnly: true,
  surfaces: ['http', 'agentJson', 'answerThread'],
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
      return registryDetailOutputSchema.parse(
        await context.developmentOnlyRegistryDetailAdapter({ slug: data.slug.trim() }),
      )
    }
    return projectCurrentOfferingInquiryDetail(
      await readPublicOfferingRegistryBusinessDetail({ slug: data.slug.trim() }),
    )
  },
})
