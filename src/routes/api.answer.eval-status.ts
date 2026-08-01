import { createFileRoute } from '@tanstack/react-router'

import { readLlmFollowUpChipsEnabled } from '@/modules/answer/public'

export const Route = createFileRoute('/api/answer/eval-status')({
  server: {
    handlers: {
      GET: () => handleEvalStatusRequest(),
    },
  },
})

export function handleEvalStatusRequest(): Response {
  return Response.json(
    { llmChipsEnabled: readLlmFollowUpChipsEnabled() },
    { headers: { 'Cache-Control': 'private, max-age=60' } },
  )
}
