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
import { kindForStatus } from '@/lib/errors'
import { problem } from '@/lib/server/problem'
import { withRfc9745DeprecationNotice } from '@/modules/product-frontier/deprecation-notice'
import { quarantineWriteResponse } from '@/lib/server/quarantine-write'

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
    return problem({ status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_request_ref' })
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
  const retired = quarantineWriteResponse('customerRequest.inspectEvidence')
  if (retired !== undefined) return withRfc9745DeprecationNotice(retired)
  return withRfc9745DeprecationNotice(await inspectCustomerRequestEvidence(request, requestRef, options))
}

async function inspectCustomerRequestEvidence(
  request: Request,
  requestRef: string,
  options: Readonly<{ inspect?: (args: Record<string, unknown>) => Promise<CustomerRequestEvidenceResult> }>,
): Promise<Response> {
  if (!validRequestRef(requestRef)) {
    return problem({ status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_request_ref' })
  }
  try {
    const command = { requestRef }
    const result = customerRequestEvidenceResultSchema.parse(options.inspect === undefined
      ? await customerRequestInspectEvidenceAction.run({ data: command, context: { request } })
      : await options.inspect(command))
    if (result.kind === 'refused') {
      return problem({
        status: result.reason === 'authentication_required' ? 401 : 404,
        kind: result.reason === 'authentication_required' ? 'UNAUTHENTICATED' : 'NOT_FOUND',
        code: result.reason,
      })
    }
    return response(result, 200)
  } catch (error) {
    if (error instanceof ConvexSourceError) {
      return problem({ status: error.status, kind: kindForStatus(error.status), code: error.code })
    }
    return problem({ status: 503, kind: 'UNAVAILABLE', code: 'evidence_unavailable' })
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

