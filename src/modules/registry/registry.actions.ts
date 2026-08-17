import { z } from 'zod'

import {
  OfferingPriceTaxTreatmentValues,
  OfferingPriceUnitValues,
} from '@/modules/catalog/public'
import { exactAmountSchema } from '@/modules/money/public'
import { TrustTierValues, type BusinessContext } from '@/modules/business/public'
import {
  type CatalogOfferingOperationMapEntry,
  type InspectPlanInput,
  type InspectPlanResult,
  type OperationCompareInput,
  type OperationCompareResult,
  type OperationDetailInput,
  type OperationDetailResult,
  type OperationSearchInput,
  type OperationSearchResult,
} from '@/modules/capability-supply/public'
import {
  readCapabilityOperationCompare,
  readCapabilityOperationDetail,
  readCapabilityOperationInspectPlan,
  readCapabilityOperationSearch,
  readCatalogOfferingOperationMap,
} from '@/modules/capability-supply/operation-source'
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
  type PublicBusinessCatalogApiV2SearchPage,
  type PublicBusinessCatalogQueryInput,
  type PublicBusinessCatalogSearchInput,
  type PublicBusinessCatalogV2DetailResult,
  type PublicServicesApiPage,
  type PublicServicesSearchPage,
  type ServiceDto,
  projectPublicServicesPage,
  projectPublicServicesSearchPage,
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
  cursor: z.string().min(1).max(512).optional().describe('Pagination cursor from a previous catalog page'),
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
  cursor: z.string().min(1).max(512).optional().describe('Pagination cursor from a previous search page'),
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
  maxPrice: exactAmountSchema
    .optional()
    .describe('Budget ceiling as an exact amount with currency, integer units, and decimal exponent'),
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
    offeringRevision: z.number().int().nonnegative(),
    kind: z.literal('human_request'),
    channel: z.enum(['phone', 'website', 'ae_inquiry']),
    disclosure: z.string(),
    url: z.string().optional(),
  }),
  z.strictObject({
    accessPathRef: z.string(),
    offeringRevision: z.number().int().nonnegative(),
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

const offeringPriceOutputSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('fixed').describe('Fixed published price'),
    amount: exactAmountSchema.describe('Exact published amount: currency, integer units, and decimal exponent'),
    unit: z.enum(OfferingPriceUnitValues).optional().describe('Unit the price applies to'),
    taxTreatment: z.enum(OfferingPriceTaxTreatmentValues).describe('Published tax treatment'),
  }),
  z.strictObject({
    kind: z.literal('from').describe('Published starting price'),
    amount: exactAmountSchema.describe('Exact published amount: currency, integer units, and decimal exponent'),
    unit: z.enum(OfferingPriceUnitValues).optional().describe('Unit the price applies to'),
    taxTreatment: z.enum(OfferingPriceTaxTreatmentValues).describe('Published tax treatment'),
  }),
  z.strictObject({
    kind: z.literal('range').describe('Published bounded price range'),
    minimum: exactAmountSchema.describe('Exact lower amount: currency, integer units, and decimal exponent'),
    maximum: exactAmountSchema.describe('Exact upper amount: currency, integer units, and decimal exponent'),
    unit: z.enum(OfferingPriceUnitValues).optional().describe('Unit the price applies to'),
    taxTreatment: z.enum(OfferingPriceTaxTreatmentValues).describe('Published tax treatment'),
  }),
  z.strictObject({
    kind: z.literal('quote_only').describe('Price supplied after inquiry'),
    currency: z.string().describe('Currency code retained for quote-only pricing'),
    unit: z.enum(OfferingPriceUnitValues).optional().describe('Unit the price applies to'),
    taxTreatment: z.enum(OfferingPriceTaxTreatmentValues).describe('Published tax treatment'),
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
  price: offeringPriceOutputSchema.optional().describe('Comparable published price'),
  accessPaths: z.array(offeringAccessPathOutputSchema),
  support: z.strictObject({
    integrated: z.boolean(),
    aeSupportedAction: z.boolean(),
    observedAt: z.number().optional(),
    validUntil: z.number().optional(),
  }),
})

const businessContextOutputSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('local_human'),
    suburb: z.string(),
    stateTerritory: z.string(),
    postcode: z.string().optional(),
    publishedPhone: z.string().optional(),
  }),
  z.strictObject({
    kind: z.literal('programmable_provider'),
    website: z.string(),
    providerIdentifier: z.string(),
  }),
]) as z.ZodType<BusinessContext>

const publicBusinessCatalogApiV2DtoOutputSchema = z.strictObject({
  schemaVersion: z.literal(PublicBusinessCatalogApiSchemaVersion),
  businessId: z.string(),
  slug: z.string(),
  name: z.string(),
  category: z.string(),
  businessContext: businessContextOutputSchema,
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
  page: z.array(publicBusinessCatalogApiV2DtoOutputSchema),
  isDone: z.boolean(),
  continueCursor: z.string(),
}) as z.ZodType<PublicBusinessCatalogApiV2Page>
const registrySearchPageOutputSchema = z.strictObject({
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
}) as z.ZodType<PublicBusinessCatalogApiV2SearchPage>
const serviceOfferingOutputSchema = z.strictObject({
  offeringRef: z.string().describe('Published offering reference'),
  revision: z.number().int().nonnegative().describe('Published offering revision'),
  name: z.string().describe('Published offering name'),
  category: z.string().describe('Published offering category'),
  summary: z.string().describe('Published offering summary'),
  serviceAreaSummary: z.string().optional().describe('Published service area'),
  availabilitySummary: z.string().optional().describe('Exact published availability or timing note'),
  pricingSummary: z.string().optional().describe('Published offering pricing note'),
  price: offeringPriceOutputSchema.optional().describe('Comparable published offering price'),
  support: z.strictObject({
    integrated: z.boolean().describe('Whether the offering is capability-integrated'),
    routeable: z.boolean().describe('Whether the offering is currently routeable'),
    observedAt: z.number().optional().describe('Source observation time'),
    validUntil: z.number().optional().describe('Routeability validity window end'),
  }),
})

const serviceEndpointAuthenticationOutputSchema = z.union([
  z.strictObject({ kind: z.literal('keyless') }),
  z.strictObject({
    kind: z.literal('platform_credential'),
    scheme: z.literal('api_key'),
    in: z.enum(['query', 'header']),
    name: z.string(),
  }),
  z.strictObject({
    kind: z.literal('platform_credential'),
    scheme: z.literal('bearer'),
  }),
  z.strictObject({ kind: z.literal('x402') }),
  z.strictObject({ kind: z.literal('unknown') }),
])

