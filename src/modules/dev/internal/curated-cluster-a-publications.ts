import type {
  CapabilityContractMetadata,
  CapabilityPublicationImport,
} from '@/modules/capability-supply/public'

const AE_PUBLIC_NETWORK = 'ae:public'
const KEYLESS_AUTHORITY = { kind: 'keyless' } as const
const KEYLESS_PRICE = {
  kind: 'fixed',
  amount: { currency: 'USD', units: '0', exponent: 2 },
} as const

// ---- Open-Meteo forecast -------------------------------------------------------------

const OPEN_METEO_FORECAST_SOURCE_EVIDENCE = [
  'https://open-meteo.com/en/docs',
  'https://api.open-meteo.com/v1/forecast',
] as const

const openMeteoForecastInputSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    latitude: {
      type: 'number',
      minimum: -90,
      maximum: 90,
      description: 'Latitude (WGS84) of the location, e.g. 52.52.',
    },
    longitude: {
      type: 'number',
      minimum: -180,
      maximum: 180,
      description: 'Longitude (WGS84) of the location, e.g. 13.41.',
    },
    current_weather: {
      type: 'boolean',
      default: true,
      description: 'Include the current weather condition.',
    },
    hourly: {
      type: 'string',
      maxLength: 200,
      description: 'Comma-separated hourly weather variables to include.',
    },
    daily: {
      type: 'string',
      maxLength: 200,
      description: 'Comma-separated daily weather variables to include.',
    },
    temperature_unit: {
      type: 'string',
      enum: ['celsius', 'fahrenheit'],
      default: 'celsius',
      description: 'Temperature unit for the response.',
    },
    windspeed_unit: {
      type: 'string',
      enum: ['kmh', 'ms', 'mph', 'kn'],
      default: 'kmh',
      description: 'Wind speed unit for the response.',
    },
    timezone: {
      type: 'string',
      default: 'GMT',
      maxLength: 120,
      description: 'IANA timezone (e.g. Europe/Berlin) or auto.',
    },
    forecast_days: {
      type: 'integer',
      minimum: 1,
      maximum: 16,
      default: 7,
      description: 'Number of forecast days to return.',
    },
    models: {
      type: 'string',
      maxLength: 200,
      description: 'Comma-separated weather model names to combine.',
    },
  },
  required: ['latitude', 'longitude', 'current_weather'],
  additionalProperties: false,
} as const

const openMeteoForecastOutputSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    latitude: { type: 'number' },
    longitude: { type: 'number' },
    generationtime_ms: { type: 'number' },
    utc_offset_seconds: { type: 'number' },
    timezone: { type: 'string' },
    timezone_abbreviation: { type: 'string' },
    current_weather_units: {
      type: 'object',
      properties: {
        time: { type: 'string' },
        interval: { type: 'string' },
        temperature: { type: 'string' },
        windspeed: { type: 'string' },
        winddirection: { type: 'string' },
        weathercode: { type: 'string' },
        is_day: { type: 'string' },
      },
      required: ['time', 'interval', 'temperature', 'windspeed', 'winddirection', 'weathercode', 'is_day'],
      additionalProperties: false,
    },
    elevation: { type: 'number' },
    current_weather: {
      type: 'object',
      properties: {
        temperature: { type: 'number' },
        windspeed: { type: 'number' },
        winddirection: { type: 'number' },
        weathercode: { type: 'number' },
        is_day: { type: 'integer' },
        time: { type: 'string' },
        interval: { type: 'integer' },
      },
      required: ['temperature', 'windspeed', 'winddirection', 'weathercode', 'is_day', 'time', 'interval'],
      additionalProperties: false,
    },
  },
  required: ['latitude', 'longitude', 'generationtime_ms', 'timezone'],
} as const

