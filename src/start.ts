import { clerkMiddleware } from '@clerk/tanstack-react-start/server'
import { createCsrfMiddleware, createMiddleware, createStart } from '@tanstack/react-start'

import { applySecurityHeadersToResponse, resolveCspModeFromEnv } from '@/lib/http/security-headers'
import { isLocalE2EAuthBypassEnabled } from '@/lib/server/local-e2e-bypass'
import { createSourceWriteAdmissionMiddleware } from '@/lib/server/source-write-admission'
import { apiRequestBoundaryResponse } from '@/lib/server/api-request-boundary'

import { negotiateAgentPage } from '@/lib/http/agent-content-negotiation'
import { respondWithAgentPageMarkdown } from '@/lib/server/agent-page-markdown'
import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'

const requestCorrelationMiddleware = createMiddleware().server(async (ctx) => {
  const { runWithRequestCorrelation, withRequestCorrelationHeader } = await import('@/lib/server/request-correlation')
  const result = await runWithRequestCorrelation(ctx.request, () => ctx.next())
  return {
    ...result,
    response: withRequestCorrelationHeader(result.response),
  }
})

export const observabilityRequestMiddleware = createMiddleware().server(async (ctx) => {
  const url = new URL(ctx.request.url)
  if (url.pathname === '/api/health' || url.pathname === '/api/ready') return ctx.next()

  const { readObservabilityServerConfig } = await import('@/lib/observability/config')
  const config = readObservabilityServerConfig()
  if (!config.enabled) return ctx.next()

  const [
    { flushPostHogServer },
    { captureServerException, initSentryServer, Sentry },
    { currentRequestCorrelationId },
  ] = await Promise.all([
    import('@/lib/observability/posthog.server'),
    import('@/lib/observability/sentry.server'),
    import('@/lib/server/request-correlation'),
  ])

  initSentryServer()

  return Sentry.withIsolationScope(async (scope) => {
    scope.setTag('ae.path', url.pathname)
    const requestId = currentRequestCorrelationId()
    if (requestId !== undefined) scope.setTag('ae.request_id', requestId)

    try {
      return await ctx.next()
    } catch (error) {
      captureServerException(error, { 'ae.path': url.pathname })
      throw error
    } finally {
      await flushPostHogServer().catch(() => undefined)
    }
  })
})
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
})
const sourceWriteAdmissionMiddleware = createSourceWriteAdmissionMiddleware()
const securityHeadersRequestMiddleware = createMiddleware().server(async (ctx) => {
  const result = await ctx.next()
  return {
    ...result,
    response: applySecurityHeadersToResponse(result.response, { cspMode: resolveCspModeFromEnv() }),
  }
})
/**
 * Placed after the security-header middleware so a negotiated markdown
 * response is decorated like every other response, and before authentication
 * because these are public reads.
 */
const agentContentNegotiationMiddleware = createMiddleware().server((ctx) => {
  const negotiation = negotiateAgentPage(ctx.request)
  return negotiation.kind === 'serve_html'
    ? ctx.next()
    : respondWithAgentPageMarkdown(
        negotiation.path,
        resolveCanonicalBaseUrl(ctx.request).baseUrl,
      )
})

const apiRequestBoundaryMiddleware = createMiddleware().server((ctx) =>
  apiRequestBoundaryResponse(ctx.request) ?? ctx.next(),
)

const clerkRequestMiddleware = isLocalE2EAuthBypassEnabled() ? [] : [clerkMiddleware()]
export const startInstance = createStart(() => ({

  requestMiddleware: [
    requestCorrelationMiddleware,
    apiRequestBoundaryMiddleware,
    observabilityRequestMiddleware,
    securityHeadersRequestMiddleware,
    agentContentNegotiationMiddleware,
    csrfMiddleware,
    sourceWriteAdmissionMiddleware,
    ...clerkRequestMiddleware,
  ],
}))
