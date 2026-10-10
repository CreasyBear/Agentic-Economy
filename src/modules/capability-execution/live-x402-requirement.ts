import { canonicalDigest } from '@/modules/common/canonical-digest'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import { stableStringify } from '@/modules/common/stable-hash'
import type { JsonValue } from '@/modules/common/bounded-json'
import {
  type PublishedTool,
} from '@/modules/capability-supply/public'
import {
  inspectX402SellerEndpoint,
  parseX402FetchTransportConfiguration,
  prepareX402Request,
  selectPinnedX402Alternative,
  x402PaymentProfileForEnvironment,
  type X402SellerEndpointInspectionRefusal,
  type X402SellerEndpointInspectorDependencies,
} from '@/modules/capability-supply/server'
import { normalizePricingConfig } from '@/modules/money/public'

export type LiveX402InspectionTarget = Readonly<{
  runtimeEnvironment: PublishedTool['runtimeEnvironment']
  pricingConfig: PublishedTool['pricingConfig']
  identity: Readonly<{
    endpoint: Pick<PublishedTool['identity']['endpoint'], 'url' | 'method'>
    payment: Readonly<{ kind: 'none' }> | Readonly<{
      kind: 'x402'
      payTo: string
      network?: string
      asset?: string
      currency?: string
      routeAmountExponent?: number
      assetAmountExponent?: number
    }>
  }>
  transport: Pick<PublishedTool['transport'], 'configJson'>
}>

export type LiveX402Requirement = Readonly<{
  requirementDigest: string
  requirementJson: string
  paymentRequiredJson: string
  observedAt: number
}>

/**
 * Why a live 402 cannot be quoted or called. `payee_changed` is Provider drift (a live
 * amount is quoted as observed; Call-time digest drift reads as price_changed);
 * `payment_unsupported` is a lane AE does not pay yet;
 * `tool_unsupported` is a publication AE cannot prepare; inspection_* name the probe.
 */
type LiveX402RefusalReason =
  | 'payee_changed'
  | 'payment_unsupported'
  | 'tool_unsupported'
  | 'inspection_challenge_too_large'
  | 'inspection_challenge_malformed'
  | `inspection_${X402SellerEndpointInspectionRefusal['reason']}`

export type LiveX402RequirementResult =
  | Readonly<{ kind: 'not_required' }>
  | Readonly<{ kind: 'observed'; requirement: LiveX402Requirement }>
  | Readonly<{ kind: 'refused'; reason: LiveX402RefusalReason }>

const refusedFor = (reason: LiveX402RefusalReason) => ({ kind: 'refused', reason }) as const

/**
 * Performs the one unpaid, bounded request allowed before a managed Call.
 * Retains the selected public requirement and its bounded, validated challenge.
 * Unrelated response data, payment signatures and Provider payloads are discarded.
 */
