import { describe, expect, it } from 'vitest'

import { brandNonEmpty } from '@/modules/common/ids'
import {
  recordFunnelEvent,
} from '@/modules/observability/internal/record-funnel-event'

describe('recordFunnelEvent', () => {
  const businessId = brandNonEmpty('biz_test', 'BusinessId')
  const now = 1_700_000_000_000

  it('updates owner activation when owner status is viewed', () => {
    const result = recordFunnelEvent(
      {
        eventType: 'owner_status_viewed',
        source: 'owner-status-route',
        stage: 'published',
        pseudonymousSessionId: 'sess_test',
        correlationId: 'owner-status:1',
        consentFlag: false,
        businessId,
        now,
      },
      new Map(),
    )

    expect(result.ownerActivation?.statusSeen).toBe(true)
    expect(result.ownerActivation?.stage).toBe('visitor')
  })

  it('marks share intent on share_url_copied', () => {
    const result = recordFunnelEvent(
      {
        eventType: 'share_url_copied',
        source: 'owner-status-card',
        stage: 'published',
        pseudonymousSessionId: 'sess_test',
        correlationId: 'share:1',
        consentFlag: false,
        businessId,
        now,
      },
      new Map([[businessId, { businessId, stage: 'published', publishSeen: true, statusSeen: true, capabilityHealthSeen: true, sharedOrInterestSubmitted: false, attributionRecorded: true, lastEventAt: now - 1000 }]]),
    )

    expect(result.ownerActivation?.sharedOrInterestSubmitted).toBe(true)
  })
})
