import type { JSONSchema } from '@tanstack/ai'

import { CALL_ROUTE_CONTRACT } from '@/modules/capability-execution/call-entry'
import { TOOL_PROCURE_ACTION_ID } from '@/modules/capability-execution/procure.actions'
import { type ProblemKind } from '@/lib/errors'
import { describeActionForAgent, findAction, listCallRouteDescriptors, type PublicCallRouteDescriptor } from '@/modules/actions'
import { FUNDING_PREFLIGHT_ROUTE_CONTRACTS } from '@/modules/money/public'
import { TOOL_MARKET_ACTION_ENTRIES } from '@/modules/registry/tool-entry'

import { OPENAPI_SUPPLEMENTAL_ROUTES } from './openapi-utility-routes'
import { jsonSchemaOf, problemResponses } from './openapi-document-schema'
import { agentApiOperations } from './openapi-agent-routes'
import type { NormalizedOperation, NormalizedParam } from './openapi-document-types'
export { agentApiOperations } from './openapi-agent-routes'
export const HEAD_ROUTE_PATHS: Readonly<Record<string, true>> = {
  '/api/v1/catalogue-status': true,
  '/api/v1/funding/constraints': true,
  '/api/v1/market-metrics': true,
  '/api/v1/registry': true,
  '/api/v1/release': true,
}

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
  if (remainingEntries.length === 0 && names.length === 0 && inputJsonSchema !== undefined && inputJsonSchema.properties === undefined) {
    return { pathParams: [], queryParams: [], requestBodySchema: inputJsonSchema }
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
  [TOOL_PROCURE_ACTION_ID]: {
    summary: 'Procure the exact published Tool within an authorised budget.',
    problemKinds: ['UNAUTHENTICATED', 'PERMISSION_DENIED', 'INVALID_ARGUMENT', 'FAILED_PRECONDITION', 'ALREADY_EXISTS', 'RESOURCE_EXHAUSTED', 'UNAVAILABLE', 'INTERNAL'],
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

export function callRouteOperations(): readonly NormalizedOperation[] {
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
      ...(method === 'POST' && (descriptor.actionId === TOOL_PROCURE_ACTION_ID || descriptor.inputJsonSchema?.properties?.idempotencyKey !== undefined)
        ? { description: 'Retry the same logical operation with the same idempotencyKey in the JSON body; a changed payload conflicts.' }
        : {}),
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

export function marketToolOperations(): readonly NormalizedOperation[] {
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

export function fundingOperations(): readonly NormalizedOperation[] {
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

export function supplementalOperations(): readonly NormalizedOperation[] {
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

/** Every operation id the built document must expose; route-file parity is checked separately. */
export function listOpenApiOperationIds(): readonly string[] {
  return [
    ...listCallRouteDescriptors().map((descriptor) => descriptor.actionId),
    ...TOOL_MARKET_ACTION_ENTRIES.map((entry) => entry.actionId),
    ...FUNDING_PREFLIGHT_ROUTE_CONTRACTS.map((route) => `funding.${route.method === 'GET' ? 'constraints' : 'quote'}`),
    ...OPENAPI_SUPPLEMENTAL_ROUTES.map((route) => route.operationId),
    ...agentApiOperations().map((route) => route.operationId),
    ...OPENAPI_SUPPLEMENTAL_ROUTES.filter((route) => HEAD_ROUTE_PATHS[route.path]).map((route) => `${route.operationId}.head`),
    ...FUNDING_PREFLIGHT_ROUTE_CONTRACTS
      .filter((route) => HEAD_ROUTE_PATHS[route.path])
      .map(() => 'funding.constraints.head'),
  ]
}
