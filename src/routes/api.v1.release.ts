import { createFileRoute } from '@tanstack/react-router'

import { defineRouteHandlers } from '@/lib/server/gateway-json-route'
import { readReleaseSourceRevision } from '@/lib/deployment/environment'

function readReleaseIdentity(head = false): Response {
  const sourceRevision = readReleaseSourceRevision(process.env)
  const body = sourceRevision !== undefined
    ? { kind: 'ok' as const, sourceRevision }
    : { kind: 'unavailable' as const, reason: 'source_revision_unconfigured' as const }
  const response = Response.json(body, {
    status: body.kind === 'ok' ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  })
  return head ? new Response(null, { status: response.status, headers: response.headers }) : response
}

export const Route = createFileRoute('/api/v1/release')({
  server: {
    handlers: defineRouteHandlers({
      GET: () => readReleaseIdentity(),
      HEAD: () => readReleaseIdentity(true),
    }),
  },
})
