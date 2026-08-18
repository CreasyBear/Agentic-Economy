import { z } from 'zod'

import { kindForStatus } from '@/lib/errors'
import { readBoundedRequestJson } from '@/lib/server/bounded-request-body'
import { ConvexSourceError } from '@/lib/server/convex-source'
import { problem } from '@/lib/server/problem'
import { quarantineFamilyWriteResponse } from '@/lib/server/quarantine-write'
import {
  customerRequestCancelAction,
  customerRequestRunAction,
} from '@/modules/customer-request/customer-request.actions'
import {
  customerRequestAgentResultSchema,
  customerRequestCancellationInputSchema,
  customerRequestRouteActionInputSchema,
  type CustomerRequestAgentResult,
} from '@/modules/customer-request/agent-contract'
import { response } from '@/lib/server/no-store-response'

export type CustomerRequestPostBoundaryOptions<Input extends object, Result> = Readonly<{
  request: Request
  requestRef?: string
  maxBodyBytes: number
  inputSchema: z.ZodType<Input>
  resultSchema: z.ZodType<Result>
  run: (command: Record<string, unknown>) => Promise<Result>
  unavailableError: string
  resultToStatus: (result: Result) => number
  domainAdmission?: (input: Input) => Response | undefined
  buildCommand?: (input: Input, requestRef: string | undefined) => Record<string, unknown>
  includeInvalidFields?: boolean
}>

type HandlerOptions = Readonly<{
  run?: (args: Record<string, unknown>) => Promise<CustomerRequestAgentResult>
  cancel?: (args: Record<string, unknown>) => Promise<CustomerRequestAgentResult>
}>

export async function handleCustomerRequestRunPost(
  request: Request,
  requestRef: string,
  options: HandlerOptions = {},
): Promise<Response> {
  return handleCustomerRequestPostBoundary({
    request,
    requestRef,
    maxBodyBytes: 4 * 1024,
    inputSchema: customerRequestRouteActionInputSchema,
    resultSchema: customerRequestAgentResultSchema,
    run: options.run ?? (async (command) => await customerRequestRunAction.run({
      data: customerRequestRunAction.schema.parse(command), context: { request },
    })),
    unavailableError: 'run_unavailable',
    resultToStatus: customerRequestResultStatus,
  })
}

export async function handleCustomerRequestCancelPost(
  request: Request,
  requestRef: string,
  options: HandlerOptions = {},
): Promise<Response> {
  return handleCustomerRequestPostBoundary({
    request,
    requestRef,
    maxBodyBytes: 4 * 1024,
    inputSchema: customerRequestCancellationInputSchema,
    resultSchema: customerRequestAgentResultSchema,
    run: options.cancel ?? (async (command) => await customerRequestCancelAction.run({
      data: customerRequestCancelAction.schema.parse(command), context: { request },
    })),
    unavailableError: 'cancellation_unavailable',
    resultToStatus: customerRequestResultStatus,
  })
}

export async function handleCustomerRequestPostBoundary<Input extends object, Result>({
  request,
  requestRef,
  maxBodyBytes,
  inputSchema,
  resultSchema,
  run,
  unavailableError,
  resultToStatus,
  domainAdmission,
  buildCommand,
  includeInvalidFields = false,
}: CustomerRequestPostBoundaryOptions<Input, Result>): Promise<Response> {
  const frozen = quarantineFamilyWriteResponse('customerRequest.run')
  if (requestRef !== undefined && (requestRef.trim().length === 0 || requestRef.length > 200)) {
    return problem({ status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_request_ref', detail: 'invalid_request_ref' })
  }
  if (frozen !== undefined) return frozen
  const body = await readBoundedRequestJson(request, maxBodyBytes)
  if (!body.ok) {
    return body.code === 'payload_too_large'
      ? problem({ status: 413, kind: 'PAYLOAD_TOO_LARGE', code: 'request_too_large' })
      : problem({ status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_json' })
  }
  const parsed = inputSchema.safeParse(body.value)
  if (!parsed.success) {
    return problem({
      kind: 'INVALID_ARGUMENT',
      code: 'invalid_request',
      ...(includeInvalidFields
        ? { extras: { fields: parsed.error.issues.map((issue) => issue.path.join('.')) } }
        : {}),
    })
  }
  const admitted = domainAdmission?.(parsed.data)
  if (admitted !== undefined) return admitted
  try {
    const command = buildCommand?.(parsed.data, requestRef) ?? {
      ...(requestRef === undefined ? {} : { requestRef }),
      ...(parsed.data as Record<string, unknown>),
    }
    const result = resultSchema.parse(await run(command))
    return response(result, resultToStatus(result))
  } catch (error) {
    if (error instanceof ConvexSourceError) return problem({ status: error.status, kind: kindForStatus(error.status), code: error.code })
    return problem({ status: 503, kind: 'UNAVAILABLE', code: unavailableError, detail: unavailableError })
  }
}

export function customerRequestResultStatus(result: CustomerRequestAgentResult): number {
  if (result.kind === 'refused') return result.reason === 'authentication_required' ? 401 : 404
  if (result.kind === 'conflict') return 409
  return 200
}

