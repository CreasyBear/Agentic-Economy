import {
  defaultBodySerializer,
  defaultPathSerializer,
  serializeArrayParam,
  serializePrimitiveParam,
} from 'openapi-fetch'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { parseBoundedJson } from '@/modules/common/bounded-json'
import { isRecord } from '@/modules/common/is-record'
import { readJsonPointer } from '@/modules/common/json-pointer'
import type { BoundedRequestBody } from '@/lib/server/bounded-request-body'
import {
  cancelResponseBody,
  readBoundedRequestText,
} from '@/lib/server/bounded-request-body'
import type { ExactAmount } from '@/modules/money/public'
import {
  injectHttpJsonCredential,
  parseHttpJsonTransportConfiguration,
  type HttpJsonFixedQueryParameter,
  type HttpJsonHeaderParameterMapping,
  type HttpJsonPathParameterMapping,
  type HttpJsonQueryParameterMapping,
  type HttpJsonTransportConfiguration,
} from './transport-adapters'
import type {
  ProviderConnectionAuthorityValidation,
  ProviderConnectionCredentialResolution,
  ProviderConnectionLeaseAuthorityValidation,
  ProviderConnectionLeaseCredentialResolution,
} from '../provider-connection'
import type { RouteTransportInvocation } from './route-transport-invoke'
import {
  MAX_RESPONSE_BYTES,
  refused,
  unknown,
  type RouteTransportObservation,
} from './route-transport-observation'

export type RouteTransportResponse = BoundedRequestBody &
  Readonly<{ status: number; ok: boolean }>
export type RouteTransportHeaderRecord = Readonly<Record<string, string>>

export type RouteTransportRequestInit = Readonly<{
  method?: string
  redirect?: 'error' | 'follow' | 'manual'
  signal?: AbortSignal
  body?: string
  headers?: Readonly<Record<string, string>>
}>

export type RouteTransportFetch = (
  input: URL,
  init?: RouteTransportRequestInit,
) => Promise<RouteTransportResponse>

export type RouteTransportAuthorityCommon = Readonly<{
  attemptRef: string
  effectGeneration?: number
  operationKeyDigest: string
  mandateDigest: string
  grantDigest: string
  capabilityContractDigest: string
  maximumSpend: ExactAmount
  expiresAt: number
  callIdentity: Readonly<{ keyId: string; signature: string }>
}>

export type KeylessRouteTransportAuthority = RouteTransportAuthorityCommon &
  Readonly<{
    authorityGeneration?: never
    authorityDigest?: never
  }>

export type ProviderRouteTransportAuthority = RouteTransportAuthorityCommon &
  Readonly<{
    authorityGeneration: number
    authorityDigest: string
    leaseRef?: string
    invocationRef?: string
    operationRef?: string
    grantedScopes?: readonly string[]
    grantedResources?: readonly string[]
    readinessValidUntil?: number
    readinessDigest?: string
  }>

export function isProviderRouteTransportAuthority(
  authority: KeylessRouteTransportAuthority | ProviderRouteTransportAuthority,
): authority is ProviderRouteTransportAuthority {
  return (
    Number.isSafeInteger(authority.authorityGeneration) &&
    typeof authority.authorityDigest === 'string'
  )
}

type ProviderConnectionUnavailableReason =
  | Extract<
      ProviderConnectionCredentialResolution,
      Readonly<{ kind: 'unavailable' }>
    >['reason']
  | Extract<
      ProviderConnectionLeaseCredentialResolution,
      Readonly<{ kind: 'unavailable' }>
    >['reason']
  | Extract<
      ProviderConnectionAuthorityValidation,
      Readonly<{ kind: 'unavailable' }>
    >['reason']
  | Extract<
      ProviderConnectionLeaseAuthorityValidation,
      Readonly<{ kind: 'unavailable' }>
    >['reason']

