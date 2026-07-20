import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import { validPublicHttpsEndpoint } from './internal/transport-adapters'

const MAX_RESPONSE_BYTES = 64 * 1024

type RouteTransportResponse = Readonly<{
  status: number
  ok: boolean
  headers: Readonly<{ get(name: string): string | null }>
  text(): Promise<string>
}>

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

export type RouteTransportInvocation = Readonly<{
  binding: Readonly<{
    adapterId: string
    endpointUrl: string
    credentialRef: string
    configJson: string
    configDigest: string
  }>
  authority: Readonly<{
    attemptRef: string
    effectGeneration?: number
    operationKeyDigest: string
    mandateDigest: string
    grantDigest: string
    capabilityContractDigest: string
    maximumSpend: Readonly<{ currency: string; amountMinor: number }>
    expiresAt: number
    callIdentity: Readonly<{ keyId: string; signature: string }>
  }>
  inputJson: string
}>

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
  amount: string
  providerEndpoint: string
  custodyRef: string
  authorizationDigest: string
}>

export type RouteTransportRuntime = Readonly<{
  send: RouteTransportFetch
  resolveCredential: (reference: string) => string | undefined
  x402PaymentSigningAvailable?: (input: Readonly<{
    credentialRef: string
    network: string
    asset: string
    payTo: string
    maximumSpend: Readonly<{ currency: string; amountMinor: number }>
  }>) => boolean
  createX402PaymentSignature: (request: X402PaymentSignatureRequest) => Promise<string | undefined>
  prepareX402PaymentAuthorization?: (
    request: X402PaymentSignatureRequest & X402PaymentAuthorizationIdentity,
  ) => Promise<X402PreparedAuthorization | undefined>
  readX402PaymentAuthorization?: (
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

export type RouteTransportCancellationInvocation = Readonly<{
  binding: RouteTransportInvocation['binding']
  authority: RouteTransportInvocation['authority']
  cancellationRequestRef: string
}>

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
  const parsed = parseJson(value)
  if (!isJsonObject(parsed)
    || !['http', 'mcp', 'x402', 'unknown'].includes(String(parsed.transport))
    || !['succeeded', 'refused', 'partial', 'unknown'].includes(String(parsed.disposition))
    || typeof parsed.releaseStarted !== 'boolean'
    || !boundedString(parsed.requestDigest, 200)) return undefined
  const optionalStrings = [
    'responseDigest', 'outputJson', 'providerReceipt', 'paymentProof', 'paymentChallengeDigest',
    'continuationToken', 'failureCode',
  ] as const
  if (optionalStrings.some((key) => parsed[key] !== undefined && !boundedString(parsed[key], MAX_RESPONSE_BYTES))) {
    return undefined
  }
  const optionalStatuses = {
    queryReleaseStatus: ['not_released', 'released', 'unknown'],
    paymentAuthorizationStatus: ['not_created', 'created', 'unknown'],
    paymentSubmissionStatus: ['not_submitted', 'possibly_submitted', 'observed', 'unknown'],
    settlementStatus: ['not_evidenced', 'provider_asserted', 'unknown'],
    quoteDeliveryStatus: ['not_delivered', 'delivered', 'unknown'],
  } as const
  if (Object.entries(optionalStatuses).some(([key, allowed]) =>
    parsed[key] !== undefined && !(allowed as readonly unknown[]).includes(parsed[key]))) return undefined
  if (Object.keys(parsed).some((key) => ![
    'transport', 'disposition', 'releaseStarted', 'requestDigest', ...optionalStrings,
    ...Object.keys(optionalStatuses),
  ].includes(key))) return undefined
  return parsed as RouteTransportObservation
}

type AuxiliaryExchange = Readonly<{ path: string; requestTimeoutMs: number }>
type HttpConfiguration = Readonly<{
  method: 'GET' | 'POST'
  query?: readonly QueryParameterMapping[]
  requestTimeoutMs: number
  reconciliation?: AuxiliaryExchange
  cancellation?: AuxiliaryExchange
}>
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
type QueryParameterMapping = Readonly<{ inputPointer: string; parameter: string }>

type RegisteredConfiguration = HttpConfiguration | McpConfiguration | X402Configuration

export type PreparedRouteTransportInvocation = Readonly<{
  invocation: RouteTransportInvocation
  endpoint: URL
  credential: string
  configuration: RegisteredConfiguration
  requestDigest: string
  target?: URL
}>

export type RouteTransportPreparation =
  | Readonly<{ kind: 'prepared'; prepared: PreparedRouteTransportInvocation }>
  | Readonly<{ kind: 'refused'; observation: RouteTransportObservation }>

export async function invokeRegisteredRouteTransport(
  invocation: RouteTransportInvocation,
  runtime: RouteTransportRuntime,
): Promise<RouteTransportObservation> {
  const preparation = prepareRegisteredRouteTransportInvocation(
    invocation,
    runtime.resolveCredential,
    runtime.x402PaymentSigningAvailable,
  )
  return preparation.kind === 'refused'
    ? preparation.observation
    : await invokePreparedRouteTransport(preparation.prepared, runtime)
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
  const credential = runtime.resolveCredential(invocation.binding.credentialRef)
  if (credential === undefined || credential.length === 0) {
    return { disposition: 'unknown', requestDigest, failureCode: 'credential_unavailable' }
  }
  const cancellationEndpoint = new URL(configuration.cancellation.path, endpoint.origin)
  try {
    const response = await runtime.send(cancellationEndpoint, {
      method: 'POST', redirect: 'manual',
      signal: AbortSignal.timeout(configuration.cancellation.requestTimeoutMs),
      body: JSON.stringify(request),
      headers: callHeaders(
        { ...invocation, inputJson: JSON.stringify(request) },
        credential,
        invocation.cancellationRequestRef,
      ),
    })
    if (response.status < 200 || response.status >= 300) {
      return { disposition: 'unknown', requestDigest, failureCode: `provider_http_${response.status}` }
    }
    const text = await readBoundedText(response)
    const parsed = text === undefined ? undefined : parseJson(text)
    const responseDigest = text === undefined ? undefined : canonicalDigest(text)
    if (!isJsonObject(parsed)
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
    const common = {
      requestDigest,
      responseDigest: responseDigest!,
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
  resolveCredential: RouteTransportRuntime['resolveCredential'],
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
  const credential = resolveCredential(invocation.binding.credentialRef)
  if (credential === undefined || credential.length === 0) {
    return {
      kind: 'refused',
      observation: refused(transportKind(invocation.binding.adapterId), requestDigest, false, 'credential_unavailable'),
    }
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
    && !isJsonObject(parseJson(invocation.inputJson))) {
    return { kind: 'refused', observation: refused('mcp', requestDigest, false, 'input_invalid') }
  }
  if (invocation.binding.adapterId === 'x402-fetch:v2') {
    const x402 = typedConfiguration as X402Configuration
    if (invocation.authority.maximumSpend.currency !== x402.currency
      || convertAmount(
        invocation.authority.maximumSpend.amountMinor,
        x402.routeAmountExponent,
        x402.assetAmountExponent,
      ) === undefined) {
      return {
        kind: 'refused',
        observation: refused('x402', requestDigest, false, 'payment_authority_invalid'),
      }
    }
    if (x402PaymentSigningAvailable?.({
      credentialRef: invocation.binding.credentialRef,
      network: x402.network,
      asset: x402.asset,
      payTo: x402.payTo,
      maximumSpend: invocation.authority.maximumSpend,
    }) === false) {
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
      credential,
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
  const { invocation, endpoint, credential, configuration, requestDigest } = prepared
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
  credential: string,
  requestDigest: string,
  send: RouteTransportFetch,
  preparedTarget: URL | undefined,
): Promise<RouteTransportObservation> {
  try {
    const target = preparedTarget
    if (target === undefined) return refused('http', requestDigest, false, 'input_invalid')
    const response = await send(target, {
      method: configuration.method,
      redirect: 'manual',
      signal: AbortSignal.timeout(configuration.requestTimeoutMs),
      ...(configuration.method === 'POST' ? { body: invocation.inputJson } : {}),
      headers: callHeaders(invocation, credential),
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
  credential: string,
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
      || !isJsonObject(initializeBody.result)
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
    const input = parseJson(invocation.inputJson)
    if (!isJsonObject(input)) return refused('mcp', requestDigest, false, 'input_invalid')
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
    if (!isJsonObject(result) || result.isError === true) {
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
  runtime: RouteTransportRuntime,
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
  if (challenge.resource.url !== target.href
    || Date.now() + (requirement.maxTimeoutSeconds * 1_000) > invocation.authority.expiresAt) {
    return { ...refused('x402', requestDigest, true, 'payment_requirement_outside_authority'), paymentChallengeDigest }
  }
  if (invocation.authority.maximumSpend.currency !== configuration.currency) {
    return { ...refused('x402', requestDigest, true, 'payment_currency_mismatch'), paymentChallengeDigest }
  }
  const ceiling = convertAmount(
    invocation.authority.maximumSpend.amountMinor,
    configuration.routeAmountExponent,
    configuration.assetAmountExponent,
  )
  if (ceiling === undefined || BigInt(requirement.amount) > ceiling) {
    return { ...refused('x402', requestDigest, true, 'payment_exceeds_step_ceiling'), paymentChallengeDigest }
  }
  const authorizationIdentity = {
    paymentIdentifier: invocation.authority.operationKeyDigest,
    challengeDigest: paymentChallengeDigest,
    attemptRef: invocation.authority.attemptRef,
    effectGeneration: invocation.authority.effectGeneration ?? 0,
  }
  let legacyPaymentSignature: string | undefined
  let preparedAuthorization: X402PreparedAuthorization | undefined
  if (runtime.prepareX402PaymentAuthorization === undefined) {
    legacyPaymentSignature = await runtime.createX402PaymentSignature({
        challenge, credential, paymentIdentifier: invocation.authority.operationKeyDigest,
        selectedRequirement: requirement,
      })
    preparedAuthorization = legacyPaymentSignature === undefined || legacyPaymentSignature.length === 0
      ? undefined
      : {
          custodyRef: `legacy:${canonicalDigest(legacyPaymentSignature)}`,
          authorizationDigest: canonicalDigest(legacyPaymentSignature),
        }
  } else {
    preparedAuthorization = await runtime.prepareX402PaymentAuthorization({
        challenge, credential,
        selectedRequirement: requirement,
        ...authorizationIdentity,
      })
  }
  if (preparedAuthorization === undefined) {
    return { ...refused('x402', requestDigest, true, 'payment_signature_unavailable'), paymentChallengeDigest }
  }
  const paymentSignature = legacyPaymentSignature
    ?? await runtime.readX402PaymentAuthorization?.(preparedAuthorization)
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
    amount: requirement.amount,
    providerEndpoint: target.href,
    custodyRef: preparedAuthorization.custodyRef,
    authorizationDigest: preparedAuthorization.authorizationDigest,
  }
  try {
    await runtime.markX402PaymentPossiblySubmitted?.(paymentEvent)
    const paid = await runtime.send(target, {
      method: configuration.method, redirect: 'manual', signal: AbortSignal.timeout(configuration.requestTimeoutMs),
      headers: { ...headers, 'Payment-Signature': paymentSignature },
      ...(configuration.method === 'POST' ? { body: invocation.inputJson } : {}),
    })
    const normalized = await normalizeJsonResponse('x402', paid, requestDigest, true)
    const paymentProof = optionalHeader(paid, 'payment-response', 'paymentProof')
    const providerReceipt = optionalHeader(paid, 'provider-receipt', 'providerReceipt')
    await runtime.observeX402PaymentAttempt?.({
      ...paymentEvent,
      state: 'observed',
      evidenceRefs: [
        ...(paymentProof.paymentProof === undefined ? [] : [canonicalDigest(paymentProof.paymentProof)]),
        ...(providerReceipt.providerReceipt === undefined ? [] : [canonicalDigest(providerReceipt.providerReceipt)]),
      ],
    })
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
    await runtime.observeX402PaymentAttempt?.({
      ...paymentEvent, state: 'reconciliation_required', evidenceRefs: [],
    })
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
  const output = parseJson(text)
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
  invocation: RouteTransportInvocation,
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
  const parsed = parseJson(value)
  return isJsonObject(parsed) ? parsed : undefined
}

function isHttpConfiguration(value: Readonly<Record<string, unknown>>): value is HttpConfiguration {
  if (!optionalExactKeys(value, ['method', 'requestTimeoutMs'], ['query', 'reconciliation', 'cancellation'])
    || !['GET', 'POST'].includes(String(value.method)) || !validTimeout(value.requestTimeoutMs)
    || !validMethodQuery(value.method, value.query)) return false
  return ['reconciliation', 'cancellation'].every((key) => {
    const exchange = value[key]
    return exchange === undefined || (isJsonObject(exchange)
      && exactKeys(exchange, ['path', 'requestTimeoutMs'])
      && typeof exchange.path === 'string' && validAuxiliaryPath(exchange.path)
      && validTimeout(exchange.requestTimeoutMs))
  })
}

function isMcpConfiguration(value: Readonly<Record<string, unknown>>): value is McpConfiguration {
  return exactKeys(value, ['protocolVersion', 'requestTimeoutMs', 'toolName'])
    && boundedString(value.protocolVersion, 64) && boundedString(value.toolName, 200)
    && validTimeout(value.requestTimeoutMs)
}

function isX402Configuration(value: Readonly<Record<string, unknown>>): value is X402Configuration {
  return optionalExactKeys(value, [
    'asset', 'assetAmountExponent', 'currency', 'method', 'network', 'payTo',
    'requestTimeoutMs', 'routeAmountExponent', 'scheme',
  ], ['query'])
    && ['GET', 'POST'].includes(String(value.method)) && value.scheme === 'exact'
    && validMethodQuery(value.method, value.query)
    && boundedString(value.network, 100) && boundedString(value.currency, 20)
    && boundedString(value.asset, 200) && boundedString(value.payTo, 200) && validTimeout(value.requestTimeoutMs)
    && validExponent(value.routeAmountExponent) && validExponent(value.assetAmountExponent)
}

function validMethodQuery(method: unknown, query: unknown): boolean {
  if (method === 'POST') return query === undefined
  if (method !== 'GET' || !Array.isArray(query) || query.length < 1 || query.length > 64) return false
  const pointers = new Set<string>()
  const parameters = new Set<string>()
  return query.every((item) => {
    if (!isJsonObject(item) || !exactKeys(item, ['inputPointer', 'parameter'])
      || typeof item.inputPointer !== 'string' || typeof item.parameter !== 'string'
      || !/^\/(?:[^/~]|~[01])+(?:\/(?:[^/~]|~[01])+)*$/.test(item.inputPointer)
      || !/^[A-Za-z][A-Za-z0-9_.-]{0,99}$/.test(item.parameter)
      || pointers.has(item.inputPointer) || parameters.has(item.parameter)) return false
    pointers.add(item.inputPointer)
    parameters.add(item.parameter)
    return true
  })
}

function requestTarget(
  endpoint: URL,
  method: 'GET' | 'POST',
  query: readonly QueryParameterMapping[] | undefined,
  inputJson: string,
): URL | undefined {
  if (method === 'POST') return new URL(endpoint)
  const input = parseJson(inputJson)
  if (!isJsonObject(input) || query === undefined) return undefined
  const target = new URL(endpoint)
  for (const mapping of query) {
    const value = readJsonPointer(input, mapping.inputPointer)
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return undefined
    target.searchParams.append(mapping.parameter, String(value))
  }
  return target
}

function readJsonPointer(input: unknown, pointer: string): unknown {
  let current = input
  for (const token of pointer.slice(1).split('/').map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))) {
    if (!isJsonObject(current) || !(token in current)) return undefined
    current = current[token]
  }
  return current
}

function decodeX402Challenge(header: string | null): X402Challenge | undefined {
  if (header === null || header.length > MAX_RESPONSE_BYTES * 2) return undefined
  try {
    const parsed: unknown = JSON.parse(Buffer.from(header, 'base64').toString('utf8'))
    if (!isJsonObject(parsed) || parsed.x402Version !== 2 || !isJsonObject(parsed.resource)
      || !boundedString(parsed.resource.url, 2_000) || !Array.isArray(parsed.accepts)
      || parsed.accepts.length < 1 || parsed.accepts.length > 16) return undefined
    for (const candidate of parsed.accepts) {
      if (!isJsonObject(candidate) || !boundedString(candidate.scheme, 100)
        || !boundedString(candidate.network, 100) || !/^[A-Za-z0-9-]+:[A-Za-z0-9._-]+$/.test(candidate.network)
        || !/^\d{1,78}$/.test(String(candidate.amount))
        || !boundedString(candidate.asset, 200) || !boundedString(candidate.payTo, 200)
        || !Number.isSafeInteger(candidate.maxTimeoutSeconds) || !isJsonObject(candidate.extra)) return undefined
    }
    return parsed as X402Challenge
  } catch {
    return undefined
  }
}

function convertAmount(amount: number, fromExponent: number, toExponent: number): bigint | undefined {
  if (!Number.isSafeInteger(amount) || amount < 0 || toExponent < fromExponent) return undefined
  return BigInt(amount) * (10n ** BigInt(toExponent - fromExponent))
}

async function readJsonRpc(
  response: RouteTransportResponse,
  expectedId: string,
): Promise<Readonly<Record<string, unknown>> | undefined> {
  const text = await readBoundedText(response)
  if (text === undefined) return undefined
  if ((response.headers.get('content-type') ?? '').toLowerCase().includes('text/event-stream')) {
    for (const line of text.split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue
      const candidate = parseJson(line.slice(5).trim())
      if (isJsonObject(candidate) && candidate.id === expectedId) return candidate
    }
    return undefined
  }
  const parsed = parseJson(text)
  return isJsonObject(parsed) ? parsed : undefined
}

async function readBoundedText(response: RouteTransportResponse): Promise<string | undefined> {
  const declared = response.headers.get('content-length')
  if (declared !== null && Number(declared) > MAX_RESPONSE_BYTES) return undefined
  const text = await response.text()
  return new TextEncoder().encode(text).byteLength <= MAX_RESPONSE_BYTES ? text : undefined
}

function mcpOutput(result: Readonly<Record<string, unknown>>): unknown {
  if (result.structuredContent !== undefined) return result.structuredContent
  if (!Array.isArray(result.content)) return undefined
  const text = result.content.find((item) => isJsonObject(item) && item.type === 'text' && typeof item.text === 'string')
  return isJsonObject(text) && typeof text.text === 'string' ? parseJson(text.text) : undefined
}

function isJsonRpcResult(value: unknown, expectedId: string): value is Readonly<{
  jsonrpc: '2.0'; id: string; result: unknown
}> {
  return isJsonObject(value) && value.jsonrpc === '2.0' && value.id === expectedId && 'result' in value
}

function parseJson(value: string): unknown {
  try { return JSON.parse(value) as unknown } catch { return undefined }
}

function isJsonObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean {
  return Object.keys(value).sort().join(',') === [...keys].sort().join(',')
}

function optionalExactKeys(
  value: Readonly<Record<string, unknown>>,
  required: readonly string[],
  optional: readonly string[],
): boolean {
  const keys = Object.keys(value)
  return required.every((key) => keys.includes(key))
    && keys.every((key) => required.includes(key) || optional.includes(key))
}

function validAuxiliaryPath(value: string): boolean {
  return /^\/(?!\/)[A-Za-z0-9._~!$&'()*+,;=:@%/-]{1,1000}$/.test(value)
}

function boundedString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max
}

function validTimeout(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === 'number' && value >= 100 && value <= 120_000
}

function validExponent(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === 'number' && value >= 0 && value <= 18
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
