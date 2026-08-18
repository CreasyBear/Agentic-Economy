/**
 * P5-e implementation of the v2 manifest `businessServicesPolicy`.
 *
 * Expansion of the public businesses/services URL family is frozen. Existing
 * URLs stay and keep traffic instrumentation. RFC 8594 notice is required
 * before any of these URLs die (P5-d, not this card).
 */
export const BUSINESS_SERVICES_EXPANSION = 'frozen' as const
export const BUSINESS_SERVICES_PUBLIC_URLS = 'retain-measured' as const
export const BUSINESS_SERVICES_TRAFFIC_INSTRUMENTATION = 'retain' as const

export const MEASURED_BUSINESS_SERVICES_PUBLIC_PATHS = [
  '/api/v1/services',
  '/api/v1/services/search',
  '/api/v1/services/$serviceId',
  '/api/businesses',
  '/api/businesses/search',
  '/api/businesses/$slug',
] as const

export const MEASURED_BUSINESS_SERVICES_ROUTE_FILES = [
  'src/routes/api.v1.services.ts',
  'src/routes/api.v1.services.search.ts',
  'src/routes/api.v1.services.$serviceId.ts',
  'src/routes/api.businesses.ts',
  'src/routes/api.businesses.search.ts',
  'src/routes/api.businesses.$slug.ts',
] as const

export const MEASURED_BUSINESS_SERVICES_ACTION_ROUTES = {
  'registry.list': { routeFamily: 'businesses', routeKind: 'list' },
  'registry.search': { routeFamily: 'businesses', routeKind: 'search' },
  'registry.detail': { routeFamily: 'businesses', routeKind: 'detail' },
  'registry.services_list': { routeFamily: 'services', routeKind: 'list' },
  'registry.services_search': { routeFamily: 'services', routeKind: 'search' },
  'registry.services_detail': { routeFamily: 'services', routeKind: 'detail' },
} as const

export const MEASURED_BUSINESS_SERVICES_ACTION_IDS = [
  'registry.list',
  'registry.search',
  'registry.detail',
  'registry.services_list',
  'registry.services_search',
  'registry.services_detail',
] as const satisfies ReadonlyArray<keyof typeof MEASURED_BUSINESS_SERVICES_ACTION_ROUTES>

export const businessServicesPolicy = {
  expansion: BUSINESS_SERVICES_EXPANSION,
  publicUrls: BUSINESS_SERVICES_PUBLIC_URLS,
  trafficInstrumentation: BUSINESS_SERVICES_TRAFFIC_INSTRUMENTATION,
} as const
