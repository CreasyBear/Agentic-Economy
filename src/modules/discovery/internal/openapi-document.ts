import { convertSchemaToJsonSchema, type JSONSchema } from '@tanstack/ai'
import { z } from 'zod'

import { CALL_ROUTE_CONTRACT } from '@/modules/capability-execution/call-entry'
import { PROBLEM_KINDS, DEFAULT_STATUS, type ProblemKind } from '@/lib/errors'
import { describeActionForAgent, findAction, listCallRouteDescriptors, type PublicCallRouteDescriptor } from '@/modules/actions'
import { FUNDING_PREFLIGHT_ROUTE_CONTRACTS } from '@/modules/money/public'
import { TOOL_MARKET_ACTION_ENTRIES } from '@/modules/registry/tool-entry'
import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'

import { OPENAPI_SUPPLEMENTAL_ROUTES } from './openapi-utility-routes'
// JSON import (same pattern as src/lib/cli-distribution.ts): no module alias covers the repo root.
import packageJson from '../../../../package.json'

/**
 * OpenAPI 3.1 document builder (Well 8 Lane E). A pure projection: every
 * operation is data already owned by an existing contract source
 * (`listCallRouteDescriptors`, `TOOL_MARKET_ACTION_ENTRIES`,
 * `FUNDING_PREFLIGHT_ROUTE_CONTRACTS`, `OPENAPI_SUPPLEMENTAL_ROUTES`) - no
 * raw OpenAPI path is hand-written here.
 */

const OPENAPI_VERSION = '3.1.0' as const
const AGENT_ACCESS_SECURITY_SCHEME = 'agentAccessKey' as const
const BYTE_SIZE_INLINE_THRESHOLD = 300_000

export type OpenApiDocument = Readonly<Record<string, unknown>>

export type OpenApiBuildResult = Readonly<{
  document: OpenApiDocument
  operationCount: number
  refBytes: number
  inlineBytes: number
  chosen: 'ref' | 'inline'
}>

type NormalizedParam = Readonly<{
  name: string
  description: string
  required: boolean
  schema: JSONSchema
}>

type NormalizedResponse = Readonly<{ status: number; schema: JSONSchema; mediaType: string; description: string }>

type NormalizedOperation = Readonly<{
  operationId: string
  summary: string
  tags: readonly string[]
  method: 'GET' | 'POST'
  path: string
  security: 'none' | Readonly<{ scope: string }>
  pathParams: readonly NormalizedParam[]
  queryParams: readonly NormalizedParam[]
  requestBodySchema?: JSONSchema
  responses: readonly NormalizedResponse[]
}>

const problemDetailsSchema = z.looseObject({
  type: z.literal('about:blank'),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  instance: z.string().optional(),
  kind: z.enum(PROBLEM_KINDS),
  code: z.string(),
  reason: z.string().optional(),
  retryable: z.boolean().optional(),
  'invalid-params': z.array(z.object({ name: z.string(), reason: z.string() })).optional(),
})

function jsonSchemaOf(schema: z.ZodType): JSONSchema {
  const converted = convertSchemaToJsonSchema(schema)
  if (converted === undefined) throw new Error('openapi_schema_conversion_failed')
  return converted
}

/**
 * Zod's JSON Schema conversion hoists any subschema it uses more than once,
 * or that is genuinely self-referential (e.g. the recursive `JsonValue`
 * shape `tool.quote`'s `input` accepts), into a local `$defs`/`definitions`
 * map scoped to that one conversion's own root, with `$ref`s pointing into
 * it. Once a fragment is placed under `components/schemas/<name>` that local
 * root no longer exists, so those refs would dangle - and a self-referential
 * def cannot simply be inlined away (that would require infinite JSON).
 * Hoist each local def into the shared component-schema map under a name
 * namespaced by `namePrefix` (so different operations' anonymous `__schema0`
 * defs never collide), rewriting every `$ref` - in the main schema and in
 * the def bodies themselves, including self-references - to point at its
 * new home, then return the main schema with its local defs removed.
 */
