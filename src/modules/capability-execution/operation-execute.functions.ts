import { defaultBodySerializer } from 'openapi-fetch'
import { z } from 'zod'

import type { BoundedRequestBody } from '@/lib/server/bounded-request-body'
import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import { validateJsonSchema } from '@/modules/capability-contract/public'
import { exactAmountSchema } from '@/modules/money/public'
import { prepareHttpJsonRequest, responseContentTypeMatches } from '@/modules/capability-supply/route-transport-runtime'
import {
  isAnonymousKeylessOperationEligible,
  isPublicOperationRef,
  validPublicHttpsEndpoint,
  type AnonymousKeylessOperationEffect,
  type HttpJsonHeaderParameterMapping,
  type HttpJsonPathParameterMapping,
  type HttpJsonQueryParameterMapping,
  type PublicOperationPrice,
} from '@/modules/capability-supply/public'

/**
 * Keyless operation execution, fully DB-driven.
 *
 * The DB (capability-supply publications/bindings) is the single source of
 * truth for what an operation is and how to run it: endpoint, HTTP config
 * (method + input->query mapping + fixed query + timeout), authority,
 * provenance and contract schemas. This executor does NOT hand-register any
 * specific operation; it takes an {@link operationRef} the agent found via
 * registry navigation, reads that operation's executable descriptor from the
 * DB, re-confirms it is keyless and callable (fail-closed by construction),
 * validates the caller's input against the DB-held input schema, makes ONE
 * bounded, SSRF-safe HTTP request built from the DB descriptor, and returns a
 * validated projection plus an evidence hash.
 * only http-json keyless operations are executable today.
 */

const HTTP_JSON_ADAPTER = 'http-json:v1'
const MAX_RESPONSE_BYTES = 512 * 1024
const DEFAULT_USER_AGENT = 'AgenticEconomyOperationExecutor/0.1'

/**
 * The DB execution descriptor this executor needs. Supplied by a caller port
 * (the Convex keyless-descriptor reader); it is the ONLY trust boundary for
 * the endpoint/host. Everything else in this file trusts it as authoritative.
 */
export type OperationExecutableDescriptor = {
  operationRef: string
  capabilityId: string
  name: string
  endpointUrl: string
  authority: { kind: 'keyless' } | { kind: 'provider_connection'; connectionRef: string; providerRef: string }
  adapterId: string
  method: 'GET' | 'POST'
  price: PublicOperationPrice
  effects: readonly AnonymousKeylessOperationEffect[]
  query?: readonly HttpJsonQueryParameterMapping[]
  path?: readonly HttpJsonPathParameterMapping[]
  headers?: readonly HttpJsonHeaderParameterMapping[]
  fixedQuery?: readonly { parameter: string; value: string }[]
  requestContentType?: string
  responseContentType?: string
  responseStatus?: number
  requestTimeoutMs: number
  inputSchema: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  provenance: { publisher: string; sourceKind: string }
}
function isExecutableDescriptorMaterial(value: unknown): value is OperationExecutableDescriptor {
  if (!isRecord(value)
    || !isPublicOperationRef(value.operationRef)
    || typeof value.capabilityId !== 'string'
    || typeof value.name !== 'string'
    || typeof value.endpointUrl !== 'string'
    || !isRecord(value.authority)
    || typeof value.authority.kind !== 'string'
    || typeof value.adapterId !== 'string'
    || (value.method !== 'GET' && value.method !== 'POST')
    || !isRecord(value.price)
    || typeof value.price.kind !== 'string'
    || !Array.isArray(value.effects)
    || !value.effects.every((effect) =>
      isRecord(effect)
      && typeof effect.class === 'string'
      && typeof effect.authority === 'string')
    || typeof value.requestTimeoutMs !== 'number'
    || !Number.isSafeInteger(value.requestTimeoutMs)
    || value.requestTimeoutMs <= 0
    || !isRecord(value.inputSchema)
    || (value.outputSchema !== undefined && !isRecord(value.outputSchema))
    || !isRecord(value.provenance)
    || typeof value.provenance.publisher !== 'string'
    || typeof value.provenance.sourceKind !== 'string') {
    return false
  }
  if (value.price.kind === 'on_request') return true
  if (value.price.kind === 'fixed') {
    return exactAmountSchema.safeParse(value.price.amount).success
  }
  return value.price.kind === 'range'
    && exactAmountSchema.safeParse(value.price.minimum).success
    && exactAmountSchema.safeParse(value.price.maximum).success
}

