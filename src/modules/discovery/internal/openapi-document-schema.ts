import { convertSchemaToJsonSchema, type JSONSchema } from '@tanstack/ai'
import { z } from 'zod'

import { PROBLEM_KINDS } from '@/lib/errors'

import type { NormalizedOperation } from './openapi-document-types'

export const AGENT_ACCESS_SECURITY_SCHEME = 'agentAccessKey' as const

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

export function jsonSchemaOf(schema: z.ZodType): JSONSchema {
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
export function hoistLocalDefs(schema: JSONSchema, schemas: Map<string, JSONSchema>, namePrefix: string): JSONSchema {
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

export const PROBLEM_JSON_SCHEMA = jsonSchemaOf(problemDetailsSchema)

function operationIdToComponentName(operationId: string): string {
  return operationId
    .split(/[._-]/u)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

export function buildPaths(
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
export function inlineDocumentSchemas(
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

export function byteSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length
}
