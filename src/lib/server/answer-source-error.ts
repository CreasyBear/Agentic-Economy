import { kindForStatus } from '@/lib/errors'
import { ConvexSourceError } from '@/lib/server/convex-source'
import { problem } from '@/lib/server/problem'

export function answerTurnSourceErrorResponse(error: unknown): Response | undefined {
  if (!(error instanceof ConvexSourceError)) return undefined
  return problem({
    status: error.status,
    kind: kindForStatus(error.status),
    code: error.code,
    detail: error.code === 'missing_convex_url'
      ? 'Answer service is not configured. Set CONVEX_URL or VITE_CONVEX_URL, then restart the local stack.'
      : 'Answer service authentication is unavailable. Sign in again; local operators should restart npm run dev:local.',
  })
}
