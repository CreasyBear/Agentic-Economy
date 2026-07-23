import { describe, expect, it } from 'vitest'

import {
  projectComparisonProfile,
  type OfferingComparisonEnvelope,
} from '@/modules/comparison/public'

const source = { kind: 'business_supplied' as const }
const known = <T>(value: T) => ({ kind: 'known' as const, value, source, observedAt: 10 })

const professional = {
  schemaVersion: 'offering-comparison:v1',
  profile: {
    profileId: 'professional_service:v1',
    scopeBasis: known('Brochure website'),
    priceBasis: known({
      description: 'AUD 2,500 total',
      currency: 'AUD',
      amountMinor: 250_000,
      unit: 'total',
    }),
    timingBasis: known('Four weeks'),
    serviceArea: known('Perth'),
  },
} as const satisfies OfferingComparisonEnvelope

const machine = {
  schemaVersion: 'offering-comparison:v1',
  profile: {
    profileId: 'machine_data:v1',
    interfaceFormat: known('graphql'),
    requestMethod: known('POST'),
    authentication: known('api_key'),
    priceBasis: known({
      description: 'AUD 0.01 per request',
      currency: 'AUD',
      amountMinor: 1,
      unit: 'request',
    }),
    freshnessOrUpdateCadence: known('Every minute'),
  },
} as const satisfies OfferingComparisonEnvelope

describe('closed comparison profile projection', () => {
  it('projects professional_service:v1 to closed registered dimensions', () => {
    expect(projectComparisonProfile(professional, 10)).toMatchObject({
      kind: 'projected',
      profileId: 'professional_service:v1',
      dimensions: [
        { dimensionId: 'professional_service:v1:scope_basis' },
        { dimensionId: 'professional_service:v1:price_basis' },
        { dimensionId: 'professional_service:v1:timing_basis' },
        { dimensionId: 'professional_service:v1:service_area' },
      ],
    })
  })

  it('projects machine_data:v1 through the same host contract', () => {
    expect(projectComparisonProfile(machine, 10)).toMatchObject({
      kind: 'projected',
      profileId: 'machine_data:v1',
      dimensions: [
        { dimensionId: 'machine_data:v1:interface_format' },
        { dimensionId: 'machine_data:v1:request_method' },
        { dimensionId: 'machine_data:v1:authentication' },
        { dimensionId: 'machine_data:v1:price_basis' },
        { dimensionId: 'machine_data:v1:freshness_or_update_cadence' },
      ],
    })
  })

  it('does not infer comparability from matching price labels across profile or unit', () => {
    const professionalPrice = projectComparisonProfile(professional, 10)
    const machinePrice = projectComparisonProfile(machine, 10)
    expect(professionalPrice.kind).toBe('projected')
    expect(machinePrice.kind).toBe('projected')
    if (professionalPrice.kind !== 'projected' || machinePrice.kind !== 'projected') return

    expect(professionalPrice.dimensions[1]?.dimensionId).not.toBe(
      machinePrice.dimensions[3]?.dimensionId,
    )
    expect(professionalPrice.dimensions[1]?.comparisonKey).not.toBe(
      machinePrice.dimensions[3]?.comparisonKey,
    )
  })

  it('converts an expired known fact to stale without changing its source value', () => {
    const expiring = {
      ...professional,
      profile: {
        ...professional.profile,
        scopeBasis: {
          ...professional.profile.scopeBasis,
          validUntil: 20,
        },
      },
    } satisfies OfferingComparisonEnvelope

    const projected = projectComparisonProfile(expiring, 21)
    expect(projected.kind).toBe('projected')
    if (projected.kind !== 'projected') return
    expect(projected.dimensions[0]?.cell).toMatchObject({
      kind: 'stale',
      lastKnown: 'Brochure website',
      observedAt: 10,
      validUntil: 20,
    })
  })
})
