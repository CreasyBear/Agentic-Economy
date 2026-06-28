import { createFileRoute } from '@tanstack/react-router'

import { createDefaultRegistrySourceState, listPublicBusinessCatalog } from '@/modules/registry/public'

export const Route = createFileRoute('/api/businesses')({
  server: {
    handlers: {
      GET: ({ request }) => handleListBusinessesRequest(request),
    },
  },
})

export function handleListBusinessesRequest(request: Request): Response {
  const url = new URL(request.url)
  const state = createDefaultRegistrySourceState()
  const result = listPublicBusinessCatalog(state, {
    ...optionalCursor(url.searchParams.get('cursor')),
    ...optionalLimit(url.searchParams.get('limit')),
  })

  return jsonResponse(result)
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return Response.json(body, {
    ...init,
    headers: {
      'Cache-Control': 'no-store',
      ...init.headers,
    },
  })
}

export function optionalParam(value: string | null): string | undefined {
  if (value === null || value.trim().length === 0) {
    return undefined
  }

  return value.trim()
}

export function numericParam(value: string | null): number | undefined {
  if (value === null || value.trim().length === 0) {
    return undefined
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function optionalCursor(value: string | null): { cursor?: string } {
  const cursor = optionalParam(value)
  return cursor === undefined ? {} : { cursor }
}

export function optionalLimit(value: string | null): { limit?: number } {
  const limit = numericParam(value)
  return limit === undefined ? {} : { limit }
}
