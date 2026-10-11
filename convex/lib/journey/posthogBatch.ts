export type PosthogBatchEvent = Readonly<{
  uuid?: string
  event: string
  distinctId: string
  timestamp: string
  properties: Readonly<Record<string, unknown>>
}>

/** The host comes from the deployment's POSTHOG_HOST, never caller input. Anything other than a bare https origin is refused. */
function batchDestination(posthogHost: string): URL | null {
  let destination: URL
  try {
    destination = new URL(`${posthogHost.replace(/\/+$/u, '')}/batch/`)
  } catch {
    return null
  }
  if (destination.protocol !== 'https:' || destination.username !== '' || destination.password !== ''
    || destination.search !== '' || destination.hash !== '') return null
  return destination
}

/** One event to the PostHog batch endpoint, without person profiles or GeoIP. Null when the host is refused; network errors propagate, and callers must not log them because they can carry request data. */
export async function postPosthogBatch(posthogKey: string, posthogHost: string, event: PosthogBatchEvent): Promise<Response | null> {
  const destination = batchDestination(posthogHost)
  if (destination === null) return null
  const response = await fetch(destination, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: posthogKey,
      batch: [{
        ...(event.uuid === undefined ? {} : { uuid: event.uuid }),
        event: event.event,
        distinct_id: event.distinctId,
        timestamp: event.timestamp,
        properties: { ...event.properties, $process_person_profile: false, $geoip_disable: true },
      }],
    }),
    redirect: 'error',
    signal: AbortSignal.timeout(5_000),
  })
  void response.body?.cancel().catch(() => {})
  return response
}
