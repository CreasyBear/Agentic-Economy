import type { AnyRouter } from '@tanstack/react-router'
import type { PostHog } from 'posthog-js'

import { readObservabilityClientConfig } from '@/lib/observability/config'
import { buildFunnelEventProperties, type FunnelCaptureInput } from '@/lib/observability/funnel-event-props'
import { getOrCreatePseudonymousSessionId } from '@/lib/observability/funnel-attribution'
import {
  isTelemetryAllowedForCurrentRoute,
  safeTelemetryPath,
  sanitizeTelemetryValue,
  securePrivateRecordLocation,
} from '@/lib/observability/private-route-safety'


let initialized = false
let posthogClient: PostHog | undefined
let initPromise: Promise<boolean> | undefined

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
  if (typeof window === 'undefined' || !isTelemetryAllowedForCurrentRoute()) return
  void ensurePostHogClient().then((ready) => {
    if (!ready || posthogClient === undefined) {
      return
    }

    posthogClient.capture(input.eventType, sanitizeTelemetryValue(buildFunnelEventProperties(input)) as Record<string, unknown>)
  })
}

export function captureClientProductEvent(event: string, properties?: Record<string, unknown>): void {
  if (typeof window === 'undefined' || !isTelemetryAllowedForCurrentRoute()) return
  void ensurePostHogClient().then((ready) => {
    if (!ready || posthogClient === undefined) {
      return
    }

    posthogClient.capture(event, sanitizeTelemetryValue(properties ?? {}) as Record<string, unknown>)
  })
}

function ensurePostHogClient(router?: AnyRouter): Promise<boolean> {
  if (typeof window === 'undefined') {
    return Promise.resolve(false)
  }
  securePrivateRecordLocation(window.location, window.history)
  if (!isTelemetryAllowedForCurrentRoute()) return Promise.resolve(false)
  if (initialized) return Promise.resolve(true)

  initPromise ??= import('posthog-js')
    .then(({ default: posthog }) => {
      const config = readObservabilityClientConfig()
      if (config.posthogKey === undefined) {
        return false
      }

      posthog.init(config.posthogKey, {
        api_host: config.posthogHost,
        person_profiles: 'identified_only',
        capture_pageview: false,
        capture_pageleave: false,
        persistence: 'sessionStorage',
        disable_session_recording: true,
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
    if (!isTelemetryAllowedForCurrentRoute()) return
    const pathname = safeTelemetryPath(window.location)
    posthog.capture('$pageview', { $current_url: pathname, ae_pathname: pathname })
  }
  if (router === undefined) {
    capturePageview()
    return
  }

  router.subscribe('onResolved', capturePageview)
}
