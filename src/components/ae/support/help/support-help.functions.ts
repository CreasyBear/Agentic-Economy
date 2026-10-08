import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import { resolvePublicDocumentationLinks } from '@/lib/documentation/public-documentation'

export const readSupportHelpPageServer = createServerFn({ method: 'GET' }).handler(() => {
  const canonicalBaseUrl = resolveCanonicalBaseUrl(getRequest()).baseUrl
  const documentation = resolvePublicDocumentationLinks(process.env.AE_PUBLIC_DOCS_URL)
  return { canonicalBaseUrl, ...(documentation === undefined ? {} : { documentation }) }
})
