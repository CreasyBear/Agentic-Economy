import { createFileRoute } from '@tanstack/react-router'

import { methodNotAllowed } from '@/lib/server/method-guard'

function readReleaseIdentity(head = false): Response {
  const sourceRevision = process.env.AE_RELEASE_SOURCE_REVISION?.trim()
  const body = sourceRevision !== undefined && /^[a-f0-9]{40}$/u.test(sourceRevision)
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
    handlers: {
      GET: () => readReleaseIdentity(),
      POST: () => methodNotAllowed(['GET', 'HEAD']),
      PUT: () => methodNotAllowed(['GET', 'HEAD']),
      PATCH: () => methodNotAllowed(['GET', 'HEAD']),
      DELETE: () => methodNotAllowed(['GET', 'HEAD']),
      HEAD: () => readReleaseIdentity(true),
      OPTIONS: () => methodNotAllowed(['GET', 'HEAD']),
      TRACE: () => methodNotAllowed(['GET', 'HEAD']),
      CONNECT: () => methodNotAllowed(['GET', 'HEAD']),
    },
  },
})
