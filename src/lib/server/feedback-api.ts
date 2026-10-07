import { z } from 'zod'

import { feedbackSubmitAction, FEEDBACK_ROUTE_CONTRACT } from '@/modules/actions/feedback.actions'
import { authenticateAgentAccess, authRefusalProblem, resolveAgentAccessPrincipal, type AgentAccessAuthenticationOptions } from './agent-access-auth'
import { readBoundedRequestText } from './bounded-request-body'
import { resolveCanonicalOrigin } from './canonical-url'
import { executeCorrelatedJsonRoute } from './gateway-json-route'
import { response } from './no-store-response'
import { problem } from './problem'

const querySchema = z.strictObject({})
type FeedbackHandlerOptions = Pick<AgentAccessAuthenticationOptions, 'authenticate' | 'resolvePrincipal'>

/** Authentication and rate admission precede the single explicit disclosure. */
export async function handleFeedbackPost(request: Request, options: FeedbackHandlerOptions = {}): Promise<Response> {
  return await executeCorrelatedJsonRoute(request, 'public-mutation', async correlationId => {
    if (!querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams)).success) {
      return problem({ status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_request', detail: 'Feedback does not accept query parameters.' })
    }
    const origin = request.headers.get('origin')
    if (origin !== null && origin !== resolveCanonicalOrigin(request)) {
      return problem({ status: 403, kind: 'PERMISSION_DENIED', code: 'origin_not_allowed', detail: 'This Origin cannot submit feedback to this server.' })
    }
    if (request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
      return problem({ status: 415, kind: 'UNSUPPORTED_MEDIA_TYPE', code: 'invalid_content_type', detail: 'Feedback requires Content-Type: application/json.' })
    }
    const bounded = await readBoundedRequestText(request, 64 * 1024)
    if (!bounded.ok) return problem({ status: 413, kind: 'PAYLOAD_TOO_LARGE', code: bounded.code, detail: 'The feedback request exceeds 64 KiB.' })
    const resolvePrincipal = options.resolvePrincipal ?? (options.authenticate === undefined
      ? resolveAgentAccessPrincipal(request, bounded.text, correlationId) : undefined)
    const admitted = await authenticateAgentAccess({
      request, requiredScope: null, requiredAnyScopes: FEEDBACK_ROUTE_CONTRACT.anyScopes,
      consequenceResource: 'surface:http:feedback-submit',
      ...(options.authenticate === undefined ? {} : { authenticate: options.authenticate }),
      ...(resolvePrincipal === undefined ? {} : { resolvePrincipal }),
    })
    if (admitted.kind !== 'authenticated') return authRefusalProblem(request, admitted, undefined, undefined, correlationId)
    let body: unknown
    try { body = JSON.parse(bounded.text) as unknown } catch {
      return problem({ status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_json', detail: 'The feedback body must be valid JSON.' })
    }
    const input = feedbackSubmitAction.schema.safeParse(body)
    if (!input.success) return problem({ status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_request', detail: 'Send only a nonblank message of at most 10,000 characters.' })
    const result = await feedbackSubmitAction.run({ data: input.data, context: { caller: 'http', agentAccessPrincipal: admitted.principal } })
    if (result.kind === 'refused') {
      return problem({
        status: result.code === 'feedback_disabled' ? 409 : 503,
        kind: result.code === 'feedback_disabled' ? 'FAILED_PRECONDITION' : 'UNAVAILABLE',
        code: result.code, retryable: false,
        detail: result.code === 'feedback_disabled'
          ? 'Product feedback is disabled on this server. Skip feedback and continue your task.'
          : 'Feedback ingestion was not confirmed. Do not automatically retry; continue your task.',
      })
    }
    return response(feedbackSubmitAction.outputSchema.parse(result), 200, { 'Content-Type': 'application/json; charset=utf-8' })
  })
}
