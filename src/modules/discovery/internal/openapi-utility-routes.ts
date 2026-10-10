import { z } from 'zod'

import { exactAmountSchema } from '@/modules/money/public'

import type { ProblemKind } from '@/lib/errors'
import { marketWindowSchema } from '@/modules/market/contracts'

/**
 * Declarative OpenAPI route facts for the public surfaces that are not
 * already registered actions with an `inputJsonSchema`/`outputJsonSchema`
 * pair: the `/api/businesses*` and `/api/v1/businesses*` reads (registered
 * actions, but invoked over query-string/path-param GET rather than a JSON
 * body, so the wire parameter names differ from the action's own schema
 * vocabulary) and the five platform utility routes that have no backing
 * action at all. Each entry is data, consumed by
 * `openapi-document.ts` - no raw OpenAPI path is hand-written there.
 */

export type OpenApiRouteParam = Readonly<{
  name: string
  description: string
  required: boolean
  schema: z.ZodType
}>

export type OpenApiSupplementalRoute = Readonly<{
  operationId: string
  summary: string
  method: 'GET' | 'POST'
  /** OpenAPI path template; `{name}` segments match `pathParams`. */
  path: string
  tags: readonly string[]
  pathParams?: readonly OpenApiRouteParam[]
  queryParams?: readonly OpenApiRouteParam[]
  requestBodySchema?: z.ZodType
  /** Resolve the response schema from a registered action's outputSchema. */
  actionIdForOutput?: string
  /** Response schema for routes with no backing action. */
  outputSchema?: z.ZodType
  /** Defaults to `[200]`; `/api/v1/release` also documents its `503` body. */
  successStatuses?: readonly number[]
  problemKinds: readonly ProblemKind[]
}>

const cursorParam: OpenApiRouteParam = {
  name: 'cursor', description: 'Opaque pagination cursor from a previous page.', required: false,
  schema: z.string().min(1).max(512),
}
const limitParam: OpenApiRouteParam = {
  name: 'limit', description: 'Maximum rows to return (1-50, default 20).', required: false,
  schema: z.coerce.number().int().min(1).max(50).default(20),
}
const searchQueryParams: readonly OpenApiRouteParam[] = [
  { name: 'q', description: 'Search phrase.', required: false, schema: z.string().max(200) },
  { name: 'mode', description: 'Search scope.', required: false, schema: z.enum(['near_me', 'whole_catalogue', 'near', 'catalogue', 'catalog']) },
  { name: 'location', description: 'Place to search around when mode is near_me.', required: false, schema: z.string().max(80) },
  { name: 'max_price_currency', description: 'Exact amount currency code, including supported token symbols.', required: false, schema: exactAmountSchema.shape.currency },
  { name: 'max_price_units', description: 'Budget ceiling integer units.', required: false, schema: exactAmountSchema.shape.units },
  { name: 'max_price_exponent', description: 'Budget ceiling decimal exponent.', required: false, schema: exactAmountSchema.shape.exponent },
  { name: 'has_price', description: 'When true, return only businesses publishing at least one comparable price.', required: false, schema: z.enum(['true', 'false', '1', '0']) },
  cursorParam,
  limitParam,
]

const listQueryParams: readonly OpenApiRouteParam[] = [cursorParam, limitParam]

const releaseIdentitySchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('ok'), sourceRevision: z.string() }),
  z.strictObject({ kind: z.literal('unavailable'), reason: z.literal('source_revision_unconfigured') }),
])

const catalogueStatusSchema = z.strictObject({
  schemaVersion: z.literal('catalogue-status:v1'),
  status: z.string().describe('Freshness state of the x402 directory index.'),
  refreshState: z.enum(['none', 'refreshing', 'complete', 'failed']),
  generation: z.string().optional(),
  completedAt: z.number().optional(),
  ageHours: z.number().optional(),
  lastError: z.string().optional(),
})

