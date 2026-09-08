import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isBoundedJsonValue, type JsonValue } from '@/modules/common/bounded-json'
import { isRecord } from '@/modules/common/is-record'

import {
  decodeX402PaymentRequiredHeader,
  validateX402PaymentRequired,
} from './x402-payment-signer'
import {
  isX402PaymentRequirementForProfile,
  normalizeX402PaymentRequirement,
  x402PaymentProfileForEnvironment,
  type X402AeEnvironment,
  type X402PaymentProfile,
  type X402PaymentRequirementLike,
} from './x402-payment-profile'
import {
  admitOfficialBazaarFromPaymentRequired,
} from './facilitator-discovery-client'
import { x402ResourceUrlBindsTarget } from './route-transport-x402-payment'
import type { BazaarAdmission } from './publication-importer-x402-bazaar'

const MAX_CHALLENGE_BODY_BYTES = 128 * 1024
const INSPECTION_TIMEOUT_MS = 10_000
const PAYMENT_HEADER_NAMES = [
  'payment',
  'payment-signature',
  'x-payment',
  'x-payment-signature',
] as const

export type X402SellerEndpointMethod = 'GET' | 'POST'

export type X402SellerPaymentAlternative = Readonly<{
  alternativeId: string
  scheme: string
  network: string
  amount: string
  asset: string
  payTo: string
  maxTimeoutSeconds: number
  extra: Readonly<Record<string, JsonValue>>
  supportedByAe: boolean
}>

export type X402SellerPaymentSelection =
  | Readonly<{
      kind: 'selected'
      alternativeId: string
    }>
  | Readonly<{
      kind: 'unsupported'
      reason:
        | 'no_payment_alternatives'
        | 'no_base_mainnet_usdc_exact_eip3009_lane'
        | 'no_base_sepolia_usdc_exact_eip3009_lane'
      action: string
    }>
  | Readonly<{
      kind: 'ambiguous'
      alternativeIds: readonly string[]
      action: string
    }>

/**
 * A successful inspection is deliberately lower-authority evidence. It is not
 * a canonical Operation, proof of seller control, or proof that a paid call
 * returns usable output.
 */
export type X402SellerEndpointObservation = Readonly<{
  kind: 'observed'
  authority: 'observed_external'
  canonical: false
  usageVerified: false
  endpoint: Readonly<{
    endpointId: string
    url: string
  }>
  backend: Readonly<{
    backendId: string
    method: X402SellerEndpointMethod
    resource: string
  }>
  payment: Readonly<{
    profile: X402PaymentProfile['profile']
    accepts: readonly X402SellerPaymentAlternative[]
    selection: X402SellerPaymentSelection
  }>
  discovery: BazaarAdmission
  probe: Readonly<{
    status: 'payment_required'
    httpStatus: 402
    observedAt: number
  }>
  digest: string
  paymentRequiredJson: string
}>

export type X402SellerEndpointInspectionRefusal = Readonly<{
  kind: 'refused'
  reason:
    | 'target_invalid'
    | 'target_not_public'
    | 'request_invalid'
    | 'request_failed'
    | 'redirect_refused'
    | 'payment_not_required'
    | 'challenge_missing'
    | 'challenge_too_large'
    | 'challenge_malformed'
    | 'challenge_conflict'
    | 'challenge_resource_mismatch'
  action: string
  probe: Readonly<{
    observedAt: number
    httpStatus?: number
  }>
}>

export type X402SellerEndpointInspection =
  | X402SellerEndpointObservation
  | X402SellerEndpointInspectionRefusal

export type X402SellerEndpointInspectorDependencies = Readonly<{
  now?: () => number
  validatePublicTarget?: (target: URL) => Promise<boolean>
  beforeSend?: () => Promise<boolean>
  send?: (request: Request) => Promise<Response>
}>

