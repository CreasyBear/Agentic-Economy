import { createFileRoute } from '@tanstack/react-router'

import { registryDetailAction } from '@/modules/registry/registry.actions'
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
  request?: Request,
): Promise<Response> {
  const result = await registryDetailAction.run({
    data: registryDetailAction.schema.parse({ slug }),
    context: { caller: 'http', ...(request === undefined ? {} : { request }) },
  })

  return result.kind === 'not_found' ? jsonResponse(result, { status: 404 }) : jsonResponse(result)
}
