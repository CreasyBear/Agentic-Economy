import type { AnyRouter } from '@tanstack/react-router'
import type { PostHog } from 'posthog-js'

import { readObservabilityClientConfig } from '@/lib/observability/config'
import { buildFunnelEventProperties, type FunnelCaptureInput } from '@/lib/observability/funnel-event-props'
import { protectPostHogEvent } from './posthog-event-safety'
import {
  isTelemetryAllowedForCurrentRoute,
  safeTelemetryPath,
  sanitizeTelemetryValue,
  securePrivateRecordLocation,
} from '@/lib/observability/private-route-safety'


let initialized = false
let posthogClient: PostHog | undefined
let initPromise: Promise<boolean> | undefined
let adminAnalyticsBlocked = false

// Admin browsing is operational work, not acquisition. Once this page runtime
// visits admin, exclude its product analytics until a fresh page load. Sentry's
// independently redacted error reporting remains available.
function productAnalyticsAllowed(): boolean {
  if (typeof window === 'undefined') return false
  adminAnalyticsBlocked ||= /^\/admin(?:\/|$)/.test(window.location.pathname)
  return !adminAnalyticsBlocked && isTelemetryAllowedForCurrentRoute()
}

export function initPostHogClient(router?: AnyRouter): boolean {
  if (initialized) {
    return true
  }

  if (typeof window === 'undefined') {
    return false
  }

  void ensurePostHogClient(router)
  return initialized
}

export function captureClientFunnelEvent(input: FunnelCaptureInput): void {
  if (!productAnalyticsAllowed()) return
  void ensurePostHogClient().then((ready) => {
    if (!ready || posthogClient === undefined || !productAnalyticsAllowed()) {
      return
    }

    posthogClient.capture(
      String(sanitizeTelemetryValue(input.eventType)),
      sanitizeTelemetryValue(buildFunnelEventProperties(input)) as Record<string, unknown>,
    )
  }).catch(() => {})
}

export function captureClientProductEvent(event: string, properties?: Record<string, unknown>): void {
  if (!productAnalyticsAllowed()) return
  void ensurePostHogClient().then((ready) => {
    if (!ready || posthogClient === undefined || !productAnalyticsAllowed()) {
      return
    }

    posthogClient.capture(
      String(sanitizeTelemetryValue(event)),
      sanitizeTelemetryValue(properties ?? {}) as Record<string, unknown>,
    )
  }).catch(() => {})
}

/** Joins this browser's anonymous events to the signed-in account's journey digest. */
export function identifyPostHogAccount(distinctId: string): void {
  if (!productAnalyticsAllowed()) return
  void ensurePostHogClient().then((ready) => {
    if (ready && posthogClient !== undefined && posthogClient.get_distinct_id() !== distinctId) posthogClient.identify(distinctId)
  }).catch(() => {})
}

export type AttributionTouch = {
  source?: string; medium?: string; campaign?: string; content?: string; term?: string
  referrer?: string; landingPath?: string; clickId?: string; at: number
}

/** Maps PostHog campaign props (`$initial_*` for first touch, `$session_entry_*` for last) to a stored touch. Path only, never the query. */
export function buildAttributionTouch(props: Record<string, unknown>, prefix: '$initial_' | '$session_entry_', at: number): AttributionTouch | undefined {
  const str = (key: string): string | undefined => {
    const value = props[prefix + key]
    return typeof value === 'string' && value !== '' && value !== '$direct' ? value.slice(0, 200) : undefined
  }
  const url = str('current_url') ?? str('url')
  let pathname = str('pathname')
  if (pathname === undefined && url !== undefined) try { pathname = new URL(url).pathname } catch { /* ignore */ }
  const landingPath = pathname === undefined ? undefined : safeTelemetryPath({ pathname })
  const touch = {
    source: str('utm_source'), medium: str('utm_medium'), campaign: str('utm_campaign'),
    content: str('utm_content'), term: str('utm_term'), referrer: str('referring_domain'),
    landingPath, clickId: str('gclid') ?? str('fbclid') ?? str('msclkid'),
  }
  const present = Object.entries(touch).filter(([, value]) => value !== undefined)
  return present.length === 0 ? undefined : { ...Object.fromEntries(present), at }
}

/** First touch from PostHog's persisted initial person info; last touch from this session's entry props. */
export async function readPostHogAttribution(): Promise<{ firstTouch?: AttributionTouch; lastTouch?: AttributionTouch } | undefined> {
  if (!productAnalyticsAllowed() || !(await ensurePostHogClient()) || posthogClient === undefined) return undefined
  // Session start stamps both touches; the server overrides firstTouch.at with the account's createdAt.
  const at = posthogClient.sessionManager?.checkAndGetSessionAndWindowId(true).sessionStartTimestamp ?? Date.now()
  const firstTouch = buildAttributionTouch(posthogClient.persistence?.get_initial_props() ?? {}, '$initial_', at)
  const lastTouch = buildAttributionTouch(posthogClient.sessionPropsManager?.getSessionProps() ?? {}, '$session_entry_', at)
  return firstTouch === undefined && lastTouch === undefined ? undefined : { ...(firstTouch && { firstTouch }), ...(lastTouch && { lastTouch }) }
}

/** Sign-out starts a fresh anonymous identity so the next visitor on this browser is not attributed to the account. */
export function resetPostHogAccount(): void {
  posthogClient?.reset()
}

function ensurePostHogClient(router?: AnyRouter): Promise<boolean> {
  if (typeof window === 'undefined') {
    return Promise.resolve(false)
  }
  securePrivateRecordLocation(window.location, window.history)
  if (!productAnalyticsAllowed()) return Promise.resolve(false)
  if (initialized) return Promise.resolve(true)
  const config = readObservabilityClientConfig()
  const key = config.posthogKey
  if (!config.enabled || key === undefined) return Promise.resolve(false)

  initPromise ??= import('posthog-js')
    .then(({ default: posthog }) => {
      if (!productAnalyticsAllowed()) return false
      posthog.init(key, {
        api_host: config.posthogHost,
        person_profiles: 'identified_only',
        capture_pageview: false,
        capture_pageleave: false,
        autocapture: false,
        persistence: 'localStorage+cookie',
        cross_subdomain_cookie: /(^|\.)aecon\.ai$/.test(window.location.hostname),
        disable_session_recording: true,
        before_send: protectPostHogEvent,
        loaded: (ph) => {
          ph.register({
            ae_environment: config.environment,
            ...(config.release === undefined ? {} : { ae_release: config.release }),
          })
        },
      })
      registerPostHogPageviews(posthog, router)
      posthogClient = posthog
      initialized = true
      return true
    })
    .catch(() => false)

  return initPromise
}

function registerPostHogPageviews(posthog: PostHog, router: AnyRouter | undefined): void {
  const capturePageview = () => {
    securePrivateRecordLocation(window.location, window.history)
    if (!productAnalyticsAllowed()) return
    const pathname = safeTelemetryPath(window.location)
    posthog.capture('$pageview', { $current_url: pathname, ae_pathname: pathname })
  }
  if (router === undefined) {
    capturePageview()
    return
  }

  router.subscribe('onResolved', capturePageview)
}
