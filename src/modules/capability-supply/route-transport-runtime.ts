import { parseJsonEventStream } from '@ai-sdk/provider-utils'
import { z } from 'zod'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { parseBoundedJson } from '@/modules/common/bounded-json'
import { isRecord } from '@/modules/common/is-record'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { readJsonPointer } from '@/modules/common/json-pointer'
import type { BoundedRequestBody } from '@/lib/server/bounded-request-body'
import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import {
  exactAmountSchema,
  compareExactAmounts,
  formatExactAmount,
  parseDecimalExactAmount,
  rescaleExactAmount,
} from '@/modules/money/public'
import type { ExactAmount } from '@/modules/money/public'

import { decodeX402PaymentRequiredHeader } from './internal/x402-payment-signer'
import {
  injectHttpJsonCredential,
  parseHttpJsonTransportConfiguration,
  type HttpJsonFixedQueryParameter,
  type HttpJsonQueryParameterMapping,
  type HttpJsonTransportConfiguration,
  validPublicHttpsEndpoint,
} from './internal/transport-adapters'
import {
  isProviderConnectionCredentialRef,
  type ProviderConnectionCredentialResolution,
} from './provider-connection'
import type { CapabilityTransportAuthority } from './public'

const MAX_RESPONSE_BYTES = 64 * 1024
type RouteTransportResponse = BoundedRequestBody & Readonly<{ status: number; ok: boolean }>

