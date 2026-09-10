import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { kindForStatus } from '@/lib/errors'
import {
  callPublicSourceQuery,
  ConvexSourceError,
  sourceQuery,
} from '@/lib/server/convex-source'
import { methodNotAllowed } from '@/lib/server/method-guard'
import { duplicateQueryParameterProblem, problem, zodIssueDetail } from '@/lib/server/problem'
import { withHttpRateLimit } from '@/lib/server/rate-limit'
import {
  runWithRequestCorrelation,
  withRequestCorrelationHeader,
} from '@/lib/server/request-correlation'
import { isInvalidRegistryCursorError } from '@/routes/api.businesses'
import { decodeOpaqueCursor, encodeOpaqueCursor } from '@/modules/registry/opaque-cursor'
import { toolCatalogPaginationSchema } from '@/modules/registry/tool-choice-contracts'
import { readDirectoryFreshnessField } from '@/modules/market/x402-directory-index.server'

const requestQuery = z.strictObject({
  query: z.string().max(200).default(''),
  limit: z.coerce.number().int().min(1).max(50).default(24),
  cursor: z.string().max(512).optional(),
})

const REGISTRY_RETRY_AFTER_SECONDS = 30

// Convex's native pagination vocabulary never crosses this boundary (decision D2):
// the shared opaque-cursor contract (limit/nextCursor/hasMore) stays the only
// pagination shape this route speaks. The cursor itself is wrapped by
// `@/modules/registry/opaque-cursor` (AIP-158: page tokens are opaque to the
// client and owned by the API) and bound to the directory generation it was
// issued against, so a cursor from a different route, or one issued against a
// since-rotated generation, is rejected as `invalid_cursor` before it ever
// reaches the index - never silently reinterpreted (200) or misreported as an
// outage (503).

type RegistryBrowseResult =
  | Readonly<{ kind: 'unavailable'; reason: string }>
  | (Readonly<{
      kind: 'ok'
      coverage: Readonly<Record<string, unknown>>
      searchMethod: 'native_full_text' | 'native_index'
      page: readonly Readonly<Record<string, unknown>>[]
    }> & Readonly<Record<string, unknown>>)

const registryBrowseQuery = sourceQuery<
  {
    query: string
    paginationOpts: { cursor: string | null; numItems: number }
  },
  RegistryBrowseResult
>('x402DirectoryIndex:browse')

type RegistryStatusResult = Readonly<{
  kind: 'unavailable' | 'ready'
  coverage?: Readonly<{ generation: string; completedAt: number }>
}>

const registryStatusQuery = sourceQuery<Record<string, never>, RegistryStatusResult>('x402DirectoryIndex:status')

/**
 * Resolves an incoming opaque registry cursor to its inner engine cursor,
 * scoped to the currently active directory generation. `undefined` means the
 * caller must be rejected with 400 `invalid_cursor` - either the token itself
 * is malformed/foreign, or there is no active generation for it to belong to.
 */
async function resolveInnerRegistryCursor(cursor: string): Promise<string | undefined> {
  const status = await callPublicSourceQuery(registryStatusQuery, {})
  const generation = status.kind === 'ready' ? status.coverage?.generation : undefined
  if (generation === undefined) return undefined
  return decodeOpaqueCursor(cursor, { kind: 'registry', scope: generation })
}

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
        const duplicateParam = duplicateQueryParameterProblem(url)
        if (duplicateParam !== undefined) return duplicateParam
        const allParams: Record<string, string> = {}
        for (const [key, value] of url.searchParams) {
          allParams[key] = value
        }
        const parsed = requestQuery.safeParse(allParams)
        if (!parsed.success) {
          return problem({
            status: 400,
            kind: 'INVALID_ARGUMENT',
            code: 'invalid_query_parameter',
            detail: zodIssueDetail(parsed.error),
          })
        }
        const innerCursor = parsed.data.cursor === undefined
          ? null
          : await resolveInnerRegistryCursor(parsed.data.cursor)
        if (innerCursor === undefined) {
          return problem({
            status: 400,
            kind: 'INVALID_ARGUMENT',
            code: 'invalid_cursor',
            detail: 'The supplied pagination cursor is invalid or expired.',
          })
        }
        // `limit` is a maximum page size: browse serves native pages of at most
        // 12 rows regardless of the requested limit, so `hasMore` carries the rest.
        const projection = await callPublicSourceQuery(registryBrowseQuery, {
          query: parsed.data.query,
          paginationOpts: { cursor: innerCursor, numItems: parsed.data.limit },
        })
        if (projection.kind === 'unavailable') return unavailableRegistryResponse(projection.reason)
        const headers = {
          'Cache-Control': 'public, max-age=60, stale-while-revalidate=240',
        }
        const nativeDone = projection.isDone === true
        const nativeCursor = projection.continueCursor
        const generation = typeof projection.coverage.generation === 'string' ? projection.coverage.generation : undefined
        const pagination = toolCatalogPaginationSchema.parse({
          limit: parsed.data.limit,
          ...(nativeDone || typeof nativeCursor !== 'string' || generation === undefined
            ? {}
            : { nextCursor: encodeOpaqueCursor({ kind: 'registry', scope: generation, cursor: nativeCursor }) }),
          hasMore: !nativeDone,
        })
        if (head) return new Response(null, { status: 200, headers })
        const freshness = await readDirectoryFreshnessField()
        return Response.json(
          {
            schemaVersion: 'api-registry:v3',
            query: parsed.data.query,
            kind: projection.kind,
            coverage: projection.coverage,
            searchMethod: projection.searchMethod,
            page: projection.page,
            pagination,
            freshness,
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

function unavailableRegistryResponse(reason: string): Response {
  if (reason === 'query_invalid' || reason === 'query_sort_unsupported') {
    return problem({
      status: 400,
      kind: 'INVALID_ARGUMENT',
      code: 'invalid_query_parameter',
    })
  }
  return registryUnavailable()
}

function registryUnavailable(): Response {
  return problem(
    { status: 503, kind: 'UNAVAILABLE', code: 'registry_unavailable' },
    { 'Retry-After': String(REGISTRY_RETRY_AFTER_SECONDS) },
  )
}

function registryError(error: unknown): Response {
  if (error instanceof ConvexSourceError) {
    return problem({
      status: error.status,
      kind: kindForStatus(error.status),
      code: error.code,
    })
  }
  if (isInvalidRegistryCursorError(error)) {
    return problem({
      status: 400,
      kind: 'INVALID_ARGUMENT',
      code: 'invalid_cursor',
      detail: 'The supplied pagination cursor is invalid or expired.',
    })
  }
  return registryUnavailable()
}
