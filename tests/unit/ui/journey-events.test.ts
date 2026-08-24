import { describe, expect, it } from 'vitest'

import { readStoredJourneyEventName } from '@/lib/ui/journey-events'
import { recordFunnelEventSchema } from '@/modules/observability/funnel.functions'
import { FunnelEventTypeValues } from '@/modules/observability/public'
import {
  StoredCompatibilityFunnelEventTypeValues,
  readStoredCompatibilityFunnelEventType,
} from '@/modules/observability/stored-compatibility'

describe('stored journey telemetry compatibility', () => {
  it('reads every retired journey literal without exposing it to current writes', () => {
    expect(StoredCompatibilityFunnelEventTypeValues).toEqual(expect.arrayContaining([
      'listing_viewed',
      'shortlist_started',
      'shortlist_exported',
      'record_reopened',
      'admitted_r1_send',
      'business_action_request_started',
    ]))

    for (const eventType of StoredCompatibilityFunnelEventTypeValues) {
      expect(readStoredCompatibilityFunnelEventType(eventType)).toBe(eventType)
      expect(readStoredJourneyEventName(eventType)).toBe(eventType)
      expect(FunnelEventTypeValues).not.toContain(eventType)
      expect(recordFunnelEventSchema.safeParse(currentWrite(eventType)).success).toBe(false)
    }
  })

  it('rejects unknown stored literals and accepts current Operation-market telemetry', () => {
    expect(readStoredJourneyEventName('customer_request_started')).toBeUndefined()
    expect(recordFunnelEventSchema.safeParse(currentWrite('registry_search')).success).toBe(true)
  })
})

function currentWrite(eventType: string) {
  return {
    eventType,
    source: 'market',
    stage: 'visitor',
    pseudonymousSessionId: 'session:opaque',
    correlationId: 'correlation:opaque',
    consentFlag: false,
  }
}