type RouteTransportRequestInit = Readonly<{
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

type RouteTransportAuthorityCommon = Readonly<{
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
type RouteTransportBinding<Authority extends CapabilityTransportAuthority> = Readonly<{
  adapterId: string
  endpointUrl: string
  authority: Authority
  configJson: string
  configDigest: string
}>
type KeylessRouteTransportAuthority = RouteTransportAuthorityCommon & Readonly<{
  authorityGeneration?: never
  authorityDigest?: never
}>
type ProviderRouteTransportAuthority = RouteTransportAuthorityCommon & Readonly<{
  authorityGeneration: number
  authorityDigest: string
}>
type KeylessRouteTransportInvocation = Readonly<{
  binding: RouteTransportBinding<Extract<CapabilityTransportAuthority, { kind: 'keyless' }>>
  authority: KeylessRouteTransportAuthority
  inputJson: string
}>
type ProviderRouteTransportInvocation = Readonly<{
  binding: RouteTransportBinding<Extract<CapabilityTransportAuthority, { kind: 'provider_connection' }>>
  authority: ProviderRouteTransportAuthority
  inputJson: string
}>
export type RouteTransportInvocation =
  | KeylessRouteTransportInvocation
  | ProviderRouteTransportInvocation

type X402Challenge = Readonly<{
  x402Version: 2
  resource: Readonly<{ url: string; description?: string; mimeType?: string }>
  accepts: readonly Readonly<{
    scheme: string
    network: `${string}:${string}`
    amount: string
    asset: string
    payTo: string
    maxTimeoutSeconds: number
    extra: Readonly<Record<string, unknown>>
  }>[]
  extensions?: Readonly<Record<string, unknown>>
}>

export type X402PaymentSignatureRequest = Readonly<{
  challenge: X402Challenge
  credential: string
  paymentIdentifier: string
  selectedRequirement: X402Challenge['accepts'][number]
}>

export type X402PaymentAuthorizationIdentity = Readonly<{
  paymentIdentifier: string
  challengeDigest: string
  attemptRef: string
  effectGeneration: number
  paymentAmount: ExactAmount
}>

export type X402PreparedAuthorization = Readonly<{
  custodyRef: string
  authorizationDigest: string
}>

export type X402PaymentAttemptEvent = Readonly<{
  paymentIdentifier: string
  attemptRef: string
  challengeDigest: string
  scheme: string
  network: string
  asset: string
  payTo: string
  amount: ExactAmount
  providerEndpoint: string
  custodyRef: string
  authorizationDigest: string
}>

export type ProviderConnectionAuthorityLookup = Readonly<{
  connectionRef: string
  providerRef: string
  adapterId: string
  authorityGeneration: number
  authorityDigest: string
}>

export type ProviderConnectionAuthorityReader = (
  input: ProviderConnectionAuthorityLookup,
) => ProviderConnectionCredentialResolution | Promise<ProviderConnectionCredentialResolution>

export type RouteTransportRuntime = Readonly<{
  send: RouteTransportFetch
  resolveCredential: (reference: string) => string | undefined | Promise<string | undefined>
  readProviderConnectionCredentialRef?: ProviderConnectionAuthorityReader
  x402PaymentSigningAvailable?: (input: Readonly<{
    credentialRef: string
    network: string
    asset: string
    payTo: string
    maximumSpend: ExactAmount
  }>) => boolean
  prepareX402PaymentAuthorization?: (
    request: X402PaymentSignatureRequest & X402PaymentAuthorizationIdentity,
  ) => Promise<X402PreparedAuthorization | undefined>
  readX402PaymentAuthorization?: (
    prepared: X402PreparedAuthorization,
  ) => Promise<string | undefined>
  /** Restores custody material by the persisted opaque digest after process loss. */
  readX402PaymentAuthorizationByDigest?: (
    prepared: X402PreparedAuthorization,
  ) => Promise<string | undefined>
  markX402PaymentPossiblySubmitted?: (event: X402PaymentAttemptEvent) => Promise<void> | void
  observeX402PaymentAttempt?: (
    event: X402PaymentAttemptEvent & Readonly<{
      state: 'observed' | 'reconciliation_required'
      evidenceRefs: readonly string[]
    }>,
  ) => Promise<void> | void
}>

export type X402RouteTransportRuntime = RouteTransportRuntime & Readonly<{
  prepareX402PaymentAuthorization: (
    request: X402PaymentSignatureRequest & X402PaymentAuthorizationIdentity,
  ) => Promise<X402PreparedAuthorization | undefined>
  readX402PaymentAuthorization: (
    prepared: X402PreparedAuthorization,
  ) => Promise<string | undefined>
  /** Restores custody material by the persisted opaque digest after process loss. */
  readX402PaymentAuthorizationByDigest: (
    prepared: X402PreparedAuthorization,
  ) => Promise<string | undefined>
}>

export type RouteTransportObservation = Readonly<{
  transport: 'http' | 'mcp' | 'x402' | 'unknown'
  disposition: 'succeeded' | 'refused' | 'partial' | 'unknown'
  releaseStarted: boolean
  queryReleaseStatus?: 'not_released' | 'released' | 'unknown'
  paymentAuthorizationStatus?: 'not_created' | 'created' | 'unknown'
  paymentSubmissionStatus?: 'not_submitted' | 'possibly_submitted' | 'observed' | 'unknown'
  settlementStatus?: 'not_evidenced' | 'provider_asserted' | 'unknown'
  quoteDeliveryStatus?: 'not_delivered' | 'delivered' | 'unknown'
  requestDigest: string
  responseDigest?: string
  outputJson?: string
  providerReceipt?: string
  paymentProof?: string
  paymentChallengeDigest?: string
  continuationToken?: string
  failureCode?: string
}>

type RouteTransportCancellationInvocationFor<Invocation extends RouteTransportInvocation> = Readonly<{
  binding: Invocation['binding']
  authority: Invocation['authority']
  cancellationRequestRef: string
}>
export type RouteTransportCancellationInvocation =
  | RouteTransportCancellationInvocationFor<KeylessRouteTransportInvocation>
  | RouteTransportCancellationInvocationFor<ProviderRouteTransportInvocation>

export type RouteTransportCancellationObservation = Readonly<{
  disposition: 'accepted' | 'rejected' | 'unknown' | 'unsupported'
  requestDigest: string
  responseDigest?: string
  providerReference?: string
  reason?: string
  failureCode?: string
}>

export function parseRouteTransportObservationJson(value: string): RouteTransportObservation | undefined {
  if (new TextEncoder().encode(value).byteLength > MAX_RESPONSE_BYTES) return undefined
  const bounded = (max: number) => z.string().refine((text) => boundedString(text, max))
  const observationSchema: z.ZodType<RouteTransportObservation> = z.strictObject({
    transport: z.enum(['http', 'mcp', 'x402', 'unknown']),
    disposition: z.enum(['succeeded', 'refused', 'partial', 'unknown']),
    releaseStarted: z.boolean(),
    queryReleaseStatus: z.enum(['not_released', 'released', 'unknown']).exactOptional(),
    paymentAuthorizationStatus: z.enum(['not_created', 'created', 'unknown']).exactOptional(),
    paymentSubmissionStatus: z.enum(['not_submitted', 'possibly_submitted', 'observed', 'unknown']).exactOptional(),
    settlementStatus: z.enum(['not_evidenced', 'provider_asserted', 'unknown']).exactOptional(),
    quoteDeliveryStatus: z.enum(['not_delivered', 'delivered', 'unknown']).exactOptional(),
    requestDigest: bounded(200),
    responseDigest: bounded(MAX_RESPONSE_BYTES).exactOptional(),
    outputJson: bounded(MAX_RESPONSE_BYTES).exactOptional(),
    providerReceipt: bounded(MAX_RESPONSE_BYTES).exactOptional(),
    paymentProof: bounded(MAX_RESPONSE_BYTES).exactOptional(),
    paymentChallengeDigest: bounded(MAX_RESPONSE_BYTES).exactOptional(),
    continuationToken: bounded(MAX_RESPONSE_BYTES).exactOptional(),
    failureCode: bounded(MAX_RESPONSE_BYTES).exactOptional(),
  })
  const parsed = observationSchema.safeParse(parseBoundedJson(value))
  return parsed.success ? parsed.data : undefined
}

type HttpConfiguration = HttpJsonTransportConfiguration
type McpConfiguration = Readonly<{
  protocolVersion: string
  toolName: string
  requestTimeoutMs: number
}>
type X402Configuration = Readonly<{
  method: 'GET' | 'POST'
  query?: readonly QueryParameterMapping[]
  requestTimeoutMs: number
  scheme: 'exact'
  network: string
  currency: string
  routeAmountExponent: number
  assetAmountExponent: number
  asset: string
  payTo: string
}>
type FixedQueryParameter = HttpJsonFixedQueryParameter
type QueryParameterMapping = HttpJsonQueryParameterMapping

type RegisteredConfiguration = HttpConfiguration | McpConfiguration | X402Configuration
const nonBlankString = z.string().superRefine((value, context) => {
  if (value.trim().length === 0) context.addIssue({ code: 'custom', message: 'must_not_be_blank' })
})
const requestTimeout = z.number().int().min(100).max(120_000)
const amountExponent = z.number().int().min(0).max(18)
const queryParameter = z.strictObject({
  inputPointer: z.string().regex(/^\/(?:[^/~]|~[01])+(?:\/(?:[^/~]|~[01])+)*$/),
  parameter: z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,99}$/),
})
const queryParameters = z.array(queryParameter).min(1).max(64).superRefine((items, context) => {
  const pointers = new Set<string>()
  const parameters = new Set<string>()
  for (const [index, item] of items.entries()) {
    if (pointers.has(item.inputPointer) || parameters.has(item.parameter)) {
      context.addIssue({ code: 'custom', path: [index], message: 'query_mapping_duplicate' })
    }
    pointers.add(item.inputPointer)
    parameters.add(item.parameter)
  }
})
const mcpConfiguration = z.strictObject({
  protocolVersion: nonBlankString.max(64),
  toolName: nonBlankString.max(200),
  requestTimeoutMs: requestTimeout,
})
const x402Configuration = z.strictObject({
  method: z.enum(['GET', 'POST']),
  query: queryParameters.optional(),
  requestTimeoutMs: requestTimeout,
  scheme: z.literal('exact'),
  network: nonBlankString.max(100),
  currency: nonBlankString.max(20),
  routeAmountExponent: amountExponent,
  assetAmountExponent: amountExponent,
  asset: nonBlankString.max(200),
  payTo: nonBlankString.max(200),
}).superRefine((value, context) => {
  if ((value.method === 'GET' && value.query === undefined)
    || (value.method === 'POST' && value.query !== undefined)) {
    context.addIssue({ code: 'custom', message: 'method_query_mismatch' })
  }
})

