import { canonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify } from '@/modules/common/stable-hash'
import type { JsonValue } from '@/modules/common/bounded-json'
import {
  type PublishedTool,
} from '@/modules/capability-supply/public'
import {
  inspectX402SellerEndpoint,
  type X402SellerEndpointInspectorDependencies,
} from '@/modules/capability-supply/server'
import { prepareX402Request } from '@/modules/capability-supply/server'
import { parseX402FetchTransportConfiguration } from '@/modules/capability-supply/public'
import { normalizePricingConfig } from '@/modules/money/public'

export type LiveX402InspectionTarget = Readonly<{
  runtimeEnvironment: PublishedTool['runtimeEnvironment']
  pricingConfig: PublishedTool['pricingConfig']
  identity: Readonly<{
    endpoint: Pick<PublishedTool['identity']['endpoint'], 'url' | 'method'>
    payment: PublishedTool['identity']['payment']
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
  try { config = parseX402FetchTransportConfiguration(JSON.parse(operation.transport.configJson)) } catch { return { kind: 'refused' } }
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
