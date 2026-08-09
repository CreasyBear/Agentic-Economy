import { buildAnswerTurnProblem } from '@/lib/errors'
import { ConvexSourceError } from '@/lib/server/convex-source'
import { problem } from '@/lib/server/problem'

export function answerTurnSourceErrorResponse(error: unknown): Response | undefined {
  if (!(error instanceof ConvexSourceError)) return undefined
  const code = error.code === 'missing_auth' && error.status >= 500 && error.status <= 599 ? 'source_unavailable' : error.code
  return problem(buildAnswerTurnProblem(code))
}
