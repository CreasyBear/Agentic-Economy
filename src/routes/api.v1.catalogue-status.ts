import { createFileRoute } from '@tanstack/react-router'

import { kindForStatus } from '@/lib/errors'
import { ConvexSourceError } from '@/lib/server/convex-source'
import { methodNotAllowed } from '@/lib/server/method-guard'
import { problem } from '@/lib/server/problem'
import { withHttpRateLimit } from '@/lib/server/rate-limit'
import { runWithRequestCorrelation, withRequestCorrelationHeader } from '@/lib/server/request-correlation'
import { readCatalogueFreshness } from '@/modules/market/x402-directory-index.server'

export const Route = createFileRoute('/api/v1/catalogue-status')({
  server: {
    handlers: {
      GET: ({ request }) => handleCatalogueStatusRequest(request),
      HEAD: ({ request }) => handleCatalogueStatusRequest(request, true),
      POST: () => methodNotAllowed(['GET', 'HEAD']),
      PUT: () => methodNotAllowed(['GET', 'HEAD']),
      PATCH: () => methodNotAllowed(['GET', 'HEAD']),
      DELETE: () => methodNotAllowed(['GET', 'HEAD']),
      OPTIONS: () => methodNotAllowed(['GET', 'HEAD']),
      TRACE: () => methodNotAllowed(['GET', 'HEAD']),
      CONNECT: () => methodNotAllowed(['GET', 'HEAD']),
    },
  },
})

export async function handleCatalogueStatusRequest(request: Request, head = false): Promise<Response> {
  return await runWithRequestCorrelation(request, async ({ correlationId }) => {
    let response: Response
    try {
      response = await withHttpRateLimit(request, 'public-read', async () => {
        const body = await readCatalogueFreshness(Date.now())
        const headers = { 'Cache-Control': 'no-store' }
        return head ? new Response(null, { status: 200, headers }) : Response.json(body, { headers })
      })
    } catch (error) {
      response = catalogueStatusError(error)
    }
    return withRequestCorrelationHeader(response, correlationId)
  })
}

function catalogueStatusError(error: unknown): Response {
  if (error instanceof ConvexSourceError) return problem({ status: error.status, kind: kindForStatus(error.status), code: error.code })
  return problem({ status: 503, kind: 'UNAVAILABLE', code: 'catalogue_status_unavailable' })
}
