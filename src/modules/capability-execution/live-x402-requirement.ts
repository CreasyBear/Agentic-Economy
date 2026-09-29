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

export type LiveX402RequirementResult =
  | Readonly<{ kind: 'not_required' }>
  | Readonly<{ kind: 'observed'; requirement: LiveX402Requirement }>
  | Readonly<{ kind: 'refused' }>

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
  if (pricing.kind !== 'valid') return { kind: 'refused' }
  if (pricing.config.kind === 'fixed_aud') return { kind: 'not_required' }
  if (pricing.config.effectTiming !== 'payment_required_before_effect'
    || operation.identity.payment.kind !== 'x402') return { kind: 'refused' }

  let config
  try { config = parseX402FetchTransportConfiguration(JSON.parse(operation.transport.configJson)) } catch (cause) { return degradeBackend(cause, { kind: 'refused' } as const, { site: 'inspectLiveX402Requirement', reason: 'invalid_response' }) }
  if (config === undefined) return { kind: 'refused' }
  const request = prepareX402Request(new URL(operation.identity.endpoint.url), config, JSON.stringify(input))
  if (request.kind !== 'prepared') return { kind: 'refused' }
  const observation = await inspectX402SellerEndpoint({
    endpointUrl: request.target.href,
    method: operation.identity.endpoint.method,
    queryMapped: config.query !== undefined || config.queryObjectPointer !== undefined,
    ...(config.method === 'POST' ? { postBody: JSON.parse(request.body ?? '{}') as JsonValue } : {}),
    aeEnvironment: operation.runtimeEnvironment,
  }, dependencies)
  if (observation.kind !== 'observed' || observation.paymentRequiredJson.length > 65_536) return { kind: 'refused' }
  const selection = observation.payment.selection
  if (selection.kind !== 'selected') return { kind: 'refused' }
  const selected = observation.payment.accepts.find((candidate) =>
    candidate.alternativeId === selection.alternativeId)
  if (selected === undefined
    || selected.scheme !== 'exact'
    || selected.network !== pricing.config.sourceRequirement.network
    || selected.asset.toLowerCase() !== pricing.config.sourceRequirement.asset.toLowerCase()
    || !/^[1-9][0-9]{0,77}$/.test(selected.amount)
    || selected.payTo.toLowerCase() !== operation.identity.payment.payTo.toLowerCase()) {
    return { kind: 'refused' }
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
  if (pricing.kind !== 'valid') return { kind: 'refused' }
  if (pricing.config.kind === 'fixed_aud') return { kind: 'not_required' }
  if (pricing.config.effectTiming !== 'payment_required_before_effect'
    || operation.identity.payment.kind !== 'x402') return { kind: 'refused' }
  const profile = x402PaymentProfileForEnvironment(operation.runtimeEnvironment)
  if (profile === undefined || !Number.isSafeInteger(observedAt) || observedAt < 0) return { kind: 'refused' }
  let config
  try { config = parseX402FetchTransportConfiguration(JSON.parse(operation.transport.configJson)) }
  catch (cause) { return degradeBackend(cause, { kind: 'refused' } as const, { site: 'persistedManagedX402Requirement', reason: 'invalid_response' }) }
  if (config === undefined) return { kind: 'refused' }
  const request = prepareX402Request(new URL(operation.identity.endpoint.url), config, JSON.stringify(input))
  if (request.kind !== 'prepared') return { kind: 'refused' }
  const selected = selectPinnedX402Alternative(config.paymentRequiredJson, profile)
  const published = pricing.config.sourceRequirement
  if (selected === undefined
    || selected.scheme !== 'exact'
    || selected.network !== published.network
    || selected.asset.toLowerCase() !== published.asset.toLowerCase()
    || selected.amount !== published.atomicUnits
    || selected.payTo.toLowerCase() !== operation.identity.payment.payTo.toLowerCase()) {
    return { kind: 'refused' }
  }
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
