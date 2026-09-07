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
import { normalizePricingConfig } from '@/modules/money/public'

export type LiveX402Requirement = Readonly<{
  requirementDigest: string
  requirementJson: string
  observedAt: number
}>

export type LiveX402RequirementResult =
  | Readonly<{ kind: 'not_required' }>
  | Readonly<{ kind: 'observed'; requirement: LiveX402Requirement }>
  | Readonly<{ kind: 'refused' }>

/**
 * Performs the one unpaid, bounded request allowed before a managed Call.
 * Only the selected public payment requirement is retained; response bodies,
 * headers, signatures, and unrestricted Provider payloads are discarded.
 */
export async function inspectLiveX402Requirement(
  operation: PublishedTool,
  input: Record<string, unknown>,
  dependencies: X402SellerEndpointInspectorDependencies = {},
): Promise<LiveX402RequirementResult> {
  const pricing = normalizePricingConfig(operation.pricingConfig)
  if (pricing.kind !== 'valid') return { kind: 'refused' }
  if (pricing.config.kind === 'fixed_aud') return { kind: 'not_required' }
  if (pricing.config.effectTiming !== 'payment_required_before_effect'
    || operation.identity.payment.kind !== 'x402') return { kind: 'refused' }

  const observation = await inspectX402SellerEndpoint({
    endpointUrl: operation.identity.endpoint.url,
    method: operation.identity.endpoint.method,
    postBody: input as JsonValue,
    aeEnvironment: operation.runtimeEnvironment,
  }, dependencies)
  if (observation.kind !== 'observed') return { kind: 'refused' }
  const selection = observation.payment.selection
  if (selection.kind !== 'selected') return { kind: 'refused' }
  const selected = observation.payment.accepts.find((candidate) =>
    candidate.alternativeId === selection.alternativeId)
  if (selected === undefined
    || selected.scheme !== 'exact'
    || selected.network !== pricing.config.sourceRequirement.network
    || selected.asset.toLowerCase() !== pricing.config.sourceRequirement.asset.toLowerCase()
    || selected.amount !== pricing.config.sourceRequirement.atomicUnits
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
    },
  }
}