export async function inspectX402SellerEndpoint(
  input: Readonly<{
    endpointUrl: string
    method: X402SellerEndpointMethod
    postBody?: JsonValue
    queryMapped?: boolean
    aeEnvironment?: X402AeEnvironment
  }>,
  dependencies: X402SellerEndpointInspectorDependencies = {},
): Promise<X402SellerEndpointInspection> {
  const now = dependencies.now ?? Date.now
  const observedAt = now()
  const profile = x402PaymentProfileForEnvironment(
    input.aeEnvironment ?? 'production',
  )
  if (profile === undefined) {
    return refused('request_invalid', observedAt, undefined,
      'Choose either the sandbox or production payment environment.')
  }
  const endpoint = publicHttpsUrl(input.endpointUrl)
  if (endpoint === undefined) {
    return refused('target_invalid', observedAt, undefined,
      'Provide an absolute public HTTPS endpoint without credentials or a fragment.')
  }

  let targetIsPublic = false
  try {
    if (dependencies.validatePublicTarget !== undefined) {
      targetIsPublic = await dependencies.validatePublicTarget(endpoint)
    } else {
      const { defaultDnsResolver, isPublicHttpTarget } = await import(
        '@/modules/network-guard/public'
      )
      targetIsPublic = await isPublicHttpTarget(endpoint, defaultDnsResolver)
    }
  } catch {
    targetIsPublic = false
  }
  if (!targetIsPublic) {
    return refused('target_not_public', observedAt, undefined,
      'Use a publicly resolvable endpoint; private, loopback, and link-local targets are not inspected.')
  }

  if (
    (input.method !== 'GET' && input.method !== 'POST')
    || (input.postBody !== undefined && !isBoundedJsonValue(input.postBody))
  ) {
    return refused('request_invalid', observedAt, undefined,
      'Choose GET or POST and provide only a bounded JSON example body.')
  }
  let request: Request
  try {
    request = inspectionRequest(endpoint, input.method, input.postBody)
  } catch {
    return refused('request_invalid', observedAt, undefined,
      'Choose GET or POST and provide only a bounded JSON example body.')
  }
  let response: Response
  try {
    if (dependencies.beforeSend !== undefined && !await dependencies.beforeSend()) {
      return refused('request_failed', observedAt, undefined,
        'The request authority or Tool changed before inspection. Request a fresh Quote.')
    }
    if (dependencies.send !== undefined) {
      response = await dependencies.send(request)
    } else {
      const { sendGuardedHttpRequest } = await import('@/modules/network-guard/server')
      response = await sendGuardedHttpRequest(request, MAX_CHALLENGE_BODY_BYTES)
    }
  } catch {
    return refused('request_failed', observedAt, undefined,
      'The endpoint could not be reached without payment. Check its availability and TLS configuration.')
  }

  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel().catch(() => undefined)
    return refused('redirect_refused', observedAt, response.status,
      'Submit the final HTTPS endpoint directly; onboarding inspection never follows redirects.')
  }
  if (response.status !== 402) {
    await response.body?.cancel().catch(() => undefined)
    return refused('payment_not_required', observedAt, response.status,
      'The unpaid endpoint must answer with HTTP 402 and an x402 v2 PaymentRequired challenge.')
  }

  const challenge = await readChallenge(response)
  if (challenge.kind === 'refused') {
    return refused(challenge.reason, observedAt, response.status, challenge.action)
  }

  const resource = publicHttpsUrl(challenge.value.resource.url)
  if (resource === undefined || !x402ResourceUrlBindsTarget(resource.href, endpoint, input.method, input.queryMapped === true)) {
    return refused('challenge_resource_mismatch', observedAt, response.status,
      'Make the PaymentRequired resource URL exactly match the endpoint being onboarded.')
  }

  const accepts = normalizedAlternatives(challenge.value.accepts, profile)
  if (accepts === undefined) {
    return refused('challenge_malformed', observedAt, response.status,
      'Return bounded x402 v2 payment alternatives with complete scheme, network, amount, asset, payTo, timeout, and extra fields.')
  }
  const selection = paymentSelection(accepts, profile)
  const discovery = admitOfficialBazaarFromPaymentRequired(challenge.value)
  const canonicalDiscovery = discovery.kind === 'admitted'
    ? {
        kind: discovery.kind,
        method: discovery.method,
        inputSchema: discovery.inputSchema,
        ...(discovery.inputExample === undefined ? {} : { inputExample: discovery.inputExample }),
        outputSchema: discovery.outputSchema,
        ...(discovery.query === undefined ? {} : { query: discovery.query }),
      }
    : discovery
  const endpointId = canonicalDigest({
    kind: 'x402-seller-endpoint',
    url: endpoint.href,
  })
  const backendId = canonicalDigest({
    kind: 'x402-seller-backend',
    endpointId,
    method: input.method,
    resource: resource.href,
  })
  const stableObservation = {
    version: 1,
    authority: 'observed_external',
    endpoint: { endpointId, url: endpoint.href },
    backend: { backendId, method: input.method, resource: resource.href },
    payment: { profile: profile.profile, accepts, selection },
    discovery: canonicalDiscovery,
    probe: { status: 'payment_required', httpStatus: 402 },
  } as const

  return {
    kind: 'observed',
    authority: 'observed_external',
    canonical: false,
    usageVerified: false,
    endpoint: stableObservation.endpoint,
    backend: stableObservation.backend,
    payment: stableObservation.payment,
    discovery: stableObservation.discovery,
    probe: {
      ...stableObservation.probe,
      observedAt,
    },
    digest: canonicalDigest(stableObservation),
    paymentRequiredJson: stableStringify(challenge.value as StableHashValue),
  }
}