export type PreparedRouteTransportInvocation = Readonly<{
  invocation: RouteTransportInvocation
  endpoint: URL
  configuration: RegisteredConfiguration
  requestDigest: string
  target?: URL
}>

export type RouteTransportPreparation =
  | Readonly<{ kind: 'prepared'; prepared: PreparedRouteTransportInvocation }>
  | Readonly<{ kind: 'refused'; observation: RouteTransportObservation }>

type InvocationCredential =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'resolved'; value: string }>
  | Readonly<{ kind: 'unavailable'; failureCode: string }>

type ProviderConnectionUnavailableReason = Extract<
  ProviderConnectionCredentialResolution,
  Readonly<{ kind: 'unavailable' }>
>['reason']

function providerAuthorityFailure(reason: ProviderConnectionUnavailableReason): string {
  switch (reason) {
    case 'not_found': return 'connection_authority_not_found'
    case 'inactive': return 'connection_authority_inactive'
    case 'stale_generation': return 'connection_authority_stale_generation'
    case 'expired': return 'connection_authority_expired'
    case 'digest_mismatch': return 'connection_authority_stale_digest'
    case 'credential_unavailable': return 'credential_unavailable'
    default: {
      const _exhaustive: never = reason
      return _exhaustive
    }
  }
}

type RouteTransportCredentialInvocation =
  | RouteTransportInvocation
  | RouteTransportCancellationInvocation
type ProviderRouteTransportCredentialInvocation =
  | ProviderRouteTransportInvocation
  | RouteTransportCancellationInvocationFor<ProviderRouteTransportInvocation>

export type RouteTransportCredentialPreflight =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'resolved'; credentialRef: string }>
  | Readonly<{ kind: 'unavailable'; failureCode: string }>

function isProviderRouteTransportInvocation(
  invocation: RouteTransportCredentialInvocation,
): invocation is ProviderRouteTransportCredentialInvocation {
  return invocation.binding.authority.kind === 'provider_connection'
}

async function readProviderCredentialRefForAuthority(
  invocation: ProviderRouteTransportCredentialInvocation,
  runtime: RouteTransportRuntime,
): Promise<Exclude<RouteTransportCredentialPreflight, Readonly<{ kind: 'none' }>>> {
  const { binding, authority } = invocation
  if (!Number.isSafeInteger(authority.authorityGeneration)
    || authority.authorityGeneration < 1
    || typeof authority.authorityDigest !== 'string'
    || !/^sha256:[0-9a-f]{64}$/.test(authority.authorityDigest)) {
    return { kind: 'unavailable', failureCode: 'connection_authority_snapshot_invalid' }
  }
  const readProviderConnectionCredentialRef = runtime.readProviderConnectionCredentialRef
  if (readProviderConnectionCredentialRef === undefined) {
    return { kind: 'unavailable', failureCode: 'connection_authority_reader_unavailable' }
  }
  const resolved = await readProviderConnectionCredentialRef({
    connectionRef: binding.authority.connectionRef,
    providerRef: binding.authority.providerRef,
    adapterId: binding.adapterId,
    authorityGeneration: authority.authorityGeneration,
    authorityDigest: authority.authorityDigest,
  })
  if (resolved.kind !== 'resolved') {
    return { kind: 'unavailable', failureCode: providerAuthorityFailure(resolved.reason) }
  }
  return { kind: 'resolved', credentialRef: resolved.credentialRef }
}

async function preflightCredentialForInvocation(
  invocation: RouteTransportCredentialInvocation,
  runtime: RouteTransportRuntime,
): Promise<RouteTransportCredentialPreflight> {
  if (!isProviderRouteTransportInvocation(invocation)) return { kind: 'none' }
  return await readProviderCredentialRefForAuthority(invocation, runtime)
}

export async function preflightRouteTransportCredential(
  invocation: RouteTransportInvocation,
  runtime: RouteTransportRuntime,
): Promise<RouteTransportCredentialPreflight> {
  return await preflightCredentialForInvocation(invocation, runtime)
}

async function resolveCredentialForAuthority(
  invocation: RouteTransportCredentialInvocation,
  runtime: RouteTransportRuntime,
): Promise<InvocationCredential> {
  const preflight = await preflightCredentialForInvocation(invocation, runtime)
  if (preflight.kind === 'none') return preflight
  if (preflight.kind === 'unavailable') return preflight
  const credential = await runtime.resolveCredential(preflight.credentialRef)
  if (credential === undefined
    || credential.trim().length === 0
    || isProviderConnectionCredentialRef(credential)) {
    return { kind: 'unavailable', failureCode: 'credential_unavailable' }
  }
  return { kind: 'resolved', value: credential }
}

