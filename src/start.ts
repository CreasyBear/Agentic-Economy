import { clerkMiddleware } from '@clerk/tanstack-react-start/server'
import { createCsrfMiddleware, createMiddleware, createStart } from '@tanstack/react-start'
import type * as SentryServer from '@/lib/observability/sentry.server'
import type { currentRequestCorrelationId } from '@/lib/server/request-correlation'

import { applySecurityHeadersToResponse, resolveCspModeFromEnv } from '@/lib/http/security-headers'
import { createSourceWriteAdmissionMiddleware } from '@/lib/server/source-write-admission'
import { apiRequestBoundaryResponse } from '@/lib/server/api-request-boundary'

import { negotiateAgentPage } from '@/lib/http/agent-content-negotiation'
import { respondWithAgentPageMarkdown } from '@/lib/server/agent-page-markdown'
import { clerkMiddlewareConfigured } from '@/lib/deployment/environment'
import { resolveCanonicalBaseUrl, resolveCanonicalOrigin } from '@/lib/server/canonical-url'
import { sanitizeTelemetryError, sanitizeTelemetryValue } from '@/lib/observability/private-route-safety'
import { boundaryCauseKind, captureBackendException } from '@/lib/observability/degrade-backend'

// This shared entry is also evaluated in the browser. Validate shared server
// prerequisites on first request; the full money manifest is checked at new
// money initiation and by readiness.
// Requires an exact safe router probe. Ensures diagnostics can explain invalid
// boot/auth configuration, including release identity, without admitting pages,
// writes or server functions.
// Invariant: diagnostic reads never mark validation successful; readiness still
// runs its own checks. The Clerk callback has separate identity admission.
function isRouterDiagnosticRead(ctx: { request: Request; handlerType: 'router' | 'serverFn' }): boolean {
  if (ctx.handlerType !== 'router' || (ctx.request.method !== 'GET' && ctx.request.method !== 'HEAD')) return false
  const path = new URL(ctx.request.url).pathname
  return (path === '/api/health' || path === '/api/ready' || path === '/api/v1/release')
    && apiRequestBoundaryResponse(ctx.request) === undefined
}

function isClerkWebhookRequest(ctx: { request: Request; handlerType: 'router' | 'serverFn' }): boolean {
  return ctx.handlerType === 'router' && ctx.request.method === 'POST'
    && new URL(ctx.request.url).pathname === '/api/clerk/webhook'
    && apiRequestBoundaryResponse(ctx.request) === undefined
}

const bootEnvironmentMiddleware = createMiddleware().server(async (ctx) => {
  if (isRouterDiagnosticRead(ctx)) return ctx.next()
  const { ensureBootEnvironmentValidated, ensureClerkWebhookEnvironmentValidated } = await import('@/lib/deployment/validate-boot-env.server')
  if (isClerkWebhookRequest(ctx)) ensureClerkWebhookEnvironmentValidated()
  else ensureBootEnvironmentValidated()
  return ctx.next()
})

const requestCorrelationMiddleware = createMiddleware().server(async (ctx) => {
  const { runWithRequestCorrelation, withRequestCorrelationHeader } = await import('@/lib/server/request-correlation')
  const result = await runWithRequestCorrelation(ctx.request, () => ctx.next())
  return {
    ...result,
    response: withRequestCorrelationHeader(result.response),
  }
})

let serverTelemetry: Readonly<{ sentry: typeof SentryServer; requestId: typeof currentRequestCorrelationId }> | undefined
let serverTelemetryStarted = false

