import { type Infer } from 'convex/values'

import { degradeBackend } from '@/lib/observability/degrade-backend'
import {
  isX402PaymentRequirementForProfile,
  parsePinnedX402PaymentRequiredJson,
  parseX402FetchTransportConfiguration,
  validPublicHttpsEndpoint,
  x402PaymentProfileForEnvironment,
  type PublishPreparedCapabilityCommandResult,
  type X402SellerClaim,
} from '@/modules/capability-supply/public'
import { pricingConfigSourceAmount } from '@/modules/money/public'
import {
  normalizePricingConfig,
  pricingConfigDigest,
  rescaleExactAmount,
} from '@/modules/money/public'

import { preparedPublicationMaterialValue } from '../../capabilitySupplyPublish'
import {
  sellerClaimValue,
  type StageOwnerX402CapabilityArgs,
  type StageOwnerX402CapabilityResult,
} from './ownerStagingValues'

export function canonicalEndpoint(value: string): string | undefined {
  const endpoint = validPublicHttpsEndpoint(value)
  return endpoint === undefined || endpoint.hash !== ''
    ? undefined
    : endpoint.toString()
}

export function boundedSellerClaim(value: Infer<typeof sellerClaimValue>): value is X402SellerClaim {
  return value.businessId.length > 0
    && value.businessId.length <= 200
    && value.endpointUrl.length > 0
    && value.endpointUrl.length <= 2_048
    && value.observationDigest.length === 71
    && /^sha256:[0-9a-f]{64}$/u.test(value.observationDigest)
    && value.payTo.length === 42
    && /^0x[0-9a-fA-F]{40}$/u.test(value.payTo)
}

export function oneEvidenceRef(
  evidenceRefs: readonly string[],
  prefix: string,
): string | undefined {
  const matches = evidenceRefs.filter((ref) => ref.startsWith(prefix))
  return matches.length === 1 ? matches[0] : undefined
}

export function exactCatalogOrigin(
  prepared: Infer<typeof preparedPublicationMaterialValue>,
  args: Pick<StageOwnerX402CapabilityArgs, 'offeringRef' | 'revision' | 'sourceHash'>,
) {
  const origin = prepared.offering.origin
  return origin?.kind === 'catalog_offering'
    && origin.offeringRef === args.offeringRef
    && origin.offeringRevision === args.revision
    && origin.offeringSourceHash === args.sourceHash
    && origin.declaredAccessPathRef !== undefined
    && origin.accessPathSourceHash !== undefined
    ? origin
    : undefined
}

export function exactOwnerX402Environment(
  prepared: Infer<typeof preparedPublicationMaterialValue>,
  claim: X402SellerClaim,
): 'sandbox' | 'production' | undefined {
  if (
    prepared.sourceKind !== 'x402'
    || prepared.binding.adapter.adapterId !== 'x402-fetch:v2'
    || prepared.binding.authority.kind !== 'provider_connection'
  ) return undefined
  const endpoint = canonicalEndpoint(prepared.binding.endpointUrl)
  const claimEndpoint = canonicalEndpoint(claim.endpointUrl)
  const config = parseX402FetchTransportConfiguration(
    prepared.binding.adapter.config,
  )
  const environment = config?.network === 'eip155:84532'
    ? 'sandbox'
    : config?.network === 'eip155:8453'
      ? 'production'
      : undefined
  const profile = x402PaymentProfileForEnvironment(environment)
  if (
    endpoint === undefined
    || claimEndpoint !== endpoint
    || config === undefined
    || profile === undefined
    || config.method !== claim.method
    || config.scheme !== profile.scheme
    || config.network !== profile.network
    || config.asset.toLowerCase() !== profile.asset.toLowerCase()
    || config.payTo.toLowerCase() !== claim.payTo.toLowerCase()
  ) return undefined

  const paymentRequired = parsePinnedX402PaymentRequiredJson(
    config.paymentRequiredJson,
  )
  if (
    paymentRequired === undefined
    || paymentRequired.x402Version !== 2
    || canonicalEndpoint(paymentRequired.resource.url) !== endpoint
  ) return undefined
  const matching = paymentRequired.accepts.filter((candidate) => (
    isX402PaymentRequirementForProfile({
      ...candidate,
      extra: candidate.extra ?? {},
    }, profile)
    && candidate.scheme === config.scheme
    && candidate.network === config.network
    && candidate.asset.toLowerCase() === config.asset.toLowerCase()
    && candidate.payTo.toLowerCase() === config.payTo.toLowerCase()
  ))
  if (matching.length !== 1) return undefined

  let pricing: ReturnType<typeof normalizePricingConfig>
  try {
    pricing = normalizePricingConfig(JSON.parse(prepared.pricingConfigJson))
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'exactOwnerX402Environment', reason: 'invalid_response' })
  }
  if (
    pricing.kind !== 'valid'
    || pricingConfigDigest(pricing.config) !== prepared.priceDigest
    || pricing.config.kind !== 'managed_x402'
    || pricing.config.sourceRequirement.network !== config.network
    || pricing.config.sourceRequirement.asset.toLowerCase() !== config.asset.toLowerCase()
  ) return undefined
  const atomicAmount = rescaleExactAmount(
    pricingConfigSourceAmount(pricing.config),
    config.assetAmountExponent,
  )
  return atomicAmount !== undefined && matching[0]?.amount === atomicAmount.units
    ? environment
    : undefined
}

export function convexStagingResult(
  result: PublishPreparedCapabilityCommandResult,
): StageOwnerX402CapabilityResult {
  if (result.kind === 'refused') {
    const { next, ...refusal } = result
    return next === undefined ? refusal : { ...refusal, next: next.map((action) => ({ ...action })) }
  }
  return {
    kind: result.kind,
    ...(result.operationId === undefined ? {} : { operationId: result.operationId }),
    publicationRef: result.publicationRef,
    publicationRevision: result.publicationRevision,
    toolRef: result.toolRef,
    contractRef: { ...result.contractRef },
    offeringId: result.offeringId,
    bindingId: result.bindingId,
    sourceKind: result.sourceKind,
    sourceSelector: result.sourceSelector,
    sourceRevision: result.sourceRevision,
    sourceDigest: result.sourceDigest,
    priceDigest: result.priceDigest,
    authorityMode: result.authorityMode,
    publisherRef: result.publisherRef,
    provenanceDigest: result.provenanceDigest,
    lifecycle: {
      state: result.lifecycle.state,
      reasons: [...result.lifecycle.reasons],
    },
  }
}