export async function invokeRegisteredRouteCancellation(
  invocation: RouteTransportCancellationInvocation,
  runtime: RouteTransportRuntime,
): Promise<RouteTransportCancellationObservation> {
  const request = {
    cancellationRequestRef: invocation.cancellationRequestRef,
    attemptRef: invocation.authority.attemptRef,
    operationKeyDigest: invocation.authority.operationKeyDigest,
  }
  const requestDigest = canonicalDigest(request)
  const endpoint = validPublicHttpsEndpoint(invocation.binding.endpointUrl)
  const configuration = parseConfiguration(invocation.binding.configJson)
  if (endpoint === undefined || configuration === undefined
    || canonicalDigest(configuration as StableHashValue) !== invocation.binding.configDigest
    || invocation.binding.adapterId !== 'http-json:v1'
    || !isHttpConfiguration(configuration)
    || configuration.cancellation === undefined) {
    return { disposition: 'unsupported', requestDigest, failureCode: 'cancellation_not_registered' }
  }
  const credentialResult = await resolveCredentialForAuthority(invocation, runtime)
  if (credentialResult.kind === 'unavailable') {
    return { disposition: 'unknown', requestDigest, failureCode: credentialResult.failureCode }
  }
  const credential = credentialResult.kind === 'resolved' ? credentialResult.value : undefined
  const cancellationEndpoint = new URL(configuration.cancellation.path, endpoint.origin)
  const credentialApplied = injectHttpJsonCredential(
    configuration,
    cancellationEndpoint,
    callHeaders(invocation, undefined, invocation.cancellationRequestRef),
    credential,
  )
  if (credentialApplied === undefined) {
    return { disposition: 'unknown', requestDigest, failureCode: 'credential_unavailable' }
  }
  try {
    const response = await runtime.send(credentialApplied.target, {
      method: 'POST', redirect: 'manual',
      signal: AbortSignal.timeout(configuration.cancellation.requestTimeoutMs),
      body: JSON.stringify(request),
      headers: credentialApplied.headers,
    })
    if (response.status < 200 || response.status >= 300) {
      return { disposition: 'unknown', requestDigest, failureCode: `provider_http_${response.status}` }
    }
    const text = await readBoundedText(response)
    const parsed = text === undefined ? undefined : parseBoundedJson(text)
    const responseDigest = text === undefined ? undefined : canonicalDigest(text)
    if (!isRecord(parsed)
      || !['cancellation_accepted', 'cancellation_rejected', 'cancellation_unknown'].includes(String(parsed.kind))
      || (parsed.providerReference !== undefined && !boundedString(parsed.providerReference, 500))
      || (parsed.reason !== undefined && !boundedString(parsed.reason, 500))
      || Object.keys(parsed).some((key) => !['kind', 'providerReference', 'reason'].includes(key))) {
      return {
        disposition: 'unknown', requestDigest,
        ...(responseDigest === undefined ? {} : { responseDigest }),
        failureCode: 'cancellation_response_invalid',
      }
    }
    if (responseDigest === undefined) {
      return {
        disposition: 'unknown',
        requestDigest,
        failureCode: 'cancellation_response_invalid',
      }
    }
    const common = {
      requestDigest,
      responseDigest,
      ...(parsed.providerReference === undefined ? {} : { providerReference: parsed.providerReference as string }),
    }
    if (parsed.kind === 'cancellation_accepted') return { ...common, disposition: 'accepted' }
    if (parsed.kind === 'cancellation_rejected' && boundedString(parsed.reason, 500)) {
      return { ...common, disposition: 'rejected', reason: parsed.reason }
    }
    return { ...common, disposition: 'unknown' }
  } catch (error) {
    return { disposition: 'unknown', requestDigest, failureCode: `network_${errorName(error)}` }
  }
}

export function prepareRegisteredRouteTransportInvocation(
  invocation: RouteTransportInvocation,
  x402PaymentSigningAvailable?: RouteTransportRuntime['x402PaymentSigningAvailable'],
): RouteTransportPreparation {
  const requestDigest = canonicalDigest({
    adapterId: invocation.binding.adapterId,
    endpointUrl: invocation.binding.endpointUrl,
    configDigest: invocation.binding.configDigest,
    attemptRef: invocation.authority.attemptRef,
    operationKeyDigest: invocation.authority.operationKeyDigest,
    mandateDigest: invocation.authority.mandateDigest,
    grantDigest: invocation.authority.grantDigest,
    capabilityContractDigest: invocation.authority.capabilityContractDigest,
    inputJson: invocation.inputJson,
  })
  const endpoint = validPublicHttpsEndpoint(invocation.binding.endpointUrl)
  if (endpoint === undefined) return { kind: 'refused', observation: refused('unknown', requestDigest, false, 'endpoint_invalid') }
  const configuration = parseConfiguration(invocation.binding.configJson)
  if (configuration === undefined
    || canonicalDigest(configuration as StableHashValue) !== invocation.binding.configDigest) {
    return { kind: 'refused', observation: refused('unknown', requestDigest, false, 'adapter_config_invalid') }
  }
  const validConfiguration = invocation.binding.adapterId === 'http-json:v1'
    ? isHttpConfiguration(configuration)
    : invocation.binding.adapterId === 'mcp-jsonrpc:v1'
      ? isMcpConfiguration(configuration)
      : invocation.binding.adapterId === 'x402-fetch:v2'
        ? isX402Configuration(configuration)
        : false
  if (!validConfiguration) {
    return {
      kind: 'refused',
      observation: refused(transportKind(invocation.binding.adapterId), requestDigest, false,
        invocation.binding.adapterId === 'http-json:v1' || invocation.binding.adapterId === 'mcp-jsonrpc:v1'
          || invocation.binding.adapterId === 'x402-fetch:v2'
          ? 'adapter_config_invalid'
          : 'adapter_not_registered'),
    }
  }
  const typedConfiguration = configuration as RegisteredConfiguration
  const target = invocation.binding.adapterId === 'http-json:v1'
    || invocation.binding.adapterId === 'x402-fetch:v2'
    ? requestTarget(
        endpoint,
        (typedConfiguration as HttpConfiguration | X402Configuration).method,
        (typedConfiguration as HttpConfiguration | X402Configuration).query,
        invocation.binding.adapterId === 'http-json:v1'
          ? (typedConfiguration as HttpConfiguration).fixedQuery
          : undefined,
        invocation.inputJson,
      )
    : undefined
  if ((invocation.binding.adapterId === 'http-json:v1'
      || invocation.binding.adapterId === 'x402-fetch:v2') && target === undefined) {
    return {
      kind: 'refused',
      observation: refused(transportKind(invocation.binding.adapterId), requestDigest, false, 'input_invalid'),
    }
  }
  if (invocation.binding.adapterId === 'mcp-jsonrpc:v1'
    && !isRecord(parseBoundedJson(invocation.inputJson))) {
    return { kind: 'refused', observation: refused('mcp', requestDigest, false, 'input_invalid') }
  }
  if (invocation.binding.adapterId === 'x402-fetch:v2') {
    const x402 = typedConfiguration as X402Configuration
    if (expectedX402Amount(invocation.authority.maximumSpend, x402) === undefined) {
      return {
        kind: 'refused',
        observation: refused('x402', requestDigest, false, 'payment_authority_invalid'),
      }
    }
    if (x402PaymentSigningAvailable !== undefined
      && !x402PaymentSigningAvailable({
        credentialRef: invocation.binding.authority.kind === 'provider_connection'
          ? invocation.binding.authority.connectionRef
          : 'none',
        network: x402.network,
        asset: x402.asset,
        payTo: x402.payTo,
        maximumSpend: invocation.authority.maximumSpend,
      })) {
      return {
        kind: 'refused',
        observation: refused('x402', requestDigest, false, 'payment_signature_unavailable'),
      }
    }
  }
  return {
    kind: 'prepared',
    prepared: {
      invocation,
      endpoint,
      configuration: typedConfiguration,
      requestDigest,
      ...(target === undefined ? {} : { target }),
    },
  }
}

