import { createFileRoute } from '@tanstack/react-router'

import { methodNotAllowed } from '@/lib/server/method-guard'
import type { RequestCorrelation } from '@/lib/server/request-correlation'

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: ({ request }) => handleHealthRequest(request, false),
      HEAD: ({ request }) => handleHealthRequest(request, true),
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

export async function handleHealthRequest(request: Request, head = false): Promise<Response> {
  const { runWithRequestCorrelation, withRequestCorrelationHeader } = await import('@/lib/server/request-correlation')
  return await runWithRequestCorrelation(request, ({ correlationId }: RequestCorrelation) => {
    const response = head
      ? new Response(null, { status: 200, headers: { 'Cache-Control': 'no-store' } })
      : Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } })
    return withRequestCorrelationHeader(response, correlationId)
  })
}
