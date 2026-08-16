import { PostHog } from 'posthog-node'

import { readObservabilityServerConfig } from '@/lib/observability/config'
import { buildFunnelEventProperties, type FunnelCaptureInput } from '@/lib/observability/funnel-event-props'
import { sanitizeTelemetryValue } from '@/lib/observability/private-route-safety'

let client: PostHog | undefined

function getPostHogServerClient(): PostHog | undefined {
  const config = readObservabilityServerConfig()
  if (!config.enabled || config.posthogKey === undefined) {
    return undefined
  }

  client ??= new PostHog(config.posthogKey, {
    host: config.posthogHost,
    flushAt: 10,
    flushInterval: 5000,
  })

  return client
}

export function captureServerFunnelEvent(input: FunnelCaptureInput): void {
  const posthog = getPostHogServerClient()
  if (posthog === undefined) {
    return
  }

  posthog.capture({
    distinctId: String(sanitizeTelemetryValue(input.pseudonymousSessionId)),
    event: String(sanitizeTelemetryValue(input.eventType)),
    properties: sanitizeTelemetryValue(buildFunnelEventProperties(input)) as Record<string, string | number | boolean | null>,
  })
}

export function captureServerEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, string | number | boolean | null>,
): void {
  try {
    const posthog = getPostHogServerClient()
    if (posthog === undefined) {
      return
    }
    posthog.capture({
      distinctId: String(sanitizeTelemetryValue(distinctId)),
      event: String(sanitizeTelemetryValue(event)),
      ...(properties === undefined ? {} : {
        properties: sanitizeTelemetryValue(properties) as Record<string, string | number | boolean | null>,
      }),
    })
  } catch {
    // Diagnostics must never alter application behavior.
  }
}

export function captureLegacyRegistryApiRequest(
  routeFamily: 'businesses' | 'services',
  routeKind: 'list' | 'search' | 'detail',
): void {
  captureServerEvent('ae-legacy-registry-api', 'legacy_registry_api_request', {
    route_family: routeFamily,
    route_kind: routeKind,
    $process_person_profile: false,
    $geoip_disable: true,
  })
}

export async function flushPostHogServer(): Promise<void> {
  if (client === undefined) {
    return
  }

  await client.flush()
}

export async function shutdownPostHogServer(): Promise<void> {
  if (client === undefined) {
    return
  }

  await client.shutdown()
  client = undefined
}