function hoistLocalDefs(schema: JSONSchema, schemas: Map<string, JSONSchema>, namePrefix: string): JSONSchema {
  const localDefs: Readonly<Record<string, JSONSchema>> = { ...schema.$defs, ...schema.definitions }
  if (Object.keys(localDefs).length === 0) return schema
  const nameFor = new Map<string, string>(
    Object.keys(localDefs).map((key) => [key, `${namePrefix}${operationIdToComponentName(key)}`]),
  )
  function rewrite(node: unknown): unknown {
    if (Array.isArray(node)) return node.map((item) => rewrite(item))
    if (node === null || typeof node !== 'object') return node
    const record = node as Record<string, unknown>
    const ref = record.$ref
    if (typeof ref === 'string') {
      const match = /^#\/(?:\$defs|definitions)\/(.+)$/u.exec(ref)
      const uniqueName = match?.[1] === undefined ? undefined : nameFor.get(match[1])
      if (uniqueName !== undefined) return { $ref: `#/components/schemas/${uniqueName}` }
    }
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(record)) {
      if (key === '$defs' || key === 'definitions') continue
      out[key] = rewrite(value)
    }
    return out
  }
  for (const [key, uniqueName] of nameFor) {
    schemas.set(uniqueName, rewrite(localDefs[key]) as JSONSchema)
  }
  return rewrite(schema) as JSONSchema
}

const PROBLEM_JSON_SCHEMA = jsonSchemaOf(problemDetailsSchema)

/** `{name}` segments of an OpenAPI path template, in order. */
function pathParamNames(path: string): readonly string[] {
  return [...path.matchAll(/\{([^}]+)\}/gu)].map((match) => match[1] ?? '')
}

/**
 * Call routes declare their whole invocation contract (including path-bound
 * fields like `callRef`) in one zod schema. Split that schema's top-level
 * properties into path params (matching the route's `{name}` segments),
 * query params (GET routes only - the remainder), and a request body schema
 * (POST routes only - the remainder) so the same JSON Schema the action
 * already carries becomes the transport-accurate OpenAPI shape.
 */
function splitActionSchemaForTransport(
  inputJsonSchema: JSONSchema | undefined,
  path: string,
  method: 'GET' | 'POST',
): Readonly<{ pathParams: readonly NormalizedParam[]; queryParams: readonly NormalizedParam[]; requestBodySchema?: JSONSchema }> {
  const names = pathParamNames(path)
  const properties = inputJsonSchema?.properties ?? {}
  const required = new Set(inputJsonSchema?.required ?? [])
  // Any of these fragments may carry a `$ref` into the whole schema's own
  // `$defs`/`definitions` (reused or self-referential subschemas, e.g. the
  // recursive JSON-value shape). That root disappears once a fragment is
  // extracted on its own, so carry the whole schema's local defs along with
  // every fragment - `hoistLocalDefs` (applied where each fragment is placed)
  // only hoists the ones actually referenced.
  const localDefs = { ...inputJsonSchema?.$defs, ...inputJsonSchema?.definitions }
  const withLocalDefs = (fragment: JSONSchema): JSONSchema =>
    Object.keys(localDefs).length === 0 ? fragment : { ...fragment, $defs: localDefs }
  const pathParams: NormalizedParam[] = names
    .filter((name) => name in properties)
    .map((name) => ({
      name, description: properties[name]?.description ?? '', required: true,
      schema: withLocalDefs(properties[name] as JSONSchema),
    }))
  const remainingEntries = Object.entries(properties).filter(([name]) => !names.includes(name))
  if (method === 'GET') {
    return {
      pathParams,
      queryParams: remainingEntries.map(([name, schema]) => ({
        name, description: schema.description ?? '', required: required.has(name), schema: withLocalDefs(schema),
      })),
    }
  }
  if (remainingEntries.length === 0) return { pathParams, queryParams: [] }
  return {
    pathParams,
    queryParams: [],
    requestBodySchema: withLocalDefs({
      type: 'object',
      properties: Object.fromEntries(remainingEntries),
      required: remainingEntries.map(([name]) => name).filter((name) => required.has(name)),
    }),
  }
}

const TOOL_QUOTE_ACTION_ID = 'tool.quote' as const

