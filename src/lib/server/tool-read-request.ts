import type { ZodType } from 'zod'

import { readBoundedRequestJson } from '@/lib/server/bounded-request-body'
import { isJsonContentType } from '@/lib/server/json-content-type'
import { problem, zodIssueDetail } from '@/lib/server/problem'

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
  if (!(await isJsonContentType(request.headers.get('content-type')))) {
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
    return {
      ok: false,
      response: problem({
        status: 400,
        kind: 'INVALID_ARGUMENT',
        code: 'invalid_body',
        detail: zodIssueDetail(parsed.error),
      }),
    }
  }

  return { ok: true, data: parsed.data }
}

/**
 * `Cache-Control` for an anonymous public Tool-read response. When the
 * response carries a `freshness.staleAfterMs` reading (`list`/`search`, read
 * from the periodically reconciled supply projection), the response is
 * cacheable for that same window; a response with no freshness reading (the
 * `unavailable` branch, or a route whose source has no staleness window) is
 * never cached.
 */
export function publicToolReadCacheControl(
  data: Readonly<{ kind: string; freshness?: Readonly<{ staleAfterMs: number }> | undefined }>,
): string {
  const staleAfterMs = data.freshness?.staleAfterMs
  return staleAfterMs === undefined
    ? 'no-store'
    : `public, max-age=${Math.floor(staleAfterMs / 1000)}, stale-while-revalidate=60`
}
