const cspModes = ['report-only', 'enforce'] as const
export type CspMode = (typeof cspModes)[number]

export type SecurityHeaderBuildOptions = {
  cspMode?: CspMode
}

export type SecurityHeaderEnv = Record<string, string | undefined>

const cspReportOnlyEnvName = 'AE_CSP_REPORT_ONLY'

const cspDirectiveNames = [
  'default-src',
  'base-uri',
  'object-src',
  'frame-ancestors',
  'form-action',
  'script-src',
  'style-src',
  'img-src',
  'font-src',
  'connect-src',
  'frame-src',
  'worker-src',
  'manifest-src',
  'media-src',
] as const

type CspDirectiveName = (typeof cspDirectiveNames)[number]

// CSP allows 'unsafe-inline' for script-src and style-src because TanStack Start's SSR
// hydration (`<Scripts />` in src/routes/__root.tsx) runs inline bootstrap scripts, and
// third-party embeds (Clerk, PostHog) inject inline styles. Dropping 'unsafe-inline' needs a
// per-request nonce (or precomputed hashes) threaded through the SSR render, which is out of
// scope here — tracked as a follow-up tightening once nonce plumbing lands.
const cspDirectives = {
  'default-src': ["'self'"],
  'base-uri': ["'self'"],
  'object-src': ["'none'"],
  'frame-ancestors': ["'none'"],
  'form-action': ["'self'"],
  'script-src': [
    "'self'",
    "'unsafe-inline'",
    'https://*.clerk.accounts.dev',
    'https://*.clerk.com',
    'https://challenges.cloudflare.com',
    'https://*.posthog.com',
    'https://*.i.posthog.com',
    'https://browser.sentry-cdn.com',
  ],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': [
    "'self'",
    'data:',
    'blob:',
    'https://*.clerk.accounts.dev',
    'https://*.clerk.com',
    'https://*.googleusercontent.com',
    'https://*.googleapis.com',
    'https://*.gstatic.com',
    'https://*.posthog.com',
    'https://*.i.posthog.com',
  ],
  'font-src': ["'self'", 'data:'],
  'connect-src': [
    "'self'",
    'https://*.clerk.accounts.dev',
    'https://*.clerk.com',
    'wss://*.clerk.com',
    'https://*.convex.cloud',
    'https://*.convex.site',
    'wss://*.convex.cloud',
    'wss://*.convex.site',
    'https://*.ingest.sentry.io',
    'https://*.sentry.io',
    'https://*.posthog.com',
    'https://*.i.posthog.com',
  ],
  'frame-src': [
    "'self'",
    'https://*.clerk.accounts.dev',
    'https://*.clerk.com',
    'https://challenges.cloudflare.com',
  ],
  'worker-src': ["'self'", 'blob:'],
  'manifest-src': ["'self'"],
  'media-src': ["'self'", 'data:', 'blob:'],
} satisfies Record<CspDirectiveName, readonly string[]>

const securityHeaderNames = [
  'Referrer-Policy',
  'Permissions-Policy',
  'X-Content-Type-Options',
  'X-Frame-Options',
] as const

type StaticSecurityHeaderName = (typeof securityHeaderNames)[number]

const staticSecurityHeaders = {
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
} satisfies Record<StaticSecurityHeaderName, string>

// Production defaults to an enforcing Content-Security-Policy; AE_CSP_REPORT_ONLY only matters
// there as an explicit opt-in back into report-only during a staged rollout (any value other
// than 'false'/'0' requests it). Non-production keeps the original report-only-by-default
// behavior unchanged so local dev never breaks on a policy violation.
export function resolveCspModeFromEnv(env: SecurityHeaderEnv = process.env): CspMode {
  const raw = env[cspReportOnlyEnvName]?.trim().toLowerCase()

  if (env.NODE_ENV === 'production') {
    const reportOnlyRequested = raw !== undefined && raw !== 'false' && raw !== '0'
    return reportOnlyRequested ? 'report-only' : 'enforce'
  }

  return raw === 'false' || raw === '0' ? 'enforce' : 'report-only'
}

export function buildContentSecurityPolicy(): string {
  return cspDirectiveNames
    .map((directive) => `${directive} ${cspDirectives[directive].join(' ')}`)
    .join('; ')
}

export function buildSecurityHeaders(options: SecurityHeaderBuildOptions = {}): Headers {
  const cspMode = options.cspMode ?? 'report-only'
  const headers = new Headers()
  headers.set(cspHeaderName(cspMode), buildContentSecurityPolicy())

  for (const name of securityHeaderNames) {
    headers.set(name, staticSecurityHeaders[name])
  }

  return headers
}

export function applySecurityHeadersToResponse(response: Response, options: SecurityHeaderBuildOptions = {}): Response {
  if (!isSecurityHeaderResponse(response)) {
    return response
  }

  const headers = new Headers(response.headers)
  const cspMode = options.cspMode ?? 'report-only'
  headers.delete(cspHeaderName(cspMode === 'report-only' ? 'enforce' : 'report-only'))

  for (const [name, value] of buildSecurityHeaders({ cspMode })) {
    headers.set(name, value)
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function isSecurityHeaderResponse(response: Response): boolean {
  const contentType = response.headers.get('content-type')
  if (contentType === null) {
    return false
  }

  const mimeType = contentType.split(';')[0]?.trim().toLowerCase()
  return mimeType === 'text/html' || mimeType === 'application/json' || mimeType?.endsWith('+json') === true
}

function cspHeaderName(mode: CspMode): 'Content-Security-Policy' | 'Content-Security-Policy-Report-Only' {
  return mode === 'enforce' ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only'
}