const openMeteoForecastContract: CapabilityContractMetadata = {
  capabilityId: 'open-meteo.forecast',
  version: 1,
  name: 'Open-Meteo weather forecast',
  description: 'Returns a public weather forecast (current, hourly, or daily) for a latitude/longitude through the keyless Open-Meteo API.',
  customerAnnotations: [
    { annotationId: 'latitude', document: 'input', pointer: '/latitude', label: 'Latitude', role: 'request' },
    { annotationId: 'longitude', document: 'input', pointer: '/longitude', label: 'Longitude', role: 'request' },
    { annotationId: 'forecast', document: 'output', pointer: '/generationtime_ms', label: 'Weather forecast generated', role: 'completion_evidence' },
  ],
  dataUse: [
    {
      effectId: 'query_release', inputPointer: '/latitude', classification: 'public',
      phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['retrieve_weather_forecast'],
    },
    {
      effectId: 'query_release', inputPointer: '/longitude', classification: 'public',
      phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['retrieve_weather_forecast'],
    },
    {
      effectId: 'query_release', inputPointer: '/current_weather', classification: 'public',
      phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['select_current_weather'],
    },
    {
      effectId: 'query_release', inputPointer: '/hourly', classification: 'public',
      phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['select_hourly_variables'],
    },
    {
      effectId: 'query_release', inputPointer: '/daily', classification: 'public',
      phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['select_daily_variables'],
    },
    {
      effectId: 'query_release', inputPointer: '/temperature_unit', classification: 'public',
      phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['select_temperature_unit'],
    },
    {
      effectId: 'query_release', inputPointer: '/windspeed_unit', classification: 'public',
      phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['select_windspeed_unit'],
    },
    {
      effectId: 'query_release', inputPointer: '/timezone', classification: 'public',
      phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['select_response_timezone'],
    },
    {
      effectId: 'query_release', inputPointer: '/forecast_days', classification: 'public',
      phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['select_forecast_horizon'],
    },
    {
      effectId: 'query_release', inputPointer: '/models', classification: 'public',
      phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['select_weather_model'],
    },
  ],
  effects: [{
    effectId: 'query_release', class: 'data_release', authority: 'mandate_or_explicit', reversibility: 'not_applicable',
  }],
  evidence: [{ evidenceId: 'forecast', outputPointer: '/generationtime_ms', purpose: 'completion' }],
  lifecycle: { idempotency: 'required', recovery: 'reconcile_required' },
  inputExamples: [
    { label: 'Paris weather', input: { latitude: 48.857, longitude: 2.352, current_weather: true } },
    { label: 'London weather', input: { latitude: 51.5074, longitude: -0.1278, current_weather: true } },
  ],
}

const openMeteoForecastPublication: CapabilityPublicationImport = {
  kind: 'openapi_http',
  document: {
    openapi: '3.1.0',
    info: {
      title: 'Open-Meteo Forecast API',
      version: '1',
      description: 'Public keyless weather forecast API (documentation, not shipped OpenAPI).',
    },
    servers: [{ url: 'https://api.open-meteo.com/v1' }],
    paths: {
      '/forecast': {
        get: {
          operationId: 'open-meteo.forecast',
          description: 'Returns a public weather forecast for a latitude/longitude.',
          parameters: [
            { name: 'latitude', in: 'query', required: true, schema: { type: 'number', minimum: -90, maximum: 90 } },
            { name: 'longitude', in: 'query', required: true, schema: { type: 'number', minimum: -180, maximum: 180 } },
            { name: 'current_weather', in: 'query', required: true, schema: { type: 'boolean', default: true } },
            { name: 'hourly', in: 'query', required: false, schema: { type: 'string', maxLength: 200 } },
            { name: 'daily', in: 'query', required: false, schema: { type: 'string', maxLength: 200 } },
            { name: 'temperature_unit', in: 'query', required: false, schema: { type: 'string', enum: ['celsius', 'fahrenheit'] } },
            { name: 'windspeed_unit', in: 'query', required: false, schema: { type: 'string', enum: ['kmh', 'ms', 'mph', 'kn'] } },
            { name: 'timezone', in: 'query', required: false, schema: { type: 'string', maxLength: 120 } },
            { name: 'forecast_days', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 16 } },
            { name: 'models', in: 'query', required: false, schema: { type: 'string', maxLength: 200 } },
          ],
          responses: {
            '200': {
              description: 'Weather forecast for the requested coordinates.',
              content: { 'application/json': { schema: openMeteoForecastOutputSchema } },
            },
          },
        },
      },
    },
  },
  operation: { path: '/forecast', method: 'get' },
  contract: openMeteoForecastContract,
  commercial: {
    offering: {
      offeringId: 'offering:open-meteo-forecast:forecast:v1',
      networkId: AE_PUBLIC_NETWORK,
      presentation: {
        label: 'Open-Meteo weather forecast',
        summary: 'AE-curated keyless access to public weather forecasts (current, hourly, daily) via Open-Meteo.',
        price: { ...KEYLESS_PRICE },
        materialTerms: [
          { termId: 'provider-cost', label: 'Provider cost', value: 'Public keyless HTTPS; platform-funded provider cost is USD 0.' },
          { termId: 'usage-boundary', label: 'Use', value: 'Subject to the Open-Meteo free non-commercial fair-use limits; not a commercial weather guarantee.' },
          { termId: 'source-attribution', label: 'Source', value: 'Open-Meteo free weather API; docs-not-OpenAPI derivation from official documentation.' },
        ],
        commercialRelationship: {
          kind: 'none',
          summary: 'AE-curated external publication with no commercial relationship to Open-Meteo.',
          influencesEligibility: false,
          influencesInclusion: false,
          influencesOrder: false,
          evidenceRefs: [...OPEN_METEO_FORECAST_SOURCE_EVIDENCE],
        },
      },
      searchTerms: ['weather', 'forecast', 'temperature', 'current weather', 'hourly forecast', 'open-meteo'],
      registrationEvidenceRefs: [...OPEN_METEO_FORECAST_SOURCE_EVIDENCE],
    },
    bindingId: 'binding:open-meteo-forecast:forecast:v1',
    authority: KEYLESS_AUTHORITY,
    registrationEvidenceRefs: [...OPEN_METEO_FORECAST_SOURCE_EVIDENCE],
    requestTimeoutMs: 10_000,
  },
  evidenceRefs: [...OPEN_METEO_FORECAST_SOURCE_EVIDENCE],
}