export function providerAuthorityFailure(
  reason: ProviderConnectionUnavailableReason,
): string {
  switch (reason) {
    case 'not_found':
    case 'connection_not_found':
      return 'connection_authority_not_found'
    case 'inactive':
    case 'connection_inactive':
      return 'connection_authority_inactive'
    case 'stale_generation':
    case 'lease_generation_stale':
      return 'connection_authority_stale_generation'
    case 'expired':
    case 'connection_expired':
      return 'connection_authority_expired'
    case 'digest_mismatch':
    case 'lease_digest_stale':
      return 'connection_authority_stale_digest'
    case 'lease_not_found':
      return 'connection_lease_not_found'
    case 'lease_inactive':
      return 'connection_lease_inactive'
    case 'lease_expired':
      return 'connection_lease_expired'
    case 'lease_scope_mismatch':
      return 'connection_lease_scope_mismatch'
    case 'lease_resource_mismatch':
      return 'connection_lease_resource_mismatch'
    case 'lease_identity_mismatch':
      return 'connection_lease_identity_mismatch'
    case 'readiness_expired':
      return 'readiness_expired'
    case 'readiness_mismatch':
      return 'readiness_stale'
    case 'credential_unavailable':
      return 'credential_unavailable'
    default: {
      const _exhaustive: never = reason
      return _exhaustive
    }
  }
}

export type HttpConfiguration = HttpJsonTransportConfiguration
type FixedQueryParameter = HttpJsonFixedQueryParameter
type QueryParameterMapping = HttpJsonQueryParameterMapping

export function parseConfiguration(
  value: string,
): Readonly<Record<string, unknown>> | undefined {
  const parsed = parseBoundedJson(value)
  return isRecord(parsed) ? parsed : undefined
}

export function isHttpConfiguration(
  value: Readonly<Record<string, unknown>>,
): value is HttpConfiguration {
  return parseHttpJsonTransportConfiguration(value) !== undefined
}

export function containsSensitiveValue(
  value: unknown,
  sensitiveValues: readonly string[],
): boolean {
  if (typeof value === 'string') {
    return sensitiveValues.some(
      (candidate) => candidate.length > 0 && value.includes(candidate),
    )
  }
  if (Array.isArray(value))
    return value.some((item) => containsSensitiveValue(item, sensitiveValues))
  if (!isRecord(value)) return false
  return Object.entries(value).some(
    ([key, child]) =>
      containsSensitiveValue(key, sensitiveValues) ||
      containsSensitiveValue(child, sensitiveValues),
  )
}

export function outboundSensitiveValues(
  invocation: Readonly<{ authority: RouteTransportAuthorityCommon }>,
  credential?: string,
  paymentSignature?: string,
): readonly string[] {
  return [
    invocation.authority.callIdentity.signature,
    ...(credential === undefined ? [] : [credential]),
    ...(paymentSignature === undefined ? [] : [paymentSignature]),
  ].filter((value) => value.length > 0)
}

export function callHeaders(
  invocation: Readonly<{ authority: RouteTransportAuthorityCommon }>,
  bearer: string | undefined,
  idempotencyKey = invocation.authority.operationKeyDigest,
  contentType = 'application/json',
): Record<string, string> {
  return {
    'Content-Type': contentType,
    Accept: 'application/json',
    'Idempotency-Key': idempotencyKey,
    'AE-Call-Key-Id': invocation.authority.callIdentity.keyId,
    'AE-Call-Signature': invocation.authority.callIdentity.signature,
    'AE-Mandate-Digest': invocation.authority.mandateDigest,
    'AE-Grant-Digest': invocation.authority.grantDigest,
    'AE-Capability-Digest': invocation.authority.capabilityContractDigest,
    'AE-Attempt-Ref': invocation.authority.attemptRef,
    ...(bearer === undefined ? {} : { Authorization: `Bearer ${bearer}` }),
  }
}