const CALL_ROUTE_FACTS: Readonly<Record<string, Readonly<{ summary: string; problemKinds: readonly ProblemKind[] }>>> = {
  [TOOL_QUOTE_ACTION_ID]: {
    summary: 'Resolve one expiring, caller-bound Quote for a Tool purchase.',
    problemKinds: ['UNAUTHENTICATED', 'PERMISSION_DENIED', 'INVALID_ARGUMENT', 'FAILED_PRECONDITION', 'RESOURCE_EXHAUSTED', 'UNAVAILABLE'],
  },
  [CALL_ROUTE_CONTRACT.call.actionId]: {
    summary: 'Execute a Tool Call against a returned Quote.',
    problemKinds: ['UNAUTHENTICATED', 'PERMISSION_DENIED', 'INVALID_ARGUMENT', 'FAILED_PRECONDITION', 'ALREADY_EXISTS', 'RESOURCE_EXHAUSTED', 'UNAVAILABLE', 'INTERNAL'],
  },
  [CALL_ROUTE_CONTRACT.list.actionId]: {
    summary: 'List the caller’s own Calls, newest first.',
    problemKinds: ['UNAUTHENTICATED', 'PERMISSION_DENIED', 'RESOURCE_EXHAUSTED'],
  },
  [CALL_ROUTE_CONTRACT.status.actionId]: {
    summary: 'Read one Call’s current state and receipt.',
    problemKinds: ['UNAUTHENTICATED', 'PERMISSION_DENIED', 'NOT_FOUND', 'RESOURCE_EXHAUSTED'],
  },
  [CALL_ROUTE_CONTRACT.cancel.actionId]: {
    summary: 'Cancel one Call before it settles.',
    problemKinds: ['UNAUTHENTICATED', 'PERMISSION_DENIED', 'NOT_FOUND', 'FAILED_PRECONDITION', 'RESOURCE_EXHAUSTED'],
  },
  [CALL_ROUTE_CONTRACT.reconcile.actionId]: {
    summary: 'Recover an uncertain Call outcome before retrying.',
    problemKinds: ['UNAUTHENTICATED', 'PERMISSION_DENIED', 'NOT_FOUND', 'FAILED_PRECONDITION', 'RESOURCE_EXHAUSTED', 'UNAVAILABLE'],
  },
}

function problemResponses(kinds: readonly ProblemKind[]): readonly NormalizedResponse[] {
  const statuses = new Set(kinds.map((kind) => DEFAULT_STATUS[kind]))
  return [...statuses].sort((a, b) => a - b).map((status) => ({
    status, schema: PROBLEM_JSON_SCHEMA, mediaType: 'application/problem+json', description: 'Problem Details (RFC 9457).',
  }))
}

function callRouteOperations(): readonly NormalizedOperation[] {
  return listCallRouteDescriptors().map((descriptor: PublicCallRouteDescriptor) => {
    const facts = CALL_ROUTE_FACTS[descriptor.actionId]
    if (facts === undefined) throw new Error(`openapi_call_route_facts_missing:${descriptor.actionId}`)
    const method = descriptor.method as 'GET' | 'POST'
    const split = splitActionSchemaForTransport(descriptor.inputJsonSchema, descriptor.path, method)
    const successSchema = descriptor.outputJsonSchema ?? { type: 'object' }
    return {
      operationId: descriptor.actionId,
      summary: facts.summary,
      tags: ['Call gateway'],
      method,
      path: descriptor.path,
      security: { scope: CALL_ROUTE_CONTRACT.scope },
      pathParams: split.pathParams,
      queryParams: split.queryParams,
      ...(split.requestBodySchema === undefined ? {} : { requestBodySchema: split.requestBodySchema }),
      responses: [
        { status: 200, schema: successSchema, mediaType: 'application/json', description: 'Success.' },
        ...problemResponses(facts.problemKinds),
      ],
    }
  })
}

const MARKET_TOOL_PROBLEM_KINDS: readonly ProblemKind[] = ['INVALID_ARGUMENT', 'UNAVAILABLE', 'RESOURCE_EXHAUSTED', 'INTERNAL']

function marketToolOperations(): readonly NormalizedOperation[] {
  return TOOL_MARKET_ACTION_ENTRIES.map((entry) => {
    const action = findAction(entry.actionId)
    if (action === undefined) throw new Error(`openapi_market_tool_action_missing:${entry.actionId}`)
    const descriptor = describeActionForAgent(action)
    const requestBodySchema = descriptor.inputJsonSchema
    const successSchema = descriptor.outputJsonSchema ?? { type: 'object' }
    return {
      operationId: entry.actionId,
      summary: `${descriptor.name}.`,
      tags: ['Tool market'],
      method: 'POST',
      path: entry.pathTemplate,
      security: 'none',
      pathParams: [],
      queryParams: [],
      ...(requestBodySchema === undefined ? {} : { requestBodySchema }),
      responses: [
        { status: 200, schema: successSchema, mediaType: 'application/json', description: 'Success.' },
        ...problemResponses(MARKET_TOOL_PROBLEM_KINDS),
      ],
    }
  })
}