// ---- Open-Meteo geocoding -----------------------------------------------------------

const OPEN_METEO_GEOCODING_SOURCE_EVIDENCE = [
  'https://open-meteo.com/en/docs/geocoding-api',
  'https://geocoding-api.open-meteo.com/v1/search',
] as const

const openMeteoGeocodingInputSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    name: {
      type: 'string',
      minLength: 1,
      maxLength: 200,
      description: 'Location name or search query to geocode, e.g. Berlin.',
    },
    count: {
      type: 'integer',
      minimum: 1,
      maximum: 100,
      default: 10,
      description: 'Maximum number of matches to return.',
    },
    language: {
      type: 'string',
      maxLength: 20,
      default: 'en',
      description: 'Language of the returned location names.',
    },
    format: {
      type: 'string',
      enum: ['json'],
      default: 'json',
      description: 'Response format.',
    },
  },
  required: ['name'],
  additionalProperties: false,
} as const

const openMeteoGeocodingOutputSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          latitude: { type: 'number' },
          longitude: { type: 'number' },
          elevation: { type: 'number' },
          country_code: { type: 'string' },
          country: { type: 'string' },
          timezone: { type: 'string' },
          population: { type: 'integer' },
        },
        required: ['id', 'name', 'latitude', 'longitude'],
        additionalProperties: false,
      },
    },
    generationtime_ms: { type: 'number' },
  },
  required: ['results'],
} as const

const openMeteoGeocodingContract: CapabilityContractMetadata = {
  capabilityId: 'open-meteo.geocoding',
  version: 1,
  name: 'Open-Meteo geocoding search',
  description: 'Searches place names and returns matching coordinates and metadata through the keyless Open-Meteo geocoding API.',
  customerAnnotations: [
    { annotationId: 'name', document: 'input', pointer: '/name', label: 'Location name', role: 'request' },
    { annotationId: 'results', document: 'output', pointer: '/results', label: 'Geocoding matches', role: 'completion_evidence' },
  ],
  dataUse: [
    {
      effectId: 'query_release', inputPointer: '/name', classification: 'public',
      phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['geocode_location_name'],
    },
    {
      effectId: 'query_release', inputPointer: '/count', classification: 'public',
      phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['bound_geocoding_matches'],
    },
    {
      effectId: 'query_release', inputPointer: '/language', classification: 'public',
      phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['select_geocoding_language'],
    },
    {
      effectId: 'query_release', inputPointer: '/format', classification: 'public',
      phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['select_geocoding_format'],
    },
  ],
  effects: [{
    effectId: 'query_release', class: 'data_release', authority: 'mandate_or_explicit', reversibility: 'not_applicable',
  }],
  evidence: [{ evidenceId: 'results', outputPointer: '/results', purpose: 'completion' }],
  lifecycle: { idempotency: 'required', recovery: 'reconcile_required' },
  inputExamples: [
    { label: 'Paris coords', input: { name: 'Paris', count: 5 } },
    { label: 'Berlin coords', input: { name: 'Berlin', count: 3 } },
  ],
}

