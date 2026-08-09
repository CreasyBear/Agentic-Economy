import { z } from 'zod'

import type { BoundedRequestBody } from '@/lib/server/bounded-request-body'
import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import { validateJsonSchema } from '@/modules/capability-contract/public'
import { isPublicOperationRef, validPublicHttpsEndpoint } from '@/modules/capability-supply/public'

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
 *
 * Honesty guards (RULES.MD): nothing is fabricated; a refused/error result is
 * returned, never thrown to the model as success; the caller never supplies a
 * URL or host (the endpoint comes from the DB and is re-validated as HTTPS);
 * only http-json GET keyless operations are executable today.
 */

const HTTP_JSON_ADAPTER = 'http-json:v1'
const EXECUTABLE_METHODS = ['GET'] as const
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
  query?: readonly { inputPointer: string; parameter: string }[]
  fixedQuery?: readonly { parameter: string; value: string }[]
  requestTimeoutMs: number
  inputSchema: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  provenance: { publisher: string; sourceKind: string }
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
    input: URL | RequestInfo,
    init?: RequestInit,
  ) => Promise<BoundedRequestBody & Readonly<{ status: number; ok: boolean }>>
  now?: () => number
}

export async function executeOperation(
  input: OperationExecuteInput,
  deps: OperationExecuteDeps,
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

  // Fail-closed by construction: only DB-described keyless GET http-json
  // operations are executable, and an observed listing or any other provenance
  // that is not a real AE-runnable keyless op is refused. The DB reader should
  // already only emit such descriptors; this re-check is defence in depth.
  if (descriptor.authority.kind !== 'keyless'
    || descriptor.adapterId !== HTTP_JSON_ADAPTER
    || descriptor.method !== 'GET'
    || (descriptor.method === 'GET' && !EXECUTABLE_METHODS.includes(descriptor.method))) {
    return { kind: 'refused', operationRef: input.operationRef, reason: 'operation_not_keyless' }
  }
  if (descriptor.provenance.sourceKind === 'x402') {
    return { kind: 'refused', operationRef: input.operationRef, reason: 'operation_not_executable' }
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

  // Build the request exactly as the DB descriptor dictates (input->query
  // mapping + fixed query), mirroring the repo's transport request-target
  // logic. The host is the DB endpoint; the caller never supplies it.
  const target = buildRequestTarget(
    endpoint,
    descriptor.method,
    descriptor.query ?? [],
    descriptor.fixedQuery ?? [],
    input.input,
  )
  if (target === undefined) {
    return { kind: 'refused', operationRef: input.operationRef, reason: 'input_invalid' }
  }

  const startedAt = (deps.now ?? Date.now)()
  let response: BoundedRequestBody & Readonly<{ status: number; ok: boolean }>
  try {
    response = await deps.fetchImpl(target, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(descriptor.requestTimeoutMs),
      headers: { Accept: 'application/json', 'User-Agent': DEFAULT_USER_AGENT },
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

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json') && !contentType.includes('json')) {
    return {
      kind: 'error',
      operationRef: input.operationRef,
      code: 'response_invalid',
      retryable: false,
      reason: 'The operation did not return JSON.',
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


function buildRequestTarget(
  endpoint: URL,
  method: 'GET' | 'POST',
  query: readonly { inputPointer: string; parameter: string }[],
  fixedQuery: readonly { parameter: string; value: string }[],
  input: Record<string, unknown>,
): URL | undefined {
  if (method === 'POST') return new URL(endpoint)
  const url = new URL(endpoint)
  for (const mapping of query) {
    const value = resolveInputPointer(input, mapping.inputPointer)
    // Schema validation (above) already guarantees required inputs are present,
    // so a missing mapped param is an OPTIONAL one the caller simply did not
    // supply — skip it rather than failing the whole request.
    if (value === undefined) continue
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') continue
    url.searchParams.set(mapping.parameter, String(value))
  }
  for (const fixed of fixedQuery) {
    url.searchParams.set(fixed.parameter, fixed.value)
  }
  return url
}

function resolveInputPointer(input: Record<string, unknown>, pointer: string): unknown {
  // Pointers are /foo/bar JSON-Pointers (no ~0/~1 decoding needed for these).
  if (!pointer.startsWith('/')) return undefined
  const parts = pointer.split('/').slice(1)
  let current: unknown = input
  for (const part of parts) {
    if (!isRecord(current)) return undefined
    if (!Object.prototype.hasOwnProperty.call(current, part)) return undefined
    current = current[part]
  }
  return current
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