export async function readBoundedText(
  response: RouteTransportResponse,
): Promise<string | undefined> {
  const bounded = await readBoundedRequestText(response, MAX_RESPONSE_BYTES)
  return bounded.ok ? bounded.text : undefined
}

export function toHeaderRecord(
  response: RouteTransportResponse,
): RouteTransportHeaderRecord {
  const headers: Record<string, string> = {}
  response.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value
  })
  return headers
}

export function optionalHeader<
  K extends 'providerReceipt' | 'paymentProof' | 'continuationToken',
>(
  headers: RouteTransportHeaderRecord,
  header: string,
  key: K,
): Partial<Record<K, string>> {
  const value = headers[header.toLowerCase()]
  return value === undefined || value.length === 0 || value.length > 4_096
    ? {}
    : ({ [key]: value } as Record<K, string>)
}

export function errorName(error: unknown): string {
  return error instanceof Error &&
    /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(error.name)
    ? error.name.toLowerCase()
    : 'error'
}

export function normalizeResponseMediaType(value: string): string {
  return value.split(';', 1)[0]?.trim().toLowerCase() ?? ''
}

export function responseContentTypeMatches(
  expected: string,
  actual: string,
): boolean {
  return (
    normalizeResponseMediaType(actual) === normalizeResponseMediaType(expected)
  )
}

export async function normalizeJsonResponse(
  transport: RouteTransportObservation['transport'],
  response: RouteTransportResponse,
  requestDigest: string,
  releaseStarted: boolean,
  expectedStatus?: number,
  expectedContentType?: string,
  sensitiveValues: readonly string[] = [],
): Promise<RouteTransportObservation> {
  const responseHeaders = toHeaderRecord(response)
  if (response.status < 200 || response.status >= 300) {
    await cancelResponseBody(response)
    return refused(
      transport,
      requestDigest,
      releaseStarted,
      `provider_http_${response.status}`,
    )
  }
  if (expectedStatus !== undefined && response.status !== expectedStatus) {
    await cancelResponseBody(response)
    return unknown(
      transport,
      requestDigest,
      releaseStarted,
      'response_status_invalid',
    )
  }
  if (
    expectedContentType !== undefined &&
    !responseContentTypeMatches(
      expectedContentType,
      responseHeaders['content-type'] ?? '',
    )
  ) {
    await cancelResponseBody(response)
    return unknown(
      transport,
      requestDigest,
      releaseStarted,
      'response_content_type_invalid',
    )
  }
  const text = await readBoundedText(response)
  if (text === undefined)
    return unknown(
      transport,
      requestDigest,
      releaseStarted,
      'response_unreadable',
    )
  const output = parseBoundedJson(text)
  if (output === undefined)
    return unknown(
      transport,
      requestDigest,
      releaseStarted,
      'response_json_invalid',
    )
  const providerReceipt = optionalHeader(
    responseHeaders,
    'provider-receipt',
    'providerReceipt',
  )
  const continuation = responseHeaders['continuation-token']
  if (
    containsSensitiveValue(output, sensitiveValues) ||
    containsSensitiveValue(providerReceipt, sensitiveValues) ||
    containsSensitiveValue(continuation, sensitiveValues)
  ) {
    return unknown(
      transport,
      requestDigest,
      releaseStarted,
      'response_output_invalid',
    )
  }
  const common = {
    transport,
    releaseStarted,
    requestDigest,
    responseDigest: canonicalDigest(text),
    outputJson: JSON.stringify(output),
    ...providerReceipt,
  }
  return continuation === undefined
    ? { ...common, disposition: 'succeeded' as const }
    : {
        ...common,
        disposition: 'partial' as const,
        continuationToken: continuation,
      }
}

