import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { kindForStatus } from '@/lib/errors'
import { callPublicSourceQuery, ConvexSourceError, sourceQuery } from '@/lib/server/convex-source'
import { defineRouteHandlers } from '@/lib/server/gateway-json-route'
import { duplicateQueryParameterProblem, problem, zodIssueDetail } from '@/lib/server/problem'
import { withHttpRateLimit } from '@/lib/server/rate-limit'
import { runWithRequestCorrelation, withRequestCorrelationHeader } from '@/lib/server/request-correlation'
import { readDirectoryFreshnessField } from '@/modules/market/x402-directory-index.server'
import type { DirectoryChoice } from '@/modules/market/x402-directory'

const detailQuery = z.strictObject({ id: z.string().regex(/^registry:[a-f0-9]{64}$/u) })
const registryDetailQuery = sourceQuery<
  { id: string },
  | Readonly<{ kind: 'unavailable'; reason: string }>
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{
      kind: 'found'
      coverage: Readonly<{ generation: string; completedAt: number }>
      item: Readonly<{ toolRef?: string; choice?: DirectoryChoice; entry: Readonly<{ metadataJson: string }> }> & Readonly<Record<string, unknown>>
    }>
>('x402DirectoryIndex:detailById')

export const Route = createFileRoute('/api/v1/registry/detail')({
  server: {
    handlers: defineRouteHandlers({
      GET: ({ request }) => handleApiRegistryDetailRequest(request),
    }),
  },
})

export async function handleApiRegistryDetailRequest(request: Request): Promise<Response> {
  return await runWithRequestCorrelation(request, async ({ correlationId }) => {
    let response: Response
    try {
      response = await withHttpRateLimit(request, 'public-read', async () => {
        const url = new URL(request.url)
        const duplicateParam = duplicateQueryParameterProblem(url)
        if (duplicateParam !== undefined) return duplicateParam
        const params = Object.fromEntries(url.searchParams)
        const parsed = detailQuery.safeParse(params)
        if (!parsed.success) {
          return problem({ status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_query_parameter', detail: zodIssueDetail(parsed.error) })
        }
        const result = await callPublicSourceQuery(registryDetailQuery, { id: parsed.data.id })
        if (result.kind === 'not_found') return problem({ status: 404, kind: 'NOT_FOUND', code: 'registry_entry_not_found' })
        if (result.kind === 'unavailable') {
          return result.reason === 'query_invalid'
            ? problem({ status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_query_parameter' })
            : problem({ status: 503, kind: 'UNAVAILABLE', code: 'registry_unavailable' }, { 'Retry-After': '30' })
        }
        const choice = result.item.choice ?? { access: 'unavailable' as const }
        return Response.json({
          schemaVersion: 'api-registry-detail:v1',
          kind: 'found',
          id: parsed.data.id,
          access: choice.access,
          ...(choice.reason === undefined ? {} : { reason: choice.reason }),
          coverage: result.coverage,
          item: result.item,
          freshness: await readDirectoryFreshnessField(),
        }, { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=240' } })
      })
    } catch (error) {
      response = error instanceof ConvexSourceError
        ? problem({ status: error.status, kind: kindForStatus(error.status), code: error.code })
        : problem({ status: 503, kind: 'UNAVAILABLE', code: 'registry_unavailable' }, { 'Retry-After': '30' })
    }
    return withRequestCorrelationHeader(response, correlationId)
  })
}
