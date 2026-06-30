import { captureServerFunnelEvent } from '@/lib/observability/posthog.server'
import {
  recordFunnelEventSchema,
  recordOwnerActivationThroughSource,
  type RecordPublicFunnelEventInput,
} from '@/modules/observability/funnel.functions'

export async function recordServerFunnelEventThroughSource(input: RecordPublicFunnelEventInput): Promise<void> {
  const parsed = recordFunnelEventSchema.parse(input)
  captureServerFunnelEvent(parsed)
  await recordOwnerActivationThroughSource(parsed)
}

/** @deprecated Use recordServerFunnelEventThroughSource. */
export async function recordPublicFunnelEventThroughSource(input: RecordPublicFunnelEventInput): Promise<void> {
  await recordServerFunnelEventThroughSource(input)
}
