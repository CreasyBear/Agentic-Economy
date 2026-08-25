import { createFileRoute } from '@tanstack/react-router'

import { methodNotAllowed } from '@/lib/server/method-guard'

function readReleaseIdentity(): Response {
  const sourceRevision = process.env.AE_RELEASE_SOURCE_REVISION?.trim()
  const body = sourceRevision !== undefined && /^[a-f0-9]{40}$/u.test(sourceRevision)
    ? { kind: 'ok' as const, sourceRevision }
    : { kind: 'unavailable' as const, reason: 'source_revision_unconfigured' as const }
  return Response.json(body, {
    status: body.kind === 'ok' ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  })
}

export const Route = createFileRoute('/api/v1/release')({
  server: {
    handlers: {
      GET: () => readReleaseIdentity(),
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
