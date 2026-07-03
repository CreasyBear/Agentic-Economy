import type { AnyRouter } from '@tanstack/react-router'
import type { PostHog } from 'posthog-js'

import { readObservabilityClientConfig } from '@/lib/observability/config'
import { buildFunnelEventProperties, type FunnelCaptureInput } from '@/lib/observability/funnel-event-props'
import { getOrCreatePseudonymousSessionId } from '@/lib/observability/funnel-attribution'


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
  void ensurePostHogClient().then((ready) => {
    if (!ready || posthogClient === undefined) {
      return
    }

    posthogClient.capture(input.eventType, buildFunnelEventProperties(input))
  })
}

export function captureClientProductEvent(event: string, properties?: Record<string, unknown>): void {
  void ensurePostHogClient().then((ready) => {
    if (!ready || posthogClient === undefined) {
      return
    }

    posthogClient.capture(event, properties)
  })
}

function ensurePostHogClient(router?: AnyRouter): Promise<boolean> {
  if (initialized) {
    return Promise.resolve(true)
  }

  if (typeof window === 'undefined') {
    return Promise.resolve(false)
  }

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
        capture_pageleave: true,
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
  if (router === undefined) {
    posthog.capture('$pageview', { $current_url: window.location.href })
    return
  }

  router.subscribe('onResolved', () => {
    posthog.capture('$pageview', {
      $current_url: window.location.href,
      ae_pathname: window.location.pathname,
    })
  })
}
