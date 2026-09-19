import { describe, expect, it, vi } from 'vitest'
import { adjudicateStealthFailureAndReleaseHold } from '../../../convex/capabilityCallWorker'
import type { ActionCtx } from '../../../convex/_generated/server'

describe('Convex Delivery Adjudicator (Gravity Well 2)', () => {
  it('detects stealth provider timeout and triggers Formance hold release', async () => {
    const runActionMock = vi.fn().mockResolvedValue({
      kind: 'accepted',
      state: 'released',
    })

    const mockCtx = {
      runAction: runActionMock,
      runQuery: vi.fn(),
      runMutation: vi.fn(),
    } as unknown as ActionCtx

    const errorPayload = {
      error: 'upstream_gateway_timeout: 402timezones upstream host failed to respond',
      code: 'ETIMEDOUT',
    }

    const result = await adjudicateStealthFailureAndReleaseHold(mockCtx, {
      callRef: 'call:v1:test_stealth_err',
      toolRef: 'operation:v1:timezone_converter',
      outputJson: JSON.stringify(errorPayload),
    })

    expect(result.adjudicated).toBe(true)
    expect(result.isFailure).toBe(true)
    expect(result.fault).toBe('upstream_provider')
    expect(result.releasedHold).toBe(true)
    expect(runActionMock).toHaveBeenCalledTimes(1)
  })

  it('preserves Formance hold on clean successful delivery', async () => {
    const runActionMock = vi.fn()

    const mockCtx = {
      runAction: runActionMock,
      runQuery: vi.fn(),
      runMutation: vi.fn(),
    } as unknown as ActionCtx

    const successPayload = {
      result: {
        convertedTime: '2026-07-05T04:30:00+09:00',
        status: 'ok',
      },
    }

    const result = await adjudicateStealthFailureAndReleaseHold(mockCtx, {
      callRef: 'call:v1:test_success',
      toolRef: 'operation:v1:timezone_converter',
      outputJson: JSON.stringify(successPayload),
    })

    expect(result.adjudicated).toBe(true)
    expect(result.isFailure).toBe(false)
    expect(result.fault).toBe('none')
    expect(result.releasedHold).toBe(false)
    expect(runActionMock).not.toHaveBeenCalled()
  })
})
