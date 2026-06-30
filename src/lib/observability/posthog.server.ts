import { PostHog } from 'posthog-node'

import { readObservabilityServerConfig } from '@/lib/observability/config'
import { buildFunnelEventProperties, type FunnelCaptureInput } from '@/lib/observability/funnel-event-props'

let client: PostHog | undefined

function getPostHogServerClient(): PostHog | undefined {
  const config = readObservabilityServerConfig()
  if (config.posthogKey === undefined) {
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
    distinctId: input.pseudonymousSessionId,
    event: input.eventType,
    properties: buildFunnelEventProperties(input),
  })
}

export function captureServerEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, string | number | boolean | null>,
): void {
  const posthog = getPostHogServerClient()
  if (posthog === undefined) {
    return
  }
  posthog.capture({ distinctId, event, ...(properties === undefined ? {} : { properties }) })
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
