import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js'
import {
  normalizeHeaders,
  type FetchLike,
  type Transport,
  type TransportSendOptions,
} from '@modelcontextprotocol/sdk/shared/transport.js'
import {
  defaultBodySerializer,
  defaultPathSerializer,
  serializeArrayParam,
  serializePrimitiveParam,
} from 'openapi-fetch'
import { z } from 'zod'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { parseBoundedJson } from '@/modules/common/bounded-json'
import { isRecord } from '@/modules/common/is-record'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { readJsonPointer } from '@/modules/common/json-pointer'
import type { BoundedRequestBody } from '@/lib/server/bounded-request-body'
import {
  cancelResponseBody,
  readBoundedRequestText,
} from '@/lib/server/bounded-request-body'
import {
  exactAmountSchema,
  compareExactAmounts,
  formatExactAmount,
  parseDecimalExactAmount,
  rescaleExactAmount,
} from '@/modules/money/public'
import type { ExactAmount } from '@/modules/money/public'
import type { CapabilityTransportAuthority } from './public'

import {
  decodeX402PaymentRequiredHeader,
  readX402PaymentPayer,
  readX402PaymentResponseHeader,
  validateX402PaymentRequired,
  type X402SettlementEvidence,
  type X402SettlementResponse,
  type X402SettlementStatus,
} from './internal/x402-payment-signer'
export type {
  X402SettlementEvidence,
  X402SettlementResponse,
  X402SettlementStatus,
} from './internal/x402-payment-signer'
import {
  injectHttpJsonCredential,
  parseHttpJsonTransportConfiguration,
  parseMcpJsonRpcTransportConfiguration,
  type HttpJsonFixedQueryParameter,
  type HttpJsonHeaderParameterMapping,
  type HttpJsonPathParameterMapping,
  type HttpJsonQueryParameterMapping,
  type HttpJsonTransportConfiguration,
  type McpJsonRpcTransportConfiguration,
  validPublicHttpsEndpoint,
} from './internal/transport-adapters'
import {
  isProviderConnectionCredentialRef,
  type ProviderConnectionAuthorityValidation,
  type ProviderConnectionCredentialResolution,
  type ProviderConnectionLeaseAuthorityValidation,
  type ProviderConnectionLeaseCredentialResolution,
} from './provider-connection'

const MAX_RESPONSE_BYTES = 512 * 1024
type RouteTransportResponse = BoundedRequestBody &
  Readonly<{ status: number; ok: boolean }>
type RouteTransportHeaderRecord = Readonly<Record<string, string>>

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

export const MCP_TOOL_LIST_PAGE_LIMIT = 32
export const MCP_TOOL_LIST_TOOL_LIMIT = 4_096

export type McpToolListPage = Readonly<{
  tools: readonly unknown[]
  nextCursor?: string
}>

export type McpToolListPageRead<Failure> =
  | Readonly<{ kind: 'ok'; page: McpToolListPage }>
  | Readonly<{ kind: 'error'; failure: Failure }>

export type McpToolLookupResult<Failure> =
  | Readonly<{ kind: 'found'; tool: Readonly<Record<string, unknown>> }>
  | Readonly<{ kind: 'missing' }>
  | Readonly<{ kind: 'page_limit' }>
  | Readonly<{ kind: 'tool_limit' }>
  | Readonly<{ kind: 'cursor_cycle' }>
  | Readonly<{ kind: 'error'; failure: Failure }>

export async function findMcpToolAcrossPages<Failure>(
  toolName: string,
  readPage: (
    cursor: string | undefined,
  ) => Promise<McpToolListPageRead<Failure>>,
): Promise<McpToolLookupResult<Failure>> {
  const seenCursors = new Set<string>()
  let cursor: string | undefined
  let toolCount = 0
  for (let page = 0; page < MCP_TOOL_LIST_PAGE_LIMIT; page += 1) {
    const read = await readPage(cursor)
    if (read.kind === 'error') return read
    toolCount += read.page.tools.length
    if (toolCount > MCP_TOOL_LIST_TOOL_LIMIT) return { kind: 'tool_limit' }
    const selected = read.page.tools.find(
      (tool) => isRecord(tool) && tool.name === toolName,
    )
    if (isRecord(selected)) return { kind: 'found', tool: selected }
    const nextCursor = read.page.nextCursor
    if (nextCursor === undefined) return { kind: 'missing' }
    if (nextCursor.trim().length === 0 || seenCursors.has(nextCursor)) {
      return { kind: 'cursor_cycle' }
    }
    seenCursors.add(nextCursor)
    cursor = nextCursor
  }
  return { kind: 'page_limit' }
}

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
type RouteTransportBinding<Authority extends CapabilityTransportAuthority> =
  Readonly<{
    adapterId: string
    endpointUrl: string
    authority: Authority
    configJson: string
    configDigest: string
  }>
type KeylessRouteTransportAuthority = RouteTransportAuthorityCommon &
  Readonly<{
    authorityGeneration?: never
    authorityDigest?: never
  }>
type ProviderRouteTransportAuthority = RouteTransportAuthorityCommon &
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
function isProviderRouteTransportAuthority(
  authority: KeylessRouteTransportAuthority | ProviderRouteTransportAuthority,
): authority is ProviderRouteTransportAuthority {
  return (
    Number.isSafeInteger(authority.authorityGeneration) &&
    typeof authority.authorityDigest === 'string'
  )
}
type KeylessRouteTransportInvocation = Readonly<{
  binding: RouteTransportBinding<
    Extract<CapabilityTransportAuthority, { kind: 'keyless' }>
  >
  authority: KeylessRouteTransportAuthority
  inputJson: string
}>
type ProviderRouteTransportInvocation = Readonly<{
  binding: RouteTransportBinding<
    Extract<CapabilityTransportAuthority, { kind: 'provider_connection' }>
  >
  authority: ProviderRouteTransportAuthority
  inputJson: string
}>
export type RouteTransportInvocation =
  KeylessRouteTransportInvocation | ProviderRouteTransportInvocation

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
  /** Opaque server-only payer credential locator; resolve it only at signing. */
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
  settlementEvidence?: X402SettlementEvidence
}>

