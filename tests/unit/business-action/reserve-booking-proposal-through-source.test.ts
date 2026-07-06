import { afterEach, describe, expect, it, vi } from 'vitest'

import { createReserveBookingProposalThroughSource } from '@/modules/business-action/business-action.functions'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('createReserveBookingProposalThroughSource local source contract', () => {
  it('creates a proposed reserve-booking request with status and action slug through the local e2e source path', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-05T10:00:00.000Z'))
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', 'true')

    const result = await createReserveBookingProposalThroughSource({ businessId: 'business:test-x' })

    expect(result).toMatchObject({
      kind: 'ok',
      request: {
        status: 'proposed',
        actionSlug: 'reserve-booking',
      },
    })
  })
})