const openMeteoGeocodingPublication: CapabilityPublicationImport = {
  kind: 'openapi_http',
  document: {
    openapi: '3.1.0',
    info: {
      title: 'Open-Meteo Geocoding API',
      version: '1',
      description: 'Public keyless geocoding search API (documentation, not shipped OpenAPI).',
    },
    servers: [{ url: 'https://geocoding-api.open-meteo.com/v1' }],
    paths: {
      '/search': {
        get: {
          operationId: 'open-meteo.geocoding',
          description: 'Searches place names and returns matching coordinates and metadata.',
          parameters: [
            { name: 'name', in: 'query', required: true, schema: { type: 'string', minLength: 1, maxLength: 200 } },
            { name: 'count', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 100 } },
            { name: 'language', in: 'query', required: false, schema: { type: 'string', maxLength: 20 } },
            { name: 'format', in: 'query', required: false, schema: { type: 'string', enum: ['json'] } },
          ],
          responses: {
            '200': {
              description: 'Geocoding matches for the requested place name.',
              content: { 'application/json': { schema: openMeteoGeocodingOutputSchema } },
            },
          },
        },
      },
    },
  },
  operation: { path: '/search', method: 'get' },
  contract: openMeteoGeocodingContract,
  commercial: {
    offering: {
      offeringId: 'offering:open-meteo-geocoding:search:v1',
      networkId: AE_PUBLIC_NETWORK,
      presentation: {
        label: 'Open-Meteo geocoding search',
        summary: 'AE-curated keyless access to place-name geocoding via Open-Meteo.',
        price: { ...KEYLESS_PRICE },
        materialTerms: [
          { termId: 'provider-cost', label: 'Provider cost', value: 'Public keyless HTTPS; platform-funded provider cost is USD 0.' },
          { termId: 'usage-boundary', label: 'Use', value: 'Subject to the Open-Meteo free non-commercial fair-use limits.' },
          { termId: 'source-attribution', label: 'Source', value: 'Official Open-Meteo geocoding API documentation.' },
        ],
        commercialRelationship: {
          kind: 'none',
          summary: 'AE-curated external publication with no commercial relationship to Open-Meteo.',
          influencesEligibility: false,
          influencesInclusion: false,
          influencesOrder: false,
          evidenceRefs: [...OPEN_METEO_GEOCODING_SOURCE_EVIDENCE],
        },
      },
      searchTerms: ['geocode', 'geocoding', 'place search', 'place lookup', 'city coordinates', 'coordinates lookup', 'location lookup', 'find location'],
      registrationEvidenceRefs: [...OPEN_METEO_GEOCODING_SOURCE_EVIDENCE],
    },
    bindingId: 'binding:open-meteo-geocoding:search:v1',
    authority: KEYLESS_AUTHORITY,
    registrationEvidenceRefs: [...OPEN_METEO_GEOCODING_SOURCE_EVIDENCE],
    requestTimeoutMs: 10_000,
  },
  evidenceRefs: [...OPEN_METEO_GEOCODING_SOURCE_EVIDENCE],
}

// ---- Wikipedia REST page summary ----------------------------------------------------

const WIKIPEDIA_SUMMARY_SOURCE_EVIDENCE = [
  'https://www.mediawiki.org/wiki/API:REST_API',
  'https://en.wikipedia.org/api/rest_v1/page/summary',
] as const

const wikipediaSummaryInputSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    title: {
      type: 'string',
      minLength: 1,
      maxLength: 300,
      description: 'Wikipedia page title whose summary is requested (a URL path segment in the real REST API).',
    },
    redirect: {
      type: 'boolean',
      description: 'Whether to follow redirects to the final page title.',
    },
  },
  required: ['title'],
  additionalProperties: false,
} as const

const wikipediaSummaryOutputSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    title: { type: 'string' },
    displaytitle: { type: 'string' },
    pageid: { type: 'integer' },
    extract: { type: 'string' },
    description: { type: 'string' },
    thumbnail: {
      type: 'object',
      properties: {
        source: { type: 'string', format: 'uri' },
        width: { type: 'integer' },
        height: { type: 'integer' },
      },
      required: ['source'],
      additionalProperties: false,
    },
  },
  required: ['title', 'extract'],
} as const

const wikipediaSummaryContract: CapabilityContractMetadata = {
  capabilityId: 'wikipedia-rest.page-summary',
  version: 1,
  name: 'Wikipedia page summary',
  description: 'Returns a plain-text summary and metadata for a Wikipedia page through the keyless REST summary endpoint.',
  customerAnnotations: [
    { annotationId: 'title', document: 'input', pointer: '/title', label: 'Page title', role: 'request' },
    { annotationId: 'summary', document: 'output', pointer: '/extract', label: 'Page summary', role: 'completion_evidence' },
  ],
  dataUse: [
    {
      effectId: 'query_release', inputPointer: '/title', classification: 'public',
      phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['retrieve_wikipedia_summary'],
    },
    {
      effectId: 'query_release', inputPointer: '/redirect', classification: 'public',
      phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['follow_page_redirect'],
    },
  ],
  effects: [{
    effectId: 'query_release', class: 'data_release', authority: 'mandate_or_explicit', reversibility: 'not_applicable',
  }],
  evidence: [{ evidenceId: 'summary', outputPointer: '/extract', purpose: 'completion' }],
  lifecycle: { idempotency: 'required', recovery: 'reconcile_required' },
  inputExamples: [
    { label: 'Paris summary', input: { title: 'Paris' } },
    { label: 'OpenAI summary', input: { title: 'OpenAI' } },
  ],
}

