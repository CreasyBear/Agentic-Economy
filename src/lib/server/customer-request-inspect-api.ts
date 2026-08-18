import { callSourceAction, ConvexSourceError, sourceAction } from '@/lib/server/convex-source'
import type { CustomerRequestView } from '@/modules/customer-request/customer-projection'
import { customerRequestInspectResultSchema } from '@/modules/customer-request/agent-contract'
import { response } from '@/lib/server/no-store-response'
import { kindForStatus } from '@/lib/errors'
import { problem } from '@/lib/server/problem'
import { withRfc9745DeprecationNotice } from '@/modules/product-frontier/deprecation-notice'
import { quarantineWriteResponse } from '@/lib/server/quarantine-write'

export type InspectResult = CustomerRequestView | Readonly<{ kind: 'refused'; reason: 'authentication_required' | 'request_not_found' }>
const inspectAction = sourceAction<Record<string, unknown>, InspectResult>('customerRequestApplication:resume')
type HandlerOptions = Readonly<{ inspect?: (args: Record<string, unknown>) => Promise<InspectResult> }>

export async function handleCustomerRequestGet(requestRef: string, options: HandlerOptions = {}): Promise<Response> {
  const retired = quarantineWriteResponse('customerRequest.run')
  if (retired !== undefined) return withRfc9745DeprecationNotice(retired)
  return withRfc9745DeprecationNotice(await inspectCustomerRequest(requestRef, options))
}

async function inspectCustomerRequest(requestRef: string, options: HandlerOptions): Promise<Response> {
  if (requestRef.trim().length === 0 || requestRef.length > 200) {
    return problem({ status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_request_ref' })
  }
  try {
    const result = customerRequestInspectResultSchema.parse(
      await (options.inspect ?? (async (args) => await callSourceAction(inspectAction, args)))({ requestRef }),
    )
    if (result.kind === 'refused') {
      return problem({
        status: result.reason === 'authentication_required' ? 401 : 404,
        kind: result.reason === 'authentication_required' ? 'UNAUTHENTICATED' : 'NOT_FOUND',
        code: result.reason,
      })
    }
    return response(result, result.state === 'preparing_options' ? 202 : 200)
  } catch (error) {
    if (error instanceof ConvexSourceError) {
      return problem({ status: error.status, kind: kindForStatus(error.status), code: error.code })
    }
    return problem({ status: 503, kind: 'UNAVAILABLE', code: 'request_unavailable' })
  }
}

