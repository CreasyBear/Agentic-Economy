import type { DevSeedBusinessFixture } from './dev-seed-business-fixtures'

/**
 * Cluster B (keyed HTTP providers): OpenWeatherMap, Tavily, SerpAPI, and
 * CoinGecko. These are real, keyed external operations; the seed derives
 * readiness from credential/health state, so availability is only confirmed
 * once the credential is present and a probe succeeds. Fixtures mark the
 * wormholes accordingly.
 */
export const CLUSTER_B_FIXTURES: readonly DevSeedBusinessFixture[] = [
  {
    requestedSlug: 'openweathermap-current-weather',
    businessName: 'OpenWeatherMap — current weather',
    category: 'External weather data',
    suburb: 'Online',
    stateTerritory: 'External',
    ownerMessage: 'AE-curated external operation using the OpenWeatherMap Current Weather Data API with an API key; not provider-owned or endorsed.',
    sourceLabel: 'docs_referenced / https://openweathermap.org/current / 2026-08-05',
    offerings: [{
      name: 'OpenWeatherMap current weather',
      category: 'Weather data',
      summary: 'Returns current weather by city name or latitude and longitude pair through the official OpenWeatherMap Current Weather Data endpoint.',
      serviceAreaSummary: 'Online',
      availabilitySummary: 'Requires an OPENWEATHER_API_KEY credential; ready only once credential and readiness are confirmed by AE',
      accessPaths: [],
      firstRequestMode: 'not_available_yet',
      publicDisclosure: 'AE-curated external operation. Lookup takes either a city name (q) or a latitude and longitude pair (lat and lon); appid is always required.',
      noContactReason: 'Use the registered AE operation after credential, readiness, and exact route confirmation succeed.',
    }],
  },
  {
    requestedSlug: 'tavily-search',
    businessName: 'Tavily — web search',
    category: 'External web search',
    suburb: 'Online',
    stateTerritory: 'External',
    ownerMessage: 'AE-curated external operation using the official Tavily search API with an API key; not provider-owned or endorsed.',
    sourceLabel: 'docs_referenced / https://docs.tavily.com + https://app.tavily.com/.well-known/openapi.json / 2026-08-05',
    offerings: [{
      name: 'Tavily search',
      category: 'Web search',
      summary: 'Searches the web through Tavily and returns bounded, agent-oriented results with optional answer and raw content.',
      serviceAreaSummary: 'Online',
      availabilitySummary: 'Requires a TAVILY_API_KEY credential; ready only once credential and readiness are confirmed by AE',
      accessPaths: [],
      firstRequestMode: 'not_available_yet',
      publicDisclosure: 'AE-curated external operation. Search is keyed with a bearer API key and submitted as a JSON POST body.',
      noContactReason: 'Use the registered AE operation after credential, readiness, and exact route confirmation succeed.',
    }],
  },
  {
    requestedSlug: 'serpapi-google-search',
    businessName: 'SerpAPI — Google search',
    category: 'External search engine access',
    suburb: 'Online',
    stateTerritory: 'External',
    ownerMessage: 'AE-curated external operation using the SerpAPI search endpoint with an API key; not provider-owned or endorsed.',
    sourceLabel: 'docs_referenced / https://serpapi.com/search / 2026-08-05',
    offerings: [{
      name: 'SerpAPI Google search',
      category: 'Search engine access',
      summary: 'Runs a Google search through SerpAPI and returns organic results plus reference metadata.',
      serviceAreaSummary: 'Online',
      availabilitySummary: 'Requires a SERPAPI_API_KEY credential; ready only once credential and readiness are confirmed by AE',
      accessPaths: [],
      firstRequestMode: 'not_available_yet',
      publicDisclosure: 'AE-curated external operation. Search is keyed with an API key sent as a query parameter; provenance is the public endpoint documentation only (no formal OpenAPI contract).',
      noContactReason: 'Use the registered AE operation after credential, readiness, and exact route confirmation succeed.',
    }],
  },
  {
    requestedSlug: 'coingecko-simple-price-demo',
    businessName: 'CoinGecko — simple price (demo)',
    category: 'External crypto price data',
    suburb: 'Online',
    stateTerritory: 'External',
    ownerMessage: 'AE-curated external operation using the CoinGecko simple price endpoint with a demo API key; not provider-owned or endorsed.',
    sourceLabel: 'docs_referenced / https://docs.coingecko.com/reference/simple-price / 2026-08-05',
    offerings: [{
      name: 'CoinGecko simple price',
      category: 'Crypto price data',
      summary: 'Returns current spot prices for one or more crypto assets in one or more currencies through the CoinGecko simple price endpoint.',
      serviceAreaSummary: 'Online',
      availabilitySummary: 'Requires a COINGECKO_DEMO_API_KEY credential; ready only once credential and readiness are confirmed by AE',
      accessPaths: [],
      firstRequestMode: 'not_available_yet',
      publicDisclosure: 'AE-curated external operation. The demo API key is sent as the x-cg-demo-api-key request header (header-key variant).',
      noContactReason: 'Use the registered AE operation after credential, readiness, and exact route confirmation succeed.',
    }],
  },
] as const