function fundingOperations(): readonly NormalizedOperation[] {
  return FUNDING_PREFLIGHT_ROUTE_CONTRACTS.map((route) => ({
    operationId: `funding.${route.method === 'GET' ? 'constraints' : 'quote'}`,
    summary: `${route.label}.`,
    tags: ['Funding'],
    method: route.method,
    path: route.path,
    security: 'none',
    pathParams: [],
    queryParams: [],
    ...('inputSchema' in route ? { requestBodySchema: jsonSchemaOf(route.inputSchema) } : {}),
    responses: [
      { status: 200, schema: jsonSchemaOf(route.outputSchema), mediaType: 'application/json', description: 'Success.' },
      ...problemResponses(['INVALID_ARGUMENT', 'RESOURCE_EXHAUSTED']),
    ],
  }))
}

function supplementalOperations(): readonly NormalizedOperation[] {
  return OPENAPI_SUPPLEMENTAL_ROUTES.map((route) => {
    const outputSchema = route.actionIdForOutput === undefined
      ? (route.outputSchema === undefined ? undefined : jsonSchemaOf(route.outputSchema))
      : describeActionForAgent(requireAction(route.actionIdForOutput)).outputJsonSchema
    if (outputSchema === undefined) throw new Error(`openapi_supplemental_output_missing:${route.operationId}`)
    const successStatuses = route.successStatuses ?? [200]
    return {
      operationId: route.operationId,
      summary: `${route.summary}.`,
      tags: route.tags,
      method: route.method,
      path: route.path,
      security: 'none',
      pathParams: (route.pathParams ?? []).map((param) => ({ ...param, schema: jsonSchemaOf(param.schema) })),
      queryParams: (route.queryParams ?? []).map((param) => ({ ...param, schema: jsonSchemaOf(param.schema) })),
      ...(route.requestBodySchema === undefined ? {} : { requestBodySchema: jsonSchemaOf(route.requestBodySchema) }),
      responses: [
        ...successStatuses.map((status) => ({ status, schema: outputSchema, mediaType: 'application/json', description: 'Success.' })),
        ...problemResponses(route.problemKinds),
      ],
    }
  })
}

function requireAction(actionId: string) {
  const action = findAction(actionId)
  if (action === undefined) throw new Error(`openapi_action_missing:${actionId}`)
  return action
}

function operationIdToComponentName(operationId: string): string {
  return operationId
    .split(/[._-]/u)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

function documentVersion(): string {
  return packageJson.version
}

function securitySchemeFor(canonicalBaseUrl: string): Readonly<{ type: 'http'; scheme: 'bearer'; description: string }> {
  return {
    type: 'http',
    scheme: 'bearer',
    description:
      `AE agent access key. Connect through the OAuth device flow (\`ae connect\`) or the ` +
      `\`${trimTrailingSlashes(canonicalBaseUrl)}/.well-known/oauth-protected-resource\` metadata; ` +
      `send the resulting key as \`Authorization: Bearer <token>\`.`,
  }
}

function buildPaths(
  operations: readonly NormalizedOperation[],
  schemas: Map<string, JSONSchema>,
): Record<string, Record<string, unknown>> {
  const paths: Record<string, Record<string, unknown>> = {}
  for (const operation of operations) {
    const componentBase = operationIdToComponentName(operation.operationId)
    const parameters = [
      ...operation.pathParams.map((param) => ({
        name: param.name, in: 'path', required: true, description: param.description,
        schema: hoistLocalDefs(param.schema, schemas, `${componentBase}${operationIdToComponentName(param.name)}`),
      })),
      ...operation.queryParams.map((param) => ({
        name: param.name, in: 'query', required: param.required, description: param.description,
        schema: hoistLocalDefs(param.schema, schemas, `${componentBase}${operationIdToComponentName(param.name)}`),
      })),
    ]
    let requestBody: Record<string, unknown> | undefined
    if (operation.requestBodySchema !== undefined) {
      const name = `${componentBase}Request`
      schemas.set(name, hoistLocalDefs(operation.requestBodySchema, schemas, name))
      requestBody = {
        required: true,
        content: { 'application/json': { schema: { $ref: `#/components/schemas/${name}` } } },
      }
    }
    const responses: Record<string, unknown> = {}
    for (const response of operation.responses) {
      const isProblem = response.mediaType === 'application/problem+json'
      const schemaName = isProblem ? 'Problem' : `${componentBase}Response`
      if (!isProblem) schemas.set(schemaName, hoistLocalDefs(response.schema, schemas, schemaName))
      const existing = responses[String(response.status)] as Record<string, unknown> | undefined
      const content = (existing?.content as Record<string, unknown> | undefined) ?? {}
      responses[String(response.status)] = {
        description: response.description,
        content: { ...content, [response.mediaType]: { schema: { $ref: `#/components/schemas/${schemaName}` } } },
      }
    }
    const operationObject: Record<string, unknown> = {
      operationId: operation.operationId,
      summary: operation.summary,
      tags: operation.tags,
      ...(parameters.length === 0 ? {} : { parameters }),
      ...(requestBody === undefined ? {} : { requestBody }),
      responses,
      ...(operation.security === 'none' ? { security: [] } : {
        security: [{ [AGENT_ACCESS_SECURITY_SCHEME]: [operation.security.scope] }],
      }),
    }
    const pathItem = paths[operation.path] ?? {}
    pathItem[operation.method.toLowerCase()] = operationObject
    paths[operation.path] = pathItem
  }
  return paths
}

/**
 * Recursively replace every `{ $ref: '#/components/schemas/Name' }` with a
 * deep copy of that schema. `path` is the chain of component names currently
 * being expanded on this branch: a self- or mutually-referential component
 * (the hoisted recursive JSON-value defs) cannot be inlined without
 * producing infinite JSON, so a ref back to a name already in `path` is left
 * as a `$ref` instead of expanded again.
 */
function inlineRefs(node: unknown, schemas: Readonly<Record<string, JSONSchema>>, path: ReadonlySet<string> = new Set()): unknown {
  if (Array.isArray(node)) return node.map((item) => inlineRefs(item, schemas, path))
  if (node === null || typeof node !== 'object') return node
  const record = node as Record<string, unknown>
  const ref = record.$ref
  if (typeof ref === 'string' && ref.startsWith('#/components/schemas/')) {
    const name = ref.slice('#/components/schemas/'.length)
    const target = schemas[name]
    if (target === undefined || path.has(name)) return node
    return inlineRefs(target, schemas, new Set([...path, name]))
  }
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) out[key] = inlineRefs(value, schemas, path)
  return out
}