const wikipediaSummaryPublication: CapabilityPublicationImport = {
  kind: 'openapi_http',
  document: {
    openapi: '3.1.0',
    info: {
      title: 'Wikipedia REST API',
      version: '1',
      description: 'Public keyless MediaWiki REST summary endpoint.',
    },
    servers: [{ url: 'https://en.wikipedia.org' }],
    paths: {
      '/api/rest_v1/page/summary': {
        get: {
          operationId: 'wikipedia-rest.page-summary',
          description: 'Returns a plain-text summary for a Wikipedia page title.',
          parameters: [
            { name: 'title', in: 'query', required: true, schema: { type: 'string', minLength: 1, maxLength: 300 } },
            { name: 'redirect', in: 'query', required: false, schema: { type: 'boolean' } },
          ],
          responses: {
            '200': {
              description: 'Wikipedia page summary and metadata.',
              content: { 'application/json': { schema: wikipediaSummaryOutputSchema } },
            },
          },
        },
      },
    },
  },
  operation: { path: '/api/rest_v1/page/summary', method: 'get' },
  contract: wikipediaSummaryContract,
  commercial: {
    offering: {
      offeringId: 'offering:wikipedia-rest-summary:page-summary:v1',
      networkId: AE_PUBLIC_NETWORK,
      presentation: {
        label: 'Wikipedia page summary',
        summary: 'AE-curated keyless access to Wikipedia page summaries via the MediaWiki REST API.',
        price: { ...KEYLESS_PRICE },
        materialTerms: [
          { termId: 'provider-cost', label: 'Provider cost', value: 'Public keyless HTTPS with permissive CORS; platform-funded provider cost is USD 0.' },
          { termId: 'usage-boundary', label: 'Use', value: 'Subject to Wikimedia fair-use and rate limits; content remains CC BY-SA licensed.' },
          { termId: 'source-attribution', label: 'Source', value: 'Official MediaWiki REST API documentation.' },
          { termId: 'shape-note', label: 'Shape', value: 'For the generic GET harness, the required title is mapped as a query input; in the real REST API it is a URL path segment (…/summary/{title}).' },
        ],
        commercialRelationship: {
          kind: 'none',
          summary: 'AE-curated external publication with no commercial relationship to the Wikimedia Foundation.',
          influencesEligibility: false,
          influencesInclusion: false,
          influencesOrder: false,
          evidenceRefs: [...WIKIPEDIA_SUMMARY_SOURCE_EVIDENCE],
        },
      },
      searchTerms: ['wikipedia', 'page summary', 'article summary', 'encyclopedia', 'wiki extract'],
      registrationEvidenceRefs: [...WIKIPEDIA_SUMMARY_SOURCE_EVIDENCE],
    },
    bindingId: 'binding:wikipedia-rest-summary:page-summary:v1',
    authority: KEYLESS_AUTHORITY,
    registrationEvidenceRefs: [...WIKIPEDIA_SUMMARY_SOURCE_EVIDENCE],
    requestTimeoutMs: 10_000,
  },
  evidenceRefs: [...WIKIPEDIA_SUMMARY_SOURCE_EVIDENCE],
}

// ---- Mockster random cat images ----------------------------------------------------

const MOCKSTER_CAT_IMAGES_SOURCE_EVIDENCE = [
  'https://mockster.dev/docs/api/images',
  'https://api.mockster.dev/api/v1/images',
  'https://loremflickr.com/',
] as const

const mocksterCatImagesInputSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    count: {
      type: 'integer',
      minimum: 1,
      maximum: 10,
      default: 10,
      description: 'Exact number of random cat image results to return.',
    },
  },
  required: [],
  additionalProperties: false,
} as const

const mocksterCatImagesOutputSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'array',
  minItems: 1,
  maxItems: 10,
  items: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      url: { type: 'string', format: 'uri' },
    },
    required: ['name', 'url'],
    additionalProperties: false,
  },
} as const

const mocksterCatImagesContract: CapabilityContractMetadata = {
  capabilityId: 'mockster.cat-images',
  version: 1,
  name: 'Random cat image batch',
  description: 'Returns the requested number of random cat image links through Mockster’s keyless image endpoint.',
  customerAnnotations: [
    { annotationId: 'image_link', semanticIdentity: 'https-link', document: 'output', pointer: '/0/url', label: 'Cat image link', role: 'completion_evidence' },
  ],
  dataUse: [
    {
      effectId: 'query_release', inputPointer: '/count', classification: 'public',
      phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['bound_image_result_count'],
    },
  ],
  effects: [{
    effectId: 'query_release', class: 'data_release', authority: 'mandate_or_explicit', reversibility: 'not_applicable',
  }],
  evidence: [{ evidenceId: 'image_link', outputPointer: '/0/url', purpose: 'completion' }],
  lifecycle: { idempotency: 'required', recovery: 'reconcile_required' },
  inputExamples: [
    { label: 'One cat', input: { count: 1 } },
  ],
}

