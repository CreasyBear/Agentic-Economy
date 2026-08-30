import { describe, expect, it, vi } from 'vitest'

const posthog = vi.hoisted(() => ({ captureServerFunnelEvent: vi.fn() }))

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    validator: () => ({ handler: (handler: unknown) => handler }),
  }),
}))
vi.mock('@/lib/observability/posthog.server', () => posthog)

import { recordServerFunnelEventServer } from '@/modules/observability/funnel.functions'

describe('Public funnel event exemption', () => {
  it('recordServerFunnelEventServer discards caller-shaped actor and business provenance before analytics release', async () => {
    const handler = recordServerFunnelEventServer as unknown as (input: {
      data: Record<string, unknown>
    }) => Promise<{ ok: true }>

    await expect(handler({
      data: {
        eventType: 'route_viewed',
        source: 'public-route',
        stage: 'discovery',
        pseudonymousSessionId: 'session:public',
        correlationId: 'correlation:public',
        consentFlag: true,
        actorRef: 'caller-shaped-principal',
        businessId: 'caller-shaped-account',
      },
    })).resolves.toEqual({ ok: true })

    expect(posthog.captureServerFunnelEvent).toHaveBeenCalledWith({
      eventType: 'route_viewed',
      source: 'public-route',
      stage: 'discovery',
      pseudonymousSessionId: 'session:public',
      correlationId: 'correlation:public',
      consentFlag: true,
    })
  })
})
