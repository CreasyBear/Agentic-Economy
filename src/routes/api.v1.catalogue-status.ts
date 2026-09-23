import { createFileRoute } from '@tanstack/react-router'

import { kindForStatus } from '@/lib/errors'
import { ConvexSourceError } from '@/lib/server/convex-source'
import { defineRouteHandlers, executeCorrelatedJsonRoute } from '@/lib/server/gateway-json-route'
import { problem } from '@/lib/server/problem'
import { readCatalogueFreshness } from '@/modules/market/x402-directory-index.server'

export const Route = createFileRoute('/api/v1/catalogue-status')({
  server: {
    handlers: defineRouteHandlers({
      GET: ({ request }) => handleCatalogueStatusRequest(request),
      HEAD: ({ request }) => handleCatalogueStatusRequest(request, true),
    }),
  },
})

export async function handleCatalogueStatusRequest(request: Request, head = false): Promise<Response> {
  return await executeCorrelatedJsonRoute(
    request,
    'public-read',
    async () => {
      const body = await readCatalogueFreshness(Date.now())
      const headers = { 'Cache-Control': 'no-store' }
      return head ? new Response(null, { status: 200, headers }) : Response.json(body, { headers })
    },
    (error) => catalogueStatusError(error),
  )
}

function catalogueStatusError(error: unknown): Response {
  if (error instanceof ConvexSourceError) return problem({ status: error.status, kind: kindForStatus(error.status), code: error.code })
  return problem({ status: 503, kind: 'UNAVAILABLE', code: 'catalogue_status_unavailable' })
}
