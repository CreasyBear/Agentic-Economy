import { z } from 'zod'

import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import { callSourceAction, ConvexSourceError, sourceAction } from '@/lib/server/convex-source'
import type { CustomerOptionsProjection } from '@/modules/customer-request/customer-projection'

const bodySchema = z.object({
  revision: z.number().int().positive(),
  idempotencyKey: z.string().trim().min(1).max(200),
}).strict()
const compareAction = sourceAction<Record<string, unknown>, CustomerOptionsProjection>('customerRequestApplication:compare')
type HandlerOptions = Readonly<{ compare?: (args: Record<string, unknown>) => Promise<CustomerOptionsProjection> }>

export async function handleCustomerOptionsPost(request: Request, requestRef: string, options: HandlerOptions = {}): Promise<Response> {
  if (requestRef.trim().length === 0 || requestRef.length > 200) return response({ error: 'invalid_request_ref' }, 400)
  const bounded = await readBoundedRequestText(request, 4 * 1024)
  if (!bounded.ok) return response({ error: 'request_too_large' }, 413)
  let body: unknown
  try { body = JSON.parse(bounded.text) } catch { return response({ error: 'invalid_json' }, 400) }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return response({ error: 'invalid_request' }, 400)
  try {
    const args = { requestRef, ...parsed.data }
    const result = await (options.compare ?? (async (input) => await callSourceAction(compareAction, input)))(args)
    if (result.kind === 'refused') return response(result, 401)
    if (result.kind === 'conflict') return response(result, 409)
    return response(result, result.state === 'preparing_options' ? 202 : 200)
  } catch (error) {
    if (error instanceof ConvexSourceError) return response({ error: error.code }, error.status)
    return response({ error: 'options_unavailable' }, 503)
  }
}

function response(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}
