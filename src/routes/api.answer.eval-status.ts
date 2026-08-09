import { createFileRoute } from '@tanstack/react-router'

import { readLlmFollowUpChipsEnabled } from '@/modules/answer/public'
import { methodNotAllowed } from '@/lib/server/method-guard'

export const Route = createFileRoute('/api/answer/eval-status')({
  server: {
    handlers: {
      GET: () => handleEvalStatusRequest(),
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

export function handleEvalStatusRequest(): Response {
  return Response.json(
    { llmChipsEnabled: readLlmFollowUpChipsEnabled() },
    { headers: { 'Cache-Control': 'private, max-age=60' } },
  )
}