export async function inspectLiveX402Requirement(
  operation: LiveX402InspectionTarget,
  input: Record<string, unknown>,
  dependencies: X402SellerEndpointInspectorDependencies = {},
): Promise<LiveX402RequirementResult> {
  const pricing = normalizePricingConfig(operation.pricingConfig)
  if (pricing.kind !== 'valid') return refusedFor('tool_unsupported')
  if (pricing.config.kind === 'fixed_aud') return { kind: 'not_required' }
  if (pricing.config.effectTiming !== 'payment_required_before_effect'
    || operation.identity.payment.kind !== 'x402') return refusedFor('tool_unsupported')

  let config
  try { config = parseX402FetchTransportConfiguration(JSON.parse(operation.transport.configJson)) } catch (cause) { return degradeBackend(cause, refusedFor('tool_unsupported'), { site: 'inspectLiveX402Requirement', reason: 'invalid_response' }) }
  if (config === undefined) return refusedFor('tool_unsupported')
  const request = prepareX402Request(new URL(operation.identity.endpoint.url), config, JSON.stringify(input))
  if (request.kind !== 'prepared') return refusedFor('tool_unsupported')
  const observation = await inspectX402SellerEndpoint({
    endpointUrl: request.target.href,
    method: operation.identity.endpoint.method,
    queryMapped: config.query !== undefined || config.queryObjectPointer !== undefined,
    ...(config.method === 'POST' ? { postBody: JSON.parse(request.body ?? '{}') as JsonValue } : {}),
    aeEnvironment: operation.runtimeEnvironment,
  }, dependencies)
  if (observation.kind !== 'observed') return refusedFor(`inspection_${observation.reason}`)
  if (observation.paymentRequiredJson.length > 65_536) return refusedFor('inspection_challenge_too_large')
  const selection = observation.payment.selection
  if (selection.kind !== 'selected') return refusedFor('payment_unsupported')
  const selected = observation.payment.accepts.find((candidate) =>
    candidate.alternativeId === selection.alternativeId)
  if (selected === undefined
    || selected.scheme !== 'exact'
    || selected.network !== pricing.config.sourceRequirement.network
    || selected.asset.toLowerCase() !== pricing.config.sourceRequirement.asset.toLowerCase()) {
    return refusedFor('payment_unsupported')
  }
  if (!/^[1-9][0-9]{0,77}$/.test(selected.amount)) return refusedFor('inspection_challenge_malformed')
  if (selected.payTo.toLowerCase() !== operation.identity.payment.payTo.toLowerCase()) {
    return refusedFor('payee_changed')
  }

  const material = {
    format: 'ae.live-x402-requirement:v1',
    endpoint: {
      url: observation.endpoint.url,
      method: observation.backend.method,
    },
    profile: observation.payment.profile,
    requirement: {
      scheme: selected.scheme,
      network: selected.network,
      asset: selected.asset.toLowerCase(),
      amountUnits: selected.amount,
      payTo: selected.payTo.toLowerCase(),
      maxTimeoutSeconds: selected.maxTimeoutSeconds,
      extra: selected.extra,
    },
  } as const
  return {
    kind: 'observed',
    requirement: {
      requirementDigest: canonicalDigest(material),
      requirementJson: stableStringify(material),
      observedAt: observation.probe.observedAt,
      paymentRequiredJson: observation.paymentRequiredJson,
    },
  }
}

/**
 * Prices a pre-approval Quote from the publication's validated challenge.
 * Builds the same requirement material as a live probe, including the exact
 * prepared request URL, and does not contact the Provider.
 */
export function persistedManagedX402Requirement(
  operation: LiveX402InspectionTarget,
  input: Record<string, unknown>,
  observedAt: number,
): LiveX402RequirementResult {
  const pricing = normalizePricingConfig(operation.pricingConfig)
  if (pricing.kind !== 'valid') return refusedFor('tool_unsupported')
  if (pricing.config.kind === 'fixed_aud') return { kind: 'not_required' }
  if (pricing.config.effectTiming !== 'payment_required_before_effect'
    || operation.identity.payment.kind !== 'x402') return refusedFor('tool_unsupported')
  const profile = x402PaymentProfileForEnvironment(operation.runtimeEnvironment)
  if (profile === undefined || !Number.isSafeInteger(observedAt) || observedAt < 0) return refusedFor('tool_unsupported')
  let config
  try { config = parseX402FetchTransportConfiguration(JSON.parse(operation.transport.configJson)) }
  catch (cause) { return degradeBackend(cause, refusedFor('tool_unsupported'), { site: 'persistedManagedX402Requirement', reason: 'invalid_response' }) }
  if (config === undefined) return refusedFor('tool_unsupported')
  const request = prepareX402Request(new URL(operation.identity.endpoint.url), config, JSON.stringify(input))
  if (request.kind !== 'prepared') return refusedFor('tool_unsupported')
  const selected = selectPinnedX402Alternative(config.paymentRequiredJson, profile)
  const published = pricing.config.sourceRequirement
  if (selected === undefined
    || selected.scheme !== 'exact'
    || selected.network !== published.network
    || selected.asset.toLowerCase() !== published.asset.toLowerCase()
    || selected.amount !== published.atomicUnits) {
    return refusedFor('tool_unsupported')
  }
  if (selected.payTo.toLowerCase() !== operation.identity.payment.payTo.toLowerCase()) return refusedFor('payee_changed')
  const material = {
    format: 'ae.live-x402-requirement:v1',
    endpoint: { url: request.target.href, method: operation.identity.endpoint.method },
    profile: profile.profile,
    requirement: {
      scheme: selected.scheme,
      network: selected.network,
      asset: selected.asset.toLowerCase(),
      amountUnits: selected.amount,
      payTo: selected.payTo.toLowerCase(),
      maxTimeoutSeconds: selected.maxTimeoutSeconds,
      extra: selected.extra,
    },
  } as const
  return {
    kind: 'observed',
    requirement: {
      requirementDigest: canonicalDigest(material),
      requirementJson: stableStringify(material),
      observedAt,
      paymentRequiredJson: config.paymentRequiredJson,
    },
  }
}
