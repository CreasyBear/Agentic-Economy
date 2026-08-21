import { canonicalDigest } from '@/modules/common/canonical-digest'
import { parseBoundedJson } from '@/modules/common/bounded-json'
import { isRecord } from '@/modules/common/is-record'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { cancelResponseBody } from '@/lib/server/bounded-request-body'
import {
  injectHttpJsonCredential,
  validPublicHttpsEndpoint,
} from './transport-adapters'
import {
  callHeaders,
  containsSensitiveValue,
  errorName,
  isHttpConfiguration,
  outboundSensitiveValues,
  parseConfiguration,
  readBoundedText,
} from './route-transport-http-json'
import { boundedString } from './route-transport-observation'
import {
  resolveCredentialForAuthority,
  type KeylessRouteTransportInvocation,
  type ProviderRouteTransportInvocation,
  type RouteTransportInvocation,
  type RouteTransportRuntime,
} from './route-transport-invoke'

type RouteTransportCancellationInvocationFor<
  Invocation extends RouteTransportInvocation,
> = Readonly<{
  binding: Invocation['binding']
  authority: Invocation['authority']
  cancellationRequestRef: string
}>

export type { RouteTransportCancellationInvocationFor }

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
