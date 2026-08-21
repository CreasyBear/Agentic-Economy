import { createFileRoute } from '@tanstack/react-router'

import { withHttpRateLimit } from '@/lib/server/rate-limit'
import { problem } from '@/lib/server/problem'
import { methodNotAllowed } from '@/lib/server/method-guard'
import { registryServicesDetailAction } from '@/modules/registry/registry.actions'
import { jsonResponse } from './api.businesses'

export const Route = createFileRoute('/api/v1/services/$serviceId')({
  server: {
    handlers: {
      GET: ({ params, request }) => withHttpRateLimit(request, 'public-read', () => handleDurableServiceDetailRequest(params.serviceId, request)),
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

export async function handleDurableServiceDetailRequest(
  id: string,
  request: Request,
): Promise<Response> {
  const parsed = registryServicesDetailAction.schema.safeParse({ slug: id })
  if (!parsed.success) {
    return problem({
      status: 400,
      kind: 'INVALID_ARGUMENT',
      code: 'invalid_service_id',
      detail: parsed.error.issues[0]?.message ?? 'Invalid service id.',
    })
  }

  const result = await registryServicesDetailAction.run({
    data: parsed.data,
    context: { caller: 'http', request },
  })
  return result.kind === 'not_found'
    ? problem({ status: 404, kind: 'NOT_FOUND', code: result.code, detail: result.reason })
    : jsonResponse(result)
}