/** Every `#/components/schemas/Name` still referenced somewhere in `node`. */
function collectComponentRefs(node: unknown, into: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectComponentRefs(item, into)
    return
  }
  if (node === null || typeof node !== 'object') return
  const record = node as Record<string, unknown>
  const ref = record.$ref
  if (typeof ref === 'string' && ref.startsWith('#/components/schemas/')) into.add(ref.slice('#/components/schemas/'.length))
  for (const value of Object.values(record)) collectComponentRefs(value, into)
}

/**
 * Inline every acyclic `$ref` in `paths`, then keep in `components.schemas`
 * only the (necessarily cyclic) components that inlining could not remove -
 * each expanded up to its own first repeat, so the retained set is the
 * transitive closure actually still referenced.
 */
function inlineDocumentSchemas(
  paths: Record<string, Record<string, unknown>>,
  schemas: Readonly<Record<string, JSONSchema>>,
): Readonly<{ paths: Record<string, unknown>; schemas: Record<string, JSONSchema> }> {
  const inlinedPaths = inlineRefs(paths, schemas) as Record<string, unknown>
  const retained: Record<string, JSONSchema> = {}
  const initial = new Set<string>()
  collectComponentRefs(inlinedPaths, initial)
  const pending: string[] = [...initial]
  const done = new Set<string>()
  for (let name = pending.pop(); name !== undefined; name = pending.pop()) {
    if (done.has(name)) continue
    done.add(name)
    const body = schemas[name]
    if (body === undefined) continue
    const inlinedBody = inlineRefs(body, schemas, new Set([name])) as JSONSchema
    retained[name] = inlinedBody
    const nested = new Set<string>()
    collectComponentRefs(inlinedBody, nested)
    for (const nestedName of nested) if (!done.has(nestedName)) pending.push(nestedName)
  }
  return { paths: inlinedPaths, schemas: retained }
}

function byteSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length
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

/** Every operation id the built document must expose - the parity guard's source of truth. */
export function listOpenApiOperationIds(): readonly string[] {
  return [
    ...listCallRouteDescriptors().map((descriptor) => descriptor.actionId),
    ...TOOL_MARKET_ACTION_ENTRIES.map((entry) => entry.actionId),
    ...FUNDING_PREFLIGHT_ROUTE_CONTRACTS.map((route) => `funding.${route.method === 'GET' ? 'constraints' : 'quote'}`),
    ...OPENAPI_SUPPLEMENTAL_ROUTES.map((route) => route.operationId),
  ]
}
