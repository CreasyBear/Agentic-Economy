import { z } from 'zod'

import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import { callSourceAction, ConvexSourceError, sourceAction } from '@/lib/server/convex-source'
import type { CustomerRequestProjection, CustomerRequestView } from '@/modules/customer-request/customer-projection'

const jsonValue: z.ZodType<null | boolean | number | string | readonly unknown[] | Readonly<Record<string, unknown>>> = z.lazy(() => z.union([
  z.null(), z.boolean(), z.number().finite(), z.string().max(8_000),
  z.array(jsonValue).max(256), z.record(z.string(), jsonValue),
]))
const bodySchema = z.object({
  idempotencyKey: z.string().trim().min(1).max(200),
  expectedRevision: z.number().int().positive(),
  requirementKey: z.string().trim().min(1).max(300),
  value: jsonValue,
}).strict()
export type FactsResult = CustomerRequestProjection | CustomerRequestView | Readonly<{
  kind: 'refused'
  reason: 'authentication_required' | 'request_not_found' | 'interpreter_unavailable' | 'capabilities_unavailable'
}>
const factsAction = sourceAction<Record<string, unknown>, FactsResult>('customerRequestApplication:provideFacts')
type HandlerOptions = Readonly<{ provideFacts?: (args: Record<string, unknown>) => Promise<FactsResult> }>

export async function handleCustomerRequestFactsPost(request: Request, requestRef: string, options: HandlerOptions = {}): Promise<Response> {
  if (requestRef.trim().length === 0 || requestRef.length > 200) return response({ error: 'invalid_request_ref' }, 400)
  const bounded = await readBoundedRequestText(request, 32 * 1024)
  if (!bounded.ok) return response({ error: 'request_too_large' }, 413)
  let body: unknown
  try { body = JSON.parse(bounded.text) } catch { return response({ error: 'invalid_json' }, 400) }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return response({ error: 'invalid_request' }, 400)
  try {
    const result = await (options.provideFacts ?? (async (args) => await callSourceAction(factsAction, args)))({
      requestRef, ...parsed.data,
    })
    if (result.kind === 'refused') {
      const status = result.reason === 'authentication_required' ? 401 : result.reason === 'request_not_found' ? 404 : 503
      return response(result, status)
    }
    if (result.kind === 'conflict') return response(result, 409)
    return response(result, 200)
  } catch (error) {
    if (error instanceof ConvexSourceError) return response({ error: error.code }, error.status)
    return response({ error: 'request_unavailable' }, 503)
  }
}

function response(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}
