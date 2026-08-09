import type { DevSeedBusinessFixture } from './dev-seed-business-fixtures'

const OBSERVED_DATE = '2026-08-05'

const x402OfferingSummary = (name: string, category: string, summary: string): DevSeedBusinessFixture['offerings'][number] => ({
  name,
  category,
  summary,
  serviceAreaSummary: 'Online',
  availabilitySummary: 'Not verified by AE',
  accessPaths: [],
  firstRequestMode: 'not_available_yet',
  publicDisclosure: 'External x402 listing only. AE does not execute or pay this endpoint in the seeded catalog.',
  noContactReason: 'AE does not execute or pay this endpoint. Use it only after independently verifying current terms from the observed public listing.',
})

type ClusterCFixtureSeed = Readonly<{
  slug: string
  businessName: string
  category: string
  listingUrl: string
  offering: DevSeedBusinessFixture['offerings'][number]
}>

const seeds: readonly ClusterCFixtureSeed[] = [
  {
    slug: 'agentic-market-exa-x402',
    businessName: 'Agentic Market listing — Exa (x402)',
    category: 'External x402 web search',
    listingUrl: 'https://api.agentic.market/v1/services/search?q=exa',
    offering: x402OfferingSummary(
      'Exa search (x402)',
      'Web search',
      'Agentic Market-listed x402 web search endpoint. Re-confirms the existing AE-curated Exa entry.',
    ),
  },
  {
    slug: 'agentic-market-timezone-x402',
    businessName: 'Agentic Market listing — Timezone convert (x402)',
    category: 'External x402 time conversion',
    listingUrl: 'https://api.agentic.market/v1/services/search?q=timezone',
    offering: x402OfferingSummary(
      'Timezone convert (x402)',
      'Time conversion',
      'Agentic Market-listed x402 endpoint converting an ISO time across IANA timezones.',
    ),
  },
  {
    slug: 'agentic-market-wolframalpha-x402',
    businessName: 'Agentic Market listing — Wolfram|Alpha (x402)',
    category: 'External x402 computational knowledge',
    listingUrl: 'https://api.agentic.market/v1/services/search?q=wolframalpha',
    offering: x402OfferingSummary(
      'Wolfram|Alpha query (x402)',
      'Computational knowledge',
      'Agentic Market-listed x402 Wolfram|Alpha query endpoint. The observed listing exposed empty params.',
    ),
  },
  {
    slug: 'agentic-market-coinmarketcap-x402',
    businessName: 'Agentic Market listing — CoinMarketCap quotes (x402)',
    category: 'External x402 market data',
    listingUrl: 'https://api.agentic.market/v1/services/search?q=coinmarketcap',
    offering: x402OfferingSummary(
      'CoinMarketCap quotes (x402)',
      'Cryptocurrency market data',
      'Agentic Market-listed x402 CoinMarketCap cryptocurrency quotes endpoint.',
    ),
  },
  {
    slug: 'agentic-market-flightaware-x402',
    businessName: 'Agentic Market listing — FlightAware nearby airports (x402)',
    category: 'External x402 aviation data',
    listingUrl: 'https://api.agentic.market/v1/services/search?q=flightaware',
    offering: x402OfferingSummary(
      'FlightAware nearby airports (x402)',
      'Aviation data',
      'Agentic Market-listed x402 endpoint listing airports near a latitude/longitude within a radius.',
    ),
  },
  {
    slug: 'agentic-market-bizintel-x402',
    businessName: 'Agentic Market listing — Bizintel forex rate (x402)',
    category: 'External x402 currency reference data',
    listingUrl: 'https://api.agentic.market/v1/services/search?q=frankfurter',
    offering: x402OfferingSummary(
      'Bizintel forex rate (x402)',
      'Currency reference data',
      'Agentic Market-listed x402 forex-rate endpoint. Direct adversarial same-currency-domain overlap with the AE keyless Frankfurter capability.',
    ),
  },
  {
    slug: 'agentic-market-tavily-x402',
    businessName: 'Agentic Market listing — Tavily (x402)',
    category: 'External x402 web search',
    listingUrl: 'https://api.agentic.market/v1/services/search?q=tavily',
    offering: x402OfferingSummary(
      'Tavily search (x402)',
      'Web search',
      'Agentic Market-listed x402 Tavily search endpoint, for x402-vs-keyed routing tests.',
    ),
  },
]

export const CLUSTER_C_FIXTURES: readonly DevSeedBusinessFixture[] = seeds.map((seed) => ({
  requestedSlug: seed.slug,
  businessName: seed.businessName,
  category: seed.category,
  suburb: 'Online',
  stateTerritory: 'External',
  ownerMessage: 'Publicly observed Agentic Market x402 listing; not provider-owned, AE-verified, or guaranteed available. AE does not execute or pay this endpoint.',
  sourceLabel: `publicly_observed / ${seed.listingUrl} / ${OBSERVED_DATE}`,
  offerings: [seed.offering],
}))