export function operationExecutionBindingDigest(
  descriptor: OperationExecutableDescriptor,
): string {
  const material = {
    operationRef: descriptor.operationRef,
    capabilityId: descriptor.capabilityId,
    name: descriptor.name,
    endpointUrl: descriptor.endpointUrl,
    authority: descriptor.authority,
    adapterId: descriptor.adapterId,
    method: descriptor.method,
    price: descriptor.price,
    effects: descriptor.effects,
    ...(descriptor.query === undefined ? {} : { query: descriptor.query }),
    ...(descriptor.path === undefined ? {} : { path: descriptor.path }),
    ...(descriptor.headers === undefined ? {} : { headers: descriptor.headers }),
    ...(descriptor.fixedQuery === undefined ? {} : { fixedQuery: descriptor.fixedQuery }),
    ...(descriptor.requestContentType === undefined ? {} : { requestContentType: descriptor.requestContentType }),
    ...(descriptor.responseContentType === undefined ? {} : { responseContentType: descriptor.responseContentType }),
    ...(descriptor.responseStatus === undefined ? {} : { responseStatus: descriptor.responseStatus }),
    requestTimeoutMs: descriptor.requestTimeoutMs,
    inputSchema: descriptor.inputSchema,
    ...(descriptor.outputSchema === undefined ? {} : { outputSchema: descriptor.outputSchema }),
    provenance: descriptor.provenance,
  }
  return canonicalDigest(material).toString()
}


export type OperationExecuteResult =
  | {
      kind: 'ok'
      operationRef: string
      capabilityId: string
      name: string
      output: unknown
      evidenceHash: string
    }
  | { kind: 'refused'; operationRef: string; reason: 'operation_not_found' | 'operation_not_keyless' | 'operation_not_executable' | 'input_invalid' | 'endpoint_invalid' }
  | { kind: 'error'; operationRef: string; code: 'fetch_failed' | 'response_invalid' | 'provider_error' | 'source_unavailable'; retryable: boolean; reason: string }

export type OperationExecuteInput = {
  operationRef: string
  /** Caller-supplied operation inputs, validated against the DB input schema. */
  input: Record<string, unknown>
}

export type OperationExecuteDeps = {
  readDescriptor: (operationRef: string) => Promise<OperationExecutableDescriptor | null>
  isPublicTarget: (url: URL) => Promise<boolean>
  fetchImpl: (
    input: URL | string | Request,
    init?: RequestInit,
  ) => Promise<BoundedRequestBody & Readonly<{ status: number; ok: boolean }>>
  now?: () => number
}

