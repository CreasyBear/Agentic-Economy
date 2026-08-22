import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js'
import { validatePaymentRequired } from '@x402/core/schemas'
import { z } from 'zod'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { parseBoundedJson } from '@/modules/common/bounded-json'
import { isRecord } from '@/modules/common/is-record'
import type { StableHashValue } from '@/modules/common/stable-hash'
import type { ExactAmount } from '@/modules/money/public'
import type { CapabilityTransportAuthority } from '../public'
import { validPublicHttpsEndpoint } from './transport-adapters'
import {
  isProviderConnectionCredentialRef,
  type ProviderConnectionAuthorityValidation,
  type ProviderConnectionCredentialResolution,
  type ProviderConnectionLeaseAuthorityValidation,
  type ProviderConnectionLeaseCredentialResolution,
} from '../provider-connection'
import {
  isHttpConfiguration,
  isProviderRouteTransportAuthority,
  parseConfiguration,
  prepareHttpJsonRequest,
  providerAuthorityFailure,
  requestTarget,
  invokeHttp,
  type HttpConfiguration,
  type KeylessRouteTransportAuthority,
  type ProviderRouteTransportAuthority,
  type RouteTransportFetch,
} from './route-transport-http-json'
import { isMcpConfiguration, invokeMcp, type McpConfiguration } from './route-transport-mcp'
import {
  invokeX402,
  type X402Configuration,
  type X402PaymentAttemptEvent,
  type X402PaymentAuthorizationIdentity,
  type X402PaymentSignatureRequest,
  type X402PreparedAuthorization,
  type X402RouteTransportRuntime,
} from './route-transport-x402'
import { expectedX402Amount } from './route-transport-x402-payment'
import type {
  RouteTransportCancellationInvocation,
  RouteTransportCancellationInvocationFor,
} from './route-transport-cancel'
import {
  refused,
  transportKind,
  type RouteTransportObservation,
} from './route-transport-observation'
import type { X402SettlementResponse } from './x402-payment-signer'

type RouteTransportBinding<Authority extends CapabilityTransportAuthority> =
  Readonly<{
    adapterId: string
    endpointUrl: string
    authority: Authority
    configJson: string
    configDigest: string
  }>

export type KeylessRouteTransportInvocation = Readonly<{
  binding: RouteTransportBinding<
    Extract<CapabilityTransportAuthority, { kind: 'keyless' }>
  >
  authority: KeylessRouteTransportAuthority
  inputJson: string
}>

export type ProviderRouteTransportInvocation = Readonly<{
  binding: RouteTransportBinding<
    Extract<CapabilityTransportAuthority, { kind: 'provider_connection' }>
  >
  authority: ProviderRouteTransportAuthority
  inputJson: string
}>

export type RouteTransportInvocation =
  KeylessRouteTransportInvocation | ProviderRouteTransportInvocation

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
      requirement: X402PaymentSignatureRequest['selectedRequirement']
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
    paymentRequired: z.unknown(),
  })
  .superRefine((value, context) => {
    if (
      (value.method === 'GET' && value.query === undefined) ||
      (value.method === 'POST' && value.query !== undefined)
    ) {
      context.addIssue({ code: 'custom', message: 'method_query_mismatch' })
    }
    try {
      const paymentRequired = validatePaymentRequired(value.paymentRequired)
      if (paymentRequired.x402Version !== 2) {
        context.addIssue({
          code: 'custom',
          path: ['paymentRequired'],
          message: 'payment_required_version_unsupported',
        })
      }
    } catch {
      context.addIssue({
        code: 'custom',
        path: ['paymentRequired'],
        message: 'payment_required_invalid',
      })
    }
  })

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

export async function resolveCredentialForAuthority(
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