const serviceEndpointOutputSchema = z.strictObject({
  url: z.string().describe('Published external endpoint link'),
  description: z.string().describe('Published endpoint description'),
  method: z.string().optional().describe('HTTP method when published'),
  pricing: z
    .strictObject({
      amount: z.string().optional().describe('Exact decimal amount'),
      currency: z.string().describe('Currency code for the decimal catalog price'),
      network: z.string().optional().describe('Admitted x402 payment network'),
      scheme: z.enum(['exact', 'upto']).describe('Decimal price scheme'),
      minAmount: z.string().optional().describe('Range minimum decimal amount'),
      maxAmount: z.string().optional().describe('Range maximum decimal amount'),
    })
    .optional()
    .describe('Decimal endpoint price when published'),
  providerName: z.string().optional().describe('Provider name only when linked supply is provider-owned'),
  serviceName: z.string().describe('Published business name in the legacy wire field'),
  tags: z.array(z.string()).describe('Published endpoint tags'),
  parameters: z
    .array(
      z.strictObject({
        group: z.enum(['body', 'path', 'query']).describe('Catalog-inferred parameter group'),
        name: z.string().describe('Parameter name'),
        type: z.string().describe('JSON-Schema type'),
        description: z.string().optional().describe('Parameter description'),
        example: z.unknown().optional().describe('Example value'),
        enumValues: z.array(z.string()).optional().describe('Allowed enum values'),
        default: z.unknown().optional().describe('Default value'),
        required: z.boolean().describe('Whether the parameter is required'),
      }),
    )
    .describe('Flat catalog parameters of the endpoint'),
  quality: z.null().describe('Traffic quality evidence, absent when not observed'),
  ae: z
    .strictObject({
      operationRef: z.string().regex(/^operation:v1:[0-9a-f]{64}$/).optional().describe('Canonical execution read link when linked to a capability operation'),
      offeringRef: z.string().describe('Published offering the endpoint belongs to'),
      provenance: z.enum(['business_declared', 'publicly_observed']).describe('Publication authority: declared by the business or observed publicly'),
      access: z.literal('external').describe('Published external Provider endpoint access'),
      authentication: serviceEndpointAuthenticationOutputSchema.describe('Public authentication classification without secret values'),
      execution: z.enum(['answer_tool', 'request_route', 'catalog_only']).describe('Public execution channel'),
      authorityMode: z.enum(['provider_owned', 'ae_curated_external', 'third_party_gateway', 'observed_external']).optional().describe('Publication authority mode when linked'),
      sourceKind: z.enum(['ae_envelope', 'openapi_http', 'mcp', 'agent_plugin_mcp', 'x402']).optional().describe('Publication source mode when linked'),
      authenticationSummary: z.string().optional().describe('Published authentication requirement'),
      settlementSupport: z
        .enum(['executable', 'catalog_only', 'unpriced'])
        .describe('Whether the published price can be settled by the execution path'),
    })
    .describe('AE execution and Publication provenance metadata'),
})

const servicePriceSummaryOutputSchema = z.strictObject({
  currency: z.string().describe('Currency shared by the exact source amounts'),
  minAmount: z.string().describe('Lowest published decimal amount'),
  maxAmount: z.string().describe('Highest published decimal amount'),
  avgCostPerTransaction: z.string().optional().describe('Average comparable decimal amount when derivable'),
  avgCostBasis: z.enum(['exact', 'varies']).describe('Whether the aggregate average is exact or varies'),
})

const serviceOutputSchema = z.strictObject({
  id: z.string().describe('Published business identifier'),
  name: z.string().describe('Published business name'),
  description: z.string().optional().describe('Published business portfolio description'),
  domain: z.string().optional().describe('Published Provider domain'),
  provider: z.string().optional().describe('Published business Provider'),
  providerUrl: z.string().optional().describe('Published business Provider URL'),
  category: z.string().describe('Published business category'),
  networks: z.array(z.string()).describe('Payment networks represented across linked Operations'),
  enriched: z.boolean().describe('Whether at least one endpoint is linked to an admitted Market Operation'),
  integrationType: z.enum(['1P', '3P']).describe('Provider-owned or third-party publication grouping'),
  isNew: z.boolean().optional().describe('Whether the business portfolio is newly published'),
  endpoints: z.array(serviceEndpointOutputSchema).describe('Flat external endpoint links published by the business portfolio'),
  priceSummary: servicePriceSummaryOutputSchema.optional().describe('Aggregate published decimal price summary'),
  serviceName: z.string().describe('Published business name in the legacy wire field'),
  tags: z.array(z.string()).describe('Published business portfolio tags'),
  iconUrl: z.string().optional().describe('Published business icon URL'),
  ae: z
    .strictObject({
      trustTier: z.enum(TrustTierValues).describe('Published business trust tier'),
      businessContext: businessContextOutputSchema.describe('Published business context'),
      publicUrl: z.string().describe('Published business URL'),
      responseTimeMinutes: z.number().optional().describe('Typical response window'),
      photos: z
        .array(z.strictObject({ url: z.string(), alt: z.string() }))
        .describe('Published business photos'),
      observedAt: z.number().describe('Source observation time for freshness context'),
      disposition: z.enum(['current', 'partial', 'stale']).describe('Catalog disposition'),
      source: z.literal('business_published').describe('Published business listing provenance'),
      offerings: z.array(serviceOfferingOutputSchema).describe('Local merchandising and inquiry listing view'),
      links: z
        .strictObject({
          business: z.string().describe('Provider business detail link'),
          manifest: z.string().describe('Publication manifest link'),
        })
        .describe('Related public discovery links'),
    })
    .describe('AE-local business portfolio and Publication provenance metadata'),
}) as z.ZodType<ServiceDto>