export async function invokePreparedRouteTransport(
  prepared: PreparedRouteTransportInvocation,
  runtime: RouteTransportRuntime,
): Promise<RouteTransportObservation> {
  const { invocation, endpoint, configuration, requestDigest } = prepared
  const credentialResult = await resolveCredentialForAuthority(invocation, runtime)
  if (credentialResult.kind === 'unavailable') {
    return refused(transportKind(invocation.binding.adapterId), requestDigest, false, credentialResult.failureCode)
  }
  const credential = credentialResult.kind === 'resolved' ? credentialResult.value : undefined
  switch (invocation.binding.adapterId) {
    case 'http-json:v1':
      return await invokeHttp(
        endpoint, configuration as HttpConfiguration, invocation, credential, requestDigest,
        runtime.send, prepared.target,
      )
    case 'mcp-jsonrpc:v1':
      return await invokeMcp(
        endpoint, configuration as McpConfiguration, invocation, credential, requestDigest,
        runtime.send,
      )
    case 'x402-fetch:v2':
      if (credential === undefined) return refused('x402', requestDigest, false, 'credential_unavailable')
      if (!isX402RouteTransportRuntime(runtime)) {
        return refused('x402', requestDigest, false, 'payment_custody_unavailable')
      }
      return await invokeX402(
        endpoint, configuration as X402Configuration, invocation, credential, requestDigest,
        runtime, prepared.target,
      )
    default:
      return refused('unknown', requestDigest, false, 'adapter_not_registered')
  }
}

async function invokeHttp(
  endpoint: URL,
  configuration: HttpConfiguration,
  invocation: RouteTransportInvocation,
  credential: string | undefined,
  requestDigest: string,
  send: RouteTransportFetch,
  preparedTarget: URL | undefined,
): Promise<RouteTransportObservation> {
  try {
    const target = preparedTarget
    if (target === undefined) return refused('http', requestDigest, false, 'input_invalid')
    const credentialApplied = injectHttpJsonCredential(
      configuration,
      target,
      callHeaders(invocation, undefined),
      credential,
    )
    if (credentialApplied === undefined) {
      return refused('http', requestDigest, false, 'credential_unavailable')
    }
    const response = await send(credentialApplied.target, {
      method: configuration.method,
      redirect: 'manual',
      signal: AbortSignal.timeout(configuration.requestTimeoutMs),
      ...(configuration.method === 'POST' ? { body: invocation.inputJson } : {}),
      headers: credentialApplied.headers,
    })
    return await normalizeJsonResponse('http', response, requestDigest, true)
  } catch (error) {
    return unknown('http', requestDigest, true, `network_${errorName(error)}`)
  }
}

