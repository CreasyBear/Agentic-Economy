import { z } from 'zod'

import {
  OfferingPriceKindValues,
  OfferingPriceTaxTreatmentValues,
  OfferingPriceUnitValues,
} from '@/modules/catalog/public'
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
import {
  PublicBusinessCatalogApiSchemaVersion,
  PublicServicesApiSchemaVersion,
  type PublicBusinessCatalogApiV2Dto,
  type PublicBusinessCatalogApiV2Page,
  type PublicBusinessCatalogQueryInput,
  type PublicBusinessCatalogSearchInput,
  type PublicBusinessCatalogV2DetailResult,
  type PublicServicesApiPage,
  projectPublicServicesPage,
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

const offeringPriceOutputSchema = z.strictObject({
  kind: z.enum(OfferingPriceKindValues).describe('Published price shape'),
  currency: z.string().describe('ISO 4217 currency code'),
  amountMinor: z.number().optional().describe('Published amount in minor currency units'),
  maximumAmountMinor: z.number().optional().describe('Published upper amount in minor currency units'),
  unit: z.enum(OfferingPriceUnitValues).optional().describe('Unit the price applies to'),
  taxTreatment: z.enum(OfferingPriceTaxTreatmentValues).describe('Published tax treatment'),
})

const offeringOutputSchema = z.strictObject({
  offeringRef: z.string(),
  revision: z.number().int().nonnegative(),
  name: z.string(),
  category: z.string(),
  summary: z.string(),
  serviceAreaSummary: z.string().optional(),
  availabilitySummary: z.string().optional(),
  pricingSummary: z.string().optional(),
  price: offeringPriceOutputSchema.optional().describe('Comparable published price'),
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
const serviceEndpointOutputSchema = z.strictObject({
  url: z.string().describe('Callable external operation URL'),
  method: z.string().optional().describe('HTTP method when published'),
  name: z.string().describe('Published operation name'),
  summary: z.string().describe('Published operation summary'),
  pricingSummary: z.string().optional().describe('Published operation pricing note'),
  authenticationSummary: z.string().optional().describe('Published authentication requirement'),
  provenance: z.enum(['business_declared', 'publicly_observed']).describe('How the operation was published'),
  access: z.enum(['open', 'external']).describe('Whether the operation is keyless AE sandbox access'),
})

const serviceOutputSchema = z.strictObject({
  id: z.string().describe('Published offering reference'),
  revision: z.number().int().nonnegative().describe('Published offering revision'),
  business: z
    .strictObject({
      slug: z.string().describe('Published business slug'),
      name: z.string().describe('Published business name'),
      suburb: z.string().optional().describe('Published business suburb'),
      stateTerritory: z.string().optional().describe('Published business state or territory'),
    })
    .describe('Business that publishes the offering'),
  name: z.string().describe('Published offering name'),
  category: z.string().describe('Published offering category'),
  summary: z.string().describe('Published offering summary'),
  pricingSummary: z.string().optional().describe('Published offering pricing note'),
  availabilitySummary: z.string().optional().describe('Exact published availability or timing note'),
  observedAt: z.number().optional().describe('Source observation time for freshness context'),
  price: offeringPriceOutputSchema.optional().describe('Comparable published offering price'),
  endpoints: z.array(serviceEndpointOutputSchema).describe('Published external operation endpoints'),
  links: z
    .strictObject({
      business: z.string().describe('Business detail API link'),
      manifest: z.string().describe('Business UCP-shaped manifest link'),
    })
    .describe('Related public discovery links'),
})

const servicesPageOutputSchema = z.strictObject({
  kind: z.literal('ok').describe('Successful services response'),
  schemaVersion: z.literal(PublicServicesApiSchemaVersion).describe('Services response schema version'),
  query: z.string().optional().describe('Echo of the supplied search query'),
  services: z.array(serviceOutputSchema).describe('Published offerings flattened into services'),
  pagination: z
    .strictObject({
      cursor: z.string().optional().describe('Cursor used for this page'),
      nextCursor: z.string().optional().describe('Cursor for the next page'),
      limit: z.number().int().nonnegative().describe('Maximum source catalog items requested'),
      total: z.number().int().nonnegative().describe('Total source catalog items'),
      hasMore: z.boolean().describe('Whether another source catalog page exists'),
    })
    .describe('Source catalog pagination passthrough'),
}) as z.ZodType<PublicServicesApiPage>


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
  effect: {
    class: 'observation',
    reversible: true,
    recipientKind: 'none',
    dataClasses: [],
    spendExposure: 'none',
    approval: 'none',
  },
  surfaces: ['http', 'agentJson'],
  run: async ({ data }) => projectCurrentOfferingInquiryPage(await readPublicOfferingRegistryPage(
    normalizeRegistryReadInput(data),
  )),
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
  effect: {
    class: 'observation',
    reversible: true,
    recipientKind: 'none',
    dataClasses: [],
    spendExposure: 'none',
    approval: 'none',
  },
  surfaces: ['http', 'agentJson', 'answerThread'],
  run: async ({ data, context }) => projectCurrentOfferingInquiryPage(await readPublicOfferingRegistrySearchPage(
    normalizeRegistryReadInput(data),
    { ...(context.timing === undefined ? {} : { timing: context.timing }), surface: 'registry_action' },
  )),
})

export const registryServicesListAction = defineAction({
  id: 'registry.services_list',
  name: 'List published services',
  summary:
    'List each published offering as a callable-service discovery entry. ' +
    'This is a read-only projection of the same public business supply used by /api/businesses.',
  boundaries: [
    'Read-only. Does not book, charge, dispatch, or send inquiries.',
    'Returns only public supply facts for published offerings and their external operation paths.',
    'An open endpoint is an AE sandbox operation, not proof of provider fulfilment or payment.',
  ],
  schema: registryListInputSchema as z.ZodType<PublicBusinessCatalogQueryInput>,
  outputSchema: servicesPageOutputSchema,
  parameters: listParameters,
  readOnly: true,
  effect: {
    class: 'observation',
    reversible: true,
    recipientKind: 'none',
    dataClasses: [],
    spendExposure: 'none',
    approval: 'none',
  },
  surfaces: ['http', 'agentJson', 'mcp'],
  run: async ({ data }) => projectPublicServicesPage(
    await projectCurrentOfferingInquiryPage(await readPublicOfferingRegistryPage(
      normalizeRegistryReadInput(data),
    )),
  ),
})

export const registryServicesSearchAction = defineAction({
  id: 'registry.services_search',
  name: 'Search published services',
  summary:
    'Search published offerings as callable-service discovery entries. ' +
    'This is a read-only projection of the same public business supply used by /api/businesses/search.',
  boundaries: [
    'Read-only. Does not book, charge, dispatch, or send inquiries.',
    'Returns only public supply facts for published offerings and their external operation paths.',
    'An open endpoint is an AE sandbox operation, not proof of provider fulfilment or payment.',
  ],
  schema: registrySearchInputSchema,
  outputSchema: servicesPageOutputSchema,
  parameters: searchParameters,
  readOnly: true,
  effect: {
    class: 'observation',
    reversible: true,
    recipientKind: 'none',
    dataClasses: [],
    spendExposure: 'none',
    approval: 'none',
  },
  surfaces: ['http', 'agentJson', 'mcp'],
  run: async ({ data, context }) => {
    const page = projectPublicServicesPage(
      await projectCurrentOfferingInquiryPage(await readPublicOfferingRegistrySearchPage(
        normalizeRegistryReadInput(data),
        { ...(context.timing === undefined ? {} : { timing: context.timing }), surface: 'registry_action' },
      )),
    )
    // Echo the caller's query verbatim; the search pipeline normalizes internally.
    return { ...page, query: data.query }
  },
})
type RegistryReadInput = {
  cursor?: string | undefined
  limit?: number | undefined
  query?: string | undefined
  mode?: PublicBusinessCatalogSearchInput['mode'] | undefined
  location?: string | undefined
  maxPriceMinor?: number | undefined
  hasPrice?: boolean | undefined
}

function normalizeRegistryReadInput(data: RegistryReadInput & { query: string }): PublicBusinessCatalogSearchInput
function normalizeRegistryReadInput(data: RegistryReadInput): PublicBusinessCatalogQueryInput
function normalizeRegistryReadInput(
  data: RegistryReadInput,
): PublicBusinessCatalogSearchInput | PublicBusinessCatalogQueryInput {
  const shared: PublicBusinessCatalogQueryInput = {
    ...(data.cursor === undefined ? {} : { cursor: data.cursor.trim() }),
    ...(data.limit === undefined ? {} : { limit: data.limit }),
  }
  if (data.query === undefined) return shared
  return {
    ...shared,
    query: data.query.trim(),
    ...(data.mode === undefined ? {} : { mode: data.mode }),
    ...(data.location === undefined ? {} : { location: data.location.trim() }),
    ...(data.maxPriceMinor === undefined ? {} : { maxPriceMinor: data.maxPriceMinor }),
    ...(data.hasPrice === undefined ? {} : { hasPrice: data.hasPrice }),
  }
}

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
  effect: {
    class: 'observation',
    reversible: true,
    recipientKind: 'none',
    dataClasses: [],
    spendExposure: 'none',
    approval: 'none',
  },
  surfaces: ['http', 'agentJson', 'answerThread', 'mcp'],
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
