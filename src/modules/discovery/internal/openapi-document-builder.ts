import type { JSONSchema } from '@tanstack/ai'

import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'
import { annotateCallOpenApiExamples } from './openapi-call-examples'

import {
  agentApiOperations,
  HEAD_ROUTE_PATHS,
  callRouteOperations,
  fundingOperations,
  marketToolOperations,
  supplementalOperations,
} from './openapi-operations'
import {
  AGENT_ACCESS_SECURITY_SCHEME,
  buildPaths,
  byteSize,
  hoistLocalDefs,
  inlineDocumentSchemas,
  PROBLEM_JSON_SCHEMA,
} from './openapi-document-schema'
import type { NormalizedOperation, OpenApiBuildResult, OpenApiDocument } from './openapi-document-types'

const OPENAPI_VERSION = '3.1.0' as const
// Public contract revision, independent of app and CLI package versions.
// Before stability, update for changes to requests, defaults, responses or semantics.
const API_CONTRACT_VERSION = '1.0.0-alpha.2' as const
const BYTE_SIZE_INLINE_THRESHOLD = 300_000

function securitySchemeFor(canonicalBaseUrl: string): Readonly<{ type: 'http'; scheme: 'bearer'; description: string }> {
  return {
    type: 'http',
    scheme: 'bearer',
    description:
      `Agent access key. Connect through the OAuth device flow (\`ae connect\`) or the ` +
      `\`${trimTrailingSlashes(canonicalBaseUrl)}/.well-known/oauth-protected-resource\` metadata; ` +
      `send the resulting key as \`Authorization: Bearer <Agent access key>\`.`,
  }
}

/**
 * Assemble the OpenAPI 3.1 document plus the inline-vs-$ref size comparison
 * used to decide which shape is served. `$ref` wins once inlining would push
 * the document past ~300 KB (component reuse - the Problem schema alone is
 * referenced by every operation).
 */
export function buildOpenApiDocumentWithMetrics(input: Readonly<{ canonicalBaseUrl: string }>): OpenApiBuildResult {
  const supplemental = supplementalOperations()
  const funding = fundingOperations()
  const operations: readonly NormalizedOperation[] = [
    ...callRouteOperations(),
    ...marketToolOperations(),
    ...funding,
    ...supplemental,
    ...agentApiOperations(),
    ...[...funding, ...supplemental].filter((operation) => HEAD_ROUTE_PATHS[operation.path]).map((operation) => ({
      ...operation, operationId: `${operation.operationId}.head`, method: 'HEAD' as const,
      summary: `Check ${operation.summary.toLowerCase()}`,
    })),
  ]
  const schemas = new Map<string, JSONSchema>()
  schemas.set('Problem', hoistLocalDefs(PROBLEM_JSON_SCHEMA, schemas, 'Problem'))
  const paths = buildPaths(operations, schemas)
  annotateCallOpenApiExamples(paths, schemas)
  const origin = trimTrailingSlashes(input.canonicalBaseUrl)
  const securitySchemes = { [AGENT_ACCESS_SECURITY_SCHEME]: securitySchemeFor(origin) }
  const refDocument: OpenApiDocument = {
    openapi: OPENAPI_VERSION,
    info: { title: 'Agentic Economy API', version: API_CONTRACT_VERSION },
    servers: [{ url: origin }],
    paths,
    components: { schemas: Object.fromEntries(schemas), securitySchemes },
  }
  const refBytes = byteSize(refDocument)
  const inlined = inlineDocumentSchemas(paths, Object.fromEntries(schemas))
  const inlineDocument: OpenApiDocument = {
    openapi: OPENAPI_VERSION,
    info: { title: 'Agentic Economy API', version: API_CONTRACT_VERSION },
    servers: [{ url: origin }],
    paths: inlined.paths,
    components: { schemas: inlined.schemas, securitySchemes },
  }
  const inlineBytes = byteSize(inlineDocument)
  const chosen: 'ref' | 'inline' = inlineBytes > BYTE_SIZE_INLINE_THRESHOLD ? 'ref' : 'inline'
  return {
    document: chosen === 'ref' ? refDocument : inlineDocument,
    operationCount: operations.length,
    refBytes,
    inlineBytes,
    chosen,
  }
}

export function buildOpenApiDocument(input: Readonly<{ canonicalBaseUrl: string }>): OpenApiDocument {
  return buildOpenApiDocumentWithMetrics(input).document
}
