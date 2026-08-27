import { z } from 'zod'

import {
  OfferingPriceTaxTreatmentValues,
  OfferingPriceUnitValues,
} from '@/modules/catalog/public'
import { exactAmountSchema } from '@/modules/money/public'
import { TrustTierValues, type BusinessContext } from '@/modules/business/public'
import { type ActionParameter } from '@/modules/common/action'
import {
  PublicBusinessCatalogApiSchemaVersion,
  PublicServicesApiSchemaVersion,
  type PublicBusinessCatalogApiV2Dto,
  type PublicBusinessCatalogApiV2Page,
  type PublicBusinessCatalogApiV2SearchPage,
  type PublicBusinessCatalogV2DetailResult,
  type PublicServicesApiPage,
  type PublicServicesSearchPage,
  type ServiceDto,
} from '@/modules/registry/public'

export const registryListInputSchema = z.strictObject({
  cursor: z.string().min(1).max(512).optional().describe('Pagination cursor from a previous catalog page'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe('Maximum listings to return'),
})

export const registrySearchInputSchema = z.strictObject({
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

export const registryDetailInputSchema = z.strictObject({
  slug: z.string().min(1).max(200).describe('Published business slug'),
})

export const offeringAccessPathOutputSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    accessPathRef: z.string(),
    offeringRevision: z.number().int().nonnegative(),
    kind: z.literal('human_request'),
    channel: z.enum(['phone', 'website']),
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

export const offeringPriceOutputSchema = z.discriminatedUnion('kind', [
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
    kind: z.literal('quote_only').describe('Price supplied on request'),
    currency: z.string().describe('Currency code retained for quote-only pricing'),
    unit: z.enum(OfferingPriceUnitValues).optional().describe('Unit the price applies to'),
    taxTreatment: z.enum(OfferingPriceTaxTreatmentValues).describe('Published tax treatment'),
  }),
])

export const offeringOutputSchema = z.strictObject({
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

export const businessContextOutputSchema = z.discriminatedUnion('kind', [
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

export const publicBusinessCatalogApiV2DtoOutputSchema = z.strictObject({
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

export const registryPageOutputSchema = z.strictObject({
  kind: z.literal('ok'),
  schemaVersion: z.literal(PublicBusinessCatalogApiSchemaVersion),
  page: z.array(publicBusinessCatalogApiV2DtoOutputSchema),
  isDone: z.boolean(),
  continueCursor: z.string(),
}) as z.ZodType<PublicBusinessCatalogApiV2Page>
export const registrySearchPageOutputSchema = z.strictObject({
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
export const serviceOfferingOutputSchema = z.strictObject({
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

export const serviceEndpointAuthenticationOutputSchema = z.union([
  z.strictObject({ kind: z.literal('ae_api_key') }),
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

export const serviceEndpointOutputSchema = z.strictObject({
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
  serviceName: z.string().describe('Published business name for endpoint grouping'),
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
      execution: z.enum(['operation_call', 'request_route', 'catalog_only']).describe('Public execution channel'),
      authorityMode: z.enum(['provider_owned', 'ae_curated_external', 'third_party_gateway', 'observed_external']).optional().describe('Publication authority mode when linked'),
      sourceKind: z.enum(['ae_envelope', 'openapi_http', 'mcp', 'agent_plugin_mcp', 'x402']).optional().describe('Publication source mode when linked'),
      authenticationSummary: z.string().optional().describe('Published authentication requirement'),
      settlementSupport: z
        .enum(['executable', 'catalog_only', 'unpriced'])
        .describe('Whether the published price can be settled by the execution path'),
    })
    .describe('AE execution and Publication provenance metadata'),
})

export const servicePriceSummaryOutputSchema = z.strictObject({
  currency: z.string().describe('Currency shared by the exact source amounts'),
  minAmount: z.string().describe('Lowest published decimal amount'),
  maxAmount: z.string().describe('Highest published decimal amount'),
  avgCostPerTransaction: z.string().optional().describe('Average comparable decimal amount when derivable'),
  avgCostBasis: z.enum(['exact', 'varies']).describe('Whether the aggregate average is exact or varies'),
})

export const serviceOutputSchema = z.strictObject({
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
  serviceName: z.string().describe('Published business name for portfolio grouping'),
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
      offerings: z.array(serviceOfferingOutputSchema).describe('Supplier Operation portfolio view'),
      links: z
        .strictObject({
          business: z.string().describe('Provider business detail link'),
          manifest: z.string().describe('Publication manifest link'),
        })
        .describe('Related public discovery links'),
    })
    .describe('Agentic Economy supplier portfolio and Publication source metadata'),
}) as z.ZodType<ServiceDto>

export const servicesPageOutputSchema = z.strictObject({
  kind: z.literal('ok').describe('Successful published business portfolio response'),
  schemaVersion: z.literal(PublicServicesApiSchemaVersion).describe('Published business portfolio response schema version'),
  services: z.array(serviceOutputSchema).describe('One published business portfolio per business'),
  isDone: z.boolean(),
  continueCursor: z.string(),
}) as z.ZodType<PublicServicesApiPage>
export const servicesSearchPageOutputSchema = z.strictObject({
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

export const servicesDetailOutputSchema = z.discriminatedUnion('kind', [
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

export type RegistryServicesDetailResult = Readonly<
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


export const registryDetailOutputSchema = z.discriminatedUnion('kind', [
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

export const listParameters: readonly ActionParameter[] = [
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

export const searchParameters: readonly ActionParameter[] = [
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
    description: 'Place to search around when mode is near_me, for example "Berlin" or "New York".',
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

export const detailParameters: readonly ActionParameter[] = [
  {
    name: 'slug',
    type: 'string',
    description: 'Published business slug to read in full.',
    required: true,
  },
]


