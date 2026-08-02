import type { SupplyCallLogRow } from '@/modules/capability-supply/supply-funnel.functions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { formatTimestamp } from '@/lib/ui/format-time'

export function AeSupplyCallLog({ events }: Readonly<{ events: readonly SupplyCallLogRow[] }>) {
  return (
    <Card>
      <CardHeader className="p-5 pb-0">
        <CardTitle>
          <h3 className="text-lg font-semibold text-foreground">Agent calls</h3>
        </CardTitle>
        <p className="text-sm text-muted-foreground">See when a request reached your service and whether it returned a response.</p>
      </CardHeader>
      <CardContent className="p-5">
        {events.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyTitle>No agent calls yet.</EmptyTitle>
              <EmptyDescription>Publish your service so assistants can find it.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="m-0 grid list-none gap-2 p-0">
            {events.map((event) => (
              <li key={event.eventRef} className="grid gap-1 rounded-md border border-border p-3">
                <p className="block font-semibold text-foreground">{event.outcome === 'filled' ? 'Response received' : humanZeroReason(event.zeroReason)}</p>
                <p className="block text-sm text-muted-foreground">{formatTimestamp(event.observedAt)} · {event.environment === 'production' ? 'Live service' : event.environment === 'sandbox' ? 'Sandbox test' : 'Development test'} {event.durationMs === undefined ? '' : `· ${event.durationMs} ms`}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function humanZeroReason(reason: string | undefined): string {
  switch (reason) {
    case 'no_route':
    case 'no_match':
      return 'No matching request reached this service. Check what your service offers and try again.'
    case 'not_ready':
    case 'readiness_stale':
      return 'The service needs a fresh check before it can answer. Check the service, then try again.'
    case 'request_timeout':
    case 'transport_unreachable':
      return 'The service did not respond in time. Check the connection and try again.'
    default:
      return 'No response came back. Check the service setup and try again.'
  }
}
