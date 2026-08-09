import type {
  CapabilityContractMetadata,
  CapabilityPublicationImport,
} from './public'

// Cluster B (keyed HTTP operations): OpenWeatherMap current weather, Tavily
// search, SerpAPI Google search, and CoinGecko simple price (demo key).
// Each requires a real API credential resolved from an env var; readiness is
// only confirmed once that credential and a health probe succeed.

const AE_PUBLIC_NETWORK = 'ae:public'

const OPENWEATHER_AUTHORITY = {
  kind: 'provider_connection',
  connectionRef: 'connection:openweathermap',
  providerRef: 'provider:openweathermap',
} as const
const TAVILY_AUTHORITY = {
  kind: 'provider_connection',
  connectionRef: 'connection:tavily',
  providerRef: 'provider:tavily',
} as const
const SERPAPI_AUTHORITY = {
  kind: 'provider_connection',
  connectionRef: 'connection:serpapi',
  providerRef: 'provider:serpapi',
} as const
const COINGECKO_AUTHORITY = {
  kind: 'provider_connection',
  connectionRef: 'connection:coingecko-demo',
  providerRef: 'provider:coingecko',
} as const

const KEYED_PRICE = { amount: { currency: 'USD', units: '1', exponent: 2 } } as const
const PAYMENT_TERM = { termId: 'provider-cost', label: 'Provider cost', value: 'Provider-funded API usage; no customer payment is submitted.' } as const

const OPENWEATHER_SOURCE_EVIDENCE = [
  'https://openweathermap.org/current',
] as const

const TAVILY_SOURCE_EVIDENCE = [
  'https://docs.tavily.com',
  'https://app.tavily.com/.well-known/openapi.json',
] as const

const SERPAPI_SOURCE_EVIDENCE = [
  'https://serpapi.com/search',
] as const

const COINGECKO_SOURCE_EVIDENCE = [
  'https://docs.coingecko.com/reference/simple-price',
] as const

const openweatherOutputSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    coord: {
      type: 'object',
      properties: {
        lon: { type: 'number' },
        lat: { type: 'number' },
      },
      required: ['lon', 'lat'],
      additionalProperties: false,
    },
    weather: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          main: { type: 'string' },
          description: { type: 'string' },
          icon: { type: 'string' },
        },
        required: ['id', 'main', 'description', 'icon'],
        additionalProperties: false,
      },
    },
    base: { type: 'string' },
    main: {
      type: 'object',
      properties: {
        temp: { type: 'number' },
        feels_like: { type: 'number' },
        pressure: { type: 'integer' },
        humidity: { type: 'integer' },
        temp_min: { type: 'number' },
        temp_max: { type: 'number' },
        sea_level: { type: 'integer' },
        grnd_level: { type: 'integer' },
      },
      required: ['temp', 'feels_like', 'pressure', 'humidity'],
      additionalProperties: false,
    },
    rain: {
      type: 'object',
      properties: {
        '1h': { type: 'number' },
        '3h': { type: 'number' },
      },
      additionalProperties: false,
    },
    snow: {
      type: 'object',
      properties: {
        '1h': { type: 'number' },
        '3h': { type: 'number' },
      },
      additionalProperties: false,
    },
    wind: {
      type: 'object',
      properties: {
        speed: { type: 'number' },
        deg: { type: 'integer' },
        gust: { type: 'number' },
      },
      required: ['speed', 'deg'],
      additionalProperties: false,
    },
    clouds: {
      type: 'object',
      properties: {
        all: { type: 'integer' },
      },
      required: ['all'],
      additionalProperties: false,
    },
    visibility: { type: 'integer' },
    dt: { type: 'integer' },
    sys: {
      type: 'object',
      properties: {
        type: { type: 'integer' },
        id: { type: 'integer' },
        message: { type: 'number' },
        country: { type: 'string' },
        sunrise: { type: 'integer' },
        sunset: { type: 'integer' },
      },
      required: ['country'],
      additionalProperties: false,
    },
    timezone: { type: 'integer' },
    id: { type: 'integer' },
    name: { type: 'string' },
    cod: { type: 'integer' },
  },
  required: ['main', 'cod'],
  additionalProperties: false,
} as const

const tavilyInputSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    query: {
      type: 'string',
      minLength: 1,
      maxLength: 2_000,
      description: 'The search query.',
    },
    max_results: {
      type: 'integer',
      minimum: 1,
      maximum: 20,
      default: 5,
      description: 'The maximum number of search results to return.',
    },
    search_depth: {
      type: 'string',
      enum: ['basic', 'advanced'],
      default: 'basic',
      description: 'The depth of the search.',
    },
    topic: {
      type: 'string',
      enum: ['general', 'news', 'finance'],
      default: 'general',
      description: 'The category of the search.',
    },
    days: {
      type: 'integer',
      minimum: 1,
      maximum: 30,
      description: 'Days of history to search for news and finance topics.',
    },
    include_answer: {
      type: 'boolean',
      default: false,
      description: 'Whether to include a concise answer generated from the results.',
    },
    include_raw_content: {
      type: 'boolean',
      default: false,
      description: 'Whether to include the raw content of each result.',
    },
    domains: {
      type: 'array',
      items: { type: 'string', format: 'hostname', minLength: 1, maxLength: 2_048 },
      description: 'A list of domains to restrict the search to.',
    },
  },
  required: ['query'],
  additionalProperties: false,
} as const

const tavilyOutputSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    query: { type: 'string' },
    answer: { type: 'string' },
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          url: { type: 'string', format: 'uri', minLength: 1, maxLength: 2_048 },
          content: { type: 'string' },
          score: { type: 'number' },
          raw_content: { type: 'string' },
        },
        required: ['title', 'url', 'content', 'score'],
        additionalProperties: false,
      },
    },
    response_time: { type: 'number' },
    cost: { type: 'number', minimum: 0 },
  },
  required: ['results'],
  additionalProperties: false,
} as const

const serpapiOutputSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    search_metadata: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        status: { type: 'string' },
        json_endpoint: { type: 'string', format: 'uri' },
        created_at: { type: 'string' },
        processed_at: { type: 'string' },
        google_url: { type: 'string', format: 'uri' },
        raw_html_file: { type: 'string', format: 'uri' },
        prettify_html_file: { type: 'string', format: 'uri' },
        total_time_taken: { type: 'number' },
      },
      additionalProperties: false,
    },
    search_parameters: {
      type: 'object',
      properties: {
        engine: { type: 'string' },
        q: { type: 'string' },
        location_requested: { type: 'string' },
        location_used: { type: 'string' },
        google_domain: { type: 'string' },
        hl: { type: 'string' },
        gl: { type: 'string' },
        device: { type: 'string' },
      },
      additionalProperties: false,
    },
    search_information: {
      type: 'object',
      properties: {
        query_displayed: { type: 'string' },
        total_results: { type: 'integer' },
        time_taken_displayed: { type: 'number' },
        organic_results_state: { type: 'string' },
        results_for: { type: 'string' },
      },
      additionalProperties: true,
    },
    organic_results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          position: { type: 'integer' },
          title: { type: 'string' },
          link: { type: 'string', format: 'uri', minLength: 1, maxLength: 2_048 },
          redirect_link: { type: 'string', format: 'uri', minLength: 1, maxLength: 2_048 },
          displayed_link: { type: 'string' },
          thumbnail: { type: 'string', format: 'uri' },
          favicon: { type: 'string', format: 'uri' },
          snippet: { type: 'string' },
          snippet_highlighted_words: { type: 'array', items: { type: 'string' } },
          source: { type: 'string' },
          sitelinks: {
            type: 'object',
            properties: {
              inline: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    link: { type: 'string', format: 'uri' },
                  },
                  required: ['title', 'link'],
                  additionalProperties: false,
                },
              },
            },
            additionalProperties: false,
          },
        },
        required: ['title', 'link'],
        additionalProperties: false,
      },
    },
    pagination: {
      type: 'object',
      properties: {
        current: { type: 'integer' },
        next: { type: 'string', format: 'uri' },
        previous: { type: 'string', format: 'uri' },
        other_pages: { type: 'object', additionalProperties: { type: 'string', format: 'uri' } },
      },
      additionalProperties: false,
    },
  },
  required: ['organic_results'],
  // SerpAPI adds query-dependent result sections beyond these stable fields.
  additionalProperties: true,
} as const

const coingeckoOutputSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  description: 'The current Bitcoin price in USD with optional requested market metrics.',
  required: ['bitcoin'],
  properties: {
    bitcoin: {
      type: 'object',
      properties: {
        usd: { type: 'number' },
        usd_market_cap: { type: 'number' },
        usd_24h_vol: { type: 'number' },
        usd_24h_change: { type: 'number' },
        last_updated_at: { type: 'integer' },
      },
      required: ['usd'],
      additionalProperties: false,
    },
  },
  additionalProperties: false,
} as const

const openweatherContract: CapabilityContractMetadata = {
  capabilityId: 'openweathermap.current-weather',
  version: 1,
  name: 'OpenWeatherMap current weather',
  description: 'Returns the current weather for a city (or latitude and longitude pair) through the official OpenWeatherMap Current Weather Data API.',
  customerAnnotations: [
    { annotationId: 'city', document: 'input', pointer: '/q', label: 'City name', role: 'request' },
    { annotationId: 'latitude', document: 'input', pointer: '/lat', label: 'Latitude', role: 'request' },
    { annotationId: 'longitude', document: 'input', pointer: '/lon', label: 'Longitude', role: 'request' },
    { annotationId: 'weather', document: 'output', pointer: '/main', label: 'Weather conditions', role: 'completion_evidence' },
  ],
  dataUse: [
    {
      effectId: 'query_release',
      inputPointer: '/q',
      classification: 'public',
      phase: 'execution',
      recipient: { kind: 'selected_binding' },
      purposes: ['lookup_current_weather_by_city'],
    },
    {
      effectId: 'query_release',
      inputPointer: '/lat',
      classification: 'public',
      phase: 'execution',
      recipient: { kind: 'selected_binding' },
      purposes: ['lookup_current_weather_by_coordinates'],
    },
    {
      effectId: 'query_release',
      inputPointer: '/lon',
      classification: 'public',
      phase: 'execution',
      recipient: { kind: 'selected_binding' },
      purposes: ['lookup_current_weather_by_coordinates'],
    },
  ],
  effects: [{
    effectId: 'query_release',
    class: 'data_release',
    authority: 'mandate_or_explicit',
    reversibility: 'not_applicable',
  }],
  evidence: [{ evidenceId: 'weather', outputPointer: '/main', purpose: 'completion' }],
  lifecycle: { idempotency: 'required', recovery: 'reconcile_required' },
  inputExamples: [
    { label: 'London weather', input: { q: 'London' } },
  ],
}

const tavilyContract: CapabilityContractMetadata = {
  capabilityId: 'tavily.search',
  version: 1,
  name: 'Tavily search',
  description: 'Searches the web through Tavily and returns bounded, agent-oriented results with optional answer and raw content.',
  customerAnnotations: [
    { annotationId: 'query', document: 'input', pointer: '/query', label: 'Search query', role: 'request' },
    { annotationId: 'max_results', document: 'input', pointer: '/max_results', label: 'Result limit', role: 'constraint' },
    { annotationId: 'topic', document: 'input', pointer: '/topic', label: 'Search category', role: 'constraint' },
    { annotationId: 'search_depth', document: 'input', pointer: '/search_depth', label: 'Search depth', role: 'constraint' },
    { annotationId: 'results', document: 'output', pointer: '/results', label: 'Search results', role: 'completion_evidence' },
  ],
  dataUse: [
    {
      effectId: 'query_release',
      inputPointer: '/query',
      classification: 'public',
      phase: 'execution',
      recipient: { kind: 'selected_binding' },
      purposes: ['search_public_web'],
    },
    {
      effectId: 'query_release',
      inputPointer: '/max_results',
      classification: 'public',
      phase: 'execution',
      recipient: { kind: 'selected_binding' },
      purposes: ['bound_search_result_count'],
    },
    {
      effectId: 'query_release',
      inputPointer: '/topic',
      classification: 'public',
      phase: 'execution',
      recipient: { kind: 'selected_binding' },
      purposes: ['select_search_category'],
    },
    {
      effectId: 'query_release',
      inputPointer: '/search_depth',
      classification: 'public',
      phase: 'execution',
      recipient: { kind: 'selected_binding' },
      purposes: ['select_search_depth'],
    },
    {
      effectId: 'query_release',
      inputPointer: '/days',
      classification: 'public',
      phase: 'execution',
      recipient: { kind: 'selected_binding' },
      purposes: ['bound_news_history_horizon'],
    },
    {
      effectId: 'query_release',
      inputPointer: '/include_answer',
      classification: 'public',
      phase: 'execution',
      recipient: { kind: 'selected_binding' },
      purposes: ['select_concise_answer_inclusion'],
    },
    {
      effectId: 'query_release',
      inputPointer: '/include_raw_content',
      classification: 'public',
      phase: 'execution',
      recipient: { kind: 'selected_binding' },
      purposes: ['select_raw_content_inclusion'],
    },
    {
      effectId: 'query_release',
      inputPointer: '/domains',
      classification: 'public',
      phase: 'execution',
      recipient: { kind: 'selected_binding' },
      purposes: ['restrict_domains'],
    },
  ],
  effects: [{
    effectId: 'query_release',
    class: 'data_release',
    authority: 'mandate_or_explicit',
    reversibility: 'not_applicable',
  }],
  evidence: [{ evidenceId: 'results', outputPointer: '/results', purpose: 'completion' }],
  lifecycle: { idempotency: 'required', recovery: 'reconcile_required' },
}

