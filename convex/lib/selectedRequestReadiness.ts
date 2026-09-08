import { FACILITATOR_DISCOVERY_PUBLISHER_REF } from '@/modules/capability-supply/convex'
import { normalizePricingConfig } from '@/modules/money/public'

/** Imported managed requests are checked with customer input at Quote time. */
export function usesSelectedRequestReadiness(publication: Readonly<{
  authorityMode?: string | undefined
  publisherRef: string
  sourceKind: string
  pricingConfigJson?: string | undefined
}>): boolean {
  if (publication.authorityMode !== 'observed_external'
    || publication.publisherRef !== FACILITATOR_DISCOVERY_PUBLISHER_REF
    || publication.sourceKind !== 'x402'
    || publication.pricingConfigJson === undefined) return false
  try {
    const pricing = normalizePricingConfig(JSON.parse(publication.pricingConfigJson))
    return pricing.kind === 'valid' && pricing.config.kind === 'managed_x402'
  } catch { return false }
}
