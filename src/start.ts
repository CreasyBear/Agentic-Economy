import { clerkMiddleware } from '@clerk/tanstack-react-start/server'
import { createCsrfMiddleware, createMiddleware, createStart } from '@tanstack/react-start'

import { applySecurityHeadersToResponse, resolveCspModeFromEnv } from '@/lib/http/security-headers'
import { isLocalE2EAuthBypassEnabled } from '@/lib/server/local-e2e-bypass'
import { createSourceWriteAdmissionMiddleware } from '@/lib/server/source-write-admission'

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

const clerkRequestMiddleware = isLocalE2EAuthBypassEnabled() ? [] : [clerkMiddleware()]

export const startInstance = createStart(() => ({
  requestMiddleware: [
    observabilityRequestMiddleware,
    securityHeadersRequestMiddleware,
    csrfMiddleware,
    sourceWriteAdmissionMiddleware,
    ...clerkRequestMiddleware,
  ],
}))