const serpapiContract: CapabilityContractMetadata = {
  capabilityId: 'serpapi.google-search',
  version: 1,
  name: 'SerpAPI Google search',
  description: 'Runs a Google web search through SerpAPI and returns organic results plus reference metadata.',
  customerAnnotations: [
    { annotationId: 'query', document: 'input', pointer: '/q', label: 'Search query', role: 'request' },
    { annotationId: 'num', document: 'input', pointer: '/num', label: 'Result count', role: 'constraint' },
    { annotationId: 'country', document: 'input', pointer: '/gl', label: 'Country', role: 'constraint' },
    { annotationId: 'results', document: 'output', pointer: '/organic_results', label: 'Organic results', role: 'completion_evidence' },
  ],
  dataUse: [
    {
      effectId: 'query_release',
      inputPointer: '/q',
      classification: 'public',
      phase: 'execution',
      recipient: { kind: 'selected_binding' },
      purposes: ['search_public_web'],
    },
    {
      effectId: 'query_release',
      inputPointer: '/num',
      classification: 'public',
      phase: 'execution',
      recipient: { kind: 'selected_binding' },
      purposes: ['bound_search_result_count'],
    },
    {
      effectId: 'query_release',
      inputPointer: '/gl',
      classification: 'public',
      phase: 'execution',
      recipient: { kind: 'selected_binding' },
      purposes: ['scope_search_by_country'],
    },
    {
      effectId: 'query_release',
      inputPointer: '/engine',
      classification: 'public',
      phase: 'execution',
      recipient: { kind: 'selected_binding' },
      purposes: ['select_search_engine'],
    },
    {
      effectId: 'query_release',
      inputPointer: '/hl',
      classification: 'public',
      phase: 'execution',
      recipient: { kind: 'selected_binding' },
      purposes: ['select_search_language'],
    },
    {
      effectId: 'query_release',
      inputPointer: '/location',
      classification: 'public',
      phase: 'execution',
      recipient: { kind: 'selected_binding' },
      purposes: ['scope_search_by_location'],
    },
  ],
  effects: [{
    effectId: 'query_release',
    class: 'data_release',
    authority: 'mandate_or_explicit',
    reversibility: 'not_applicable',
  }],
  evidence: [{ evidenceId: 'results', outputPointer: '/organic_results', purpose: 'completion' }],
  lifecycle: { idempotency: 'required', recovery: 'reconcile_required' },
  inputExamples: [
    { label: 'Agent economy search', input: { q: 'agent economy', num: 3 } },
  ],
}

