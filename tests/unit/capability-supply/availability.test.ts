import { describe, expect, it } from 'vitest'

import {
  availability,
  type CapabilityAvailabilityInput,
} from '@/modules/capability-supply/public'

const NOW = 1_800_000_000_000

const baseInput = (
  overrides: Partial<CapabilityAvailabilityInput> = {},
): CapabilityAvailabilityInput => ({
  routeable: false,
  integrated: false,
  readiness: {},
  ...overrides,
})

describe('availability (C7a shared posture projection)', () => {
  it('happy path: routeable + integrated + valid readiness -> routeable', () => {
    const result = availability(
      baseInput({
        routeable: true,
        integrated: true,
        disposition: 'current',
        sourceAuthorityState: 'verified',
        admission: 'admitted',
        conformance: 'conformant',
        credentialState: 'ready',
        healthState: 'healthy',
        readiness: {
          observedAt: NOW - 1_000,
          lastHealthyAt: NOW - 1_000,
          validUntil: NOW + 1_000,
        },
      }),
      NOW,
    )
    expect(result).toEqual({
      posture: 'routeable',
      observedAt: NOW - 1_000,
      lastHealthyAt: NOW - 1_000,
      validUntil: NOW + 1_000,
    })
  })

  it('boundary: validUntil exactly equal to now is not > now, so readiness reads as expired', () => {
    const result = availability(
      baseInput({
        routeable: true,
        integrated: true,
        readiness: { validUntil: NOW },
      }),
      NOW,
    )
    expect(result).toEqual({
      posture: 'setup_required',
      validUntil: NOW,
      reason: 'readiness_expired',
    })
  })

  it('expired: validUntil in the past -> unavailable with readiness_expired', () => {
    const result = availability(
      baseInput({
        routeable: true,
        integrated: false,
        readiness: { validUntil: NOW - 1_000 },
      }),
      NOW,
    )
    expect(result).toEqual({
      posture: 'unavailable',
      validUntil: NOW - 1_000,
      reason: 'readiness_expired',
    })
  })

  it('withdrawn: upstream disposition carried alongside its mapped unavailableReason', () => {
    const result = availability(
      baseInput({
        disposition: 'withdrawn',
        unavailableReason: 'publisher_withdrew',
      }),
      NOW,
    )
    expect(result).toEqual({
      posture: 'unavailable',
      reason: 'publisher_withdrew',
    })
  })

  it('incompatible: upstream disposition carried alongside its mapped unavailableReason', () => {
    const result = availability(
      baseInput({
        disposition: 'incompatible',
        unavailableReason: 'not_supported_by_ae',
      }),
      NOW,
    )
    expect(result).toEqual({
      posture: 'unavailable',
      reason: 'not_supported_by_ae',
    })
  })

  it('review_required authority: not routeable/integrated, no explicit reason -> defaults to setup_required', () => {
    const result = availability(
      baseInput({
        integrated: true,
        sourceAuthorityState: 'review_required',
      }),
      NOW,
    )
    expect(result).toEqual({
      posture: 'setup_required',
      reason: 'setup_required',
    })
  })

  it('admission not admitted: not routeable/integrated, no explicit reason -> unavailable/setup_required', () => {
    const result = availability(
      baseInput({
        admission: 'not_admitted',
      }),
      NOW,
    )
    expect(result).toEqual({
      posture: 'unavailable',
      reason: 'setup_required',
    })
  })

  it('inspection_required always wins over the readiness-expiry reason', () => {
    const result = availability(
      baseInput({
        integrated: true,
        unavailableReason: 'inspection_required',
        readiness: { validUntil: NOW - 1_000 },
      }),
      NOW,
    )
    expect(result).toEqual({
      posture: 'setup_required',
      validUntil: NOW - 1_000,
      reason: 'inspection_required',
    })
  })
})