export type ProviderConnectionAuthorityLookup = Readonly<{
  connectionRef: string
  providerRef: string
  adapterId: string
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

export type ProviderConnectionAuthorityReader = (
  input: ProviderConnectionAuthorityLookup,
) =>
  | ProviderConnectionCredentialResolution
  | ProviderConnectionLeaseCredentialResolution
  | Promise<
      | ProviderConnectionCredentialResolution
      | ProviderConnectionLeaseCredentialResolution
    >

export type ProviderConnectionAuthorityValidationResult =
  | ProviderConnectionAuthorityValidation
  | ProviderConnectionLeaseAuthorityValidation

export type ProviderConnectionAuthorityValidator = (
  input: ProviderConnectionAuthorityLookup,
) =>
  | ProviderConnectionAuthorityValidationResult
  | Promise<ProviderConnectionAuthorityValidationResult>
export type RouteTransportRuntime = Readonly<{
  send: RouteTransportFetch
  resolveCredential: (
    reference: string,
  ) => string | undefined | Promise<string | undefined>

  readProviderConnectionCredentialRef?: ProviderConnectionAuthorityReader
  readX402PaymentCredentialRef?: () =>
    string | undefined | Promise<string | undefined>
  validateProviderConnectionAuthority?: ProviderConnectionAuthorityValidator
  x402PaymentSigningAvailable?: (
    input: Readonly<{
      credentialRef: string
      network: string
      asset: string
      payTo: string
      maximumSpend: ExactAmount
    }>,
  ) => boolean
  verifyX402Settlement?: (
    input: Readonly<{
      response: X402SettlementResponse
      requirement: X402Challenge['accepts'][number]
      paymentSignature: string
      paymentIdentifier: string
      challengeDigest: string
    }>,
  ) => boolean | Promise<boolean>
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
  markX402PaymentPossiblySubmitted?: (
    event: X402PaymentAttemptEvent,
  ) => Promise<void> | void
  observeX402PaymentAttempt?: (
    event: X402PaymentAttemptEvent &
      Readonly<{
        state: 'settled' | 'not_settled' | 'reconciliation_required'
        evidenceRefs: readonly string[]
      }>,
  ) => Promise<void> | void
}>

export type X402RouteTransportRuntime = RouteTransportRuntime &
  Readonly<{
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
async function validateX402ProviderAuthority(
  invocation: RouteTransportInvocation,
  runtime: RouteTransportRuntime,
): Promise<string | undefined> {
  if (invocation.binding.authority.kind !== 'provider_connection')
    return undefined
  const validateProviderConnectionAuthority =
    runtime.validateProviderConnectionAuthority
  if (validateProviderConnectionAuthority === undefined)
    return 'connection_authority_validator_unavailable'
  const authority = invocation.authority
  if (!isProviderRouteTransportAuthority(authority))
    return 'connection_authority_snapshot_invalid'
  let validation: ProviderConnectionAuthorityValidationResult
  try {
    validation = await validateProviderConnectionAuthority({
      connectionRef: invocation.binding.authority.connectionRef,
      providerRef: invocation.binding.authority.providerRef,
      adapterId: invocation.binding.adapterId,
      authorityGeneration: authority.authorityGeneration,
      authorityDigest: authority.authorityDigest,
      ...(authority.leaseRef === undefined
        ? {}
        : {
            leaseRef: authority.leaseRef,
            invocationRef: authority.invocationRef,
            operationRef: authority.operationRef,
            grantedScopes: authority.grantedScopes,
            grantedResources: authority.grantedResources,
            readinessValidUntil: authority.readinessValidUntil,
            ...(authority.readinessDigest === undefined
              ? {}
              : { readinessDigest: authority.readinessDigest }),
          }),
    })
  } catch {
    return 'connection_authority_validation_failed'
  }
  return validation.kind === 'valid'
    ? undefined
    : providerAuthorityFailure(validation.reason)
}

export type RouteTransportObservation = Readonly<{
  transport: 'http' | 'mcp' | 'x402' | 'unknown'
  disposition: 'succeeded' | 'refused' | 'partial' | 'unknown'
  releaseStarted: boolean
  queryReleaseStatus?: 'not_released' | 'released' | 'unknown'
  paymentAuthorizationStatus?: 'not_created' | 'created' | 'unknown'
  paymentSubmissionStatus?:
    'not_submitted' | 'possibly_submitted' | 'observed' | 'unknown'
  settlementEvidence?: X402SettlementEvidence
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

type RouteTransportCancellationInvocationFor<
  Invocation extends RouteTransportInvocation,
> = Readonly<{
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

export function parseRouteTransportObservationJson(
  value: string,
): RouteTransportObservation | undefined {
  if (new TextEncoder().encode(value).byteLength > MAX_RESPONSE_BYTES)
    return undefined
  const bounded = (max: number) =>
    z.string().refine((text) => boundedString(text, max))
  const settlementResponse = z.strictObject({
    success: z.boolean(),
    transaction: bounded(4_096),
    network: bounded(256),
    amount: bounded(4_096).exactOptional(),
    payer: bounded(4_096).exactOptional(),
    errorReason: bounded(4_096).exactOptional(),
    errorMessage: bounded(4_096).exactOptional(),
  })
  const settlementEvidence = z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('not_submitted') }),
    z.strictObject({
      kind: z.enum(['settled', 'not_settled']),
      response: settlementResponse,
      digest: bounded(200),
    }),
    z.strictObject({
      kind: z.literal('unknown'),
      reason: bounded(200),
      response: settlementResponse.exactOptional(),
      digest: bounded(200).exactOptional(),
    }),
  ])
  const observationSchema: z.ZodType<RouteTransportObservation> =
    z.strictObject({
      transport: z.enum(['http', 'mcp', 'x402', 'unknown']),
      disposition: z.enum(['succeeded', 'refused', 'partial', 'unknown']),
      releaseStarted: z.boolean(),
      queryReleaseStatus: z
        .enum(['not_released', 'released', 'unknown'])
        .exactOptional(),
      paymentAuthorizationStatus: z
        .enum(['not_created', 'created', 'unknown'])
        .exactOptional(),
      paymentSubmissionStatus: z
        .enum(['not_submitted', 'possibly_submitted', 'observed', 'unknown'])
        .exactOptional(),
      settlementEvidence: settlementEvidence.exactOptional(),
      quoteDeliveryStatus: z
        .enum(['not_delivered', 'delivered', 'unknown'])
        .exactOptional(),
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
type McpConfiguration = McpJsonRpcTransportConfiguration
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

type RegisteredConfiguration =
  HttpConfiguration | McpConfiguration | X402Configuration
const nonBlankString = z.string().superRefine((value, context) => {
  if (value.trim().length === 0)
    context.addIssue({ code: 'custom', message: 'must_not_be_blank' })
})
const requestTimeout = z.number().int().min(100).max(120_000)
const amountExponent = z.number().int().min(0).max(18)
const queryParameter = z.strictObject({
  inputPointer: z.string().regex(/^\/(?:[^/~]|~[01])+(?:\/(?:[^/~]|~[01])+)*$/),
  parameter: z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,99}$/),
  required: z.boolean().optional(),
  style: z.literal('form').optional(),
  explode: z.boolean().optional(),
})
const queryParameters = z
  .array(queryParameter)
  .min(1)
  .max(64)
  .superRefine((items, context) => {
    const pointers = new Set<string>()
    const parameters = new Set<string>()
    for (const [index, item] of items.entries()) {
      if (pointers.has(item.inputPointer) || parameters.has(item.parameter)) {
        context.addIssue({
          code: 'custom',
          path: [index],
          message: 'query_mapping_duplicate',
        })
      }
      pointers.add(item.inputPointer)
      parameters.add(item.parameter)
    }
  })
const x402Configuration = z
  .strictObject({
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
  })
  .superRefine((value, context) => {
    if (
      (value.method === 'GET' && value.query === undefined) ||
      (value.method === 'POST' && value.query !== undefined)
    ) {
      context.addIssue({ code: 'custom', message: 'method_query_mismatch' })
    }
  })

export type PreparedRouteTransportInvocation = Readonly<{
  invocation: RouteTransportInvocation
  endpoint: URL
  configuration: RegisteredConfiguration
  requestDigest: string
  target?: URL
  headers?: Readonly<Record<string, string>>
}>

export type RouteTransportPreparation =
  | Readonly<{ kind: 'prepared'; prepared: PreparedRouteTransportInvocation }>
  | Readonly<{ kind: 'refused'; observation: RouteTransportObservation }>

type InvocationCredential =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'resolved'; value: string }>
  | Readonly<{ kind: 'unavailable'; failureCode: string }>

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
function providerAuthorityFailure(
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

type RouteTransportCredentialInvocation =
  RouteTransportInvocation | RouteTransportCancellationInvocation
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
): Promise<
  Exclude<RouteTransportCredentialPreflight, Readonly<{ kind: 'none' }>>