function publicHttpsUrl(value: string): URL | undefined {
  try {
    const url = new URL(value)
    if (
      url.protocol !== 'https:'
      || url.username.length > 0
      || url.password.length > 0
      || url.hash.length > 0
    ) return undefined
    return url
  } catch {
    return undefined
  }
}

function inspectionRequest(
  endpoint: URL,
  method: X402SellerEndpointMethod,
  postBody: JsonValue | undefined,
): Request {
  const headers = new Headers({ accept: 'application/json' })
  let body: string | undefined
  if (method === 'POST') {
    headers.set('content-type', 'application/json')
    body = JSON.stringify(postBody === undefined ? {} : postBody)
  }
  for (const name of PAYMENT_HEADER_NAMES) headers.delete(name)
  return new Request(endpoint, {
    method,
    headers,
    ...(body === undefined ? {} : { body }),
    redirect: 'manual',
    signal: AbortSignal.timeout(INSPECTION_TIMEOUT_MS),
  })
}

type ChallengeReadResult =
  | Readonly<{ kind: 'challenge'; value: ValidV2PaymentRequired }>
  | Readonly<{
      kind: 'refused'
      reason:
        | 'challenge_missing'
        | 'challenge_too_large'
        | 'challenge_malformed'
        | 'challenge_conflict'
      action: string
    }>

type ValidV2PaymentRequired = Readonly<{
  x402Version: 2
  resource: Readonly<{ url: string }>
  accepts: readonly unknown[]
}>

async function readChallenge(response: Response): Promise<ChallengeReadResult> {
  const header = response.headers.get('payment-required')
  let fromHeader: ValidV2PaymentRequired | undefined
  if (header !== null && header.trim().length > 0) {
    try {
      fromHeader = validV2Challenge(
        validateX402PaymentRequired(decodeX402PaymentRequiredHeader(header)),
      )
    } catch {
      return {
        kind: 'refused',
        reason: 'challenge_malformed',
        action: 'Return a valid official x402 v2 PAYMENT-REQUIRED header.',
      }
    }
    if (fromHeader === undefined) {
      return {
        kind: 'refused',
        reason: 'challenge_malformed',
        action: 'Upgrade the endpoint to an official x402 v2 PaymentRequired challenge.',
      }
    }
  }

  const bounded = await readBoundedRequestText(response, MAX_CHALLENGE_BODY_BYTES)
  if (!bounded.ok) {
    return {
      kind: 'refused',
      reason: 'challenge_too_large',
      action: 'Keep the unpaid PaymentRequired response body below 128 KiB.',
    }
  }
  const fromBody = bounded.text.trim().length === 0
    ? undefined
    : paymentRequiredFromBody(bounded.text)

  if (fromHeader !== undefined && fromBody?.kind === 'malformed') {
    return {
      kind: 'refused',
      reason: 'challenge_malformed',
      action: 'Remove the malformed response body or make it the same valid x402 v2 challenge as the header.',
    }
  }
  if (fromBody?.kind === 'challenge' && fromHeader !== undefined) {
    if (canonicalDigest(fromBody.value) !== canonicalDigest(fromHeader)) {
      return {
        kind: 'refused',
        reason: 'challenge_conflict',
        action: 'Return one PaymentRequired challenge; header and body must not disagree.',
      }
    }
    return { kind: 'challenge', value: fromHeader }
  }
  if (fromHeader !== undefined) return { kind: 'challenge', value: fromHeader }
  // The pinned x402 SDK requires PAYMENT-REQUIRED for v2; its body fallback
  // is v1-only. Do not admit a Quote that the execution transport cannot use.
  return {
    kind: 'refused',
    reason: fromBody?.kind === 'malformed' ? 'challenge_malformed' : 'challenge_missing',
    action: fromBody?.kind === 'malformed'
      ? 'Return a valid official x402 v2 PAYMENT-REQUIRED header and remove the malformed challenge body.'
      : 'Return PaymentRequired in the official x402 v2 PAYMENT-REQUIRED header.',
  }
}

function paymentRequiredFromBody(
  text: string,
):
  | Readonly<{ kind: 'challenge'; value: ValidV2PaymentRequired }>
  | Readonly<{ kind: 'malformed' }>
  | Readonly<{ kind: 'absent' }> {
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    return { kind: 'absent' }
  }
  if (!isRecord(parsed)) return { kind: 'absent' }
  const wrapped = 'paymentRequired' in parsed
  const looksDirect = 'x402Version' in parsed || 'resource' in parsed || 'accepts' in parsed
  if (!wrapped && !looksDirect) return { kind: 'absent' }
  const candidate = wrapped ? parsed.paymentRequired : parsed
  try {
    const validated = validV2Challenge(validateX402PaymentRequired(candidate))
    return validated === undefined
      ? { kind: 'malformed' }
      : { kind: 'challenge', value: validated }
  } catch {
    return { kind: 'malformed' }
  }
}

