import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import { ConvexSourceError } from '@/lib/server/convex-source'
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
  const parsed = await parseBody(request, requestRef, customerRequestRepeatPermissionAllowInputSchema)
  if (parsed instanceof Response) return parsed
  try {
    const command = { requestRef, ...parsed }
    const result = customerRequestRepeatPermissionResultSchema.parse(await (options.allow === undefined
      ? customerRequestAllowRepeatPermissionAction.run({
          data: customerRequestAllowRepeatPermissionAction.schema.parse(command),
          context: { request },
        })
      : options.allow(command)))
    return resultResponse(result)
  } catch (error) {
    return unavailable(error, 'repeat_permission_unavailable')
  }
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
  const parsed = await parseBody(request, requestRef, customerRequestRepeatPermissionUseInputSchema)
  if (parsed instanceof Response) return parsed
  try {
    const command = { requestRef, permissionRef, ...parsed }
    const result = customerRequestAgentResultSchema.parse(await (options.use === undefined
      ? customerRequestUseRepeatPermissionAction.run({
          data: customerRequestUseRepeatPermissionAction.schema.parse(command),
          context: { request },
        })
      : options.use(command)))
    return resultResponse(result)
  } catch (error) {
    return unavailable(error, 'repeat_permission_use_unavailable')
  }
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
  const parsed = await parseBody(request, requestRef, customerRequestRepeatPermissionWithdrawInputSchema)
  if (parsed instanceof Response) return parsed
  try {
    const command = { requestRef, permissionRef, ...parsed }
    const result = customerRequestRepeatPermissionResultSchema.parse(await (options.withdraw === undefined
      ? customerRequestWithdrawRepeatPermissionAction.run({
          data: customerRequestWithdrawRepeatPermissionAction.schema.parse(command),
          context: { request },
        })
      : options.withdraw(command)))
    return resultResponse(result)
  } catch (error) {
    return unavailable(error, 'repeat_permission_withdrawal_unavailable')
  }
}

async function parseBody<Output>(
  request: Request,
  requestRef: string,
  schema: Readonly<{ safeParse: (value: unknown) => { success: true; data: Output } | { success: false } }>,
): Promise<Output | Response> {
  if (!validRef(requestRef, 200)) return response({ error: 'invalid_request_ref' }, 400)
  const bounded = await readBoundedRequestText(request, 4 * 1024)
  if (!bounded.ok) return response({ error: 'request_too_large' }, 413)
  let body: unknown
  try {
    body = JSON.parse(bounded.text)
  } catch {
    return response({ error: 'invalid_json' }, 400)
  }
  const parsed = schema.safeParse(body)
  return parsed.success ? parsed.data : response({ error: 'invalid_request' }, 400)
}

function resultResponse(result: { kind: string; reason?: string }): Response {
  if (result.kind === 'refused') {
    return response(result, result.reason === 'authentication_required' ? 401 : 404)
  }
  if (result.kind === 'conflict') return response(result, 409)
  if (result.kind === 'unavailable') return response(result, 422)
  return response(result, 200)
}

function unavailable(error: unknown, code: string): Response {
  if (error instanceof ConvexSourceError) return response({ error: error.code }, error.status)
  return response({ error: code }, 503)
}

function validRef(value: string, maximum: number): boolean {
  return value.trim().length > 0 && value.length <= maximum
}