const coingeckoContract: CapabilityContractMetadata = {
  capabilityId: 'coingecko.simple-price-demo',
  version: 1,
  name: 'CoinGecko Bitcoin price (demo key)',
  description: 'Returns the current Bitcoin price in USD through the CoinGecko simple price endpoint using a demo API key; the coin and quote are fixed for this publication.',
  customerAnnotations: [
    { annotationId: 'include_market_cap', document: 'input', pointer: '/include_market_cap', label: 'Include market cap', role: 'constraint' },
    { annotationId: 'include_24hr_vol', document: 'input', pointer: '/include_24hr_vol', label: 'Include 24 hour volume', role: 'constraint' },
    { annotationId: 'include_24hr_change', document: 'input', pointer: '/include_24hr_change', label: 'Include 24 hour change', role: 'constraint' },
    { annotationId: 'include_last_updated_at', document: 'input', pointer: '/include_last_updated_at', label: 'Include last updated time', role: 'constraint' },
    { annotationId: 'bitcoin_price', document: 'output', pointer: '/bitcoin', label: 'Bitcoin price', role: 'completion_evidence' },
  ],
  dataUse: [
    {
      effectId: 'query_release',
      inputPointer: '/include_market_cap',
      classification: 'public',
      phase: 'execution',
      recipient: { kind: 'selected_binding' },
      purposes: ['select_market_cap_inclusion'],
    },
    {
      effectId: 'query_release',
      inputPointer: '/include_24hr_vol',
      classification: 'public',
      phase: 'execution',
      recipient: { kind: 'selected_binding' },
      purposes: ['select_24hr_volume_inclusion'],
    },
    {
      effectId: 'query_release',
      inputPointer: '/include_24hr_change',
      classification: 'public',
      phase: 'execution',
      recipient: { kind: 'selected_binding' },
      purposes: ['select_24hr_change_inclusion'],
    },
    {
      effectId: 'query_release',
      inputPointer: '/include_last_updated_at',
      classification: 'public',
      phase: 'execution',
      recipient: { kind: 'selected_binding' },
      purposes: ['select_last_updated_inclusion'],
    },
  ],
  effects: [{
    effectId: 'query_release',
    class: 'data_release',
    authority: 'mandate_or_explicit',
    reversibility: 'not_applicable',
  }],
  evidence: [{ evidenceId: 'bitcoin_price', outputPointer: '/bitcoin', purpose: 'completion' }],
  lifecycle: { idempotency: 'required', recovery: 'reconcile_required' },
  inputExamples: [
    { label: 'Bitcoin USD', input: {} },
  ],
}

const openweatherOpenApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'OpenWeatherMap Current Weather Data',
    version: '2.5',
    description: 'Official OpenWeatherMap Current Weather Data API contract.',
  },
  servers: [{ url: 'https://api.openweathermap.org/data/2.5' }],
  security: [{ apiKey: [] }],
  components: {
    securitySchemes: {
      apiKey: { type: 'apiKey', in: 'query', name: 'appid' },
    },
  },
  paths: {
    '/weather': {
      get: {
        operationId: 'openweathermap.current-weather',
        description: 'Get the current weather by city name or by latitude and longitude coordinates; the appid API key is sent as a query parameter.',
        parameters: [
          {
            name: 'q',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
              minLength: 1,
              maxLength: 200,
              description: 'City name, optionally suffixed with state and country code (e.g. London or London,uk). Alternate to latitude and longitude.',
            },
          },
          {
            name: 'lat',
            in: 'query',
            required: false,
            schema: { type: 'number', minimum: -90, maximum: 90, description: 'Latitude. Must be supplied with lon; alternate to the city name.' },
          },
          {
            name: 'lon',
            in: 'query',
            required: false,
            schema: { type: 'number', minimum: -180, maximum: 180, description: 'Longitude. Must be supplied with lat; alternate to the city name.' },
          },
        ],
        responses: {
          '200': {
            description: 'Current weather data.',
            content: { 'application/json': { schema: openweatherOutputSchema } },
          },
        },
      },
    },
  },
} as const

const tavilyOpenApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Tavily Search API',
    version: '1.0.0',
    description: 'Official Tavily search contract.',
  },
  servers: [{ url: 'https://api.tavily.com' }],
  security: [{ bearer: [] }],
  components: {
    securitySchemes: {
      bearer: { type: 'http', scheme: 'bearer' },
    },
  },
  paths: {
    '/search': {
      post: {
        operationId: 'tavily.search',
        description: 'Search the web and return bounded agent-oriented results.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: tavilyInputSchema } },
        },
        responses: {
          '200': {
            description: 'Bounded Tavily search results.',
            content: { 'application/json': { schema: tavilyOutputSchema } },
          },
        },
      },
    },
  },
} as const

const serpapiOpenApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'SerpAPI Google Search',
    version: '1.0.0',
    description: 'SerpAPI Google Search contract derived from the public search endpoint documentation.',
  },
  servers: [{ url: 'https://serpapi.com' }],
  security: [{ apiKey: [] }],
  components: {
    securitySchemes: {
      apiKey: { type: 'apiKey', in: 'query', name: 'api_key' },
    },
  },
  paths: {
    '/search': {
      get: {
        operationId: 'serpapi.google-search',
        description: 'Run a Google search; the api_key is sent as a query parameter.',
        parameters: [
          {
            name: 'engine',
            in: 'query',
            required: false,
            schema: { type: 'string', default: 'google', description: 'The search engine to use.' },
          },
          {
            name: 'q',
            'x-ae-input-name': 'q',
            in: 'query',
            required: true,
            schema: { type: 'string', minLength: 1, maxLength: 2_000, description: 'The search query.' },
          },
          {
            name: 'num',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1, maximum: 100, description: 'The number of results to return.' },
          },
          {
            name: 'gl',
            in: 'query',
            required: false,
            schema: { type: 'string', minLength: 2, maxLength: 2, description: 'Country to use for the search (two-letter code).' },
          },
          {
            name: 'hl',
            in: 'query',
            required: false,
            schema: { type: 'string', minLength: 2, maxLength: 8, description: 'Language to use for the search.' },
          },
          {
            name: 'location',
            in: 'query',
            required: false,
            schema: { type: 'string', minLength: 1, maxLength: 200, description: 'Location from which the search is performed.' },
          },
        ],
        responses: {
          '200': {
            description: 'Google search results.',
            content: { 'application/json': { schema: serpapiOutputSchema } },
          },
        },
      },
    },
  },
} as const

const coingeckoOpenApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'CoinGecko Simple Bitcoin Price (Demo)',
    version: '3',
    description: 'Official CoinGecko simple price endpoint bounded to Bitcoin in USD using a demo API key.',
  },
  servers: [{ url: 'https://api.coingecko.com/api/v3' }],
  security: [{ demoApiKey: [] }],
  components: {
    securitySchemes: {
      demoApiKey: { type: 'apiKey', in: 'header', name: 'x-cg-demo-api-key' },
    },
  },
  paths: {
    '/simple/price': {
      get: {
        operationId: 'coingecko.simple-price-demo',
        description: 'Get the current Bitcoin price in USD; the demo API key is sent as the x-cg-demo-api-key request header.',
        parameters: [
          {
            name: 'ids',
            in: 'query',
            required: true,
            schema: {
              type: 'string',
              enum: ['bitcoin'],
              description: 'Fixed Bitcoin coin id for this publication.',
            },
          },
          {
            name: 'vs_currencies',
            in: 'query',
            required: true,
            schema: {
              type: 'string',
              enum: ['usd'],
              description: 'Fixed USD quote currency for this publication.',
            },
          },
          {
            name: 'include_market_cap',
            in: 'query',
            required: false,
            schema: { type: 'boolean', default: false, description: 'Include market cap values.' },
          },
          {
            name: 'include_24hr_vol',
            in: 'query',
            required: false,
            schema: { type: 'boolean', default: false, description: 'Include 24 hour volume values.' },
          },
          {
            name: 'include_24hr_change',
            in: 'query',
            required: false,
            schema: { type: 'boolean', default: false, description: 'Include 24 hour price change percentages.' },
          },
          {
            name: 'include_last_updated_at',
            in: 'query',
            required: false,
            schema: { type: 'boolean', default: false, description: 'Include the last updated timestamp.' },
          },
        ],
        responses: {
          '200': {
            description: 'The current Bitcoin price in USD with optional requested metrics.',
            content: { 'application/json': { schema: coingeckoOutputSchema } },
          },
        },
      },
    },
  },
} as const

