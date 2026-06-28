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
