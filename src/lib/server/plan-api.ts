import { z } from 'zod'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import { readBoundedRequestText } from './bounded-request-body'
import { authenticateCallGateway, createCallService, type CallHandlerOptions, type CallService } from './call-api'
import { ConvexSourceError } from './convex-source'
import { isJsonContentType } from './json-content-type'
import { response } from './no-store-response'
import { duplicateQueryParameterProblem, problem } from './problem'
import { withHttpRateLimit } from './rate-limit'
import { runWithRequestCorrelation, withRequestCorrelationHeader } from './request-correlation'
import { toolPlanQuoteAction } from '@/modules/capability-execution/plan/quote.actions'
import { toolPlanRunAction, toolPlanGetAction, toolPlanCancelAction } from '@/modules/capability-execution/plan/runtime.actions'

const noQueryParameters = z.strictObject({})
function queryProblem(request: Request): Response | undefined {
  const url = new URL(request.url)
  return duplicateQueryParameterProblem(url) ?? (!noQueryParameters.safeParse(Object.fromEntries(url.searchParams)).success
    ? problem({ status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_query_parameter', detail: 'This Plan request does not accept query parameters.' }) : undefined)
}
function unavailable(error: unknown, actionId: string): Response {
  return problem({ status: error instanceof ConvexSourceError ? error.status : 503, kind: 'UNAVAILABLE',
    code: `${actionId.replaceAll('.', '_')}_unavailable`, detail: actionId === 'tool.plan.quote'
      ? 'The Plan quote service is unavailable. No purchase was submitted.'
      : 'The Plan service is unavailable. Read the recorded Plan before retrying with the same idempotency key.' })
}

async function planPost<Input, Output>(request: Request, options: CallHandlerOptions,
  action: { id: string; schema: z.ZodType<Input>; outputSchema: z.ZodType<Output> },
  run: (input: Input, service: CallService, principal: AgentAccessPrincipal, correlationId: string) => Promise<Output>,
): Promise<Response> {
  return runWithRequestCorrelation(request, async ({ correlationId }) => {
    const result = await withHttpRateLimit(request, 'public-mutation', async () => {
      const invalidQuery = queryProblem(request)
      if (invalidQuery !== undefined) return invalidQuery
      const bounded = await readBoundedRequestText(request, 256 * 1024)
      if (!bounded.ok) return problem({ status: 413, kind: 'PAYLOAD_TOO_LARGE', code: bounded.code, detail: 'The Plan request body is too large.' })
      const admitted = await authenticateCallGateway(request, correlationId, options, bounded.text)
      if (admitted instanceof Response) return admitted
      if (!await isJsonContentType(request.headers.get('content-type'))) return problem({ status: 415, kind: 'UNSUPPORTED_MEDIA_TYPE', code: 'invalid_content_type', detail: 'Plan commands require application/json.' })
      let body: unknown
      try { body = JSON.parse(bounded.text) } catch {
        return problem({ status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_json', detail: 'The Plan request body must be valid JSON.' })
      }
      const parsed = action.schema.safeParse(body)
      if (!parsed.success) return problem({ status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_request', detail: `The request did not match ${action.id}:v1.` })
      try {
        const output = await run(parsed.data, options.callService ?? createCallService(request, bounded.text), admitted.principal, correlationId)
        return response(action.outputSchema.parse(output), 200, { 'Content-Type': 'application/json' })
      } catch (error) { return unavailable(error, action.id) }
    })
    return withRequestCorrelationHeader(result, correlationId)
  })
}

export function handleToolPlanQuotePost(request: Request, options: CallHandlerOptions = {}): Promise<Response> {
  return planPost(request, options, toolPlanQuoteAction, async (input, service, principal, correlationId) => {
    if (service.planQuote === undefined) throw new Error('tool_plan_quote_unavailable')
    return service.planQuote({ input, principal, correlationId })
  })
}
export function handleToolPlanRunPost(request: Request, options: CallHandlerOptions = {}): Promise<Response> {
  return planPost(request, options, toolPlanRunAction, async (input, service, principal, correlationId) => {
    if (service.planRun === undefined) throw new Error('tool_plan_run_unavailable')
    return service.planRun({ input, principal, correlationId })
  })
}
export function handleToolPlanCancelPost(request: Request, options: CallHandlerOptions = {}): Promise<Response> {
  return planPost(request, options, toolPlanCancelAction, async (input, service, principal, correlationId) => {
    if (service.planCancel === undefined) throw new Error('tool_plan_cancel_unavailable')
    return service.planCancel({ input, principal, correlationId })
  })
}
export async function handleToolPlanGet(request: Request, planRef: string, options: CallHandlerOptions = {}): Promise<Response> {
  return runWithRequestCorrelation(request, async ({ correlationId }) => {
    const result = await withHttpRateLimit(request, 'public-read', async () => {
      const invalidQuery = queryProblem(request)
      if (invalidQuery !== undefined) return invalidQuery
      const admitted = await authenticateCallGateway(request, correlationId, options, '')
      if (admitted instanceof Response) return admitted
      const parsed = toolPlanGetAction.schema.safeParse({ planRef })
      if (!parsed.success) return problem({ status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_request', detail: 'A valid Plan reference is required.' })
      try {
        const service = options.callService ?? createCallService(request, '')
        if (service.planGet === undefined) throw new Error('tool_plan_get_unavailable')
        return response(toolPlanGetAction.outputSchema.parse(await service.planGet({ input: parsed.data, principal: admitted.principal, correlationId })), 200, { 'Content-Type': 'application/json' })
      } catch (error) { return unavailable(error, toolPlanGetAction.id) }
    })
    return withRequestCorrelationHeader(result, correlationId)
  })
}
