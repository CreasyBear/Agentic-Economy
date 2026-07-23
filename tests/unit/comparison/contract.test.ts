import { describe, expect, it } from 'vitest'

import { validateOfferingComparisonEnvelope } from '@/modules/catalog/public'

const source = { kind: 'business_supplied' as const }

describe('Offering comparison envelope', () => {
  it('accepts explicit known, unknown, not supplied and stale fact states', () => {
    const result = validateOfferingComparisonEnvelope({
      schemaVersion: 'offering-comparison:v1',
      profile: {
        profileId: 'professional_service:v1',
        scopeBasis: { kind: 'known', value: 'Five-page brochure site', source, observedAt: 10 },
        priceBasis: { kind: 'not_supplied', source, observedAt: 10 },
        timingBasis: {
          kind: 'stale',
          lastKnown: 'Four to six weeks',
          source,
          observedAt: 10,
          validUntil: 20,
        },
        serviceArea: {
          kind: 'unknown',
          explanation: 'Remote delivery boundary was not stated.',
          source,
          observedAt: 10,
        },
      },
    })

    expect(result.kind).toBe('valid')
  })

  it.each([
    ['extra keys', { unexpected: true }],
    ['arbitrary profile IDs', { profileId: 'anything:v1' }],
    ['invalid dates', { scopeBasis: { kind: 'known', value: 'Site', source, observedAt: -1 } }],
  ])('refuses %s rather than trusting a cast-only payload', (_label, profileOverride) => {
    const input = {
      schemaVersion: 'offering-comparison:v1',
      profile: {
        profileId: 'professional_service:v1',
        scopeBasis: { kind: 'known', value: 'Site', source, observedAt: 10 },
        priceBasis: { kind: 'not_supplied', source, observedAt: 10 },
        timingBasis: { kind: 'not_supplied', source, observedAt: 10 },
        serviceArea: { kind: 'not_supplied', source, observedAt: 10 },
        ...profileOverride,
      },
    }

    expect(validateOfferingComparisonEnvelope(input)).toMatchObject({ kind: 'invalid' })
  })
})
