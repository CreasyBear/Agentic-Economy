/**
 * OpenAPI 3.1 document builder (Well 8 Lane E). A pure projection: every
 * operation is data already owned by an existing contract source
 * (`listCallRouteDescriptors`, `TOOL_MARKET_ACTION_ENTRIES`,
 * `FUNDING_PREFLIGHT_ROUTE_CONTRACTS`, `OPENAPI_SUPPLEMENTAL_ROUTES`) - no
 * raw OpenAPI path is hand-written here.
 */

export { buildOpenApiDocument, buildOpenApiDocumentWithMetrics } from './openapi-document-builder'
export { listOpenApiOperationIds } from './openapi-operations'
export type { OpenApiBuildResult, OpenApiDocument } from './openapi-document-types'
