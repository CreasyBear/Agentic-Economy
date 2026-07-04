import { clerkMiddleware } from '@clerk/tanstack-react-start/server'
import { createCsrfMiddleware, createMiddleware, createStart } from '@tanstack/react-start'

import { applySecurityHeadersToResponse, resolveCspModeFromEnv } from '@/lib/http/security-headers'
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

const clerkRequestMiddleware = usesClerkBypass() ? [] : [clerkMiddleware()]

function usesClerkBypass(): boolean {
  if (process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E !== 'true') {
    return false
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E cannot be enabled in production.')
  }

  return true
}

export const startInstance = createStart(() => ({
  requestMiddleware: [
    observabilityRequestMiddleware,
    securityHeadersRequestMiddleware,
    csrfMiddleware,
    sourceWriteAdmissionMiddleware,
    ...clerkRequestMiddleware,
  ],
}))
