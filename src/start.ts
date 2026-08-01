import { clerkMiddleware } from '@clerk/tanstack-react-start/server'
import { createCsrfMiddleware, createMiddleware, createStart } from '@tanstack/react-start'

import { applySecurityHeadersToResponse, resolveCspModeFromEnv } from '@/lib/http/security-headers'
import { isLocalE2EAuthBypassEnabled } from '@/lib/server/local-e2e-bypass'
import { createSourceWriteAdmissionMiddleware } from '@/lib/server/source-write-admission'
import { negotiateAgentPage } from '@/lib/http/agent-content-negotiation'
import { respondWithAgentPageMarkdown } from '@/lib/server/agent-page-markdown'
import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'

const observabilityRequestMiddleware = createMiddleware().server(async (ctx) => {
  const { readObservabilityServerConfig } = await import('@/lib/observability/config')
  const config = readObservabilityServerConfig()
  if (!config.enabled) {
    return ctx.next()
  }

  const [{ flushPostHogServer }, { captureServerException, initSentryServer, Sentry }] = await Promise.all([
    import('@/lib/observability/posthog.server'),
    import('@/lib/observability/sentry.server'),
  ])

  initSentryServer()
  const url = new URL(ctx.request.url)

  return Sentry.withIsolationScope(async (scope) => {
    scope.setTag('ae.path', url.pathname)

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
        ctx.request,
        negotiation.path,
        resolveCanonicalBaseUrl(ctx.request).baseUrl,
      )
})

const clerkRequestMiddleware = isLocalE2EAuthBypassEnabled() ? [] : [clerkMiddleware()]

export const startInstance = createStart(() => ({
  requestMiddleware: [
    observabilityRequestMiddleware,
    securityHeadersRequestMiddleware,
    agentContentNegotiationMiddleware,
    csrfMiddleware,
    sourceWriteAdmissionMiddleware,
    ...clerkRequestMiddleware,
  ],
}))
