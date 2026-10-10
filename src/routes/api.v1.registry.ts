import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { kindForStatus } from '@/lib/errors'
import {
  callPublicSourceQuery,
  ConvexSourceError,
  sourceQuery,
} from '@/lib/server/convex-source'
import { defineRouteHandlers } from '@/lib/server/gateway-json-route'
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
import type { DirectoryChoice } from '@/modules/market/x402-directory'

const requestQuery = z.strictObject({
  query: z.string().max(200).default(''),
  limit: z.coerce.number().int().min(1).max(12).default(8),
  cursor: z.string().max(16384).optional(),
})

const REGISTRY_RETRY_AFTER_SECONDS = 30
const MAX_REGISTRY_RESPONSE_BYTES = 16 * 1024

// The compact index is the only listing source. Never forward its retained
// source JSON through this route; clients inspect an exact ID through /detail.
type RegistryCompactRow = Readonly<{
  id: string
  source: 'coinbase' | 'provider'
  sourceRouteRef?: string
  toolRef?: string
  choice: DirectoryChoice
  title: string
  summary: string
  provider: string
  actionClass: string
  objectClass: string
  category?: string
  completedAt: number
}>

type RegistryCompactResult =
  | Readonly<{ kind: 'unavailable'; reason: string }>
  | Readonly<{
      kind: 'ok'
      coverage: Readonly<{ generation: string; completedAt: number }>
      page: readonly RegistryCompactRow[]
      continueCursor: string
      isDone: boolean
    }>

const registryCompactQuery = sourceQuery<
  { query: string; paginationOpts: { cursor: string | null; numItems: number } },
  RegistryCompactResult
>('x402DirectoryIndex:searchCompact')

type RegistryStatusResult = Readonly<{
  kind: 'unavailable' | 'ready'
  coverage?: Readonly<{ generation: string; completedAt: number }>
}>

const registryStatusQuery = sourceQuery<Record<string, never>, RegistryStatusResult>('x402DirectoryIndex:status')

/**
 * The cursor is bound to the index's active generation, not the user's query.
 * The index still owns cursor validation for changed queries or filters.
 */
async function resolveInnerRegistryCursor(cursor: string): Promise<string | undefined> {
  const status = await callPublicSourceQuery(registryStatusQuery, {})
  const generation = status.kind === 'ready' ? status.coverage?.generation : undefined
  if (generation === undefined) return undefined
  return decodeOpaqueCursor(cursor, { kind: 'registry', scope: generation })
}

export const Route = createFileRoute('/api/v1/registry')({
  server: {
    handlers: defineRouteHandlers({
      GET: ({ request }) => handleApiRegistryRequest(request),
      HEAD: ({ request }) => handleApiRegistryRequest(request, true),
    }),
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
        if (innerCursor === undefined) return invalidRegistryCursorResponse()
        const freshness = head ? undefined : await readDirectoryFreshnessField()
        let count = parsed.data.limit
        let initialGeneration: string | undefined
        for (;;) {
          // Re-query the same input cursor with fewer rows rather than slicing
          // a page: only the index can produce the correct continuation cursor.
          const projection = await callPublicSourceQuery(registryCompactQuery, {
            query: parsed.data.query,
            paginationOpts: { cursor: innerCursor, numItems: count },
          })
          if (projection.kind === 'unavailable') return unavailableRegistryResponse(projection.reason)
          if (projection.page.length > count || (!projection.isDone && !projection.continueCursor)) return registryUnavailable()
          const generation = projection.coverage.generation
          if (initialGeneration !== undefined && generation !== initialGeneration) return registryUnavailable()
          initialGeneration = generation
          if (parsed.data.cursor !== undefined) {
            const cursorForGeneration = decodeOpaqueCursor(parsed.data.cursor, { kind: 'registry', scope: generation })
            if (cursorForGeneration === undefined) return invalidRegistryCursorResponse()
          }
          const headers = {
            'Cache-Control': 'public, max-age=60, stale-while-revalidate=240',
          }
          if (head) return new Response(null, { status: 200, headers })
          const page = projection.page.map(row => ({
            id: row.id,
            source: row.source,
            access: row.choice.access,
            ...(row.choice.reason === undefined ? {} : { reason: row.choice.reason }),
            ...(row.sourceRouteRef === undefined ? {} : { sourceRouteRef: row.sourceRouteRef }),
            ...(row.toolRef === undefined ? {} : { toolRef: row.toolRef }),
            title: row.title,
            summary: row.summary,
            provider: row.provider,
            actionClass: row.actionClass,
            objectClass: row.objectClass,
            ...(row.category === undefined ? {} : { category: row.category }),
            completedAt: row.completedAt,
            detailRef: `/api/v1/registry/detail?id=${encodeURIComponent(row.id)}`,
          }))
          const pagination = toolCatalogPaginationSchema.parse({
            limit: parsed.data.limit,
            ...(!projection.isDone && projection.continueCursor
              ? { nextCursor: encodeOpaqueCursor({ kind: 'registry', scope: generation, cursor: projection.continueCursor }) }
              : {}),
            hasMore: !projection.isDone,
          })
          const body = JSON.stringify({
            schemaVersion: 'api-registry:v4',
            query: parsed.data.query,
            kind: projection.kind,
            coverage: projection.coverage,
            page,
            pagination,
            freshness,
          })
          if (Buffer.byteLength(body, 'utf8') <= MAX_REGISTRY_RESPONSE_BYTES) {
            return new Response(body, { status: 200, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } })
          }
          if (page.length === 0 || count === 1) return registryUnavailable()
          count = Math.min(count - 1, page.length - 1)
        }
      })
    } catch (error) {
      response = registryError(error)
    }
    return withRequestCorrelationHeader(response, correlationId)
  })
}

function invalidRegistryCursorResponse(): Response {
  return problem({
    status: 400,
    kind: 'INVALID_ARGUMENT',
    code: 'invalid_cursor',
    detail: 'The supplied pagination cursor is invalid or expired.',
  })
}

function unavailableRegistryResponse(reason: string): Response {
  if (reason === 'cursor_invalid') return invalidRegistryCursorResponse()
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
