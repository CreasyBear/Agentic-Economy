import { createFileRoute } from '@tanstack/react-router'

import { registryDetailAction } from '@/modules/registry/registry.actions'
import { legacyPublicRegistryDetail } from '@/modules/registry/registry.functions'
import { jsonResponse } from './api.businesses'

export const Route = createFileRoute('/api/businesses/$slug')({
  server: {
    handlers: {
      GET: ({ params, request }) => handleDurableBusinessDetailRequest(params.slug, request),
    },
  },
})

export async function handleDurableBusinessDetailRequest(
  slug: string,
  request = new Request(`https://ae.invalid/api/businesses/${encodeURIComponent(slug)}`),
): Promise<Response> {
  const data = registryDetailAction.schema.parse({ slug })
  const result = await registryDetailAction.run({ data, context: { request } })

  if (result.kind === 'not_found') {
    return jsonResponse(result, { status: 404 })
  }

  return jsonResponse(result)
}

export function handleBusinessDetailRequest(slug: string): Response {
  const result = legacyPublicRegistryDetail({ slug })

  if (result.kind === 'not_found') {
    return jsonResponse(result, { status: 404 })
  }

  return jsonResponse(result)
}
