import { createFileRoute } from '@tanstack/react-router'

import {
  createDefaultRegistrySourceState,
  getPublicBusinessCatalogBySlug,
} from '@/modules/registry/public'
import { jsonResponse } from './api.businesses'

export const Route = createFileRoute('/api/businesses/$slug')({
  server: {
    handlers: {
      GET: ({ params }) => handleBusinessDetailRequest(params.slug),
    },
  },
})

export function handleBusinessDetailRequest(slug: string): Response {
  const state = createDefaultRegistrySourceState()
  const result = getPublicBusinessCatalogBySlug(state, { slug })

  if (result.kind === 'not_found') {
    return jsonResponse(result, { status: 404 })
  }

  return jsonResponse(result)
}
