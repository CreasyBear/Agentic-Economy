import { describe, expect, it } from 'vitest'

import {
  applySecurityHeadersToResponse,
  buildContentSecurityPolicy,
  buildSecurityHeaders,
  resolveCspModeFromEnv,
} from '@/lib/http/security-headers'

const staticSecurityHeaders = {
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
} as const

const requiredCspAllowances = [
  "frame-ancestors 'none'",
  'https://*.clerk.accounts.dev',
  'https://*.clerk.com',
  'wss://*.clerk.com',
  'https://*.posthog.com',
  'https://*.i.posthog.com',
  'https://*.ingest.sentry.io',
  'https://*.sentry.io',
  'https://*.convex.cloud',
  'https://*.convex.site',
  'wss://*.convex.cloud',
  'wss://*.convex.site',
] as const

describe('security header middleware', () => {
  it('emits report-only CSP unless rollout configuration opts into enforcement', () => {
    const headers = buildSecurityHeaders()

    expect(headers.get('Content-Security-Policy-Report-Only')).toBe(buildContentSecurityPolicy())
    expect(headers.has('Content-Security-Policy')).toBe(false)
  })

  it('emits the enforcing CSP header when enforcement mode is requested', () => {
    const headers = buildSecurityHeaders({ cspMode: 'enforce' })

    expect(headers.get('Content-Security-Policy')).toBe(buildContentSecurityPolicy())
    expect(headers.has('Content-Security-Policy-Report-Only')).toBe(false)
  })

  it('sets the exact static browser hardening headers', () => {
    const headers = buildSecurityHeaders({ cspMode: 'report-only' })

    for (const [name, value] of Object.entries(staticSecurityHeaders)) {
      expect(headers.get(name), name).toBe(value)
    }
  })

  it('keeps CSP frame blocking and production third-party allowances in the builder output', () => {
    const csp = buildContentSecurityPolicy()

    for (const expected of requiredCspAllowances) {
      expect(csp, expected).toContain(expected)
    }
  })

  it('resolves an enforcing default in production, opting into report-only only when explicitly requested', () => {
    const cases = [
      { name: 'unset AE_CSP_REPORT_ONLY enforces by default', env: { NODE_ENV: 'production' }, expected: 'enforce' },
      {
        name: 'false explicitly keeps enforcing',
        env: { NODE_ENV: 'production', AE_CSP_REPORT_ONLY: 'false' },
        expected: 'enforce',
      },
      {
        name: 'zero explicitly keeps enforcing',
        env: { NODE_ENV: 'production', AE_CSP_REPORT_ONLY: '0' },
        expected: 'enforce',
      },
      {
        name: 'true opts into report-only',
        env: { NODE_ENV: 'production', AE_CSP_REPORT_ONLY: 'true' },
        expected: 'report-only',
      },
    ] as const

    for (const { name, env, expected } of cases) {
      expect(resolveCspModeFromEnv(env), name).toBe(expected)
    }
  })

  it('resolves a report-only default outside production unless AE_CSP_REPORT_ONLY explicitly disables it', () => {
    const cases = [
      { name: 'unset env', env: {}, expected: 'report-only' },
      { name: 'development NODE_ENV keeps report-only default', env: { NODE_ENV: 'development' }, expected: 'report-only' },
      { name: 'false disables report-only', env: { AE_CSP_REPORT_ONLY: 'false' }, expected: 'enforce' },
      { name: 'zero disables report-only', env: { AE_CSP_REPORT_ONLY: '0' }, expected: 'enforce' },
      { name: 'true keeps report-only', env: { AE_CSP_REPORT_ONLY: 'true' }, expected: 'report-only' },
    ] as const

    for (const { name, env, expected } of cases) {
      expect(resolveCspModeFromEnv(env), name).toBe(expected)
    }
  })

  it('emits an enforcing Content-Security-Policy header by default in production, with report-only as an explicit opt-in and non-production untouched', () => {
    const productionDefault = buildSecurityHeaders({ cspMode: resolveCspModeFromEnv({ NODE_ENV: 'production' }) })
    expect(productionDefault.get('Content-Security-Policy')).toBe(buildContentSecurityPolicy())
    expect(productionDefault.has('Content-Security-Policy-Report-Only')).toBe(false)

    const productionReportOnly = buildSecurityHeaders({
      cspMode: resolveCspModeFromEnv({ NODE_ENV: 'production', AE_CSP_REPORT_ONLY: 'true' }),
    })
    expect(productionReportOnly.get('Content-Security-Policy-Report-Only')).toBe(buildContentSecurityPolicy())
    expect(productionReportOnly.has('Content-Security-Policy')).toBe(false)

    const nonProductionDefault = buildSecurityHeaders({ cspMode: resolveCspModeFromEnv({}) })
    expect(nonProductionDefault.get('Content-Security-Policy-Report-Only')).toBe(buildContentSecurityPolicy())
    expect(nonProductionDefault.has('Content-Security-Policy')).toBe(false)
  })

  it('applies security headers to HTML responses while preserving response status, body, and existing headers', async () => {
    const response = new Response('<!doctype html><h1>Agentic Economy</h1>', {
      status: 203,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Existing': 'keep-me',
      },
    })

    const secured = applySecurityHeadersToResponse(response, { cspMode: 'enforce' })

    expect(secured.status).toBe(203)
    expect(secured.headers.get('X-Existing')).toBe('keep-me')
    expect(secured.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'")
    expect(secured.headers.has('Content-Security-Policy-Report-Only')).toBe(false)
    expectStaticSecurityHeaders(secured.headers)
    await expect(secured.text()).resolves.toBe('<!doctype html><h1>Agentic Economy</h1>')
  })

  it('applies security headers to JSON responses', async () => {
    const response = Response.json({ ok: true }, { status: 201 })

    const secured = applySecurityHeadersToResponse(response, { cspMode: 'report-only' })

    expect(secured.status).toBe(201)
    expect(secured.headers.get('Content-Security-Policy-Report-Only')).toContain("frame-ancestors 'none'")
    expect(secured.headers.has('Content-Security-Policy')).toBe(false)
    expectStaticSecurityHeaders(secured.headers)
    await expect(secured.json()).resolves.toEqual({ ok: true })
  })

  it('does not attach security headers to plain text responses', async () => {
    const response = new Response('plain discovery file', {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })

    const untouched = applySecurityHeadersToResponse(response, { cspMode: 'enforce' })

    expect(untouched.headers.get('Content-Security-Policy')).toBeNull()
    expect(untouched.headers.get('Content-Security-Policy-Report-Only')).toBeNull()
    for (const name of Object.keys(staticSecurityHeaders)) {
      expect(untouched.headers.get(name), name).toBeNull()
    }
    await expect(untouched.text()).resolves.toBe('plain discovery file')
  })
})

function expectStaticSecurityHeaders(headers: Headers): void {
  for (const [name, value] of Object.entries(staticSecurityHeaders)) {
    expect(headers.get(name), name).toBe(value)
  }
}
