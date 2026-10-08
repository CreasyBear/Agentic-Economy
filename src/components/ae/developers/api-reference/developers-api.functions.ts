import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'

import { resolvePublicDocumentationLinks } from '@/lib/documentation/public-documentation'
import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import { buildOpenApiDocument } from '@/modules/discovery/public'

import { createDevelopersApiViewModel } from './developers-api.view-model'

export const readDevelopersApiPageServer = createServerFn().handler(() => {
  const canonicalBaseUrl = resolveCanonicalBaseUrl(getRequest()).baseUrl
  const documentation = resolvePublicDocumentationLinks(process.env.AE_PUBLIC_DOCS_URL)
  return { ...createDevelopersApiViewModel(buildOpenApiDocument({ canonicalBaseUrl })), ...(documentation === undefined ? {} : { documentation }) }
})