const mocksterCatImagesPublication: CapabilityPublicationImport = {
  kind: 'openapi_http',
  document: {
    openapi: '3.1.0',
    info: {
      title: 'Mockster',
      version: '1',
      description: 'Public keyless random image data API.',
    },
    servers: [{ url: 'https://api.mockster.dev/api/v1' }],
    paths: {
      '/images': {
        get: {
          operationId: 'mockster.cat-images',
          description: 'Returns the caller-requested number of random cat image URLs.',
          parameters: [
            { name: 'category', in: 'query', required: false, schema: { type: 'string', enum: ['cats'] } },
            { name: 'count', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 10 } },
          ],
          responses: {
            '200': {
              description: 'An array containing the requested number of cat image records.',
              content: { 'application/json': { schema: mocksterCatImagesOutputSchema } },
            },
          },
        },
      },
    },
  },
  operation: { path: '/images', method: 'get' },
  fixedQuery: [{ parameter: 'category', value: 'cats' }],
  contract: mocksterCatImagesContract,
  commercial: {
    offering: {
      offeringId: 'offering:mockster-cat-images:cat-images:v1',
      networkId: AE_PUBLIC_NETWORK,
      presentation: {
        label: 'Random cat image batch',
        summary: 'AE-curated keyless access to exact-size batches of random cat image links via Mockster.',
        price: { ...KEYLESS_PRICE },
        materialTerms: [
          { termId: 'provider-cost', label: 'Provider cost', value: 'Public keyless HTTPS; platform-funded provider cost is USD 0.' },
          { termId: 'usage-boundary', label: 'Use', value: 'AE bounds each request to 1–10 images; Mockster documents Count as the number of returned objects.' },
          { termId: 'source-attribution', label: 'Source', value: 'Official Mockster image API; image links are supplied by LoremFlickr and retain upstream licensing and attribution requirements.' },
        ],
        commercialRelationship: {
          kind: 'none',
          summary: 'AE-curated external publication with no commercial relationship to Mockster or LoremFlickr.',
          influencesEligibility: false,
          influencesInclusion: false,
          influencesOrder: false,
          evidenceRefs: [...MOCKSTER_CAT_IMAGES_SOURCE_EVIDENCE],
        },
      },
      searchTerms: ['cat', 'cat images', 'random cat', 'cat photo', 'cute cat pictures'],
      registrationEvidenceRefs: [...MOCKSTER_CAT_IMAGES_SOURCE_EVIDENCE],
    },
    bindingId: 'binding:mockster-cat-images:cat-images:v1',
    authority: KEYLESS_AUTHORITY,
    registrationEvidenceRefs: [...MOCKSTER_CAT_IMAGES_SOURCE_EVIDENCE],
    requestTimeoutMs: 10_000,
  },
  evidenceRefs: [...MOCKSTER_CAT_IMAGES_SOURCE_EVIDENCE],
}

// ---- CoinGecko simple price (keyless) ----------------------------------------------

const COINGECKO_SIMPLE_PRICE_SOURCE_EVIDENCE = [
  'https://docs.coingecko.com/reference/simple-price',
  'https://api.coingecko.com/api/v3/simple/price',
] as const

const coingeckoSimplePriceIdsSchema = {
  type: 'string',
  minLength: 1,
  maxLength: 515,
  pattern: '^[A-Za-z0-9_-]+(?:,[A-Za-z0-9_-]+)*$',
  description: 'Comma-separated CoinGecko coin ids (e.g. bitcoin,ethereum).',
} as const

const coingeckoSimplePriceCurrenciesSchema = {
  type: 'string',
  minLength: 1,
  maxLength: 120,
  pattern: '^[A-Za-z0-9_-]+(?:,[A-Za-z0-9_-]+)*$',
  description: 'Comma-separated quote currencies (e.g. usd,eur).',
} as const

const coingeckoSimplePriceIncludeChangeSchema = {
  type: 'boolean',
  description: 'Whether to include the 24-hour percentage price change.',
} as const

const coingeckoSimplePriceInputSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    ids: coingeckoSimplePriceIdsSchema,
    vs_currencies: coingeckoSimplePriceCurrenciesSchema,
    include_24hr_change: coingeckoSimplePriceIncludeChangeSchema,
  },
  required: ['ids', 'vs_currencies'],
  additionalProperties: false,
} as const

const coingeckoQuotePricesSchema = {
  type: 'object',
  minProperties: 1,
  additionalProperties: { type: 'number' },
} as const

const coingeckoSimplePriceOutputSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  minProperties: 1,
  description: 'A dynamic map of requested CoinGecko coin ids to quote-currency price records.',
  additionalProperties: coingeckoQuotePricesSchema,
} as const

