import { createFileRoute } from '@tanstack/react-router'

import { captureLegacyRegistryApiRequest } from '@/lib/observability/posthog.server'
import { problem } from '@/lib/server/problem'
import { methodNotAllowed } from '@/lib/server/method-guard'
import { registryDetailAction } from '@/modules/registry/registry.actions'
import { jsonResponse } from './api.businesses'

export const Route = createFileRoute('/api/businesses/$slug')({
  server: {
    handlers: {
      GET: ({ params, request }) => {
        captureLegacyRegistryApiRequest('businesses', 'detail')
        return handleDurableBusinessDetailRequest(params.slug, request)
      },
      POST: () => methodNotAllowed(['GET']),
      PUT: () => methodNotAllowed(['GET']),
      PATCH: () => methodNotAllowed(['GET']),
      DELETE: () => methodNotAllowed(['GET']),
      HEAD: () => methodNotAllowed(['GET']),
      OPTIONS: () => methodNotAllowed(['GET']),
      TRACE: () => methodNotAllowed(['GET']),
      CONNECT: () => methodNotAllowed(['GET']),
    },
  },
})

export async function handleDurableBusinessDetailRequest(
  slug: string,
  request?: Request,
): Promise<Response> {
  const parsed = registryDetailAction.schema.safeParse({ slug })
  if (!parsed.success) {
    return problem({
      status: 400,
      kind: 'INVALID_ARGUMENT',
      code: 'invalid_query_parameter',
      detail: parsed.error.issues[0]?.message ?? 'Invalid query parameter.',
    })
  }

  const result = await registryDetailAction.run({
    data: parsed.data,
    context: { caller: 'http', ...(request === undefined ? {} : { request }) },
  })

  return result.kind === 'not_found'
    ? problem({ status: 404, kind: 'NOT_FOUND', code: result.code, detail: result.reason })
    : jsonResponse(result)
}
