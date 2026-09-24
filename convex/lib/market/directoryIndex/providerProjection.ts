import Decimal from 'decimal.js'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { canonicalProviderWebsite, isProgrammableProviderBusinessContext } from '@/modules/business/public'
import { directoryProviderKey } from '@/modules/market/x402-directory-index'
import { displayPriceFromPricingConfig, normalizePricingConfig, pricingConfigSourceAmount } from '@/modules/money/public'
import type { Doc } from '../../../_generated/dataModel'
import type { DirectoryEntry } from './contracts'

const PROVIDER_RESOURCE_PREFIX = 'provider-route:'

export function providerResourceKey(sourceRouteRef: string): string {
  return `${PROVIDER_RESOURCE_PREFIX}${sourceRouteRef}`
}

/** Separate identity namespace from Coinbase's resource-keyed documentId - a provider row never shares a marketExternalRegistryEntries row with a Coinbase one. */
export function providerDocumentId(sourceRouteRef: string): string {
  return `registry:${canonicalDigest({ source: 'provider', sourceRouteRef }).slice(7)}`
}

/** Business host if this is a self-declared programmable provider with a valid website, else the business's own public slug. */
export function providerKeyForBusiness(business: Doc<'businesses'>): string {
  if (isProgrammableProviderBusinessContext(business.businessContext)) {
    const canonical = canonicalProviderWebsite(business.businessContext.website)
    if (canonical !== undefined) return directoryProviderKey(new URL(canonical).hostname)
  }
  return business.slug
}

function providerOfferingPrices(
  pricingConfigJson: string | undefined,
  offering: Doc<'capabilityOfferings'>,
  networkId: string,
): DirectoryEntry['prices'] {
  if (pricingConfigJson !== undefined) {
    try {
      const parsed = JSON.parse(pricingConfigJson) as unknown
      const normalized = normalizePricingConfig(parsed)
      if (normalized.kind === 'valid') {
        const config = normalized.config
        if (config.kind === 'managed_x402') {
          const amount = pricingConfigSourceAmount(config)
          const decimalAmount = new Decimal(amount.units).div(new Decimal(10).pow(amount.exponent)).toFixed()
          return [{ network: networkId, scheme: 'exact', amount: amount.units, asset: amount.currency, symbol: amount.currency, decimalAmount }]
        }
        const display = displayPriceFromPricingConfig(config)
        if (display.kind === 'fixed') {
          const amount = display.amount
          const decimalAmount = new Decimal(amount.units).div(new Decimal(10).pow(amount.exponent)).toFixed()
          return [{ network: networkId, scheme: 'exact', amount: amount.units, asset: amount.currency, symbol: amount.currency, decimalAmount }]
        }
        return []
      }
    } catch (cause) {
      void cause;
      // fallback to offering presentation price if pricingConfigJson parsing fails
    }
  }
  const price = offering.presentation.price
  if (price === undefined || price.kind === 'on_request') return []
  const amount = price.kind === 'fixed' ? price.amount : price.minimum
  const decimalAmount = new Decimal(amount.units).div(new Decimal(10).pow(amount.exponent)).toFixed()
  return [{ network: networkId, scheme: 'exact', amount: amount.units, asset: amount.currency, symbol: amount.currency, decimalAmount }]
}

/**
 * The Coinbase-shaped projection of one reviewed-tier publication. Feeding
 * this through the same helpers a Coinbase entry uses (searchAnalytics,
 * listingIdentityDigest, writeFacetMembership, writeAnalytics,
 * indexedDirectoryEntry/storedDirectoryEntry) is what lets browse/search/
 * facets/bySlug/canonical carry no provider-specific branch.
 */
export function providerDirectoryEntry(
  resource: string, providerKey: string, business: Doc<'businesses'>, offering: Doc<'capabilityOfferings'>,
  publication: Pick<Doc<'capabilityPublications'>, 'sourceKind' | 'networkId' | 'pricingConfigJson'>,
): DirectoryEntry {
  return {
    resource, title: offering.presentation.label, description: offering.presentation.summary,
    protocol: publication.sourceKind,
    // Matches the Coinbase convention (directoryProviderKey(entry.provider))
    // where `provider` is itself the normalised host - not a display name -
    // so the provider-filtered browse/facets index key (row.provider) stays
    // consistent across both sources.
    provider: providerKey,
    category: business.category.trim().toLowerCase() || 'uncategorized',
    prices: providerOfferingPrices(publication.pricingConfigJson, offering, publication.networkId),
    metadataJson: '',
  }
}
