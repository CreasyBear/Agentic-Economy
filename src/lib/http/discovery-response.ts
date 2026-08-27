const discoveryHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
} as const

export function discoveryJsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(serializeJson(body), {
    ...init,
    headers: mergeHeaders('application/json; charset=utf-8', init.headers),
  })
}

export function discoveryTextResponse(body: string, contentType: string, init: ResponseInit = {}): Response {
  return new Response(body, {
    ...init,
    headers: mergeHeaders(contentType, init.headers),
  })
}

/** RFC 9727 profile media type for `/.well-known/api-catalog`. */
export const rfc9727LinksetContentType = 'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"' as const

/**
 * RFC 9727 api-catalog documents are JSON documents served under a distinct
 * media type; they keep exactly the same discovery header discipline as the
 * JSON manifests.
 */
export function discoveryLinksetJsonResponse(body: unknown): Response {
  return discoveryTextResponse(serializeJson(body), rfc9727LinksetContentType)
}

function mergeHeaders(contentType: string, input: HeadersInit | undefined): Headers {
  const headers = new Headers(input)
  headers.set('Content-Type', contentType)

  for (const [key, value] of Object.entries(discoveryHeaders)) {
    headers.set(key, value)
  }

  return headers
}

function serializeJson(body: unknown): string {
  return JSON.stringify(body)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
}