function validV2Challenge(value: unknown): ValidV2PaymentRequired | undefined {
  if (
    !isRecord(value)
    || value.x402Version !== 2
    || !isRecord(value.resource)
    || typeof value.resource.url !== 'string'
    || !Array.isArray(value.accepts)
  ) return undefined
  return value as ValidV2PaymentRequired
}

function normalizedAlternatives(
  values: readonly unknown[],
  profile: X402PaymentProfile,
): readonly X402SellerPaymentAlternative[] | undefined {
  const alternatives = new Map<string, X402SellerPaymentAlternative>()
  for (const value of values) {
    if (
      !isRecord(value)
      || typeof value.scheme !== 'string'
      || typeof value.network !== 'string'
      || typeof value.amount !== 'string'
      || typeof value.asset !== 'string'
      || typeof value.payTo !== 'string'
      || typeof value.maxTimeoutSeconds !== 'number'
      || !Number.isFinite(value.maxTimeoutSeconds)
      || !isRecord(value.extra)
      || !isBoundedJsonValue(value.extra)
    ) return undefined
    const normalized = normalizeX402PaymentRequirement({
      scheme: value.scheme.trim().toLowerCase(),
      network: value.network.trim().toLowerCase(),
      amount: value.amount.trim(),
      asset: normalizeAddressLike(value.asset),
      payTo: normalizeAddressLike(value.payTo),
      maxTimeoutSeconds: value.maxTimeoutSeconds,
      extra: value.extra,
    })
    const alternativeId = canonicalDigest({
      kind: 'x402-payment-alternative',
      ...normalized,
    })
    alternatives.set(alternativeId, {
      alternativeId,
      ...normalized,
      supportedByAe: isSupportedAlternative(normalized, profile),
    })
  }
  return [...alternatives.values()].sort((left, right) =>
    left.alternativeId.localeCompare(right.alternativeId))
}

function normalizeAddressLike(value: string): string {
  const trimmed = value.trim()
  return /^0x[0-9a-f]+$/iu.test(trimmed) ? trimmed.toLowerCase() : trimmed
}

function isSupportedAlternative(
  value: X402PaymentRequirementLike,
  profile: X402PaymentProfile,
): boolean {
  return isX402PaymentRequirementForProfile(value, profile)
}

function paymentSelection(
  accepts: readonly X402SellerPaymentAlternative[],
  profile: X402PaymentProfile,
): X402SellerPaymentSelection {
  const supported = accepts.filter((alternative) => alternative.supportedByAe)
  const first = supported[0]
  if (supported.length === 1 && first !== undefined) {
    return { kind: 'selected', alternativeId: first.alternativeId }
  }
  if (supported.length > 1) {
    return {
      kind: 'ambiguous',
      alternativeIds: supported.map(({ alternativeId }) => alternativeId),
      action: profile.aeEnvironment === 'sandbox'
        ? 'Choose and pin exactly one Base-Sepolia USDC exact EIP-3009 payment lane before canary verification.'
        : 'Choose and pin exactly one Base-mainnet USDC exact EIP-3009 payment lane before canary verification.',
    }
  }
  return accepts.length === 0
    ? {
        kind: 'unsupported',
        reason: 'no_payment_alternatives',
        action: profile.aeEnvironment === 'sandbox'
          ? 'Advertise one Base-Sepolia USDC exact EIP-3009 payment alternative.'
          : 'Advertise one Base-mainnet USDC exact EIP-3009 payment alternative.',
      }
    : {
        kind: 'unsupported',
        reason: profile.aeEnvironment === 'sandbox'
          ? 'no_base_sepolia_usdc_exact_eip3009_lane'
          : 'no_base_mainnet_usdc_exact_eip3009_lane',
        action: profile.aeEnvironment === 'sandbox'
          ? 'Add a Base-Sepolia USDC exact EIP-3009 lane, then inspect again.'
          : 'Add a Base-mainnet USDC exact EIP-3009 lane, then inspect again.',
      }
}

function refused(
  reason: X402SellerEndpointInspectionRefusal['reason'],
  observedAt: number,
  httpStatus: number | undefined,
  action: string,
): X402SellerEndpointInspectionRefusal {
  return {
    kind: 'refused',
    reason,
    action,
    probe: {
      observedAt,
      ...(httpStatus === undefined ? {} : { httpStatus }),
    },
  }
}
