import type { JSONSchema } from '@tanstack/ai'

import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'

import {
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
// JSON import (same pattern as src/lib/cli-distribution.ts): no module alias covers the repo root.
import packageJson from '../../../../package.json'

const OPENAPI_VERSION = '3.1.0' as const
const BYTE_SIZE_INLINE_THRESHOLD = 300_000

function documentVersion(): string {
  return packageJson.version
}

function securitySchemeFor(canonicalBaseUrl: string): Readonly<{ type: 'http'; scheme: 'bearer'; description: string }> {
  return {
    type: 'http',
    scheme: 'bearer',
    description:
      `AE Agent access key. Connect through the OAuth device flow (\`ae connect\`) or the ` +
      `\`${trimTrailingSlashes(canonicalBaseUrl)}/.well-known/oauth-protected-resource\` metadata; ` +
      `send the resulting key as \`Authorization: Bearer <token>\`.`,
  }
}

/**
 * Assemble the OpenAPI 3.1 document plus the inline-vs-$ref size comparison
 * used to decide which shape is served. `$ref` wins once inlining would push
 * the document past ~300 KB (component reuse - the Problem schema alone is
 * referenced by every operation).
 */
export function buildOpenApiDocumentWithMetrics(input: Readonly<{ canonicalBaseUrl: string }>): OpenApiBuildResult {
  const operations: readonly NormalizedOperation[] = [
    ...callRouteOperations(),
    ...marketToolOperations(),
    ...fundingOperations(),
    ...supplementalOperations(),
  ]
  const schemas = new Map<string, JSONSchema>()
  schemas.set('Problem', hoistLocalDefs(PROBLEM_JSON_SCHEMA, schemas, 'Problem'))
  const paths = buildPaths(operations, schemas)
  const origin = trimTrailingSlashes(input.canonicalBaseUrl)
  const securitySchemes = { [AGENT_ACCESS_SECURITY_SCHEME]: securitySchemeFor(origin) }
  const refDocument: OpenApiDocument = {
    openapi: OPENAPI_VERSION,
    info: { title: 'Agentic Economy API', version: documentVersion() },
    servers: [{ url: origin }],
    paths,
    components: { schemas: Object.fromEntries(schemas), securitySchemes },
  }
  const refBytes = byteSize(refDocument)
  const inlined = inlineDocumentSchemas(paths, Object.fromEntries(schemas))
  const inlineDocument: OpenApiDocument = {
    openapi: OPENAPI_VERSION,
    info: { title: 'Agentic Economy API', version: documentVersion() },
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