const servicesPageOutputSchema = z.strictObject({
  kind: z.literal('ok').describe('Successful published business portfolio response'),
  schemaVersion: z.literal(PublicServicesApiSchemaVersion).describe('Published business portfolio response schema version'),
  services: z.array(serviceOutputSchema).describe('One published business portfolio per business'),
  isDone: z.boolean(),
  continueCursor: z.string(),
}) as z.ZodType<PublicServicesApiPage>
const servicesSearchPageOutputSchema = z.strictObject({
  kind: z.literal('ok').describe('Successful published business portfolio response'),
  schemaVersion: z.literal(PublicServicesApiSchemaVersion).describe('Published business portfolio response schema version'),
  query: z.string().optional().describe('Echo of the supplied search query'),
  services: z.array(serviceOutputSchema).describe('Matching published business portfolios'),
  pagination: z
    .strictObject({
      cursor: z.string().optional().describe('Cursor used for this page'),
      nextCursor: z.string().optional().describe('Cursor for the next page'),
      limit: z.number().int().nonnegative().describe('Maximum source catalog items requested'),
      total: z.number().int().nonnegative().describe('Total source catalog items'),
      hasMore: z.boolean().describe('Whether another source catalog page exists'),
    })
    .describe('Computed search pagination'),
}) as z.ZodType<PublicServicesSearchPage>

const servicesDetailOutputSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('found').describe('Published business portfolio found'),
    schemaVersion: z.literal(PublicServicesApiSchemaVersion).describe('Published business portfolio response schema version'),
    service: serviceOutputSchema.describe('Published business portfolio projection'),
  }),
  z.strictObject({
    kind: z.literal('not_found').describe('Published business was not found'),
    code: z.literal('service_not_found'),
    reason: z.string(),
  }),
]) as z.ZodType<RegistryServicesDetailResult>

type RegistryServicesDetailResult = Readonly<
  | {
      kind: 'found'
      schemaVersion: typeof PublicServicesApiSchemaVersion
      service: ServiceDto
    }
  | {
      kind: 'not_found'
      code: 'service_not_found'
      reason: string
    }
>


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
    name: 'maxPrice',
    type: 'object',
    description:
      'Budget ceiling as an exact amount. Keeps a business when at least one offering fits. '
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
  schema: registryListInputSchema as z.ZodType<RegistryListActionInput>,
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
  run: async ({ data }) => projectCurrentOfferingInquiryPage(await readPublicOfferingRegistryPage(
    normalizeRegistryListInput(data),
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
    'maxPrice filters on the published comparable price using exact currency units and exponent. A business is kept when any one of its offerings fits the budget. An offering quoted on request has no comparable ceiling, so it is never removed by a budget: absence of a price is not evidence of an expensive one.',
    'hasPrice set to true narrows to businesses publishing at least one comparable price. Most local supply quotes on request, so this filter hides real options; use it only when a number is genuinely required.',
    'Availability, quotes, and job acceptance still need a human reply through the listing or qualified inquiry path.',
  ],
  schema: registrySearchInputSchema,
  outputSchema: registrySearchPageOutputSchema,
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
  invocationContract: {
    version: 'registry.search:v2',
    consequenceClass: 'read_only',
    materialInputPaths: ['query', 'limit', 'cursor', 'mode', 'location', 'maxPrice', 'hasPrice'],
    authorityRequirement: 'none',
    retryClass: 'replayable',
    expectedEvidence: ['public_registry_search_result'],
    safeContinuations: ['inspect_result'],
    invalidationConditions: [
      'action_contract_version_changed',
      'query_changed',
      'limit_changed',
      'cursor_changed',
      'mode_changed',
      'location_changed',
      'maxPrice_changed',
      'hasPrice_changed',
    ],
  },
  run: async ({ data, context }) => projectCurrentOfferingInquiryPage(await readPublicOfferingRegistrySearchPage(
    normalizeRegistrySearchInput(data),
    { ...(context.timing === undefined ? {} : { timing: context.timing }), surface: context.caller === 'answerThread' ? 'answer_thread' : 'registry_action' },
  )),
})

