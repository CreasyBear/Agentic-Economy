import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  callPublicSourceMutation: vi.fn(),
  callSourceQuery: vi.fn(),
  sourceMutation: vi.fn((name: string) => ({ name })),
  sourceQuery: vi.fn((name: string) => ({ name })),
}))

vi.mock('@/lib/server/convex-source', () => ({
  callPublicSourceMutation: mocks.callPublicSourceMutation,
  callSourceQuery: mocks.callSourceQuery,
  sourceMutation: mocks.sourceMutation,
  sourceQuery: mocks.sourceQuery,
}))

import { recordOwnerActivationThroughSource } from '@/modules/observability/funnel.source'

describe('recordOwnerActivationThroughSource', () => {
  beforeEach(() => {
    mocks.callPublicSourceMutation.mockReset()
    mocks.callSourceQuery.mockReset()
  })

  it('forwards no-business visitor_attributed events so Convex owns targeted-session evidence', async () => {
    const payload = {
      eventType: 'visitor_attributed' as const,
      source: 'partner-newsletter',
      stage: 'visitor' as const,
      pseudonymousSessionId: 'sess_14d_source_bridge',
      correlationId: 'visitor:source-bridge',
      consentFlag: false,
      referrer: 'partner.example',
      utmSource: 'partner',
      utmCampaign: 'ae-14d-run-2026-07-04',
    }

    await recordOwnerActivationThroughSource(payload)

    expect(mocks.callPublicSourceMutation).toHaveBeenCalledTimes(1)
    expect(mocks.callPublicSourceMutation).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'observability:recordOwnerActivationEvent' }),
      payload,
    )
  })
})
