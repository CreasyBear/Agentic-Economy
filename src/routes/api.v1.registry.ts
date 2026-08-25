import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { kindForStatus } from '@/lib/errors'
import {
  callPublicSourceQuery,
  ConvexSourceError,
  sourceQuery,
} from '@/lib/server/convex-source'
import { methodNotAllowed } from '@/lib/server/method-guard'
import { problem } from '@/lib/server/problem'
import { withHttpRateLimit } from '@/lib/server/rate-limit'
import {
  runWithRequestCorrelation,
  withRequestCorrelationHeader,
} from '@/lib/server/request-correlation'

const requestQuery = z.strictObject({
  query: z.string().max(200).default(''),
  access: z.enum(['all', 'x402', 'provider_account']).default('all'),
  limit: z.coerce.number().int().min(1).max(50).default(24),
  cursor: z.string().max(512).optional(),
})

type RegistrySearchResult =
  | Readonly<{ kind: 'unavailable' }>
  | Readonly<{
      kind: 'ok'
      generation: string
      coverage: Readonly<{ entries: number; completedAt: number }>
      page: readonly Readonly<Record<string, unknown>>[]
      isDone: boolean
      continueCursor: string
    }>

const registrySearchQuery = sourceQuery<
  {
    query: string
    access: 'all' | 'x402' | 'provider_account'
    limit: number
    cursor: string | null
  },
  RegistrySearchResult
>('marketExternalRegistry:search')

export const Route = createFileRoute('/api/v1/registry')({
  server: {
    handlers: {
      GET: ({ request }) => handleApiRegistryRequest(request),
      HEAD: ({ request }) => handleApiRegistryRequest(request, true),
      POST: () => methodNotAllowed(['GET', 'HEAD']),
      PUT: () => methodNotAllowed(['GET', 'HEAD']),
      PATCH: () => methodNotAllowed(['GET', 'HEAD']),
      DELETE: () => methodNotAllowed(['GET', 'HEAD']),
      OPTIONS: () => methodNotAllowed(['GET', 'HEAD']),
      TRACE: () => methodNotAllowed(['GET', 'HEAD']),
      CONNECT: () => methodNotAllowed(['GET', 'HEAD']),
    },
  },
})

export async function handleApiRegistryRequest(
  request: Request,
  head = false,
): Promise<Response> {
  return await runWithRequestCorrelation(request, async ({ correlationId }) => {
    let response: Response
    try {
      response = await withHttpRateLimit(request, 'public-read', async () => {
        const url = new URL(request.url)
        const cursor = url.searchParams.get('cursor')
        const parsed = requestQuery.safeParse({
          query: url.searchParams.get('query') ?? '',
          access: url.searchParams.get('access') ?? 'all',
          limit: url.searchParams.get('limit') ?? '24',
          ...(cursor === null ? {} : { cursor }),
        })
        if (!parsed.success) {
          return problem({
            status: 400,
            kind: 'INVALID_ARGUMENT',
            code: 'invalid_registry_query',
            detail:
              'query must be at most 200 characters; access must be all, x402, or provider_account; limit must be 1–50.',
          })
        }
        const projection = await callPublicSourceQuery(registrySearchQuery, {
          query: parsed.data.query,
          access: parsed.data.access,
          limit: parsed.data.limit,
          cursor: parsed.data.cursor ?? null,
        })
        const headers = {
          'Cache-Control': 'public, max-age=60, stale-while-revalidate=240',
        }
        return head
          ? new Response(null, { status: 200, headers })
          : Response.json(
              {
                schemaVersion: 'api-registry:v1',
                query: parsed.data.query,
                access: parsed.data.access,
                ...projection,
              },
              { headers },
            )
      })
    } catch (error) {
      response = registryError(error)
    }
    return withRequestCorrelationHeader(response, correlationId)
  })
}

function registryError(error: unknown): Response {
  if (error instanceof ConvexSourceError) {
    return problem({
      status: error.status,
      kind: kindForStatus(error.status),
      code: error.code,
    })
  }
  return problem({
    status: 503,
    kind: 'UNAVAILABLE',
    code: 'registry_unavailable',
  })
}
