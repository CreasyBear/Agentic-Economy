import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import { ConvexSourceError } from '@/lib/server/convex-source'
import {
  customerRequestInspectEvidenceAction,
  customerRequestReportProblemAction,
} from '@/modules/customer-request/customer-request.actions'
import {
  customerRequestEvidenceResultSchema,
  customerRequestProblemInputSchema,
  customerRequestProblemResultSchema,
} from '@/modules/customer-request/agent-contract'
import type { CustomerRequestEvidenceResult, CustomerRequestProblemResult } from '@/modules/customer-request/agent-contract'

export async function handleCustomerRequestProblemPost(
  request: Request,
  requestRef: string,
  options: Readonly<{ report?: (args: Record<string, unknown>) => Promise<CustomerRequestProblemResult> }> = {},
): Promise<Response> {
  if (!validRequestRef(requestRef)) return response({ error: 'invalid_request_ref' }, 400)
  const bounded = await readBoundedRequestText(request, 8 * 1024)
  if (!bounded.ok) return response({ error: 'request_too_large' }, 413)
  let body: unknown
  try { body = JSON.parse(bounded.text) } catch { return response({ error: 'invalid_json' }, 400) }
  const parsed = customerRequestProblemInputSchema.safeParse(body)
  if (!parsed.success) return response({ error: 'invalid_request' }, 400)
  try {
    const command = { requestRef, ...parsed.data }
    const result = customerRequestProblemResultSchema.parse(options.report === undefined
      ? await customerRequestReportProblemAction.run({
          data: customerRequestReportProblemAction.schema.parse(command), context: { request },
        })
      : await options.report(command))
    if (result.kind === 'refused') return response(
      result,
      result.reason === 'authentication_required' ? 401 : result.reason === 'evidence_not_found' ? 400 : 404,
    )
    if (result.kind === 'conflict') return response(result, 409)
    return response(result, 200)
  } catch (error) {
    if (error instanceof ConvexSourceError) return response({ error: error.code }, error.status)
    return response({ error: 'problem_report_unavailable' }, 503)
  }
}

export async function handleCustomerRequestEvidenceGet(
  request: Request,
  requestRef: string,
  options: Readonly<{ inspect?: (args: Record<string, unknown>) => Promise<CustomerRequestEvidenceResult> }> = {},
): Promise<Response> {
  if (!validRequestRef(requestRef)) return response({ error: 'invalid_request_ref' }, 400)
  try {
    const command = { requestRef }
    const result = customerRequestEvidenceResultSchema.parse(options.inspect === undefined
      ? await customerRequestInspectEvidenceAction.run({ data: command, context: { request } })
      : await options.inspect(command))
    if (result.kind === 'refused') return response(result, result.reason === 'authentication_required' ? 401 : 404)
    return response(result, 200)
  } catch (error) {
    if (error instanceof ConvexSourceError) return response({ error: error.code }, error.status)
    return response({ error: 'evidence_unavailable' }, 503)
  }
}

function validRequestRef(requestRef: string): boolean {
  return requestRef.trim().length > 0 && requestRef.length <= 200
}

function response(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}
