import { createFileRoute } from '@tanstack/react-router'

import { registryListAction } from '@/modules/registry/registry.actions'
import { legacyPublicRegistryList } from '@/modules/registry/registry.functions'

export const Route = createFileRoute('/api/businesses')({
  server: {
    handlers: {
      GET: ({ request }) => handleDurableListBusinessesRequest(request),
    },
  },
})

export async function handleDurableListBusinessesRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)
  assertOnlySearchParams(url.searchParams, ['cursor', 'limit'])
  const data = registryListAction.schema.parse({
    ...optionalCursor(url.searchParams.get('cursor')),
    ...strictOptionalLimit(url.searchParams.get('limit')),
  })
  const result = await registryListAction.run({ data, context: { request } })

  return jsonResponse(result)
}

export function handleListBusinessesRequest(request: Request): Response {
  const url = new URL(request.url)
  const result = legacyPublicRegistryList({
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

export function strictOptionalLimit(value: string | null): { limit?: number } {
  if (value === null || value.trim().length === 0) return {}
  return { limit: Number(value) }
}

export function assertOnlySearchParams(
  params: URLSearchParams,
  allowed: readonly string[],
): void {
  const allowedNames = new Set(allowed)
  for (const name of params.keys()) {
    if (!allowedNames.has(name)) {
      throw new Error(`Unsupported query parameter: ${name}`)
    }
  }
}
