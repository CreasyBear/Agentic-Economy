import type { AnyRouter } from '@tanstack/react-router'
import type { PostHog } from 'posthog-js'

import { readObservabilityClientConfig } from '@/lib/observability/config'
import { buildFunnelEventProperties, type FunnelCaptureInput } from '@/lib/observability/funnel-event-props'
import { getOrCreatePseudonymousSessionId } from '@/lib/observability/funnel-attribution'
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

function ensurePostHogClient(router?: AnyRouter): Promise<boolean> {
  if (typeof window === 'undefined') {
    return Promise.resolve(false)
  }
  securePrivateRecordLocation(window.location, window.history)
  if (!productAnalyticsAllowed()) return Promise.resolve(false)
  if (initialized) return Promise.resolve(true)

  initPromise ??= import('posthog-js')
    .then(({ default: posthog }) => {
      if (!productAnalyticsAllowed()) return false
      const config = readObservabilityClientConfig()
      if (!config.enabled || config.posthogKey === undefined) {
        return false
      }

      posthog.init(config.posthogKey, {
        api_host: config.posthogHost,
        person_profiles: 'identified_only',
        capture_pageview: false,
        capture_pageleave: false,
        autocapture: false,
        persistence: 'sessionStorage',
        disable_session_recording: true,
        before_send: protectPostHogEvent,
        loaded: (ph) => {
          ph.register({
            ae_environment: config.environment,
            ...(config.release === undefined ? {} : { ae_release: config.release }),
          })
        },
      })
      posthog.identify(getOrCreatePseudonymousSessionId())
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