> {
  const authority = invocation.authority
  if (!isProviderRouteTransportAuthority(authority)) {
    return {
      kind: 'unavailable',
      failureCode: 'connection_authority_snapshot_invalid',
    }
  }
  const binding = invocation.binding
  if (
    !Number.isSafeInteger(authority.authorityGeneration) ||
    authority.authorityGeneration < 1 ||
    typeof authority.authorityDigest !== 'string' ||
    !/^sha256:[0-9a-f]{64}$/.test(authority.authorityDigest)
  ) {
    return {
      kind: 'unavailable',
      failureCode: 'connection_authority_snapshot_invalid',
    }
  }
  if (
    authority.leaseRef !== undefined &&
    (typeof authority.invocationRef !== 'string' ||
      typeof authority.operationRef !== 'string' ||
      !Array.isArray(authority.grantedScopes) ||
      !Array.isArray(authority.grantedResources) ||
      !Number.isSafeInteger(authority.readinessValidUntil))
  ) {
    return {
      kind: 'unavailable',
      failureCode: 'connection_lease_snapshot_invalid',
    }
  }
  const readProviderConnectionCredentialRef =
    runtime.readProviderConnectionCredentialRef
  if (readProviderConnectionCredentialRef === undefined) {
    return {
      kind: 'unavailable',
      failureCode: 'connection_authority_reader_unavailable',
    }
  }
  const resolved = await readProviderConnectionCredentialRef({
    connectionRef: binding.authority.connectionRef,
    providerRef: binding.authority.providerRef,
    adapterId: binding.adapterId,
    authorityGeneration: authority.authorityGeneration,
    authorityDigest: authority.authorityDigest,
    ...(authority.leaseRef === undefined
      ? {}
      : {
          leaseRef: authority.leaseRef,
          invocationRef: authority.invocationRef,
          operationRef: authority.operationRef,
          grantedScopes: authority.grantedScopes,
          grantedResources: authority.grantedResources,
          readinessValidUntil: authority.readinessValidUntil,
          ...(authority.readinessDigest === undefined
            ? {}
            : { readinessDigest: authority.readinessDigest }),
        }),
  })
  if (resolved.kind !== 'resolved') {
    return {
      kind: 'unavailable',
      failureCode: providerAuthorityFailure(resolved.reason),
    }
  }
  return { kind: 'resolved', credentialRef: resolved.credentialRef }
}