const marketMetricsSchema = z.strictObject({
  window: marketWindowSchema,
  generatedAt: z.string(),
  x402Ecosystem: z.record(z.string(), z.unknown()).describe('External x402 ecosystem projection.'),
  agenticEconomy: z.record(z.string(), z.unknown()).describe('First-party AE market projection.'),
})

const sandboxReferenceRequestSchema = z.strictObject({
  request: z.string().optional(),
})
const sandboxReferenceResponseSchema = z.strictObject({
  result: z.string(),
})

const registryBrowseSchema = z.strictObject({
  schemaVersion: z.literal('api-registry:v4'),
  query: z.string(),
  kind: z.literal('ok'),
  coverage: z.strictObject({ generation: z.string(), completedAt: z.number() }),
  page: z.array(z.strictObject({
    id: z.string().regex(/^registry:[a-f0-9]{64}$/u),
    source: z.enum(['coinbase', 'provider']),
    access: z.enum(['ae_callable', 'setup_required', 'unavailable']),
    reason: z.string().optional(),
    sourceRouteRef: z.string().optional(),
    toolRef: z.string().optional(),
    title: z.string(),
    summary: z.string(),
    provider: z.string(),
    actionClass: z.enum(['retrieve', 'transform', 'analyze', 'create', 'mutate', 'other', 'unclassified']),
    objectClass: z.enum(['web', 'document', 'image', 'location', 'chain', 'data', 'other', 'unclassified']),
    category: z.string().optional(),
    completedAt: z.number(),
    detailRef: z.string(),
  })).max(12),
  pagination: z.strictObject({ limit: z.number().int().min(1).max(12), nextCursor: z.string().optional(), hasMore: z.boolean() }),
  freshness: z.record(z.string(), z.unknown()),
})

const registryDetailSchema = z.strictObject({
  schemaVersion: z.literal('api-registry-detail:v1'),
  kind: z.literal('found'),
  id: z.string().regex(/^registry:[a-f0-9]{64}$/u),
  access: z.enum(['ae_callable', 'setup_required', 'unavailable']),
  reason: z.string().optional(),
  coverage: z.strictObject({ generation: z.string(), completedAt: z.number() }),
  item: z.looseObject({
    entry: z.looseObject({
      metadataJson: z.string().describe('Full retained source JSON; returned only on exact detail.'),
      input: z.looseObject({ schemaJson: z.string().optional() }).optional(),
      output: z.looseObject({ schemaJson: z.string().optional() }).optional(),
    }),
    toolRef: z.string().optional(),
  }),
  freshness: z.record(z.string(), z.unknown()),
})

