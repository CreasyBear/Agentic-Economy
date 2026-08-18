import { existsSync, readdirSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { findAction, listActions } from '@/modules/actions'
import {
  MEASURED_BUSINESS_SERVICES_ACTION_IDS,
  MEASURED_BUSINESS_SERVICES_ACTION_ROUTES,
  MEASURED_BUSINESS_SERVICES_PUBLIC_PATHS,
  MEASURED_BUSINESS_SERVICES_ROUTE_FILES,
  businessServicesPolicy,
} from '@/modules/product-frontier/business-services-policy'

function routeFilesStartingWith(prefix: string): string[] {
  return readdirSync('src/routes')
    .filter((name) => name.startsWith(prefix) && name.endsWith('.ts'))
    .map((name) => `src/routes/${name}`)
    .sort()
}

describe('business services policy', () => {
  it('freezes expansion and retains measured public URLs with instrumentation', () => {
    expect(businessServicesPolicy).toEqual({
      expansion: 'frozen',
      publicUrls: 'retain-measured',
      trafficInstrumentation: 'retain',
    })
    expect([...MEASURED_BUSINESS_SERVICES_PUBLIC_PATHS]).toEqual([
      '/api/v1/services',
      '/api/v1/services/search',
      '/api/v1/services/$serviceId',
      '/api/businesses',
      '/api/businesses/search',
      '/api/businesses/$slug',
    ])

    for (const file of MEASURED_BUSINESS_SERVICES_ROUTE_FILES) {
      expect(existsSync(file), file).toBe(true)
    }

    expect(routeFilesStartingWith('api.v1.services')).toEqual([
      'src/routes/api.v1.services.$serviceId.ts',
      'src/routes/api.v1.services.search.ts',
      'src/routes/api.v1.services.ts',
    ])
    expect(routeFilesStartingWith('api.businesses')).toEqual([
      'src/routes/api.businesses.$slug.ts',
      'src/routes/api.businesses.search.ts',
      'src/routes/api.businesses.ts',
    ])

    const publicIds = listActions().map((action) => action.id)
    for (const actionId of MEASURED_BUSINESS_SERVICES_ACTION_IDS) {
      expect(publicIds).toContain(actionId)
      expect(findAction(actionId)?.readOnly).toBe(true)
      expect(MEASURED_BUSINESS_SERVICES_ACTION_ROUTES[actionId]).toBeDefined()
    }
  })
})