export async function executeOperation(
  input: OperationExecuteInput,
  deps: OperationExecuteDeps,
  expectedExecutionBindingDigest?: string,
): Promise<OperationExecuteResult> {
  if (!isPublicOperationRef(input.operationRef)) {
    return { kind: 'refused', operationRef: input.operationRef, reason: 'operation_not_found' }
  }

  let descriptor: OperationExecutableDescriptor | null
  try {
    descriptor = await deps.readDescriptor(input.operationRef)
  } catch {
    return {
      kind: 'error',
      operationRef: input.operationRef,
      code: 'source_unavailable',
      retryable: true,
      reason: 'The executable descriptor source is unavailable.',
    }
  }
  if (descriptor === null
    || !isPublicOperationRef(descriptor.operationRef)
    || descriptor.operationRef !== input.operationRef) {
    return { kind: 'refused', operationRef: input.operationRef, reason: 'operation_not_found' }
  }
  if (!isExecutableDescriptorMaterial(descriptor)) {
    return { kind: 'refused', operationRef: input.operationRef, reason: 'operation_not_executable' }
  }
  if (expectedExecutionBindingDigest !== undefined
    && operationExecutionBindingDigest(descriptor) !== expectedExecutionBindingDigest) {
    return { kind: 'refused', operationRef: input.operationRef, reason: 'operation_not_executable' }
  }


  // Fail-closed by construction: only descriptors accepted by the canonical
  // anonymous-keyless predicate may reach the transport. Keep the refusal
  // distinction for callers while leaving eligibility to that predicate.
  if (!isAnonymousKeylessOperationEligible({
    authority: descriptor.authority,
    adapterId: descriptor.adapterId,
    method: descriptor.method,
    sourceKind: descriptor.provenance.sourceKind,
    price: descriptor.price,
    effects: descriptor.effects,
  })) {
    const reason = descriptor.authority.kind === 'keyless' && descriptor.adapterId === HTTP_JSON_ADAPTER
      ? 'operation_not_executable'
      : 'operation_not_keyless'
    return { kind: 'refused', operationRef: input.operationRef, reason }
  }

  // Validate the caller's input against the DB-held input schema before any
  // network effect. Reuses the repo's canonical JSON-Schema validator.
  const inputValid = validateJsonSchema(descriptor.inputSchema, input.input)
  if (!inputValid) {
    return { kind: 'refused', operationRef: input.operationRef, reason: 'input_invalid' }
  }

  const endpoint = validPublicHttpsEndpoint(descriptor.endpointUrl)
  if (endpoint === undefined) {
    return { kind: 'refused', operationRef: input.operationRef, reason: 'endpoint_invalid' }
  }
  try {
    if (!await deps.isPublicTarget(endpoint)) {
      return { kind: 'refused', operationRef: input.operationRef, reason: 'endpoint_invalid' }
    }
  } catch {
    return { kind: 'refused', operationRef: input.operationRef, reason: 'endpoint_invalid' }
  }

  // Build the request through the same guarded HTTP adapter used by registered
  // route transport. The host is the DB endpoint; the caller never supplies it.
  const prepared = prepareHttpJsonRequest(endpoint, {
    method: descriptor.method,
    ...(descriptor.query === undefined ? {} : { query: descriptor.query }),
    ...(descriptor.path === undefined ? {} : { path: descriptor.path }),
    ...(descriptor.headers === undefined ? {} : { headers: descriptor.headers }),
    ...(descriptor.fixedQuery === undefined ? {} : { fixedQuery: descriptor.fixedQuery }),
    ...(descriptor.requestContentType === undefined ? {} : { requestContentType: descriptor.requestContentType }),
    ...(descriptor.responseContentType === undefined ? {} : { responseContentType: descriptor.responseContentType }),
    ...(descriptor.responseStatus === undefined ? {} : { responseStatus: descriptor.responseStatus }),
    requestTimeoutMs: descriptor.requestTimeoutMs,
    credential: { kind: 'none' as const },
  }, defaultBodySerializer(input.input))
  if (prepared.kind === 'refused') {
    return { kind: 'refused', operationRef: input.operationRef, reason: 'input_invalid' }
  }
  const requestHeaders = {
    ...(prepared.headers ?? {}),
    Accept: descriptor.responseContentType ?? 'application/json',
    'User-Agent': DEFAULT_USER_AGENT,
    ...(descriptor.method === 'POST' && descriptor.requestContentType !== undefined
      ? { 'Content-Type': descriptor.requestContentType }
      : {}),
  }
  const startedAt = (deps.now ?? Date.now)()
  let response: BoundedRequestBody & Readonly<{ status: number; ok: boolean }>
  try {
    response = await deps.fetchImpl(prepared.target, {
      method: descriptor.method,
      redirect: 'manual',
      signal: AbortSignal.timeout(descriptor.requestTimeoutMs),
      ...(descriptor.method === 'POST' && descriptor.requestContentType !== undefined
        ? { body: defaultBodySerializer(input.input) }
        : {}),
      headers: requestHeaders,
    })
  } catch (error) {
    const aborted = error instanceof Error
      && (error.name === 'AbortError' || error.name === 'TimeoutError')
    return {
      kind: 'error',
      operationRef: input.operationRef,
      code: 'fetch_failed',
      retryable: !aborted,
      reason: aborted ? 'The operation did not respond in time.' : 'The operation could not be reached.',
    }
  }

  if (!response.ok) {
    return {
      kind: 'error',
      operationRef: input.operationRef,
      code: 'provider_error',
      retryable: response.status >= 500,
      reason: `The operation returned HTTP ${response.status}.`,
    }
  }

  if (descriptor.responseStatus !== undefined && response.status !== descriptor.responseStatus) {
    return {
      kind: 'error',
      operationRef: input.operationRef,
      code: 'response_invalid',
      retryable: false,
      reason: `The operation returned HTTP ${response.status}; expected HTTP ${descriptor.responseStatus}.`,
    }
  }

  const expectedContentType = descriptor.responseContentType ?? 'application/json'
  const contentType = response.headers.get('content-type') ?? ''
  if (!responseContentTypeMatches(expectedContentType, contentType)) {
    return {
      kind: 'error',
      operationRef: input.operationRef,
      code: 'response_invalid',
      retryable: false,
      reason: `The operation did not return ${expectedContentType}.`,
    }
  }

  let bodyText: string
  try {
    const bounded = await readBoundedRequestText(response, MAX_RESPONSE_BYTES)
    if (!bounded.ok) {
      return {
        kind: 'error',
        operationRef: input.operationRef,
        code: 'response_invalid',
        retryable: false,
        reason: 'The operation response was too large.',
      }
    }
    bodyText = bounded.text
  } catch {
    return {
      kind: 'error',
      operationRef: input.operationRef,
      code: 'response_invalid',
      retryable: false,
      reason: 'The operation response could not be read.',
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(bodyText)
  } catch {
    return {
      kind: 'error',
      operationRef: input.operationRef,
      code: 'response_invalid',
      retryable: false,
      reason: 'The operation returned malformed JSON.',
    }
  }

  if (descriptor.outputSchema !== undefined && !validateJsonSchema(descriptor.outputSchema, parsed)) {
    return {
      kind: 'error',
      operationRef: input.operationRef,
      code: 'response_invalid',
      retryable: false,
      reason: 'The operation response did not match its contract.',
    }
  }

  const evidenceHash = canonicalDigest({
    operationRef: input.operationRef,
    input: input.input,
    output: parsed,
    status: response.status,
    elapsedMs: (deps.now ?? Date.now)() - startedAt,
  }).toString()

  return {
    kind: 'ok',
    operationRef: input.operationRef,
    capabilityId: descriptor.capabilityId,
    name: descriptor.name,
    output: parsed,
    evidenceHash,
  }
}



/** Mirror of the module's input shape, kept in step with the action schema. */
export const operationExecuteInputSchema = z.strictObject({
  operationRef: z
    .string()
    .refine(isPublicOperationRef, 'A current operation reference (operation:v1:...) is required')
    .describe('The operation reference found via the public operation registry.'),
  input: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null(), z.record(z.string(), z.any()), z.array(z.any())]))
    .refine((value) => Object.keys(value).length <= 64, 'input_size_exceeded')
    .default({})
    .describe('The inputs the operation contract requires, keyed exactly as its published schema names them.'),
})