export const openweatherPublicationImport: CapabilityPublicationImport = {
  kind: 'openapi_http',
  document: openweatherOpenApiDocument,
  operation: { path: '/weather', method: 'get' },
  contract: openweatherContract,
  commercial: {
    offering: {
      offeringId: 'offering:openweathermap-current-weather:current:v1',
      networkId: AE_PUBLIC_NETWORK,
      presentation: {
        label: 'OpenWeatherMap current weather',
        summary: 'AE-curated external access to the OpenWeatherMap Current Weather Data API using an API key in the query string.',
        price: { kind: 'fixed', ...KEYED_PRICE },
        materialTerms: [
          { termId: 'ae-price-ceiling', label: 'AE price ceiling', value: 'USD 0.01 per invocation.' },
          { ...PAYMENT_TERM },
          { termId: 'provider-cost', label: 'Provider cost', value: 'Provider-funded API usage; no customer payment is submitted.' },
          { termId: 'lookup-mode', label: 'Lookup', value: 'Supply either a city name (q) or a latitude and longitude pair (lat and lon); appid is always required.' },
        ],
        commercialRelationship: {
          kind: 'none',
          summary: 'AE-curated external publication with no commercial relationship to OpenWeatherMap.',
          influencesEligibility: false,
          influencesInclusion: false,
          influencesOrder: false,
          evidenceRefs: [...OPENWEATHER_SOURCE_EVIDENCE],
        },
      },
      searchTerms: ['openweathermap', 'current weather', 'weather', 'temperature', 'forecast conditions'],
      registrationEvidenceRefs: [...OPENWEATHER_SOURCE_EVIDENCE],
    },
    bindingId: 'binding:openweathermap-current-weather:current:api-key:v1',
    authority: OPENWEATHER_AUTHORITY,
    registrationEvidenceRefs: [...OPENWEATHER_SOURCE_EVIDENCE],
    requestTimeoutMs: 15_000,
  },
  evidenceRefs: [...OPENWEATHER_SOURCE_EVIDENCE],
}

export const tavilyPublicationImport: CapabilityPublicationImport = {
  kind: 'openapi_http',
  document: tavilyOpenApiDocument,
  operation: { path: '/search', method: 'post' },
  contract: tavilyContract,
  commercial: {
    offering: {
      offeringId: 'offering:tavily-search:search:v1',
      networkId: AE_PUBLIC_NETWORK,
      presentation: {
        label: 'Tavily search',
        summary: 'AE-curated external access to Tavily web search through the official API with a bearer API key.',
        price: { kind: 'fixed', ...KEYED_PRICE },
        materialTerms: [
          { termId: 'ae-price-ceiling', label: 'AE price ceiling', value: 'USD 0.01 per invocation.' },
          { termId: 'source-attribution', label: 'Source', value: 'Official Tavily documentation and published OpenAPI contract.' },
        ],
        commercialRelationship: {
          kind: 'none',
          summary: 'AE-curated external publication with no commercial relationship to Tavily.',
          influencesEligibility: false,
          influencesInclusion: false,
          influencesOrder: false,
          evidenceRefs: [...TAVILY_SOURCE_EVIDENCE],
        },
      },
      searchTerms: ['tavily', 'web search', 'search the web', 'agent search', 'research'],
      registrationEvidenceRefs: [...TAVILY_SOURCE_EVIDENCE],
    },
    bindingId: 'binding:tavily-search:search:api-key:v1',
    authority: TAVILY_AUTHORITY,
    registrationEvidenceRefs: [...TAVILY_SOURCE_EVIDENCE],
    requestTimeoutMs: 30_000,
  },
  evidenceRefs: [...TAVILY_SOURCE_EVIDENCE],
}

