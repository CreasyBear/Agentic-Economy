import type { ZodType } from 'zod'

import { readBoundedRequestJson } from '@/lib/server/bounded-request-body'
import { problem } from '@/lib/server/problem'

export type ToolReadRequestResult<T> =
  | Readonly<{ ok: true; data: T }>
  | Readonly<{ ok: false; response: Response }>

/**
 * Validate bounded caller input before consulting remote admission or catalogue
 * state, so a correctable request error is never mislabeled as an outage.
 */
export async function readToolReadRequest<T>(
  request: Request,
  maximumBodyBytes: number,
  schema: ZodType<T>,
): Promise<ToolReadRequestResult<T>> {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    return {
      ok: false,
      response: problem({
        status: 415,
        kind: 'UNSUPPORTED_MEDIA_TYPE',
        code: 'invalid_content_type',
      }),
    }
  }

  const bounded = await readBoundedRequestJson(request, maximumBodyBytes)
  if (!bounded.ok) {
    return {
      ok: false,
      response: problem({
        status: bounded.code === 'payload_too_large' ? 413 : 400,
        kind: bounded.code === 'payload_too_large' ? 'PAYLOAD_TOO_LARGE' : 'INVALID_ARGUMENT',
        code: bounded.code,
      }),
    }
  }

  const parsed = schema.safeParse(bounded.value)
  if (!parsed.success) {
    const detail = parsed.error.issues[0]?.message
    return {
      ok: false,
      response: problem({
        status: 400,
        kind: 'INVALID_ARGUMENT',
        code: 'invalid_body',
        ...(detail === undefined ? {} : { detail }),
      }),
    }
  }

  return { ok: true, data: parsed.data }
}
