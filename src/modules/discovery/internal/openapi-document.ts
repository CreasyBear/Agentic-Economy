/**
 * OpenAPI 3.1 document builder. Projects every public api.v1 route from the
 * registered action schemas and route contracts, including payer-safe funding
 * status and HEAD variants. The route-source parity test prevents omissions.
 */

export { buildOpenApiDocument, buildOpenApiDocumentWithMetrics } from './openapi-document-builder'
export { listOpenApiOperationIds } from './openapi-operations'
export type { OpenApiBuildResult, OpenApiDocument } from './openapi-document-types'