const coingeckoSimplePriceContract: CapabilityContractMetadata = {
  capabilityId: 'coingecko.simple-price',
  version: 1,
  name: 'CoinGecko simple price',
  description: 'Returns current CoinGecko prices for caller-requested coin ids and quote currencies through the keyless simple/price endpoint.',
  customerAnnotations: [
    { annotationId: 'ids', document: 'input', pointer: '/ids', label: 'Coin ids', role: 'request' },
    { annotationId: 'vs_currencies', document: 'input', pointer: '/vs_currencies', label: 'Quote currencies', role: 'request' },
    { annotationId: 'prices', document: 'output', pointer: '', label: 'Coin prices', role: 'completion_evidence' },
  ],
  dataUse: [
    {
      effectId: 'query_release', inputPointer: '/ids', classification: 'public',
      phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['retrieve_crypto_prices'],
    },
    {
      effectId: 'query_release', inputPointer: '/vs_currencies', classification: 'public',
      phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['retrieve_crypto_prices'],
    },
    {
      effectId: 'query_release', inputPointer: '/include_24hr_change', classification: 'public',
      phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['include_price_change'],
    },
  ],
  effects: [{
    effectId: 'query_release', class: 'data_release', authority: 'mandate_or_explicit', reversibility: 'not_applicable',
  }],
  evidence: [{ evidenceId: 'prices', outputPointer: '', purpose: 'completion' }],
  lifecycle: { idempotency: 'required', recovery: 'reconcile_required' },
  inputExamples: [
    { label: 'bitcoin price', input: { ids: 'bitcoin', vs_currencies: 'usd' } },
    { label: 'ethereum price', input: { ids: 'ethereum', vs_currencies: 'usd' } },
    { label: 'bitcoin and ethereum comparison', input: { ids: 'bitcoin,ethereum', vs_currencies: 'usd', include_24hr_change: true } },
  ],
}

const coingeckoSimplePricePublication: CapabilityPublicationImport = {
  kind: 'openapi_http',
  document: {
    openapi: '3.1.0',
    info: {
      title: 'CoinGecko API',
      version: '3',
      description: 'Public CoinGecko simple price endpoint (keyless availability may be rate limited).',
    },
    servers: [{ url: 'https://api.coingecko.com/api/v3' }],
    paths: {
      '/simple/price': {
        get: {
          operationId: 'coingecko.simple-price',
          description: 'Returns current prices for the requested coin ids and quote currencies.',
          parameters: [
            { name: 'ids', in: 'query', required: true, schema: coingeckoSimplePriceInputSchema.properties.ids },
            { name: 'vs_currencies', in: 'query', required: true, schema: coingeckoSimplePriceInputSchema.properties.vs_currencies },
            { name: 'include_24hr_change', in: 'query', required: false, schema: coingeckoSimplePriceInputSchema.properties.include_24hr_change },
          ],
          responses: {
            '200': {
              description: 'A dynamic map of coin ids to requested quote-currency prices.',
              content: { 'application/json': { schema: coingeckoSimplePriceOutputSchema } },
            },
          },
        },
      },
    },
  },
  operation: { path: '/simple/price', method: 'get' },
  contract: coingeckoSimplePriceContract,
  commercial: {
    offering: {
      offeringId: 'offering:coingecko-simple-price-keyless:simple-price:v1',
      networkId: AE_PUBLIC_NETWORK,
      presentation: {
        label: 'CoinGecko simple price',
        summary: 'AE-curated keyless access to current caller-requested coin prices via the CoinGecko simple/price endpoint.',
        price: { ...KEYLESS_PRICE },
        materialTerms: [
          { termId: 'provider-cost', label: 'Provider cost', value: 'Public keyless HTTPS; public (non-premium) rate limits apply; platform-funded provider cost is USD 0.' },
          { termId: 'usage-boundary', label: 'Use', value: 'Reference prices only; not investment advice or a tradable quote.' },
          { termId: 'source-attribution', label: 'Source', value: 'Official CoinGecko simple-price reference.' },
          { termId: 'shape-note', label: 'Shape', value: 'Raw CoinGecko simple/price output for the caller-requested coin ids and quote currencies.' },
        ],
        commercialRelationship: {
          kind: 'none',
          summary: 'AE-curated external publication with no commercial relationship to CoinGecko.',
          influencesEligibility: false,
          influencesInclusion: false,
          influencesOrder: false,
          evidenceRefs: [...COINGECKO_SIMPLE_PRICE_SOURCE_EVIDENCE],
        },
      },
      searchTerms: [
        'crypto price', 'bitcoin price', 'ethereum price', 'coin price', 'crypto',
        'bitcoin', 'btc', 'ethereum', 'eth', 'coingecko', 'cryptocurrency price', 'compare crypto prices', 'price',
      ],
      registrationEvidenceRefs: [...COINGECKO_SIMPLE_PRICE_SOURCE_EVIDENCE],
    },
    bindingId: 'binding:coingecko-simple-price-keyless:simple-price:v1',
    authority: KEYLESS_AUTHORITY,
    registrationEvidenceRefs: [...COINGECKO_SIMPLE_PRICE_SOURCE_EVIDENCE],
    requestTimeoutMs: 10_000,
  },
  evidenceRefs: [...COINGECKO_SIMPLE_PRICE_SOURCE_EVIDENCE],
}
// ---- ipify public IP ---------------------------------------------------------------