export const registryServicesListAction = defineAction({
  id: 'registry.services_list',
  name: 'List published business portfolios',
  summary:
    'List one public portfolio for each published business, including its offerings and external endpoint links. ' +
    'This is a read-only projection of the same public business catalog used by /api/businesses; it does not return Agent Services.',
  boundaries: [
    'Read-only. Does not book, charge, dispatch, or send inquiries.',
    'Returns one published business portfolio per business; offering facts remain under ae.offerings[].',
  ],
  schema: registryListInputSchema as z.ZodType<RegistryListActionInput>,
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
  invocationContract: {
    version: 'registry.services_list:v1',
    consequenceClass: 'read_only',
    materialInputPaths: ['cursor', 'limit'],
    authorityRequirement: 'none',
    retryClass: 'replayable',
    expectedEvidence: ['public_services_list_result'],
    safeContinuations: ['inspect_result'],
    invalidationConditions: ['action_contract_version_changed', 'cursor_changed', 'limit_changed'],
  },
  run: async ({ data }) => {
    const page = await projectCurrentOfferingInquiryPage(await readPublicOfferingRegistryPage(
      normalizeRegistryListInput(data),
    ))
    return projectPublicServicesPage(page, await offeringOperationMapFor(page.page.map((item) => item.businessId)))
  },
})

export const registryServicesSearchAction = defineAction({
  id: 'registry.services_search',
  name: 'Search published business portfolios',
  summary:
    'Search the public business catalog and return each matching business with its offering portfolio and external endpoint links. ' +
    'This is the same public business supply used by /api/businesses/search; it does not search Agent Services or select a Market Operation.',
  boundaries: [
    'Read-only. Does not book, charge, dispatch, or send inquiries.',
    'Returns one published business portfolio per business; offering facts remain under ae.offerings[].',
  ],
  schema: registrySearchInputSchema,
  outputSchema: servicesSearchPageOutputSchema,
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
  invocationContract: {
    version: 'registry.services_search:v1',
    consequenceClass: 'read_only',
    materialInputPaths: ['query', 'limit', 'cursor', 'mode', 'location', 'maxPrice', 'hasPrice'],
    authorityRequirement: 'none',
    retryClass: 'replayable',
    expectedEvidence: ['public_services_search_result'],
    safeContinuations: ['inspect_result'],
    invalidationConditions: [
      'action_contract_version_changed',
      'query_changed',
      'limit_changed',
      'cursor_changed',
      'mode_changed',
      'location_changed',
      'maxPrice_changed',
      'hasPrice_changed',
    ],
  },
  run: async ({ data, context }) => {
    const page = await projectCurrentOfferingInquiryPage(await readPublicOfferingRegistrySearchPage(
      normalizeRegistrySearchInput(data),
      { ...(context.timing === undefined ? {} : { timing: context.timing }), surface: 'registry_action' },
    ))
    const services = projectPublicServicesSearchPage(
      page,
      await offeringOperationMapFor(page.items.map((item) => item.businessId)),
    )
    // Echo the caller's query verbatim; the search pipeline normalizes internally.
    return { ...services, query: data.query }
  },
})
export const registryServicesDetailAction = defineAction({
  id: 'registry.services_detail',
  name: 'Read a published business portfolio',
  summary:
    'Read one published business portfolio by business slug. ' +
    'The detail response is the same portfolio projection returned by the list and search routes, not an Agent Service.',
  boundaries: [
    'Read-only. Does not book, charge, dispatch, or send inquiries.',
    'Returns only the public business portfolio for the requested business slug.',
    'A not_found result means no public business exists for that slug; do not invent Provider details.',
  ],
  schema: registryDetailInputSchema,
  outputSchema: servicesDetailOutputSchema,
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
  surfaces: ['http', 'agentJson'],
  invocationContract: {
    version: 'registry.services_detail:v1',
    consequenceClass: 'read_only',
    materialInputPaths: ['slug'],
    authorityRequirement: 'none',
    retryClass: 'replayable',
    expectedEvidence: ['public_services_detail_result'],
    safeContinuations: ['inspect_result'],
    invalidationConditions: ['action_contract_version_changed', 'slug_changed'],
  },
  run: async ({ data }) => {
    const detail = await projectCurrentOfferingInquiryDetail(
      await readPublicOfferingRegistryBusinessDetail({ slug: data.slug.trim() }),
    )
    if (detail.kind === 'not_found') {
      return {
        kind: 'not_found' as const,
        code: 'service_not_found' as const,
        reason: detail.reason,
      }
    }
    const page: PublicBusinessCatalogApiV2Page = {
      kind: 'ok',
      schemaVersion: PublicBusinessCatalogApiSchemaVersion,
      page: [detail.business],
      isDone: true,
      continueCursor: '',
    }
    const service = projectPublicServicesPage(
      page,
      await offeringOperationMapFor([detail.business.businessId]),
    ).services[0]
    if (service === undefined) {
      return {
        kind: 'not_found' as const,
        code: 'service_not_found' as const,
        reason: `Service ${data.slug.trim()} is not publicly available.`,
      }
    }
    return {
      kind: 'found' as const,
      schemaVersion: PublicServicesApiSchemaVersion,
      service,
    }
  },
})

