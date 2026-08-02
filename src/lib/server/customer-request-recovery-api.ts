import { ConvexSourceError } from '@/lib/server/convex-source'
import { handleCustomerRequestPostBoundary } from '@/lib/server/customer-request-route-action-api'
import {
  customerRequestInspectEvidenceAction,
  customerRequestReportProblemAction,
  customerRequestReplyProblemAction,
} from '@/modules/customer-request/customer-request.actions'
import {
  customerRequestEvidenceResultSchema,
  customerRequestProblemInputSchema,
  customerRequestProblemReplyInputSchema,
  customerRequestProblemResultSchema,
  customerRequestProblemStatusChangeSchema,
} from '@/modules/customer-request/agent-contract'
import type {
  CustomerRequestEvidenceResult,
  CustomerRequestProblemResult,
  CustomerRequestProblemStatusChange,
} from '@/modules/customer-request/agent-contract'
import { response } from '@/lib/server/no-store-response'

export async function handleCustomerRequestProblemPost(
  request: Request,
  requestRef: string,
  options: Readonly<{ report?: (args: Record<string, unknown>) => Promise<CustomerRequestProblemResult> }> = {},
): Promise<Response> {
  return handleCustomerRequestPostBoundary({
    request,
    requestRef,
    maxBodyBytes: 8 * 1024,
    inputSchema: customerRequestProblemInputSchema,
    resultSchema: customerRequestProblemResultSchema,
    run: options.report ?? (async (command) => await customerRequestReportProblemAction.run({
      data: customerRequestReportProblemAction.schema.parse(command), context: { request },
    })),
    unavailableError: 'problem_report_unavailable',
    resultToStatus: problemReportResultStatus,
  })
}

export async function handleCustomerRequestProblemReplyPost(
  request: Request,
  requestRef: string,
  reportRef: string,
  options: Readonly<{
    reply?: (args: Record<string, unknown>) => Promise<CustomerRequestProblemStatusChange>
  }> = {},
): Promise<Response> {
  if (reportRef.trim().length === 0 || reportRef.length > 300) {
    return response({ error: 'invalid_request_ref' }, 400)
  }
  return handleCustomerRequestPostBoundary({
    request,
    requestRef,
    maxBodyBytes: 8 * 1024,
    inputSchema: customerRequestProblemReplyInputSchema,
    resultSchema: customerRequestProblemStatusChangeSchema,
    buildCommand: (input) => ({ requestRef, reportRef, ...(input as Record<string, unknown>) }),
    run: options.reply ?? (async (command) => await customerRequestReplyProblemAction.run({
      data: customerRequestReplyProblemAction.schema.parse(command),
      context: { request },
    })),
    unavailableError: 'problem_reply_unavailable',
    resultToStatus: problemReplyResultStatus,
  })
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

function problemReportResultStatus(result: CustomerRequestProblemResult): number {
  if (result.kind === 'refused') {
    return result.reason === 'authentication_required' ? 401 : result.reason === 'evidence_not_found' ? 400 : 404
  }
  if (result.kind === 'conflict') return 409
  return 200
}

function problemReplyResultStatus(result: CustomerRequestProblemStatusChange): number {
  if (result.kind === 'refused') {
    return result.reason === 'authentication_required' ? 401 : result.reason === 'invalid_update' ? 400 : 404
  }
  if (result.kind === 'conflict') return 409
  return 200
}

