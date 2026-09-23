import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'

import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import { buildOpenApiDocument } from '@/modules/discovery/public'

import { createDevelopersApiViewModel } from './developers-api.view-model'

export const readDevelopersApiPageServer = createServerFn().handler(() => {
  const canonicalBaseUrl = resolveCanonicalBaseUrl(getRequest()).baseUrl
  return createDevelopersApiViewModel(buildOpenApiDocument({ canonicalBaseUrl }))
})