type RegistryListActionInput = {
  cursor?: string | undefined
  limit?: number | undefined
}

type RegistryReadInput = RegistryListActionInput & {
  query?: string | undefined
  mode?: PublicBusinessCatalogSearchInput['mode'] | undefined
  location?: string | undefined
  maxPrice?: PublicBusinessCatalogSearchInput['maxPrice'] | undefined
  hasPrice?: boolean | undefined
}

function normalizeRegistryListInput(
  data: RegistryListActionInput,
): PublicBusinessCatalogQueryInput {
  return {
    paginationOpts: {
      numItems: normalizeActionLimit(data.limit),
      cursor: data.cursor?.trim() ?? null,
    },
  }
}

function normalizeRegistrySearchInput(
  data: RegistryReadInput & { query: string },
): PublicBusinessCatalogSearchInput {
  return {
    query: data.query.trim(),
    ...(data.cursor === undefined ? {} : { cursor: data.cursor.trim() }),
    ...(data.limit === undefined ? {} : { limit: data.limit }),
    ...(data.mode === undefined ? {} : { mode: data.mode }),
    ...(data.location === undefined ? {} : { location: data.location.trim() }),
    ...(data.maxPrice === undefined ? {} : { maxPrice: data.maxPrice }),
    ...(data.hasPrice === undefined ? {} : { hasPrice: data.hasPrice }),
  }
}

function normalizeActionLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return 20
  return Math.min(Math.max(Math.trunc(limit), 1), 50)
}

/**
 * W1 origin seam: fetch the per-offering admitted-operation map for the page's
 * businesses as plain data from the capability-supply source port. Any read
 * failure (e.g. capability supply unavailable / local registry fixture path)
 * degrades to an empty map — the projection simply leaves unlinked endpoints
 * un-enriched rather than throwing or fabricating.
 */
async function offeringOperationMapFor(
  businessIds: readonly string[],
): Promise<Readonly<Record<string, readonly CatalogOfferingOperationMapEntry[]>>> {
  if (businessIds.length === 0) return {}
  try {
    const entries = await readCatalogOfferingOperationMap(businessIds)
    const map: Record<string, CatalogOfferingOperationMapEntry[]> = {}
    for (const entry of entries) {
      const current = map[entry.offeringRef]
      if (current === undefined) map[entry.offeringRef] = [entry]
      else current.push(entry)
    }
    return map
  } catch {
    return {}
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
export {
  registryOperationsSearchAction,
  registryOperationsDetailAction,
  registryOperationsCompareAction,
  registryOperationsInspectPlanAction,
} from './operations.actions'