export const serpapiPublicationImport: CapabilityPublicationImport = {
  kind: 'openapi_http',
  document: serpapiOpenApiDocument,
  operation: { path: '/search', method: 'get' },
  contract: serpapiContract,
  commercial: {
    offering: {
      offeringId: 'offering:serpapi-google-search:search:v1',
      networkId: AE_PUBLIC_NETWORK,
      presentation: {
        label: 'SerpAPI Google search',
        summary: 'AE-curated external access to Google search through SerpAPI using an API key in the query string.',
        price: { kind: 'fixed', ...KEYED_PRICE },
        materialTerms: [
          { termId: 'ae-price-ceiling', label: 'AE price ceiling', value: 'USD 0.01 per invocation.' },
          { termId: 'source-attribution', label: 'Source', value: 'SerpAPI search endpoint documentation; no formal OpenAPI contract published.' },
        ],
        commercialRelationship: {
          kind: 'none',
          summary: 'AE-curated external publication with no commercial relationship to SerpAPI.',
          influencesEligibility: false,
          influencesInclusion: false,
          influencesOrder: false,
          evidenceRefs: [...SERPAPI_SOURCE_EVIDENCE],
        },
      },
      searchTerms: ['serpapi', 'google search', 'web search', 'search engine results', 'serp'],
      registrationEvidenceRefs: [...SERPAPI_SOURCE_EVIDENCE],
    },
    bindingId: 'binding:serpapi-google-search:search:api-key:v1',
    authority: SERPAPI_AUTHORITY,
    registrationEvidenceRefs: [...SERPAPI_SOURCE_EVIDENCE],
    requestTimeoutMs: 20_000,
  },
  evidenceRefs: [...SERPAPI_SOURCE_EVIDENCE],
}

export const coingeckoPublicationImport: CapabilityPublicationImport = {
  kind: 'openapi_http',
  document: coingeckoOpenApiDocument,
  operation: { path: '/simple/price', method: 'get' },
  fixedQuery: [
    { parameter: 'ids', value: 'bitcoin' },
    { parameter: 'vs_currencies', value: 'usd' },
  ],
  contract: coingeckoContract,
  commercial: {
    offering: {
      offeringId: 'offering:coingecko-simple-price-demo:price:v1',
      networkId: AE_PUBLIC_NETWORK,
      presentation: {
        label: 'CoinGecko Bitcoin price (demo key)',
        summary: 'AE-curated external access to the current Bitcoin price in USD through CoinGecko using a demo API key header.',
        price: { kind: 'fixed', ...KEYED_PRICE },
        materialTerms: [
          { termId: 'ae-price-ceiling', label: 'AE price ceiling', value: 'USD 0.01 per invocation.' },
          { ...PAYMENT_TERM },
          { termId: 'auth-mode', label: 'Auth', value: 'Sends the API key as the x-cg-demo-api-key request header (header-key variant, unlike query-key providers).' },
        ],
        commercialRelationship: {
          kind: 'none',
          summary: 'AE-curated external publication with no commercial relationship to CoinGecko.',
          influencesEligibility: false,
          influencesInclusion: false,
          influencesOrder: false,
          evidenceRefs: [...COINGECKO_SOURCE_EVIDENCE],
        },
      },
      searchTerms: ['coingecko', 'bitcoin price', 'bitcoin', 'crypto price', 'btc', 'spot price'],
      registrationEvidenceRefs: [...COINGECKO_SOURCE_EVIDENCE],
    },
    bindingId: 'binding:coingecko-simple-price-demo:price:api-key:v1',
    authority: COINGECKO_AUTHORITY,
    registrationEvidenceRefs: [...COINGECKO_SOURCE_EVIDENCE],
    requestTimeoutMs: 15_000,
  },
  evidenceRefs: [...COINGECKO_SOURCE_EVIDENCE],
}

type CuratedClusterBPublication = Readonly<{
  businessSlug: string
  publication: CapabilityPublicationImport
}>

export const CLUSTER_B_PUBLICATIONS = [
  { businessSlug: 'openweathermap-current-weather', publication: openweatherPublicationImport },
  { businessSlug: 'tavily-search', publication: tavilyPublicationImport },
  { businessSlug: 'serpapi-google-search', publication: serpapiPublicationImport },
  { businessSlug: 'coingecko-simple-price-demo', publication: coingeckoPublicationImport },
] as const satisfies readonly CuratedClusterBPublication[]
