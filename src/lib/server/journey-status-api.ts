import { buildProblem, type ProblemInput } from '@/lib/errors'
import { authenticateCallGateway, createCallService, type CallHandlerOptions } from '@/lib/server/call-api'
import { ConvexSourceError } from '@/lib/server/convex-source'
import { response } from '@/lib/server/no-store-response'
import { problem, duplicateQueryParameterProblem } from '@/lib/server/problem'
import { withHttpRateLimit } from '@/lib/server/rate-limit'
import { runWithRequestCorrelation, withRequestCorrelationHeader } from '@/lib/server/request-correlation'
import { journeyStatusAction } from '@/modules/actions'
import { projectJourneyProblem, statusRefSchema } from '@/modules/actions/contract'

function statusProblem(input: ProblemInput, request: Request): Response {
  const projected = projectJourneyProblem({ ...buildProblem(input), retryable: input.retryable ?? false, next: [] },
    { origin: new URL(request.url).origin, source: 'local' })
  return problem({ ...input, extras: { next: projected.next } })
}

/** One canonical ref route; every private kind is admitted before its pure source query. */
export async function handleJourneyStatusGet(request: Request, ref: string, options: CallHandlerOptions = {}): Promise<Response> {
  return await runWithRequestCorrelation(request, async ({ correlationId }) => {
    const url = new URL(request.url)
    const duplicate = duplicateQueryParameterProblem(url)
    if (duplicate !== undefined) return withRequestCorrelationHeader(duplicate, correlationId)
    if (url.search !== '') return withRequestCorrelationHeader(statusProblem({ status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_query_parameter' }, request), correlationId)
    const kind = ref.startsWith('operation:v1:') ? 'tool'
      : ref.startsWith('operation-commitment:v1:') ? 'quote'
      : ref.startsWith('operation-invocation:v1:') ? 'call'
      : ref.startsWith('turn_') ? 'turn' : null
    const parsed = kind === null ? null : statusRefSchema.safeParse({ kind, ref })
    if (parsed === null || !parsed.success) return withRequestCorrelationHeader(statusProblem({ status: 400, kind: 'INVALID_ARGUMENT', code: 'malformed_ref' }, request), correlationId)
    return await withHttpRateLimit(request, 'public-read', async () => {
      const admitted = await authenticateCallGateway(request, correlationId, options, '')
      if (admitted instanceof Response) return admitted
      try {
        const result = await journeyStatusAction.run({ data: { ref: parsed.data }, context: {
          request, agentAccessPrincipal: admitted.principal,
          callService: options.callService ?? createCallService(request, ''), correlationId, caller: 'http',
        } })
        return withRequestCorrelationHeader(response(journeyStatusAction.outputSchema.parse(result), 200, { 'Content-Type': 'application/json' }), correlationId)
      } catch (error) {
        const notFound = error instanceof Error && ['tool_not_found', 'quote_not_found', 'call_not_found', 'turn_not_found'].includes(error.message)
        return withRequestCorrelationHeader(statusProblem(notFound
          ? { status: 404, kind: 'NOT_FOUND', code: 'status_not_found' }
          : error instanceof Error && error.message === 'call_status_denied'
            ? { status: 403, kind: 'PERMISSION_DENIED', code: 'principal_denied' }
            : error instanceof ConvexSourceError || error instanceof TypeError
                || error instanceof Error && error.message === 'call_status_unavailable'
              ? { status: 503, kind: 'UNAVAILABLE', code: 'source_unavailable', retryable: true }
              : { status: 500, kind: 'INTERNAL', code: 'status_failed' }, request), correlationId)
      }
    })
  })
}