const IPIFY_SOURCE_EVIDENCE = [
  'https://geo.ipify.org/docs',
  'https://api.ipify.org',
] as const

const ipifyInputSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
  },
  required: [],
  additionalProperties: false,
} as const

const ipifyOutputSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    ip: { type: 'string' },
  },
  required: ['ip'],
  additionalProperties: false,
} as const

const ipifyContract: CapabilityContractMetadata = {
  capabilityId: 'ipify.public-ip',
  version: 1,
  name: 'Get AE runtime public IP',
  description: 'Returns the AE runtime server egress IPv4 address observed by the keyless ipify endpoint.',
  customerAnnotations: [
    { annotationId: 'ip', document: 'output', pointer: '/ip', label: 'AE runtime public IP', role: 'completion_evidence' },
  ],
  dataUse: [],
  effects: [],
  evidence: [{ evidenceId: 'ip', outputPointer: '/ip', purpose: 'completion' }],
  lifecycle: { idempotency: 'required', recovery: 'reconcile_required' },
  inputExamples: [
    { label: 'Current IP', input: {} },
  ],
}

const ipifyPublication: CapabilityPublicationImport = {
  kind: 'openapi_http',
  document: {
    openapi: '3.1.0',
    info: {
      title: 'ipify API',
      version: '1',
      description: 'Simple public IP address lookup API.',
    },
    servers: [{ url: 'https://api.ipify.org' }],
    paths: {
      '/.': {
        get: {
          operationId: 'ipify.public-ip',
          description: 'Returns the AE runtime server egress public IP address at the ipify root endpoint.',
          parameters: [
            { name: 'format', in: 'query', required: false, schema: { type: 'string', enum: ['json', 'jsonp', 'text'] } },
          ],
          responses: {
            '200': {
              description: 'The public IP address.',
              content: { 'application/json': { schema: ipifyOutputSchema } },
            },
          },
        },
      },
    },
  },
  operation: { path: '/.', method: 'get' },
  fixedQuery: [{ parameter: 'format', value: 'json' }],
  contract: ipifyContract,
  commercial: {
    offering: {
      offeringId: 'offering:ipify:public-ip:v1',
      networkId: AE_PUBLIC_NETWORK,
      presentation: {
        label: 'Get AE runtime public IP',
        summary: 'AE-curated keyless observation of the AE runtime server egress IPv4 address via ipify.',
        price: { ...KEYLESS_PRICE },
        materialTerms: [
          { termId: 'provider-cost', label: 'Provider cost', value: 'Public keyless HTTPS; platform-funded provider cost is USD 0.' },
          { termId: 'usage-boundary', label: 'Use', value: 'Returns the AE runtime server egress public IP only; it does not identify the human user or their device.' },
          { termId: 'source-attribution', label: 'Source', value: 'Official ipify documentation.' },
        ],
        commercialRelationship: {
          kind: 'none',
          summary: 'AE-curated external publication with no commercial relationship to ipify.',
          influencesEligibility: false,
          influencesInclusion: false,
          influencesOrder: false,
          evidenceRefs: [...IPIFY_SOURCE_EVIDENCE],
        },
      },
      searchTerms: ['public ip', 'ip address', 'what is my ip', 'my ip', 'ipify'],
      registrationEvidenceRefs: [...IPIFY_SOURCE_EVIDENCE],
    },
    bindingId: 'binding:ipify:public-ip:v1',
    authority: KEYLESS_AUTHORITY,
    registrationEvidenceRefs: [...IPIFY_SOURCE_EVIDENCE],
    requestTimeoutMs: 10_000,
  },
  evidenceRefs: [...IPIFY_SOURCE_EVIDENCE],
}

type ClusterAPublication = Readonly<{
  businessSlug: string
  publication: CapabilityPublicationImport
}>

export const CLUSTER_A_PUBLICATIONS = [
  { businessSlug: 'open-meteo-forecast', publication: openMeteoForecastPublication },
  { businessSlug: 'open-meteo-geocoding', publication: openMeteoGeocodingPublication },
  { businessSlug: 'wikipedia-rest-summary', publication: wikipediaSummaryPublication },
  { businessSlug: 'mockster-cat-images', publication: mocksterCatImagesPublication },
  { businessSlug: 'coingecko-simple-price-keyless', publication: coingeckoSimplePricePublication },
  { businessSlug: 'ipify', publication: ipifyPublication },
] as const satisfies readonly ClusterAPublication[]
