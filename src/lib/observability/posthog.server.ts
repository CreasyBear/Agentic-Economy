import { PostHog } from 'posthog-node'
import { waitUntil } from '@vercel/functions'

import { captureRouteException } from '@/lib/observability/capture-route-exception'
import { readObservabilityServerConfig } from '@/lib/observability/config'
import { buildFunnelEventProperties, type FunnelCaptureInput } from '@/lib/observability/funnel-event-props'
import { sanitizeTelemetryValue } from '@/lib/observability/private-route-safety'
import { canonicalDigest } from '@/modules/common/canonical-digest'

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
    // The SDK owns debouncing and batching; Vercel owns request lifetime.
    // Best-effort diagnostics must not keep a function retrying after response.
    waitUntil,
    requestTimeout: 5_000,
    fetchRetryCount: 0,
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
  } catch (cause) {
    // Diagnostics must never alter application behavior.
    captureRouteException(cause, { site: 'captureServerEvent' }, 'warning')
  }
}

/** Gateway callers supply an allowlisted, pseudonymous projection, never the
 * request body. Keep vendor capture centralised with the existing server SDK. */
export function captureServerGatewayEvent(
  distinctId: string,
  properties: Record<string, string | number | boolean | null>,
): void {
  captureServerEvent(distinctId, 'ae.gateway.operation', {
    ...properties,
    $process_person_profile: false,
  })
}

/** Explicit feedback is the sole content-bearing event. Requires validated text
 * and server-owned attribution. Ensures acceptance only after ingestion returns
 * 2xx. No buffering, retries, diagnostic payloads or commercial writes. A failed
 * or timed-out request is unconfirmed; the remote event may already exist.
 * Executor uses this batch API directly. posthog-node 5.39 captureImmediate
 * catches ingestion errors, so it cannot establish this acknowledgment. */
export async function submitServerFeedback(input: Readonly<{
  message: string
  principalRef: string
  accountRef: string
}>): Promise<'accepted' | 'disabled' | 'unavailable'> {
  const config = readObservabilityServerConfig()
  if (!config.enabled || config.posthogKey === undefined) return 'disabled'
  const digest = (kind: string, value: string) => canonicalDigest({ format: 'ae.product-feedback:v1', kind, value })
  const body = JSON.stringify({
    api_key: config.posthogKey,
    batch: [{
      uuid: crypto.randomUUID(), event: 'feedback_submitted',
      distinct_id: digest('principal', input.principalRef), timestamp: new Date().toISOString(),
      properties: {
        message: input.message, accountRefDigest: digest('account', input.accountRef),
        ae_environment: config.environment,
        ...(config.release === undefined ? {} : { ae_release: config.release }),
        $process_person_profile: false, $geoip_disable: true,
      },
    }],
  })
  try {
    // Only deployment configuration selects this vendor; request data never supplies a URL.
    const destination = new URL(`${config.posthogHost.replace(/\/+$/u, '')}/batch/`)
    if (destination.protocol !== 'https:' || destination.username !== '' || destination.password !== ''
      || destination.search !== '' || destination.hash !== '') return 'unavailable'
    const { sendGuardedHttpRequest } = await import('@/modules/network-guard/server')
    const response = await sendGuardedHttpRequest(new Request(destination, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
      redirect: 'error', signal: AbortSignal.timeout(5_000),
    }), 8 * 1024)
    void response.body?.cancel().catch(() => {})
    return response.ok ? 'accepted' : 'unavailable'
  } catch {
    // Network errors can contain request data. Return the bounded outcome without logging it.
    return 'unavailable'
  }
}

export async function shutdownPostHogServer(): Promise<void> {
  if (client === undefined) {
    return
  }

  await client.shutdown()
  client = undefined
}
