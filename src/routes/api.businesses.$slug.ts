import { createFileRoute } from '@tanstack/react-router'

import { registryDetailAction } from '@/modules/registry/registry.actions'
import { legacyPublicRegistryDetail } from '@/modules/registry/registry.functions'
import { jsonResponse } from './api.businesses'

export const Route = createFileRoute('/api/businesses/$slug')({
  server: {
    handlers: {
      GET: ({ params }) => handleDurableBusinessDetailRequest(params.slug),
    },
  },
})

export async function handleDurableBusinessDetailRequest(slug: string): Promise<Response> {
  const result = await registryDetailAction.run({
    data: registryDetailAction.schema.parse({ slug }),
    context: {},
  })

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
