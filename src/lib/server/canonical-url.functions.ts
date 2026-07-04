import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'

import { resolveCanonicalBaseUrl } from './canonical-url'

export const readCanonicalBaseUrlServer = createServerFn().handler(
  () => resolveCanonicalBaseUrl(getRequest()).baseUrl
)