export const observabilityRequestMiddleware = createMiddleware().server(async (ctx) => {
  const url = new URL(ctx.request.url)
  if (isRouterDiagnosticRead(ctx)) return ctx.next()

  if (!serverTelemetryStarted) {
    serverTelemetryStarted = true
    // Telemetry setup is background work; neither imports nor remote SDK setup
    // can hold a user request hostage. The first request is served normally.
    void Promise.all([
      import('@/lib/observability/config'),
      import('@/lib/observability/sentry.server'),
      import('@/lib/server/request-correlation'),
    ]).then(([{ readObservabilityServerConfig }, sentry, { currentRequestCorrelationId: requestId }]) => {
      if (!readObservabilityServerConfig().enabled) return
      sentry.initSentryServer()
      serverTelemetry = { sentry, requestId }
    }).catch((cause: unknown) => {
      captureBackendException(boundaryCauseKind(cause), { site: 'observabilityRequestMiddleware.init' }, 'warning')
    })
    return ctx.next()
  }

  try {
    return await ctx.next()
  } catch (error) {
    const telemetry = serverTelemetry
    if (telemetry !== undefined) {
      try {
        telemetry.sentry.Sentry.withIsolationScope((scope) => {
          scope.setTag('ae.path', String(sanitizeTelemetryValue(url.pathname, 'ae.path')))
          const correlationId = telemetry.requestId()
          if (correlationId !== undefined) scope.setTag('ae.request_id', String(sanitizeTelemetryValue(correlationId)))
          telemetry.sentry.captureServerException(sanitizeTelemetryError(error), {
            'ae.path': String(sanitizeTelemetryValue(url.pathname, 'ae.path')),
          })
        })
      } catch (cause) {
        // Logging cannot replace the request's original error; omit sensitive telemetry details.
        captureBackendException(boundaryCauseKind(cause), { site: 'observabilityRequestMiddleware.capture' }, 'warning')
      }
    }
    throw error
  }
})
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
})
const sourceWriteAdmissionMiddleware = createSourceWriteAdmissionMiddleware()
export const securityHeadersRequestMiddleware = createMiddleware().server(async (ctx) => {
  const result = await ctx.next()
  const response = applySecurityHeadersToResponse(result.response, { cspMode: resolveCspModeFromEnv() })
  if (new URL(ctx.request.url).pathname === '/') {
    response.headers.set('Link', '</llms.txt>; rel="describedby"; type="text/plain", </.well-known/api-catalog>; rel="api-catalog"')
  }
  return { ...result, response }
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

export const startInstance = createStart(() => ({
  requestMiddleware: [
    bootEnvironmentMiddleware,
    requestCorrelationMiddleware,
    apiRequestBoundaryMiddleware,
    observabilityRequestMiddleware,
    securityHeadersRequestMiddleware,
    agentContentNegotiationMiddleware,
    csrfMiddleware,
    sourceWriteAdmissionMiddleware,
    ...clerkPreviewOrProductionMiddleware(),
  ],
}))

const publicPagePaths: Record<string, true> = {
  '/': true, '/about': true, '/market': true, '/for-agents': true, '/for-providers': true,
  '/privacy': true, '/terms': true, '/support': true, '/status': true,
}
const protectedTopLevelPaths: Record<string, true> = {
  '/account': true, '/admin': true, '/agent-access': true, '/api': true,
  '/activity': true, '/fund': true, '/mcp': true, '/owner': true,
  '/sign-in': true, '/sign-up': true, '/t': true, '/trial': true,
}

function isPublicDocumentRequest(request: Request, pathname: string): boolean {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false
  if (publicPagePaths[pathname] === true) return true
  if (/^\/(?:tools|providers|privacy|developers|s)\/[^/]+/u.test(pathname)) return true
  // A single-segment Business slug is public; reserved workspaces and auth
  // entry points are never treated as Businesses.
  return /^\/[a-z0-9-]+$/u.test(pathname) && protectedTopLevelPaths[pathname] !== true
}

export function clerkPreviewOrProductionMiddleware() {
  if (!clerkMiddlewareConfigured(process.env)) return []
  return [createMiddleware().server((ctx) => {
    // Exact service callbacks passed identity boot admission and verify their
    // native Svix signature in the route; browser sessions are not their auth.
    if (isRouterDiagnosticRead(ctx) || isClerkWebhookRequest(ctx)) return ctx.next()
    const pathname = new URL(ctx.request.url).pathname
    const browserChatSession = (pathname === '/api/v1/chat/turns' || pathname.startsWith('/api/v1/chat/turns/'))
      && !ctx.request.headers.has('authorization')
    if (isPublicDocumentRequest(ctx.request, pathname)) return ctx.next()
    if (!browserChatSession && (pathname === '/mcp' || pathname.startsWith('/api/v1/'))) return ctx.next()
    // Construct auth only after exact router diagnostic/public-read admission:
    // even broken auth configuration cannot intercept diagnostic reads.
    const clerk = clerkMiddleware(() => {
      // Machine handlers retain their own bearer admission; browser sessions
      // retain Clerk. This does not change either route's authentication policy.
      const origin = resolveCanonicalOrigin()
      return origin.startsWith('https://') ? { authorizedParties: [origin] } : {}
    })
    const serve = clerk.options.server
    if (serve === undefined) throw new Error('Clerk request middleware is missing its server handler')
    return serve(ctx)
  })]
}