export async function invokeHttp(
  endpoint: URL,
  configuration: HttpConfiguration,
  invocation: RouteTransportInvocation,
  credential: string | undefined,
  requestDigest: string,
  send: RouteTransportFetch,
  preparedTarget: URL | undefined,
  preparedHeaders: Readonly<Record<string, string>> | undefined,
): Promise<RouteTransportObservation> {
  try {
    const target = preparedTarget
    if (target === undefined)
      return refused('http', requestDigest, false, 'input_invalid')
    const requestHeaders = {
      ...(preparedHeaders ?? {}),
      ...callHeaders(
        invocation,
        undefined,
        invocation.authority.operationKeyDigest,
        configuration.requestContentType,
      ),
    }
    const credentialApplied = injectHttpJsonCredential(
      configuration,
      target,
      requestHeaders,
      credential,
    )
    if (credentialApplied === undefined) {
      return refused('http', requestDigest, false, 'credential_unavailable')
    }
    const requestBody =
      configuration.method === 'POST' &&
      configuration.requestContentType !== undefined
        ? defaultBodySerializer(parseBoundedJson(invocation.inputJson))
        : undefined
    if (
      configuration.method === 'POST' &&
      configuration.requestContentType !== undefined &&
      requestBody === undefined
    ) {
      return refused('http', requestDigest, false, 'input_invalid')
    }
    const response = await send(credentialApplied.target, {
      method: configuration.method,
      redirect: 'manual',
      signal: AbortSignal.timeout(configuration.requestTimeoutMs),
      ...(requestBody === undefined ? {} : { body: requestBody }),
      headers: credentialApplied.headers,
    })
    return await normalizeJsonResponse(
      'http',
      response,
      requestDigest,
      true,
      configuration.responseStatus,
      configuration.responseContentType,
      outboundSensitiveValues(invocation, credential),
    )
  } catch (error) {
    return unknown('http', requestDigest, true, `network_${errorName(error)}`)
  }
}

export type HttpJsonRequestPreparation =
  | Readonly<{
      kind: 'prepared'
      target: URL
      headers?: Readonly<Record<string, string>>
    }>
  | Readonly<{
      kind: 'refused'
      failureCode: 'input_invalid' | 'input_required'
    }>

export function prepareHttpJsonRequest(
  endpoint: URL,
  configuration: HttpJsonTransportConfiguration,
  inputJson: string,
): HttpJsonRequestPreparation {
  return requestTarget(
    endpoint,
    configuration.method,
    configuration.query,
    configuration.fixedQuery,
    configuration.path,
    configuration.headers,
    inputJson,
  )
}