async function invokeMcp(
  endpoint: URL,
  configuration: McpConfiguration,
  invocation: RouteTransportInvocation,
  credential: string | undefined,
  requestDigest: string,
  send: RouteTransportFetch,
): Promise<RouteTransportObservation> {
  const commonHeaders = callHeaders(invocation, credential)
  const initializeId = `initialize:${invocation.authority.operationKeyDigest}`
  let sessionId: string | undefined
  try {
    const initialized = await send(endpoint, {
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(configuration.requestTimeoutMs),
      headers: {
        ...commonHeaders,
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': configuration.protocolVersion,
      },
      body: JSON.stringify({
        jsonrpc: '2.0', id: initializeId, method: 'initialize',
        params: {
          protocolVersion: configuration.protocolVersion,
          capabilities: {}, clientInfo: { name: 'Agentic Economy', version: '1' },
        },
      }),
    })
    if (!initialized.ok) return refused('mcp', requestDigest, false, 'mcp_initialize_refused')
    const initializeBody = await readJsonRpc(initialized, initializeId)
    if (!isJsonRpcResult(initializeBody, initializeId)
      || !isRecord(initializeBody.result)
      || initializeBody.result.protocolVersion !== configuration.protocolVersion) {
      return refused('mcp', requestDigest, false, 'mcp_initialize_invalid')
    }
    sessionId = initialized.headers.get('mcp-session-id') ?? undefined
    const notification = await send(endpoint, {
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(configuration.requestTimeoutMs),
      headers: {
        ...commonHeaders,
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': configuration.protocolVersion,
        ...(sessionId === undefined ? {} : { 'Mcp-Session-Id': sessionId }),
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    })
    if (!notification.ok) return refused('mcp', requestDigest, false, 'mcp_initialize_notification_refused')
  } catch (error) {
    return refused('mcp', requestDigest, false, `mcp_initialize_${errorName(error)}`)
  }

  try {
    const input = parseBoundedJson(invocation.inputJson)
    if (!isRecord(input)) return refused('mcp', requestDigest, false, 'input_invalid')
    const response = await send(endpoint, {
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(configuration.requestTimeoutMs),
      headers: {
        ...commonHeaders,
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': configuration.protocolVersion,
        ...(sessionId === undefined ? {} : { 'Mcp-Session-Id': sessionId }),
      },
      body: JSON.stringify({
        jsonrpc: '2.0', id: invocation.authority.operationKeyDigest,
        method: 'tools/call', params: { name: configuration.toolName, arguments: input },
      }),
    })
    if (!response.ok) return refused('mcp', requestDigest, true, `provider_http_${response.status}`)
    const body = await readJsonRpc(response, invocation.authority.operationKeyDigest)
    if (!isJsonRpcResult(body, invocation.authority.operationKeyDigest)) {
      return unknown('mcp', requestDigest, true, 'mcp_result_invalid')
    }
    const result = body.result
    if (!isRecord(result) || result.isError === true) {
      return refused('mcp', requestDigest, true, 'provider_refused')
    }
    const output = mcpOutput(result)
    if (output === undefined) return unknown('mcp', requestDigest, true, 'mcp_output_invalid')
    const outputJson = JSON.stringify(output)
    return {
      transport: 'mcp', disposition: 'succeeded', releaseStarted: true, requestDigest,
      responseDigest: canonicalDigest(body as StableHashValue), outputJson,
      ...optionalHeader(response, 'provider-receipt', 'providerReceipt'),
      ...optionalHeader(response, 'continuation-token', 'continuationToken'),
    }
  } catch (error) {
    return unknown('mcp', requestDigest, true, `network_${errorName(error)}`)
  }
}

async function invokeX402(
  endpoint: URL,
  configuration: X402Configuration,
  invocation: RouteTransportInvocation,
  credential: string,
  requestDigest: string,
  runtime: X402RouteTransportRuntime,
  preparedTarget: URL | undefined,
): Promise<RouteTransportObservation> {
  const headers = callHeaders(invocation, undefined)
  const target = preparedTarget
  if (target === undefined) return refused('x402', requestDigest, false, 'input_invalid')
  let first: RouteTransportResponse
  try {
    first = await runtime.send(target, {
      method: configuration.method, redirect: 'manual', signal: AbortSignal.timeout(configuration.requestTimeoutMs),
      headers, ...(configuration.method === 'POST' ? { body: invocation.inputJson } : {}),
    })
  } catch (error) {
    return unknown('x402', requestDigest, true, `payment_challenge_${errorName(error)}`)
  }
  if (first.status !== 402) return await normalizeJsonResponse('x402', first, requestDigest, true)
  const challenge = decodeX402Challenge(first.headers.get('payment-required'))
  if (challenge === undefined) return refused('x402', requestDigest, true, 'payment_challenge_invalid')
  const paymentChallengeDigest = canonicalDigest(challenge as StableHashValue)
  const requirement = challenge.accepts.find((candidate) => (
    candidate.scheme === configuration.scheme
    && candidate.network === configuration.network
    && candidate.asset.toLowerCase() === configuration.asset.toLowerCase()
    && candidate.payTo.toLowerCase() === configuration.payTo.toLowerCase()
  ))
  if (requirement === undefined) return {
    ...refused('x402', requestDigest, true, 'payment_requirement_unsupported'), paymentChallengeDigest,
  }
  if (
    challenge.resource.url !== target.href
    || Date.now() + requirement.maxTimeoutSeconds * 1_000 > invocation.authority.expiresAt
  ) {
    return { ...refused('x402', requestDigest, true, 'payment_requirement_outside_authority'), paymentChallengeDigest }
  }
  if (invocation.authority.maximumSpend.currency !== configuration.currency) {
    return { ...refused('x402', requestDigest, true, 'payment_currency_mismatch'), paymentChallengeDigest }
  }
  const expectedAmount = expectedX402Amount(invocation.authority.maximumSpend, configuration)
  if (expectedAmount === undefined) {
    return { ...refused('x402', requestDigest, true, 'payment_authority_invalid'), paymentChallengeDigest }
  }
  const parsedPaymentAmount = exactAmountSchema.safeParse({
    currency: configuration.currency,
    units: requirement.amount,
    exponent: configuration.assetAmountExponent,
  })
  if (!parsedPaymentAmount.success) {
    return { ...refused('x402', requestDigest, true, 'payment_challenge_invalid'), paymentChallengeDigest }
  }
  const paymentAmount = parsedPaymentAmount.data
  if (compareExactAmounts(paymentAmount, expectedAmount) === 1) {
    return { ...refused('x402', requestDigest, true, 'payment_exceeds_step_ceiling'), paymentChallengeDigest }
  }
  const authorizationIdentity = {
    paymentIdentifier: invocation.authority.operationKeyDigest,
    challengeDigest: paymentChallengeDigest,
    attemptRef: invocation.authority.attemptRef,
    effectGeneration: invocation.authority.effectGeneration ?? 0,
    paymentAmount,
  }
  const preparedAuthorization = await runtime.prepareX402PaymentAuthorization({
    challenge, credential,
    selectedRequirement: requirement,
    ...authorizationIdentity,
  })
  if (preparedAuthorization === undefined) {
    return { ...refused('x402', requestDigest, true, 'payment_signature_unavailable'), paymentChallengeDigest }
  }
  const paymentSignature = await runtime.readX402PaymentAuthorization(preparedAuthorization)
  if (paymentSignature === undefined || paymentSignature.length === 0) {
    return { ...refused('x402', requestDigest, true, 'payment_signature_unavailable'), paymentChallengeDigest }
  }
  const paymentEvent: X402PaymentAttemptEvent = {
    paymentIdentifier: invocation.authority.operationKeyDigest,
    attemptRef: invocation.authority.attemptRef,
    challengeDigest: paymentChallengeDigest,
    scheme: requirement.scheme,
    network: requirement.network,
    asset: requirement.asset,
    payTo: requirement.payTo,
    amount: paymentAmount,
    providerEndpoint: target.href,
    custodyRef: preparedAuthorization.custodyRef,
    authorizationDigest: preparedAuthorization.authorizationDigest,
  }
  const markX402PaymentPossiblySubmitted = runtime.markX402PaymentPossiblySubmitted
  const observeX402PaymentAttempt = runtime.observeX402PaymentAttempt
  try {
    if (markX402PaymentPossiblySubmitted !== undefined) {
      await markX402PaymentPossiblySubmitted(paymentEvent)
    }
    const paid = await runtime.send(target, {
      method: configuration.method, redirect: 'manual', signal: AbortSignal.timeout(configuration.requestTimeoutMs),
      headers: { ...headers, 'Payment-Signature': paymentSignature },
      ...(configuration.method === 'POST' ? { body: invocation.inputJson } : {}),
    })
    const normalized = await normalizeJsonResponse('x402', paid, requestDigest, true)
    const paymentProof = optionalHeader(paid, 'payment-response', 'paymentProof')
    const providerReceipt = optionalHeader(paid, 'provider-receipt', 'providerReceipt')
    if (observeX402PaymentAttempt !== undefined) {
      await observeX402PaymentAttempt({
        ...paymentEvent,
        state: 'observed',
        evidenceRefs: [
          ...(paymentProof.paymentProof === undefined ? [] : [canonicalDigest(paymentProof.paymentProof)]),
          ...(providerReceipt.providerReceipt === undefined ? [] : [canonicalDigest(providerReceipt.providerReceipt)]),
        ],
      })
    }
    return {
      ...normalized, paymentChallengeDigest,
      queryReleaseStatus: 'released',
      paymentAuthorizationStatus: 'created',
      paymentSubmissionStatus: 'observed',
      settlementStatus: paymentProof.paymentProof === undefined ? 'not_evidenced' : 'provider_asserted',
      quoteDeliveryStatus: normalized.outputJson === undefined ? 'unknown' : 'delivered',
      ...paymentProof,
      ...providerReceipt,
    }
  } catch (error) {
    if (observeX402PaymentAttempt !== undefined) {
      await observeX402PaymentAttempt({
        ...paymentEvent, state: 'reconciliation_required', evidenceRefs: [],
      })
    }
    return {
      ...unknown('x402', requestDigest, true, `network_${errorName(error)}`),
      paymentChallengeDigest,
      queryReleaseStatus: 'released',
      paymentAuthorizationStatus: 'created',
      paymentSubmissionStatus: 'possibly_submitted',
      settlementStatus: 'unknown',
      quoteDeliveryStatus: 'unknown',
    }
  }
}

async function normalizeJsonResponse(
  transport: RouteTransportObservation['transport'],
  response: RouteTransportResponse,
  requestDigest: string,
  releaseStarted: boolean,
): Promise<RouteTransportObservation> {
  if (response.status < 200 || response.status >= 300) {
    return refused(transport, requestDigest, releaseStarted, `provider_http_${response.status}`)
  }
  const text = await readBoundedText(response)
  if (text === undefined) return unknown(transport, requestDigest, releaseStarted, 'response_unreadable')
  const output = parseBoundedJson(text)
  if (output === undefined) return unknown(transport, requestDigest, releaseStarted, 'response_json_invalid')
  const common = {
    transport, releaseStarted, requestDigest, responseDigest: canonicalDigest(text), outputJson: JSON.stringify(output),
    ...optionalHeader(response, 'provider-receipt', 'providerReceipt'),
  }
  const continuation = response.headers.get('continuation-token')
  return continuation === null
    ? { ...common, disposition: 'succeeded' as const }
    : { ...common, disposition: 'partial' as const, continuationToken: continuation }
}

function callHeaders(
  invocation: Readonly<{ authority: RouteTransportAuthorityCommon }>,
  bearer: string | undefined,
  idempotencyKey = invocation.authority.operationKeyDigest,
): Record<string, string> {
  return {
    'Content-Type': 'application/json',
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

function parseConfiguration(value: string): Readonly<Record<string, unknown>> | undefined {
  const parsed = parseBoundedJson(value)
  return isRecord(parsed) ? parsed : undefined
}

function isHttpConfiguration(value: Readonly<Record<string, unknown>>): value is HttpConfiguration {
  return parseHttpJsonTransportConfiguration(value) !== undefined
}

function isMcpConfiguration(value: Readonly<Record<string, unknown>>): value is McpConfiguration {
  return mcpConfiguration.safeParse(value).success
}

function isX402Configuration(value: Readonly<Record<string, unknown>>): value is X402Configuration {
  return x402Configuration.safeParse(value).success
}
function isX402RouteTransportRuntime(
  runtime: RouteTransportRuntime,
): runtime is X402RouteTransportRuntime {
  const candidate = runtime as Partial<X402RouteTransportRuntime>
  return typeof candidate.prepareX402PaymentAuthorization === 'function'
    && typeof candidate.readX402PaymentAuthorization === 'function'
}
function requestTarget(
  endpoint: URL,
  method: 'GET' | 'POST',
  query: readonly QueryParameterMapping[] | undefined,
  fixedQuery: readonly FixedQueryParameter[] | undefined,
  inputJson: string,
): URL | undefined {
  if (method === 'POST') return new URL(endpoint)
  const input = parseBoundedJson(inputJson)
  if (!isRecord(input) || query === undefined) return undefined
  const target = new URL(endpoint)
  if (fixedQuery !== undefined) {
    for (const mapping of fixedQuery) target.searchParams.append(mapping.parameter, mapping.value)
  }
  for (const mapping of query) {
    const value = readJsonPointer(input, mapping.inputPointer)
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return undefined
    target.searchParams.append(mapping.parameter, String(value))
  }
  return target
}


function decodeX402Challenge(header: string | null): X402Challenge | undefined {
  if (header === null || header.length > MAX_RESPONSE_BYTES * 2) return undefined
  try {
    const parsed: unknown = decodeX402PaymentRequiredHeader(header)
    if (!isRecord(parsed) || parsed.x402Version !== 2 || !isRecord(parsed.resource)
      || !boundedString(parsed.resource.url, 2_000) || !Array.isArray(parsed.accepts)
      || parsed.accepts.length < 1 || parsed.accepts.length > 16) return undefined
    for (const candidate of parsed.accepts) {
      if (!isRecord(candidate) || !boundedString(candidate.scheme, 100)
        || !boundedString(candidate.network, 100) || !/^[A-Za-z0-9-]+:[A-Za-z0-9._-]+$/.test(candidate.network)
        || typeof candidate.amount !== 'string'
        || !/^(?:0|[1-9]\d{0,77})$/.test(candidate.amount)
        || !boundedString(candidate.asset, 200) || !boundedString(candidate.payTo, 200)
        || !Number.isSafeInteger(candidate.maxTimeoutSeconds) || !isRecord(candidate.extra)) return undefined
    }
    return parsed as X402Challenge
  } catch {
    return undefined
  }
}

function expectedX402Amount(
  routeAmount: ExactAmount,
  configuration: X402Configuration,
): ExactAmount | undefined {
  if (
    !exactAmountSchema.safeParse(routeAmount).success
    || routeAmount.currency !== configuration.currency
  ) return undefined
  const rescaled = rescaleExactAmount(routeAmount, configuration.assetAmountExponent)
  if (rescaled === undefined) return undefined
  const decimal = formatExactAmount(routeAmount)
  if (decimal === undefined) return undefined
  const tokenAmount = parseDecimalExactAmount(
    configuration.currency,
    decimal,
    configuration.assetAmountExponent,
  )
  return tokenAmount?.units === rescaled.units ? rescaled : undefined
}

async function readJsonRpc(
  response: RouteTransportResponse,
  expectedId: string,
): Promise<Readonly<Record<string, unknown>> | undefined> {
  const text = await readBoundedText(response)
  if (text === undefined) return undefined
  if ((response.headers.get('content-type') ?? '').toLowerCase().includes('text/event-stream')) {
    const boundedResponse = new Response(`${text}\n\n`, {
      headers: { 'content-type': 'text/event-stream' },
    })
    if (boundedResponse.body === null) return undefined
    const stream = boundedResponse.body
    for await (const candidate of parseJsonEventStream({ stream, schema: z.unknown() })) {
      if (!candidate.success) continue
      if (isRecord(candidate.value) && candidate.value.id === expectedId) return candidate.value
    }
    return undefined
  }
  const parsed = parseBoundedJson(text)
  return isRecord(parsed) ? parsed : undefined
}

async function readBoundedText(response: RouteTransportResponse): Promise<string | undefined> {
  const bounded = await readBoundedRequestText(response, MAX_RESPONSE_BYTES)
  return bounded.ok ? bounded.text : undefined
}

function mcpOutput(result: Readonly<Record<string, unknown>>): unknown {
  if (result.structuredContent !== undefined) return result.structuredContent
  if (!Array.isArray(result.content)) return undefined
  const text = result.content.find((item) => isRecord(item) && item.type === 'text' && typeof item.text === 'string')
  return isRecord(text) && typeof text.text === 'string' ? parseBoundedJson(text.text) : undefined
}

function isJsonRpcResult(value: unknown, expectedId: string): value is Readonly<{
  jsonrpc: '2.0'; id: string; result: unknown
}> {
  return isRecord(value) && value.jsonrpc === '2.0' && value.id === expectedId && 'result' in value
}




function boundedString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max
}


function transportKind(adapterId: string): RouteTransportObservation['transport'] {
  if (adapterId === 'http-json:v1') return 'http'
  if (adapterId === 'mcp-jsonrpc:v1') return 'mcp'
  if (adapterId === 'x402-fetch:v2') return 'x402'
  return 'unknown'
}

function refused(
  transport: RouteTransportObservation['transport'],
  requestDigest: string,
  releaseStarted: boolean,
  failureCode: string,
): RouteTransportObservation {
  return { transport, disposition: 'refused', releaseStarted, requestDigest, failureCode }
}

function unknown(
  transport: RouteTransportObservation['transport'],
  requestDigest: string,
  releaseStarted: boolean,
  failureCode: string,
): RouteTransportObservation {
  return { transport, disposition: 'unknown', releaseStarted, requestDigest, failureCode }
}

function optionalHeader<K extends 'providerReceipt' | 'paymentProof' | 'continuationToken'>(
  response: RouteTransportResponse,
  header: string,
  key: K,
): Partial<Record<K, string>> {
  const value = response.headers.get(header)
  return value === null || value.length === 0 || value.length > 4_096 ? {} : { [key]: value } as Record<K, string>
}

function errorName(error: unknown): string {
  return error instanceof Error && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(error.name)
    ? error.name.toLowerCase()
    : 'error'
}