async function preflightCredentialForInvocation(
  invocation: RouteTransportCredentialInvocation,
  runtime: RouteTransportRuntime,
): Promise<RouteTransportCredentialPreflight> {
  if (
    !isProviderRouteTransportInvocation(invocation) ||
    invocation.binding.adapterId === 'x402-fetch:v2'
  )
    return { kind: 'none' }
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
  if (
    credential === undefined ||
    credential.trim().length === 0 ||
    isProviderConnectionCredentialRef(credential)
  ) {
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
  if (
    endpoint === undefined ||
    configuration === undefined ||
    canonicalDigest(configuration as StableHashValue) !==
      invocation.binding.configDigest ||
    invocation.binding.adapterId !== 'http-json:v1' ||
    !isHttpConfiguration(configuration) ||
    configuration.cancellation === undefined
  ) {
    return {
      disposition: 'unsupported',
      requestDigest,
      failureCode: 'cancellation_not_registered',
    }
  }
  const credentialResult = await resolveCredentialForAuthority(
    invocation,
    runtime,
  )
  if (credentialResult.kind === 'unavailable') {
    return {
      disposition: 'unknown',
      requestDigest,
      failureCode: credentialResult.failureCode,
    }
  }
  const credential =
    credentialResult.kind === 'resolved' ? credentialResult.value : undefined
  const cancellationEndpoint = new URL(
    configuration.cancellation.path,
    endpoint.origin,
  )
  const credentialApplied = injectHttpJsonCredential(
    configuration,
    cancellationEndpoint,
    callHeaders(invocation, undefined, invocation.cancellationRequestRef),
    credential,
  )
  if (credentialApplied === undefined) {
    return {
      disposition: 'unknown',
      requestDigest,
      failureCode: 'credential_unavailable',
    }
  }
  const sensitiveValues = outboundSensitiveValues(invocation, credential)
  try {
    const response = await runtime.send(credentialApplied.target, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(configuration.cancellation.requestTimeoutMs),
      body: JSON.stringify(request),
      headers: credentialApplied.headers,
    })
    if (response.status < 200 || response.status >= 300) {
      await cancelResponseBody(response)
      return {
        disposition: 'unknown',
        requestDigest,
        failureCode: `provider_http_${response.status}`,
      }
    }
    const text = await readBoundedText(response)
    const parsed = text === undefined ? undefined : parseBoundedJson(text)
    const responseDigest =
      text === undefined ? undefined : canonicalDigest(text)
    if (
      !isRecord(parsed) ||
      ![
        'cancellation_accepted',
        'cancellation_rejected',
        'cancellation_unknown',
      ].includes(String(parsed.kind)) ||
      (parsed.providerReference !== undefined &&
        !boundedString(parsed.providerReference, 500)) ||
      (parsed.reason !== undefined && !boundedString(parsed.reason, 500)) ||
      Object.keys(parsed).some(
        (key) => !['kind', 'providerReference', 'reason'].includes(key),
      ) ||
      containsSensitiveValue(parsed, sensitiveValues)
    ) {
      return {
        disposition: 'unknown',
        requestDigest,
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
      ...(parsed.providerReference === undefined
        ? {}
        : { providerReference: parsed.providerReference as string }),
    }
    if (parsed.kind === 'cancellation_accepted')
      return { ...common, disposition: 'accepted' }
    if (
      parsed.kind === 'cancellation_rejected' &&
      boundedString(parsed.reason, 500)
    ) {
      return { ...common, disposition: 'rejected', reason: parsed.reason }
    }
    return { ...common, disposition: 'unknown' }
  } catch (error) {
    return {
      disposition: 'unknown',
      requestDigest,
      failureCode: `network_${errorName(error)}`,
    }
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
  if (endpoint === undefined)
    return {
      kind: 'refused',
      observation: refused('unknown', requestDigest, false, 'endpoint_invalid'),
    }
  const configuration = parseConfiguration(invocation.binding.configJson)
  if (
    configuration === undefined ||
    canonicalDigest(configuration as StableHashValue) !==
      invocation.binding.configDigest
  ) {
    return {
      kind: 'refused',
      observation: refused(
        'unknown',
        requestDigest,
        false,
        'adapter_config_invalid',
      ),
    }
  }
  const validConfiguration =
    invocation.binding.adapterId === 'http-json:v1'
      ? isHttpConfiguration(configuration)
      : invocation.binding.adapterId === 'mcp-jsonrpc:v1'
        ? isMcpConfiguration(configuration)
        : invocation.binding.adapterId === 'x402-fetch:v2'
          ? isX402Configuration(configuration)
          : false
  if (!validConfiguration) {
    return {
      kind: 'refused',
      observation: refused(
        transportKind(invocation.binding.adapterId),
        requestDigest,
        false,
        invocation.binding.adapterId === 'http-json:v1' ||
          invocation.binding.adapterId === 'mcp-jsonrpc:v1' ||
          invocation.binding.adapterId === 'x402-fetch:v2'
          ? 'adapter_config_invalid'
          : 'adapter_not_registered',
      ),
    }
  }
  const typedConfiguration = configuration as RegisteredConfiguration
  const targetResult =
    invocation.binding.adapterId === 'http-json:v1'
      ? prepareHttpJsonRequest(
          endpoint,
          typedConfiguration as HttpConfiguration,
          invocation.inputJson,
        )
      : invocation.binding.adapterId === 'x402-fetch:v2'
        ? requestTarget(
            endpoint,
            (typedConfiguration as X402Configuration).method,
            (typedConfiguration as X402Configuration).query,
            undefined,
            undefined,
            undefined,
            invocation.inputJson,
          )
        : undefined
  const targetHeaders =
    targetResult?.kind === 'prepared' ? targetResult.headers : undefined
  const target =
    targetResult?.kind === 'prepared' ? targetResult.target : undefined
  if (targetResult?.kind === 'refused') {
    return {
      kind: 'refused',
      observation: refused(
        transportKind(invocation.binding.adapterId),
        requestDigest,
        false,
        targetResult.failureCode,
      ),
    }
  }
  if (
    (invocation.binding.adapterId === 'http-json:v1' ||
      invocation.binding.adapterId === 'x402-fetch:v2') &&
    target === undefined
  ) {
    return {
      kind: 'refused',
      observation: refused(
        transportKind(invocation.binding.adapterId),
        requestDigest,
        false,
        'input_invalid',
      ),
    }
  }
  if (
    invocation.binding.adapterId === 'mcp-jsonrpc:v1' &&
    !isRecord(parseBoundedJson(invocation.inputJson))
  ) {
    return {
      kind: 'refused',
      observation: refused('mcp', requestDigest, false, 'input_invalid'),
    }
  }
  if (
    invocation.binding.adapterId === 'mcp-jsonrpc:v1'
    && (typedConfiguration as McpConfiguration).protocolVersion !== LATEST_PROTOCOL_VERSION
  ) {
    return {
      kind: 'refused',
      observation: refused('mcp', requestDigest, false, 'mcp_protocol_unsupported'),
    }
  }
  if (invocation.binding.adapterId === 'x402-fetch:v2') {
    const x402 = typedConfiguration as X402Configuration
    if (
      expectedX402Amount(invocation.authority.maximumSpend, x402) === undefined
    ) {
      return {
        kind: 'refused',
        observation: refused(
          'x402',
          requestDigest,
          false,
          'payment_authority_invalid',
        ),
      }
    }
    if (
      x402PaymentSigningAvailable !== undefined &&
      !x402PaymentSigningAvailable({
        credentialRef:
          invocation.binding.authority.kind === 'provider_connection'
            ? invocation.binding.authority.connectionRef
            : 'none',
        network: x402.network,
        asset: x402.asset,
        payTo: x402.payTo,
        maximumSpend: invocation.authority.maximumSpend,
      })
    ) {
      return {
        kind: 'refused',
        observation: refused(
          'x402',
          requestDigest,
          false,
          'payment_signature_unavailable',
        ),
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
      ...(targetHeaders === undefined ? {} : { headers: targetHeaders }),
    },
  }
}
export async function invokePreparedRouteTransport(
  prepared: PreparedRouteTransportInvocation,
  runtime: RouteTransportRuntime,
): Promise<RouteTransportObservation> {
  const {
    invocation,
    endpoint,
    configuration,
    requestDigest,
    headers: preparedHeaders,
  } = prepared
  if (invocation.binding.adapterId === 'x402-fetch:v2') {
    if (!isX402RouteTransportRuntime(runtime)) {
      return refused(
        'x402',
        requestDigest,
        false,
        'payment_custody_unavailable',
      )
    }
    return await invokeX402(
      endpoint,
      configuration as X402Configuration,
      invocation,
      requestDigest,
      runtime,
      prepared.target,
    )
  }
  const credentialResult = await resolveCredentialForAuthority(
    invocation,
    runtime,
  )
  if (credentialResult.kind === 'unavailable') {
    return refused(
      transportKind(invocation.binding.adapterId),
      requestDigest,
      false,
      credentialResult.failureCode,
    )
  }
  const credential =
    credentialResult.kind === 'resolved' ? credentialResult.value : undefined
  switch (invocation.binding.adapterId) {
    case 'http-json:v1':
      return await invokeHttp(
        endpoint,
        configuration as HttpConfiguration,
        invocation,
        credential,
        requestDigest,
        runtime.send,
        prepared.target,
        preparedHeaders,
      )
    case 'mcp-jsonrpc:v1':
      return await invokeMcp(
        endpoint,
        configuration as McpConfiguration,
        invocation,
        credential,
        requestDigest,
        runtime.send,
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

async function invokeMcp(
  endpoint: URL,
  configuration: McpConfiguration,
  invocation: RouteTransportInvocation,
  credential: string | undefined,
  requestDigest: string,
  send: RouteTransportFetch,
): Promise<RouteTransportObservation> {
  if (configuration.protocolVersion !== LATEST_PROTOCOL_VERSION) {
    return refused('mcp', requestDigest, false, 'mcp_protocol_unsupported')
  }
  const common = injectHttpJsonCredential(
    {
      method: 'POST',
      requestTimeoutMs: configuration.requestTimeoutMs,
      ...(configuration.credential === undefined
        ? {}
        : { credential: configuration.credential }),
    },
    endpoint,
    callHeaders(invocation, undefined),
    credential,
  )
  if (common === undefined)
    return refused('mcp', requestDigest, false, 'credential_unavailable')

  const sensitiveValues = outboundSensitiveValues(invocation, credential)
  let lastResponseHeaders: RouteTransportHeaderRecord | undefined
  const fetchThroughGuard: FetchLike = async (input, init) => {
    const requestHeaders = normalizeHeaders(init?.headers)
    const requestSignal = init?.signal
    const signal =
      requestSignal === undefined ||
      requestSignal === null ||
      requestSignal.aborted
        ? AbortSignal.timeout(configuration.requestTimeoutMs)
        : AbortSignal.any([
            requestSignal,
            AbortSignal.timeout(configuration.requestTimeoutMs),
          ])
    const response = await send(
      typeof input === 'string' ? new URL(input) : new URL(input.href),
      {
        method: init?.method ?? 'GET',
        redirect: 'manual',
        signal,
        ...(typeof init?.body === 'string' ? { body: init.body } : {}),
        headers: requestHeaders,
      },
    )
    const responseHeaders = toHeaderRecord(response)
    if ((init?.method ?? 'GET').toUpperCase() !== 'GET') {
      lastResponseHeaders = responseHeaders
    }

    const contentLength = Number(responseHeaders['content-length'])
    if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
      await cancelResponseBody(response)
      throw Object.assign(new Error('payload_too_large'), {
        name: 'PayloadTooLarge',
      })
    }
    if (response.body === null)
      return new Response(null, {
        status: response.status,
        headers: responseHeaders,
      })
    const bounded = await readBoundedRequestText(response, MAX_RESPONSE_BYTES)
    if (!bounded.ok)
      throw Object.assign(new Error('payload_too_large'), {
        name: 'PayloadTooLarge',
      })
    return new Response(bounded.text, {
      status: response.status,
      headers: responseHeaders,
    })
  }
  const transport = new StreamableHTTPClientTransport(common.target, {
    requestInit: { redirect: 'manual', headers: common.headers },
    fetch: fetchThroughGuard,
    reconnectionOptions: {
      initialReconnectionDelay: configuration.requestTimeoutMs,
      maxReconnectionDelay: configuration.requestTimeoutMs,
      reconnectionDelayGrowFactor: 1,
      maxRetries: 0,
    },
  })
  const clientTransport: Transport = {
    start: () => transport.start(),
    send: (message, options?: TransportSendOptions) =>
      transport.send(message, options),
    close: () => transport.close(),
    setProtocolVersion: (version) => transport.setProtocolVersion(version),
  }
  Object.defineProperties(clientTransport, {
    onclose: {
      configurable: true,
      get: () => transport.onclose,
      set: (handler: Transport['onclose']) => {
        if (handler === undefined) delete transport.onclose
        else transport.onclose = handler
      },
    },
    onerror: {
      configurable: true,
      get: () => transport.onerror,
      set: (handler: Transport['onerror']) => {
        if (handler === undefined) delete transport.onerror
        else transport.onerror = handler
      },
    },
    onmessage: {
      configurable: true,
      get: () => transport.onmessage,
      set: (handler: Transport['onmessage']) => {
        if (handler === undefined) delete transport.onmessage
        else transport.onmessage = handler
      },
    },
  })
  const client = new Client({ name: 'Agentic Economy', version: '1' })
  const requestOptions = {
    timeout: configuration.requestTimeoutMs,
    maxTotalTimeout: configuration.requestTimeoutMs,
  }
  const httpStatus = (error: unknown): number | undefined =>
    error instanceof StreamableHTTPError &&
    error.code !== undefined &&
    error.code >= 100
      ? error.code
      : undefined
  const invalidResponseError = (error: unknown): boolean =>
    (error instanceof StreamableHTTPError && error.code === -1) ||
    ['mcperror', 'payloadtoolarge', 'syntaxerror', 'zoderror'].includes(
      errorName(error),
    )

  try {
    try {
      await client.connect(clientTransport, requestOptions)
    } catch (error) {
      if (httpStatus(error) !== undefined)
        return refused('mcp', requestDigest, false, 'mcp_initialize_refused')
      if (invalidResponseError(error))
        return refused('mcp', requestDigest, false, 'mcp_initialize_invalid')
      return refused(
        'mcp',
        requestDigest,
        false,
        `mcp_initialize_${errorName(error)}`,
      )
    }
    if (
      transport.protocolVersion !== configuration.protocolVersion ||
      client.getServerCapabilities()?.tools === undefined
    ) {
      return refused('mcp', requestDigest, false, 'mcp_initialize_invalid')
    }

    const listed = await findMcpToolAcrossPages(
      configuration.toolName,
      async (cursor) => {
        try {
          const result = await client.listTools(
            cursor === undefined ? {} : { cursor },
            requestOptions,
          )
          return {
            kind: 'ok' as const,
            page: {
              tools: result.tools,
              ...(result.nextCursor === undefined
                ? {}
                : { nextCursor: result.nextCursor }),
            },
          }
        } catch (error) {
          return {
            kind: 'error' as const,
            failure:
              httpStatus(error) === undefined
                ? ('mcp_tools_list_invalid' as const)
                : ('mcp_tools_list_refused' as const),
          }
        }
      },
    )
    if (listed.kind === 'error')
      return refused('mcp', requestDigest, false, listed.failure)
    if (listed.kind === 'missing')
      return refused('mcp', requestDigest, false, 'mcp_tool_missing')
    if (listed.kind === 'cursor_cycle') {
      return refused('mcp', requestDigest, false, 'mcp_tools_list_cursor_cycle')
    }
    if (listed.kind === 'page_limit') {
      return refused('mcp', requestDigest, false, 'mcp_tools_list_page_limit')
    }
    if (listed.kind === 'tool_limit') {
      return refused('mcp', requestDigest, false, 'mcp_tools_list_tool_limit')
    }

    const input = parseBoundedJson(invocation.inputJson)
    if (!isRecord(input))
      return refused('mcp', requestDigest, false, 'input_invalid')
    try {
      const callResult = await client.callTool(
        { name: configuration.toolName, arguments: input },
        undefined,
        requestOptions,
      )
      if (containsSensitiveValue(callResult, sensitiveValues)) {
        return unknown('mcp', requestDigest, true, 'mcp_output_invalid')
      }
      if (isRecord(callResult) && callResult.isError === true) {
        return refused('mcp', requestDigest, true, 'provider_refused')
      }
      const output = mcpOutput(callResult)
      if (output === undefined)
        return unknown('mcp', requestDigest, true, 'mcp_output_invalid')
      const providerReceipt =
        lastResponseHeaders === undefined
          ? {}
          : optionalHeader(
              lastResponseHeaders,
              'provider-receipt',
              'providerReceipt',
            )
      const continuationToken =
        lastResponseHeaders === undefined
          ? {}
          : optionalHeader(
              lastResponseHeaders,
              'continuation-token',
              'continuationToken',
            )
      if (
        containsSensitiveValue(output, sensitiveValues) ||
        containsSensitiveValue(providerReceipt, sensitiveValues) ||
        containsSensitiveValue(continuationToken, sensitiveValues)
      ) {
        return unknown('mcp', requestDigest, true, 'mcp_output_invalid')
      }
      const outputJson = JSON.stringify(output)
      if (
        outputJson === undefined ||
        outputJson.length > MAX_RESPONSE_BYTES ||
        containsSensitiveValue(outputJson, sensitiveValues)
      ) {
        return unknown('mcp', requestDigest, true, 'mcp_output_invalid')
      }
      return {
        transport: 'mcp',
        disposition: 'succeeded',
        releaseStarted: true,
        requestDigest,
        responseDigest: canonicalDigest(callResult as StableHashValue),
        outputJson,
        ...providerReceipt,
        ...continuationToken,
      }
    } catch (error) {
      const status = httpStatus(error)
      if (status !== undefined)
        return refused('mcp', requestDigest, true, `provider_http_${status}`)
      if (invalidResponseError(error))
        return unknown('mcp', requestDigest, true, 'mcp_result_invalid')
      return unknown('mcp', requestDigest, true, `network_${errorName(error)}`)
    }
  } finally {
    if (transport.sessionId !== undefined) {
      try {
        await transport.terminateSession()
      } catch {
        // Cleanup failures must not replace the invocation outcome.
      }
    }
    try {
      await transport.close()
    } catch {
      // Cleanup failures must not replace the invocation outcome.
    }
  }
}

async function invokeX402(
  endpoint: URL,
  configuration: X402Configuration,
  invocation: RouteTransportInvocation,
  requestDigest: string,
  runtime: X402RouteTransportRuntime,
  preparedTarget: URL | undefined,
): Promise<RouteTransportObservation> {
  const headers = callHeaders(invocation, undefined)
  const target = preparedTarget
  if (target === undefined)
    return refused('x402', requestDigest, false, 'input_invalid')
  const authorityFailure = await validateX402ProviderAuthority(invocation, runtime)
  if (authorityFailure !== undefined)
    return refused('x402', requestDigest, false, authorityFailure)
  let first: RouteTransportResponse
  try {
    first = await runtime.send(target, {
      method: configuration.method,
      redirect: 'manual',
      signal: AbortSignal.timeout(configuration.requestTimeoutMs),
      headers,
      ...(configuration.method === 'POST'
        ? { body: invocation.inputJson }
        : {}),
    })
  } catch (error) {
    return unknown(
      'x402',
      requestDigest,
      true,
      `payment_challenge_${errorName(error)}`,
    )
  }
  if (first.status !== 402) {
    return await normalizeJsonResponse(
      'x402',
      first,
      requestDigest,
      true,
      undefined,
      undefined,
      outboundSensitiveValues(invocation),
    )
  }
  await cancelResponseBody(first)
  const challenge = decodeX402Challenge(first.headers.get('payment-required'))
  if (challenge === undefined)
    return refused('x402', requestDigest, false, 'payment_challenge_invalid')
  const paymentChallengeDigest = canonicalDigest(challenge as StableHashValue)
  const requirement = challenge.accepts.find(
    (candidate) =>
      candidate.scheme === configuration.scheme &&
      candidate.network === configuration.network &&
      candidate.asset.toLowerCase() === configuration.asset.toLowerCase() &&
      candidate.payTo.toLowerCase() === configuration.payTo.toLowerCase(),
  )
  if (requirement === undefined)
    return {
      ...refused(
        'x402',
        requestDigest,
        false,
        'payment_requirement_unsupported',
      ),
      paymentChallengeDigest,
    }
  if (
    challenge.resource.url !== target.href ||
    Date.now() + requirement.maxTimeoutSeconds * 1_000 >
      invocation.authority.expiresAt
  ) {
    return {
      ...refused(
        'x402',
        requestDigest,
        false,
        'payment_requirement_outside_authority',
      ),
      paymentChallengeDigest,
    }
  }
  if (invocation.authority.maximumSpend.currency !== configuration.currency) {
    return {
      ...refused('x402', requestDigest, false, 'payment_currency_mismatch'),
      paymentChallengeDigest,
    }
  }
  const expectedAmount = expectedX402Amount(
    invocation.authority.maximumSpend,
    configuration,
  )
  if (expectedAmount === undefined) {
    return {
      ...refused('x402', requestDigest, false, 'payment_authority_invalid'),
      paymentChallengeDigest,
    }
  }
  const parsedPaymentAmount = exactAmountSchema.safeParse({
    currency: configuration.currency,
    units: requirement.amount,
    exponent: configuration.assetAmountExponent,
  })
  if (!parsedPaymentAmount.success) {
    return {
      ...refused('x402', requestDigest, false, 'payment_challenge_invalid'),
      paymentChallengeDigest,
    }
  }
  const paymentAmount = parsedPaymentAmount.data
  const amountComparison = compareExactAmounts(paymentAmount, expectedAmount)
  if (amountComparison !== 0) {
    return {
      ...refused(
        'x402',
        requestDigest,
        false,
        amountComparison === 1
          ? 'payment_exceeds_step_ceiling'
          : 'payment_amount_mismatch',
      ),
      paymentChallengeDigest,
    }
  }
  let paymentCredentialRef: string | undefined
  try {
    const configured =
      runtime.readX402PaymentCredentialRef === undefined
        ? undefined
        : await runtime.readX402PaymentCredentialRef()
    if (isProviderConnectionCredentialRef(configured))
      paymentCredentialRef = configured
  } catch {
    paymentCredentialRef = undefined
  }
  if (paymentCredentialRef === undefined) {
    return refused('x402', requestDigest, false, 'payment_custody_unavailable')
  }
  const authorizationIdentity = {
    paymentIdentifier: invocation.authority.operationKeyDigest,
    challengeDigest: paymentChallengeDigest,
    attemptRef: invocation.authority.attemptRef,
    effectGeneration: invocation.authority.effectGeneration ?? 0,
    paymentAmount,
  }
  const preparedAuthorization = await runtime.prepareX402PaymentAuthorization({
    challenge,
    credential: paymentCredentialRef,
    selectedRequirement: requirement,
    ...authorizationIdentity,
  })
  if (preparedAuthorization === undefined) {
    return {
      ...refused('x402', requestDigest, false, 'payment_signature_unavailable'),
      paymentChallengeDigest,
      paymentAuthorizationStatus: 'not_created',
      paymentSubmissionStatus: 'not_submitted',
      settlementEvidence: { kind: 'not_submitted' },
    }
  }
  const paymentSignature = await runtime.readX402PaymentAuthorization(
    preparedAuthorization,
  )
  if (paymentSignature === undefined || paymentSignature.length === 0) {
    return {
      ...refused('x402', requestDigest, false, 'payment_signature_unavailable'),
      paymentChallengeDigest,
      paymentAuthorizationStatus: 'created',
      paymentSubmissionStatus: 'not_submitted',
      settlementEvidence: { kind: 'not_submitted' },
    }
  }
  const sensitiveValues = outboundSensitiveValues(
    invocation,
    undefined,
    paymentSignature,
  )
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
  const preSendAuthorityFailure = await validateX402ProviderAuthority(invocation, runtime)
  if (preSendAuthorityFailure !== undefined) {
    return {
      ...refused('x402', requestDigest, false, preSendAuthorityFailure),
      paymentChallengeDigest,
      paymentAuthorizationStatus: 'created',
      paymentSubmissionStatus: 'not_submitted',
      settlementEvidence: { kind: 'not_submitted' },
    }
  }
  const markX402PaymentPossiblySubmitted =
    runtime.markX402PaymentPossiblySubmitted
  const observeX402PaymentAttempt = runtime.observeX402PaymentAttempt
  try {
    if (markX402PaymentPossiblySubmitted !== undefined) {
      await markX402PaymentPossiblySubmitted(paymentEvent)
    }
    const paid = await runtime.send(target, {
      method: configuration.method,
      redirect: 'manual',
      signal: AbortSignal.timeout(configuration.requestTimeoutMs),
      headers: { ...headers, 'Payment-Signature': paymentSignature },
      ...(configuration.method === 'POST'
        ? { body: invocation.inputJson }
        : {}),
    })
    const normalized = await normalizeJsonResponse(
      'x402',
      paid,
      requestDigest,
      true,
      undefined,
      undefined,
      sensitiveValues,
    )
    const paidHeaders = toHeaderRecord(paid)
    const paymentProof = optionalHeader(
      paidHeaders,
      'payment-response',
      'paymentProof',
    )
    const providerReceipt = optionalHeader(
      paidHeaders,
      'provider-receipt',
      'providerReceipt',
    )
    const paymentOutputContainsSensitive =
      containsSensitiveValue(paymentProof, sensitiveValues) ||
      containsSensitiveValue(providerReceipt, sensitiveValues)
    const settlement = paymentOutputContainsSensitive
      ? { status: 'unknown' as const, failureCode: 'response_output_invalid' }
      : await x402SettlementCheck(
          paymentProof.paymentProof,
          requirement,
          paymentSignature,
          authorizationIdentity,
          runtime.verifyX402Settlement,
        )
    const evidenceRefs = paymentOutputContainsSensitive
      ? []
      : [
          ...(paymentProof.paymentProof === undefined
            ? []
            : [canonicalDigest(paymentProof.paymentProof)]),
          ...(providerReceipt.providerReceipt === undefined
            ? []
            : [canonicalDigest(providerReceipt.providerReceipt)]),
        ]
    if (observeX402PaymentAttempt !== undefined) {
      await observeX402PaymentAttempt({
        ...paymentEvent,
        settlementEvidence:
          settlement.status === 'unknown'
            ? {
                kind: 'unknown',
                reason:
                  settlement.failureCode ?? 'payment_settlement_unknown',
                ...(settlement.response === undefined
                  ? {}
                  : { response: settlement.response }),
                ...(settlement.digest === undefined
                  ? {}
                  : { digest: settlement.digest }),
              }
            : {
                kind: settlement.status,
                response: settlement.response,
                digest: settlement.digest,
              },
        state:
          settlement.status === 'unknown'
            ? 'reconciliation_required'
            : settlement.status,
        evidenceRefs,
      })
    }
    if (paymentOutputContainsSensitive) {
      return {
        ...unknown('x402', requestDigest, true, 'response_output_invalid'),
        paymentChallengeDigest,
        queryReleaseStatus: 'released',
        paymentAuthorizationStatus: 'created',
        paymentSubmissionStatus: 'observed',
        settlementEvidence: {
          kind: 'unknown',
          reason: 'response_output_invalid',
        },
        quoteDeliveryStatus: 'unknown',
      }
    }
    if (settlement.status === 'unknown') {
      return {
        ...unknown(
          'x402',
          requestDigest,
          true,
          settlement.failureCode ?? 'payment_settlement_unknown',
        ),
        paymentChallengeDigest,
        queryReleaseStatus: 'released',
        paymentAuthorizationStatus: 'created',
        paymentSubmissionStatus: 'observed',
        settlementEvidence: {
          kind: 'unknown',
          reason: settlement.failureCode ?? 'payment_settlement_unknown',
          ...(settlement.response === undefined
            ? {}
            : { response: settlement.response }),
          ...(settlement.digest === undefined
            ? {}
            : { digest: settlement.digest }),
        },
        quoteDeliveryStatus: 'unknown',
        ...paymentProof,
        ...providerReceipt,
      }
    }
    if (settlement.status === 'not_settled') {
      return {
        ...normalized,
        disposition: 'refused',
        failureCode: 'payment_not_settled',
        paymentChallengeDigest,
        queryReleaseStatus: 'released',
        paymentAuthorizationStatus: 'created',
        paymentSubmissionStatus: 'observed',
        settlementEvidence: {
          kind: 'not_settled',
          response: settlement.response,
          digest: settlement.digest,
        },
        quoteDeliveryStatus: 'not_delivered',
        ...paymentProof,
        ...providerReceipt,
      }
    }
    return {
      ...normalized,
      paymentChallengeDigest,
      queryReleaseStatus: 'released',
      paymentAuthorizationStatus: 'created',
      paymentSubmissionStatus: 'observed',
      settlementEvidence: {
        kind: 'settled',
        response: settlement.response,
        digest: settlement.digest,
      },
      quoteDeliveryStatus:
        normalized.outputJson === undefined ? 'unknown' : 'delivered',
      ...paymentProof,
      ...providerReceipt,
    }
  } catch (error) {
    if (observeX402PaymentAttempt !== undefined) {
      await observeX402PaymentAttempt({
        ...paymentEvent,
        settlementEvidence: {
          kind: 'unknown',
          reason: `network_${errorName(error)}`,
        },
        state: 'reconciliation_required',
        evidenceRefs: [],
      })
    }
    return {
      ...unknown('x402', requestDigest, true, `network_${errorName(error)}`),
      paymentChallengeDigest,
      queryReleaseStatus: 'released',
      paymentAuthorizationStatus: 'created',
      paymentSubmissionStatus: 'possibly_submitted',
      settlementEvidence: {
        kind: 'unknown',
        reason: `network_${errorName(error)}`,
      },
      quoteDeliveryStatus: 'unknown',
    }
  }
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

async function normalizeJsonResponse(
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

function containsSensitiveValue(
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

function outboundSensitiveValues(
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

function callHeaders(
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

function parseConfiguration(
  value: string,
): Readonly<Record<string, unknown>> | undefined {
  const parsed = parseBoundedJson(value)
  return isRecord(parsed) ? parsed : undefined
}

function isHttpConfiguration(
  value: Readonly<Record<string, unknown>>,
): value is HttpConfiguration {
  return parseHttpJsonTransportConfiguration(value) !== undefined
}

function isMcpConfiguration(
  value: Readonly<Record<string, unknown>>,
): value is McpConfiguration {
  return parseMcpJsonRpcTransportConfiguration(value) !== undefined
}

function isX402Configuration(
  value: Readonly<Record<string, unknown>>,
): value is X402Configuration {
  return x402Configuration.safeParse(value).success
}
function isX402RouteTransportRuntime(
  runtime: RouteTransportRuntime,
): runtime is X402RouteTransportRuntime {
  const candidate = runtime as Partial<X402RouteTransportRuntime>
  return (
    typeof candidate.prepareX402PaymentAuthorization === 'function' &&
    typeof candidate.readX402PaymentAuthorization === 'function'
  )
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

function requestTarget(
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

function decodeX402Challenge(header: string | null): X402Challenge | undefined {
  if (header === null || header.length > MAX_RESPONSE_BYTES * 2)
    return undefined
  try {
    const decoded = decodeX402PaymentRequiredHeader(header)
    const parsed = validateX402PaymentRequired(decoded)
    if (
      parsed.x402Version !== 2
      || !boundedString(parsed.resource.url, 2_000)
      || !Array.isArray(parsed.accepts)
      || parsed.accepts.length < 1
      || parsed.accepts.length > 16
    )
      return undefined
    for (const candidate of parsed.accepts) {
      if (
        !isRecord(candidate)
        || !boundedString(candidate.scheme, 100)
        || !boundedString(candidate.network, 100)
        || !/^[A-Za-z0-9-]+:[A-Za-z0-9._-]+$/.test(candidate.network)
        || typeof candidate.amount !== 'string'
        || !/^(?:0|[1-9]\d{0,77})$/.test(candidate.amount)
        || !boundedString(candidate.asset, 200)
        || !boundedString(candidate.payTo, 200)
        || !Number.isSafeInteger(candidate.maxTimeoutSeconds)
        || candidate.maxTimeoutSeconds <= 0
        || candidate.maxTimeoutSeconds > 86_400
        || !isRecord(candidate.extra)
        || !isSupportedX402TransferMethod(candidate.extra)
      )
        return undefined
    }
    return parsed as X402Challenge
  } catch {
    return undefined
  }
}

function isSupportedX402TransferMethod(
  extra: Readonly<Record<string, unknown>>,
): boolean {
  const method = extra.assetTransferMethod
  return method === undefined || method === 'eip3009' || method === 'permit2'
}

function expectedX402Amount(
  routeAmount: ExactAmount,
  configuration: X402Configuration,
): ExactAmount | undefined {
  if (
    !exactAmountSchema.safeParse(routeAmount).success ||
    routeAmount.currency !== configuration.currency
  )
    return undefined
  const rescaled = rescaleExactAmount(
    routeAmount,
    configuration.assetAmountExponent,
  )
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
type X402SettlementCheck =
  | Readonly<{
      status: 'settled' | 'not_settled'
      response: X402SettlementResponse
      digest: string
    }>
  | Readonly<{
      status: 'unknown'
      response?: X402SettlementResponse
      digest?: string
      failureCode: string
    }>

async function x402SettlementCheck(
  paymentProof: string | undefined,
  requirement: X402Challenge['accepts'][number],
  paymentSignature: string,
  authorizationIdentity: Readonly<{
    paymentIdentifier: string
    challengeDigest: string
  }>,
  verifySettlement: RouteTransportRuntime['verifyX402Settlement'],
): Promise<X402SettlementCheck> {
  if (paymentProof === undefined)
    return { status: 'unknown', failureCode: 'payment_settlement_missing' }
  const response = readX402PaymentResponseHeader(paymentProof)
  if (response === undefined)
    return { status: 'unknown', failureCode: 'payment_settlement_malformed' }
  const digest = canonicalDigest(response as StableHashValue)
  if (
    response.network !== requirement.network
    || (response.amount !== undefined && response.amount !== requirement.amount)
  )
    return {
      status: 'unknown',
      response,
      digest,
      failureCode: 'payment_settlement_mismatch',
    }
  let verified = false
  try {
    verified = verifySettlement === undefined
      ? false
      : await verifySettlement({
          response,
          requirement,
          paymentSignature,
          ...authorizationIdentity,
        })
  } catch {
    verified = false
  }
  if (!verified) {
    return {
      status: 'unknown',
      response,
      digest,
      failureCode: 'payment_settlement_unverified',
    }
  }
  return {
    status: response.success ? 'settled' : 'not_settled',
    response,
    digest,
  }
}

async function readBoundedText(
  response: RouteTransportResponse,
): Promise<string | undefined> {
  const bounded = await readBoundedRequestText(response, MAX_RESPONSE_BYTES)
  return bounded.ok ? bounded.text : undefined
}

function mcpOutput(result: unknown): unknown {
  if (!isRecord(result)) return undefined
  if (result.structuredContent !== undefined) return result.structuredContent
  if (!Array.isArray(result.content)) return undefined
  const text = result.content.find(
    (item) =>
      isRecord(item) && item.type === 'text' && typeof item.text === 'string',
  )
  return isRecord(text) && typeof text.text === 'string'
    ? parseBoundedJson(text.text)
    : undefined
}

function boundedString(value: unknown, max: number): value is string {
  return (
    typeof value === 'string' && value.trim().length > 0 && value.length <= max
  )
}

function transportKind(
  adapterId: string,
): RouteTransportObservation['transport'] {
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
  return {
    transport,
    disposition: 'refused',
    releaseStarted,
    requestDigest,
    failureCode,
  }
}

function unknown(
  transport: RouteTransportObservation['transport'],
  requestDigest: string,
  releaseStarted: boolean,
  failureCode: string,
): RouteTransportObservation {
  return {
    transport,
    disposition: 'unknown',
    releaseStarted,
    requestDigest,
    failureCode,
  }
}

function toHeaderRecord(
  response: RouteTransportResponse,
): RouteTransportHeaderRecord {
  const headers: Record<string, string> = {}
  response.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value
  })
  return headers
}
function optionalHeader<
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

function errorName(error: unknown): string {
  return error instanceof Error &&
    /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(error.name)
    ? error.name.toLowerCase()
    : 'error'
}
