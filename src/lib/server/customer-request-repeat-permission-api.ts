import { ConvexSourceError } from '@/lib/server/convex-source'
import { handleCustomerRequestPostBoundary } from '@/lib/server/customer-request-route-action-api'
import {
  customerRequestAllowRepeatPermissionAction,
  customerRequestInspectRepeatPermissionAction,
  customerRequestListConnectedAssistantsAction,
  customerRequestUseRepeatPermissionAction,
  customerRequestWithdrawRepeatPermissionAction,
} from '@/modules/customer-request/customer-request.actions'
import {
  customerRequestAgentResultSchema,
  customerRequestConnectedAssistantsResultSchema,
  customerRequestRepeatPermissionAllowInputSchema,
  customerRequestRepeatPermissionInspectInputSchema,
  customerRequestRepeatPermissionResultSchema,
  customerRequestRepeatPermissionUseInputSchema,
  customerRequestRepeatPermissionWithdrawInputSchema,
  type CustomerRequestAgentResult,
  type CustomerRequestConnectedAssistantsResult,
  type CustomerRequestRepeatPermissionResult,
} from '@/modules/customer-request/agent-contract'
import { response } from '@/lib/server/no-store-response'

type AllowOptions = Readonly<{
  allow?: (args: Record<string, unknown>) => Promise<CustomerRequestRepeatPermissionResult>
}>
type ListOptions = Readonly<{
  list?: (args: Record<string, unknown>) => Promise<CustomerRequestConnectedAssistantsResult>
}>
type UseOptions = Readonly<{
  use?: (args: Record<string, unknown>) => Promise<CustomerRequestAgentResult>
}>
type InspectOptions = Readonly<{
  inspect?: (args: Record<string, unknown>) => Promise<CustomerRequestRepeatPermissionResult>
}>
type WithdrawOptions = Readonly<{
  withdraw?: (args: Record<string, unknown>) => Promise<CustomerRequestRepeatPermissionResult>
}>

export async function handleCustomerRequestRepeatPermissionAllowPost(
  request: Request,
  requestRef: string,
  options: AllowOptions = {},
): Promise<Response> {
  return handleCustomerRequestPostBoundary({
    request,
    requestRef,
    maxBodyBytes: 4 * 1024,
    inputSchema: customerRequestRepeatPermissionAllowInputSchema,
    resultSchema: customerRequestRepeatPermissionResultSchema,
    run: options.allow ?? (async (command) => await customerRequestAllowRepeatPermissionAction.run({
      data: customerRequestAllowRepeatPermissionAction.schema.parse(command),
      context: { request },
    })),
    unavailableError: 'repeat_permission_unavailable',
    resultToStatus: repeatPermissionResultStatus,
  })
}

export async function handleCustomerRequestConnectedAssistantsGet(
  request: Request,
  requestRef: string,
  options: ListOptions = {},
): Promise<Response> {
  if (!validRef(requestRef, 200)) return response({ error: 'invalid_request_ref' }, 400)
  try {
    const command = { requestRef }
    const result = customerRequestConnectedAssistantsResultSchema.parse(await (options.list === undefined
      ? customerRequestListConnectedAssistantsAction.run({
          data: customerRequestListConnectedAssistantsAction.schema.parse(command),
          context: { request },
        })
      : options.list(command)))
    return resultResponse(result)
  } catch (error) {
    return unavailable(error, 'connected_assistants_unavailable')
  }
}

export async function handleCustomerRequestRepeatPermissionUsePost(
  request: Request,
  requestRef: string,
  permissionRef: string,
  options: UseOptions = {},
): Promise<Response> {
  if (!validRef(permissionRef, 300)) return response({ error: 'invalid_permission_ref' }, 400)
  return handleCustomerRequestPostBoundary({
    request,
    requestRef,
    maxBodyBytes: 4 * 1024,
    inputSchema: customerRequestRepeatPermissionUseInputSchema,
    resultSchema: customerRequestAgentResultSchema,
    buildCommand: (input) => ({ requestRef, permissionRef, ...(input as Record<string, unknown>) }),
    run: options.use ?? (async (command) => await customerRequestUseRepeatPermissionAction.run({
      data: customerRequestUseRepeatPermissionAction.schema.parse(command),
      context: { request },
    })),
    unavailableError: 'repeat_permission_use_unavailable',
    resultToStatus: repeatPermissionResultStatus,
  })
}

export async function handleCustomerRequestRepeatPermissionGet(
  request: Request,
  requestRef: string,
  permissionRef: string,
  options: InspectOptions = {},
): Promise<Response> {
  if (!validRef(requestRef, 200)) return response({ error: 'invalid_request_ref' }, 400)
  if (!validRef(permissionRef, 300)) return response({ error: 'invalid_permission_ref' }, 400)
  const parsed = customerRequestRepeatPermissionInspectInputSchema.safeParse({
    routeRef: new URL(request.url).searchParams.get('routeRef'),
  })
  if (!parsed.success) return response({ error: 'invalid_request' }, 400)
  try {
    const command = { requestRef, permissionRef, ...parsed.data }
    const result = customerRequestRepeatPermissionResultSchema.parse(await (options.inspect === undefined
      ? customerRequestInspectRepeatPermissionAction.run({
          data: customerRequestInspectRepeatPermissionAction.schema.parse(command),
          context: { request },
        })
      : options.inspect(command)))
    return resultResponse(result)
  } catch (error) {
    return unavailable(error, 'repeat_permission_inspection_unavailable')
  }
}

export async function handleCustomerRequestRepeatPermissionWithdrawPost(
  request: Request,
  requestRef: string,
  permissionRef: string,
  options: WithdrawOptions = {},
): Promise<Response> {
  if (!validRef(permissionRef, 300)) return response({ error: 'invalid_permission_ref' }, 400)
  return handleCustomerRequestPostBoundary({
    request,
    requestRef,
    maxBodyBytes: 4 * 1024,
    inputSchema: customerRequestRepeatPermissionWithdrawInputSchema,
    resultSchema: customerRequestRepeatPermissionResultSchema,
    buildCommand: (input) => ({ requestRef, permissionRef, ...(input as Record<string, unknown>) }),
    run: options.withdraw ?? (async (command) => await customerRequestWithdrawRepeatPermissionAction.run({
      data: customerRequestWithdrawRepeatPermissionAction.schema.parse(command),
      context: { request },
    })),
    unavailableError: 'repeat_permission_withdrawal_unavailable',
    resultToStatus: repeatPermissionResultStatus,
  })
}


function repeatPermissionResultStatus(result: { kind: string; reason?: string }): number {
  if (result.kind === 'refused') return result.reason === 'authentication_required' ? 401 : 404
  if (result.kind === 'conflict') return 409
  if (result.kind === 'unavailable') return 422
  return 200
}

function resultResponse(result: { kind: string; reason?: string }): Response {
  return response(result, repeatPermissionResultStatus(result))
}

function unavailable(error: unknown, code: string): Response {
  if (error instanceof ConvexSourceError) return response({ error: error.code }, error.status)
  return response({ error: code }, 503)
}

function validRef(value: string, maximum: number): boolean {
  return value.trim().length > 0 && value.length <= maximum
}

