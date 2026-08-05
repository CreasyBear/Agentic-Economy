type FirstRequestMode = 'inquiry_available' | 'quote_request_available' | 'not_available_yet'

export type DevSeedOfferingAccessPathFixture = Readonly<{
  kind: 'human_request'
  channel: 'phone' | 'website' | 'ae_inquiry'
  disclosure: string
}>

export type DevSeedOfferingFixture = Readonly<{
  name: string
  category: string
  summary: string
  serviceAreaSummary: string
  availabilitySummary: string
  pricingSummary?: string
  accessPaths: readonly DevSeedOfferingAccessPathFixture[]
  firstRequestMode: FirstRequestMode
  publicDisclosure: string
  noContactReason: string
}>

export type DevSeedBusinessFixture = Readonly<{
  requestedSlug: string
  businessName: string
  category: string
  suburb: string
  stateTerritory: string
  ownerMessage: string
  sourceLabel: string
  publishedPhone?: string
  offerings: readonly DevSeedOfferingFixture[]
  photoUrl?: string
  responseTimeMinutes?: number
}>

/**
 * The dev-seed business catalog is the canonical real-provider supply: only the
 * AE-curated agentic.market capabilities are seeded. Sandbox and Australian
 * mock businesses are not published. `curatedProviders:seed` filters this list
 * by its two provider slugs (agentic-market-exa, frankfurter-ecb-rates) and its
 * guard requires both to be present; agentic-market-tavily is retained as the
 * third observed x402 listing.
 */
export const DEV_SEED_BUSINESS_COUNT = 3

export const DEV_SEED_BUSINESS_FIXTURES: readonly DevSeedBusinessFixture[] = [
  {
    requestedSlug: 'agentic-market-tavily',
    businessName: 'Agentic Market listing — Tavily',
    category: 'External x402 web search',
    suburb: 'Online',
    stateTerritory: 'External',
    ownerMessage: 'Publicly observed Agentic Market listing; not provider-owned, AE-verified, or guaranteed available.',
    sourceLabel: 'publicly_observed / https://api.agentic.market/v1/services/search?q=web%20search / 2026-08-03',
    offerings: [{
      name: 'Tavily Search',
      category: 'Web search',
      summary: 'Advanced web search for AI agents, listed by Agentic Market as an x402 endpoint.',
      serviceAreaSummary: 'Online',
      availabilitySummary: 'Not verified by AE',
      accessPaths: [],
      firstRequestMode: 'not_available_yet',
      publicDisclosure: 'External x402 listing only. AE does not execute or pay this endpoint in the seeded catalog.',
      noContactReason: 'Use the publicly observed external operation after independently verifying current terms.',
    }],
  },
  {
    requestedSlug: 'agentic-market-exa',
    businessName: 'Agentic Market listing — Exa',
    category: 'External x402 web search',
    suburb: 'Online',
    stateTerritory: 'External',
    ownerMessage: 'Publicly observed Agentic Market listing; not provider-owned, endorsed, or guaranteed available.',
    sourceLabel: 'publicly_observed / https://api.agentic.market/v1/services/search?q=exa / 2026-08-04',
    offerings: [{
      name: 'Exa search and contents',
      category: 'Web search and content retrieval',
      summary: 'First-party Exa search and content retrieval endpoints, listed by Agentic Market with x402 payment.',
      serviceAreaSummary: 'Online',
      availabilitySummary: 'Execution requires a funded AE x402 credential',
      accessPaths: [],
      firstRequestMode: 'not_available_yet',
      publicDisclosure: 'AE-curated external operations. Search and contents remain unavailable until current readiness and spend authority are proven.',
      noContactReason: 'Use the registered AE operations after credential, readiness, and exact route confirmation succeed.',
    }],
  },
  {
    requestedSlug: 'frankfurter-ecb-rates',
    businessName: 'Frankfurter — ECB rates',
    category: 'External currency reference data',
    suburb: 'Online',
    stateTerritory: 'External',
    ownerMessage: 'AE-curated external operation using Frankfurter with European Central Bank source attribution; not provider-owned or endorsed.',
    sourceLabel: 'publicly_observed / https://frankfurter.dev/ / 2026-08-04',
    offerings: [{
      name: 'Frankfurter ECB single-pair rate',
      category: 'Currency reference data',
      summary: 'Returns one current ECB reference rate through the public Frankfurter v2 API.',
      serviceAreaSummary: 'Online',
      availabilitySummary: 'Public keyless HTTPS; current readiness checked by AE',
      accessPaths: [],
      firstRequestMode: 'not_available_yet',
      publicDisclosure: 'Reference data only. Source: European Central Bank via Frankfurter. Not a tradable quote, guarantee, or financial advice.',
      noContactReason: 'Use the registered AE operation after current readiness and exact route confirmation succeed.',
    }],
  },
] as const
