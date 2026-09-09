import { createFileRoute } from '@tanstack/react-router'

import { kindForStatus } from '@/lib/errors'
import { callPublicSourceQuery, ConvexSourceError, sourceQuery } from '@/lib/server/convex-source'
import { methodNotAllowed } from '@/lib/server/method-guard'
import { problem } from '@/lib/server/problem'
import { withHttpRateLimit } from '@/lib/server/rate-limit'
import { runWithRequestCorrelation, withRequestCorrelationHeader } from '@/lib/server/request-correlation'

type DirectoryStatus = {
  kind: 'unavailable' | 'ready'
  coverage?: { generation: string; completedAt: number }
  refreshState: 'none' | 'refreshing' | 'complete' | 'failed'
  lastError?: string
}

const directoryStatus = sourceQuery<Record<string, never>, DirectoryStatus>('x402DirectoryIndex:status')

export const Route = createFileRoute('/api/v1/catalogue-status')({
  server: {
    handlers: {
      GET: ({ request }) => handleCatalogueStatusRequest(request),
      HEAD: ({ request }) => handleCatalogueStatusRequest(request, true),
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

export async function handleCatalogueStatusRequest(request: Request, head = false): Promise<Response> {
  return await runWithRequestCorrelation(request, async ({ correlationId }) => {
    let response: Response
    try {
      response = await withHttpRateLimit(request, 'public-read', async () => {
        const status = await callPublicSourceQuery(directoryStatus, {})
        const body = catalogueFreshness(status, Date.now())
        const headers = { 'Cache-Control': 'no-store' }
        return head ? new Response(null, { status: 200, headers }) : Response.json(body, { headers })
      })
    } catch (error) {
      response = catalogueStatusError(error)
    }
    return withRequestCorrelationHeader(response, correlationId)
  })
}

export const CATALOGUE_STALE_AFTER_MS = 36 * 60 * 60 * 1000

export function catalogueFreshness(status: DirectoryStatus, now: number) {
  const completedAt = status.coverage?.completedAt
  const state = status.kind === 'unavailable' || completedAt === undefined
    ? 'absent' as const
    : status.refreshState === 'failed'
      ? 'failed' as const
      : now - completedAt > CATALOGUE_STALE_AFTER_MS
        ? 'stale' as const
        : 'fresh' as const
  return {
    schemaVersion: 'catalogue-status:v1' as const,
    status: state,
    refreshState: status.refreshState,
    ...(status.coverage === undefined ? {} : { generation: status.coverage.generation, completedAt: status.coverage.completedAt, ageHours: Math.round((now - status.coverage.completedAt) / 3_600_000) }),
    ...(status.lastError === undefined ? {} : { lastError: status.lastError }),
  }
}

function catalogueStatusError(error: unknown): Response {
  if (error instanceof ConvexSourceError) return problem({ status: error.status, kind: kindForStatus(error.status), code: error.code })
  return problem({ status: 503, kind: 'UNAVAILABLE', code: 'catalogue_status_unavailable' })
}
