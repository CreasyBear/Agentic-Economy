import { createFileRoute } from '@tanstack/react-router'

import { jsonResponse, legacyPublicRegistryDetail, readPublicRegistryBusinessDetail } from './api.businesses'

export const Route = createFileRoute('/api/businesses/$slug')({
  server: {
    handlers: {
      GET: ({ params }) => handleDurableBusinessDetailRequest(params.slug),
    },
  },
})

export async function handleDurableBusinessDetailRequest(slug: string): Promise<Response> {
  const result = await readPublicRegistryBusinessDetail({ slug })

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