export function requestTarget(
  endpoint: URL,
  method: 'GET' | 'POST',
  query: readonly QueryParameterMapping[] | undefined,
  fixedQuery: readonly FixedQueryParameter[] | undefined,
  path: readonly HttpJsonPathParameterMapping[] | undefined,
  headers: readonly HttpJsonHeaderParameterMapping[] | undefined,
  inputJson: string,
): HttpJsonRequestPreparation {
  const parsedInput = parseBoundedJson(inputJson)
  if (parsedInput === undefined)
    return { kind: 'refused', failureCode: 'input_invalid' }
  const hasMappedInput =
    (query?.length ?? 0) > 0 ||
    (path?.length ?? 0) > 0 ||
    (headers?.length ?? 0) > 0
  const input =
    hasMappedInput && !isRecord(parsedInput) ? undefined : parsedInput
  if (hasMappedInput && input === undefined)
    return { kind: 'refused', failureCode: 'input_invalid' }
  const target = new URL(endpoint)
  const queryParts: string[] = []
  if (fixedQuery !== undefined) {
    for (const mapping of fixedQuery) {
      queryParts.push(serializePrimitiveParam(mapping.parameter, mapping.value))
    }
  }
  if (query !== undefined) {
    for (const mapping of query) {
      const value =
        input === undefined
          ? undefined
          : readJsonPointer(input, mapping.inputPointer)
      if (value === undefined || value === null) {
        if (mapping.required === true)
          return { kind: 'refused', failureCode: 'input_required' }
        continue
      }
      const serialized = serializeQueryParameter(mapping, value)
      if (serialized === undefined)
        return { kind: 'refused', failureCode: 'input_invalid' }
      queryParts.push(serialized)
    }
  }
  if (path !== undefined && path.length > 0) {
    const pathValues: Record<string, unknown> = {}
    for (const mapping of path) {
      const value =
        input === undefined
          ? undefined
          : readJsonPointer(input, mapping.inputPointer)
      if (value === undefined || value === null) {
        if (mapping.required !== false)
          return { kind: 'refused', failureCode: 'input_required' }
        continue
      }
      if (!isSerializableInputValue(value))
        return { kind: 'refused', failureCode: 'input_invalid' }
      pathValues[mapping.parameter] = value
    }
    const pathTemplate = target.pathname
      .replace(/%7B/gi, '{')
      .replace(/%7D/gi, '}')
    const serializedPath = defaultPathSerializer(pathTemplate, pathValues)
    if (/\{[^}]+\}/.test(serializedPath))
      return { kind: 'refused', failureCode: 'input_required' }
    target.pathname = serializedPath
  }
  const existingQuery = target.search.replace(/^\?/, '')
  if (queryParts.length > 0) {
    target.search = `?${[existingQuery, ...queryParts].filter((part) => part.length > 0).join('&')}`
  }
  const requestHeaders: Record<string, string> = {}
  if (headers !== undefined) {
    for (const mapping of headers) {
      const value =
        input === undefined
          ? undefined
          : readJsonPointer(input, mapping.inputPointer)
      if (value === undefined || value === null) {
        if (mapping.required === true)
          return { kind: 'refused', failureCode: 'input_required' }
        continue
      }
      const serialized = serializeHeaderParameter(mapping, value)
      if (serialized === undefined)
        return { kind: 'refused', failureCode: 'input_invalid' }
      requestHeaders[mapping.parameter] = serialized
    }
  }
  return {
    kind: 'prepared',
    target,
    ...(Object.keys(requestHeaders).length === 0
      ? {}
      : { headers: requestHeaders }),
  }
}

function isSerializableInputValue(
  value: unknown,
): value is string | number | boolean | readonly unknown[] {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    (Array.isArray(value) &&
      value.every(
        (item) =>
          typeof item === 'string' ||
          typeof item === 'number' ||
          typeof item === 'boolean',
      ))
  )
}

function serializeQueryParameter(
  mapping: QueryParameterMapping,
  value: unknown,
): string | undefined {
  if (!isSerializableInputValue(value)) return undefined
  if (Array.isArray(value)) {
    return serializeArrayParam(mapping.parameter, [...value], {
      style: mapping.style ?? 'form',
      explode: mapping.explode ?? true,
      allowReserved: false,
    })
  }
  return serializePrimitiveParam(mapping.parameter, String(value), {
    allowReserved: false,
  })
}

function serializeHeaderParameter(
  mapping: HttpJsonHeaderParameterMapping,
  value: unknown,
): string | undefined {
  if (Array.isArray(value)) {
    if (
      !value.every(
        (item) =>
          typeof item === 'string' ||
          typeof item === 'number' ||
          typeof item === 'boolean',
      )
    ) {
      return undefined
    }
    const serialized = serializeArrayParam(mapping.parameter, [...value], {
      style: 'simple',
      explode: mapping.explode ?? false,
      allowReserved: false,
    })
    return safeHeaderValue(serialized) ? serialized : undefined
  }
  if (
    typeof value !== 'string' &&
    typeof value !== 'number' &&
    typeof value !== 'boolean'
  )
    return undefined
  const serialized = String(value)
  return safeHeaderValue(serialized) ? serialized : undefined
}

function safeHeaderValue(value: string): boolean {
  return value.length <= 8_192 && !/[\r\n]/.test(value)
}