export const OPENAPI_SUPPLEMENTAL_ROUTES: readonly OpenApiSupplementalRoute[] = Object.freeze([
  {
    operationId: 'registry.list', summary: 'List published businesses', method: 'GET', path: '/api/businesses',
    tags: ['Businesses'], queryParams: listQueryParams, actionIdForOutput: 'registry.list',
    problemKinds: ['INVALID_ARGUMENT', 'FAILED_PRECONDITION', 'RESOURCE_EXHAUSTED'],
  },
  {
    operationId: 'registry.search', summary: 'Search published businesses', method: 'GET', path: '/api/businesses/search',
    tags: ['Businesses'], queryParams: searchQueryParams, actionIdForOutput: 'registry.search',
    problemKinds: ['INVALID_ARGUMENT', 'FAILED_PRECONDITION', 'RESOURCE_EXHAUSTED'],
  },
  {
    operationId: 'registry.detail', summary: 'Read one published business', method: 'GET', path: '/api/businesses/{slug}',
    tags: ['Businesses'], pathParams: [{ name: 'slug', description: 'Published business slug.', required: true, schema: z.string().min(1).max(200) }],
    actionIdForOutput: 'registry.detail',
    problemKinds: ['INVALID_ARGUMENT', 'NOT_FOUND', 'RESOURCE_EXHAUSTED'],
  },
  {
    operationId: 'registry.services_list', summary: 'List published business portfolios', method: 'GET', path: '/api/v1/businesses',
    tags: ['Businesses'], queryParams: listQueryParams, actionIdForOutput: 'registry.services_list',
    problemKinds: ['INVALID_ARGUMENT', 'FAILED_PRECONDITION', 'RESOURCE_EXHAUSTED'],
  },
  {
    operationId: 'registry.services_search', summary: 'Search published business portfolios', method: 'GET', path: '/api/v1/businesses/search',
    tags: ['Businesses'], queryParams: searchQueryParams, actionIdForOutput: 'registry.services_search',
    problemKinds: ['INVALID_ARGUMENT', 'FAILED_PRECONDITION', 'RESOURCE_EXHAUSTED'],
  },
  {
    operationId: 'registry.services_detail', summary: 'Read one published business portfolio', method: 'GET', path: '/api/v1/businesses/{businessId}',
    tags: ['Businesses'], pathParams: [{ name: 'businessId', description: 'Published business id (slug).', required: true, schema: z.string().min(1).max(200) }],
    actionIdForOutput: 'registry.services_detail',
    problemKinds: ['INVALID_ARGUMENT', 'NOT_FOUND', 'RESOURCE_EXHAUSTED'],
  },
  {
    operationId: 'platform.release', summary: 'Read the deployed release identity', method: 'GET', path: '/api/v1/release',
    tags: ['Platform'], outputSchema: releaseIdentitySchema, successStatuses: [200, 503], problemKinds: [],
  },
  {
    operationId: 'platform.catalogueStatus', summary: 'Read x402 directory catalogue freshness', method: 'GET', path: '/api/v1/catalogue-status',
    tags: ['Platform'], outputSchema: catalogueStatusSchema, problemKinds: ['UNAVAILABLE', 'RESOURCE_EXHAUSTED'],
  },
  {
    operationId: 'platform.marketMetrics', summary: 'Read the public market metrics projection', method: 'GET', path: '/api/v1/market-metrics',
    tags: ['Platform'],
    queryParams: [{ name: 'window', description: 'Aggregation window; defaults to 30d.', required: false, schema: marketWindowSchema }],
    outputSchema: marketMetricsSchema, problemKinds: ['INVALID_ARGUMENT', 'UNAVAILABLE', 'RESOURCE_EXHAUSTED'],
  },
  {
    operationId: 'platform.sandboxReference', summary: 'Call AEcon’s development-only sandbox reference counterparty', method: 'POST', path: '/api/v1/sandbox-reference',
    tags: ['Platform'], requestBodySchema: sandboxReferenceRequestSchema, outputSchema: sandboxReferenceResponseSchema,
    problemKinds: ['NOT_FOUND', 'UNSUPPORTED_MEDIA_TYPE', 'INVALID_ARGUMENT', 'PAYLOAD_TOO_LARGE', 'RESOURCE_EXHAUSTED'],
  },
  {
    operationId: 'platform.registryBrowse', summary: 'Search the compact x402 directory index', method: 'GET', path: '/api/v1/registry',
    tags: ['Platform'],
    queryParams: [
      { name: 'query', description: 'Free-text query; empty browses without a search term.', required: false, schema: z.string().max(200) },
      { name: 'limit', description: 'Maximum page size (1-12, default 8); each response stays under 16 KiB UTF-8.', required: false, schema: z.coerce.number().int().min(1).max(12) },
      { ...cursorParam, schema: z.string().min(1).max(16384) },
    ],
    outputSchema: registryBrowseSchema, problemKinds: ['INVALID_ARGUMENT', 'UNAVAILABLE', 'RESOURCE_EXHAUSTED'],
  },
  {
    operationId: 'platform.registryExternalDetail', summary: 'Inspect one indexed x402 directory entry', method: 'GET', path: '/api/v1/registry/detail',
    tags: ['Platform'],
    queryParams: [{ name: 'id', description: 'Opaque ID returned by the compact registry search.', required: true, schema: z.string().regex(/^registry:[a-f0-9]{64}$/u) }],
    outputSchema: registryDetailSchema, problemKinds: ['INVALID_ARGUMENT', 'NOT_FOUND', 'UNAVAILABLE', 'RESOURCE_EXHAUSTED'],
  },
])
