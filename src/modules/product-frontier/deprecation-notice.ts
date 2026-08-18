/**
 * RFC 9745 / RFC 8594 / RFC 9651 deprecation notice for quarantined doors and
 * `/api/v1/operations/execute` only. Never attach these headers to `/call`.
 *
 * RFC 9745 example: `Deprecation: @1688169599` (SF Date) plus
 * `Link: <...>; rel="deprecation"`. RFC 8594 `Sunset` is an HTTP-date and MUST
 * NOT precede Deprecation. P5-d 410s mutating doors; Sunset is 18 Aug 2026.
 */
export const DEPRECATION_NOTICE_EPOCH_SECONDS = 1_787_011_200
export const SUNSET_HTTP_DATE = 'Tue, 18 Aug 2026 23:59:59 GMT'
export const DEPRECATION_SUCCESSOR_PATH = '/api/v1/operations/call'

export const RFC9745_DEPRECATION_HEADER = `@${DEPRECATION_NOTICE_EPOCH_SECONDS}` as const
export const RFC9745_DEPRECATION_LINK = `<${DEPRECATION_SUCCESSOR_PATH}>; rel="deprecation"` as const

export function rfc9745DeprecationNoticeHeaders(): Readonly<Record<string, string>> {
  return {
    Deprecation: RFC9745_DEPRECATION_HEADER,
    Sunset: SUNSET_HTTP_DATE,
    Link: RFC9745_DEPRECATION_LINK,
  }
}

export function withRfc9745DeprecationNotice(response: Response): Response {
  const headers = new Headers(response.headers)
  for (const [name, value] of Object.entries(rfc9745DeprecationNoticeHeaders())) {
    headers.set(name, value)
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export function sunsetIsAfterDeprecation(): boolean {
  const sunsetMs = Date.parse(SUNSET_HTTP_DATE)
  return Number.isFinite(sunsetMs) && sunsetMs >= DEPRECATION_NOTICE_EPOCH_SECONDS * 1_000
}
