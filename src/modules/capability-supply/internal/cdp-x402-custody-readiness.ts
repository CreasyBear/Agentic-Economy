import { getAuthHeaders } from '@coinbase/cdp-sdk/auth'

import { boundaryCauseKind, degradeBackend } from '@/lib/observability/degrade-backend'
import { cancelResponseBody, readBoundedRequestText } from '@/lib/server/bounded-request-body'
import type { StringEnvironment } from '@/lib/server/read-trimmed-env'
import { isBoundedJsonValue, type JsonValue } from '@/modules/common/bounded-json'
import { isRecord } from '@/modules/common/is-record'

import { readCdpX402CustodyAccount, type CdpX402CustodyReadinessResult } from './cdp-x402-payment-policy'
import { cdpX402CustodyConfigurationFromEnvironment } from './x402-custody-configuration'
import { x402PaymentProfileForEnvironment, type X402AeEnvironment } from './x402-payment-profile'

export type { CdpX402CustodyReadinessResult } from './cdp-x402-payment-policy'

const CDP_ORIGIN = 'https://api.cdp.coinbase.com'
const READ_TIMEOUT_MS = 10_000
const MAX_RESPONSE_BYTES = 64 * 1024

/**
 * Requires: explicit custody environment and supported payment network.
 * Ensures: ready only after all three live CDP reads pass the signing predicate.
 * Invariant: no signing or provisioning; credentials and cancellation are local
 * to this check, with one deadline covering guarded DNS, requests and response
 * bodies. The fixed provider origin and refused redirects retain credentials at
 * CDP; a private DNS answer cannot become a readiness read.
 * On violation: known drift/missing custody is refused; provider failures return
 * unavailable with a safe code, never a raw response or credential.
 *
 * SDK 1.55's high-level reads have global Axios state and no cancellation option.
 * Its public auth hook with the installed Undici transport provides bounded,
 * isolated GETs without changing the signing transport or adding a dependency.
 */
export async function readCdpX402CustodyReadiness(
  environment: StringEnvironment,
  paymentEnvironment: X402AeEnvironment,
): Promise<CdpX402CustodyReadinessResult> {
  if (x402PaymentProfileForEnvironment(paymentEnvironment) === undefined) {
    return { kind: 'refused', code: 'cdp_custody_environment_unsupported' }
  }
  const configuration = cdpX402CustodyConfigurationFromEnvironment(environment)
  if (configuration === undefined
    || !/^[A-Za-z0-9][A-Za-z0-9-]{0,34}[A-Za-z0-9]$/.test(configuration.accountName)) {
    return { kind: 'refused', code: 'cdp_custody_configuration_invalid' }
  }
  // The shared Convex chunk exposes this CommonJS package through its default
  // export. Keep Node-only imports lazy because web routes share this module.
  const [{ default: { Agent, fetch: guardedFetch } }, { createGuardedLookup, defaultDnsResolver }] = await Promise.all([
    import('undici'), import('@/modules/network-guard/public'),
  ])
  const completed = new AbortController()
  const signal = AbortSignal.any([AbortSignal.timeout(READ_TIMEOUT_MS), completed.signal])
  const dispatcher = new Agent({ connect: { lookup: createGuardedLookup(defaultDnsResolver) } })
  const read = async (path: string): Promise<JsonValue> => {
    signal.throwIfAborted()
    const headers = await getAuthHeaders({
      apiKeyId: configuration.apiKeyId,
      apiKeySecret: configuration.apiKeySecret,
      requestMethod: 'GET',
      requestHost: 'api.cdp.coinbase.com',
      requestPath: path,
      source: 'ae-custody-readiness',
    })
    signal.throwIfAborted()
    // Fetch and its dispatcher share the installed transport and remain scoped
    // to this check, including response-body cancellation.
    const requestOptions = { method: 'GET', headers, signal, redirect: 'error' as const, dispatcher }
    const response = await guardedFetch(`${CDP_ORIGIN}${path}`, requestOptions)
    if (!response.ok) {
      await cancelResponseBody(response)
      throw Object.assign(new Error('CDP custody read failed'), { kind: 'cdp_custody_read_failure',
        code: response.status === 404 ? 'cdp_custody_not_found' : 'cdp_custody_read_unavailable' })
    }
    const body = await readBoundedRequestText(response, MAX_RESPONSE_BYTES)
    signal.throwIfAborted()
    if (!body.ok) throw Object.assign(new Error('CDP custody response invalid'),
      { kind: 'cdp_custody_read_failure', code: 'cdp_custody_response_invalid' })
    const value: unknown = JSON.parse(body.text)
    if (!isBoundedJsonValue(value)) {
      throw Object.assign(new Error('CDP custody response invalid'),
        { kind: 'cdp_custody_read_failure', code: 'cdp_custody_response_invalid' })
    }
    return value
  }
  try {
    return await readCdpX402CustodyAccount({
      policies: { getPolicyById: ({ id }) => read(`/platform/v2/policy-engine/policies/${id}`) },
      evm: { getAccount: ({ name }) => read(`/platform/v2/evm/accounts/by-name/${encodeURIComponent(name)}`) },
    }, configuration, paymentEnvironment)
  } catch (cause) {
    if (isRecord(cause) && cause.kind === 'cdp_custody_read_failure') {
      if (cause.code === 'cdp_custody_not_found') return { kind: 'refused', code: cause.code }
      if (cause.code === 'cdp_custody_response_invalid') return { kind: 'unavailable', code: cause.code }
    }
    return degradeBackend(boundaryCauseKind(cause),
      { kind: 'unavailable', code: cause instanceof SyntaxError
        ? 'cdp_custody_response_invalid' : 'cdp_custody_read_unavailable' } as const,
      { site: 'readCdpX402CustodyReadiness', reason: signal.aborted ? 'timeout' : 'source_unavailable' })
  } finally {
    // Stop a parallel policy read immediately when its sibling fails.
    completed.abort()
    await dispatcher.destroy().catch(() => undefined)
  }
}
