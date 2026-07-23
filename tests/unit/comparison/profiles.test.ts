import { describe, expect, it } from 'vitest'

import {
  createOfferingInState,
  validateOfferingComparisonEnvelope,
  type OfferingSourceState,
} from '@/modules/catalog/public'
import { brandNonEmpty } from '@/modules/common/ids'

const source = { kind: 'business_supplied' as const }
const notSupplied = { kind: 'not_supplied' as const, source, observedAt: 10 }

const professionalProfile = {
  schemaVersion: 'offering-comparison:v1' as const,
  profile: {
    profileId: 'professional_service:v1' as const,
    scopeBasis: { kind: 'known' as const, value: 'Brochure website', source, observedAt: 10 },
    priceBasis: {
      kind: 'known' as const,
      value: { description: 'From AUD 2,500', currency: 'AUD', amountMinor: 250_000, unit: 'total' as const },
      source,
      observedAt: 10,
    },
    timingBasis: { kind: 'known' as const, value: 'Four to six weeks', source, observedAt: 10 },
    serviceArea: { kind: 'known' as const, value: 'Perth and remote', source, observedAt: 10 },
  },
}

const machineProfile = {
  schemaVersion: 'offering-comparison:v1' as const,
  profile: {
    profileId: 'machine_data:v1' as const,
    interfaceFormat: { kind: 'known' as const, value: 'graphql' as const, source, observedAt: 10 },
    requestMethod: { kind: 'known' as const, value: 'POST' as const, source, observedAt: 10 },
    authentication: { kind: 'known' as const, value: 'api_key' as const, source, observedAt: 10 },
    priceBasis: {
      kind: 'known' as const,
      value: { description: 'AUD 0.01 per request', currency: 'AUD', amountMinor: 1, unit: 'request' as const },
      source,
      observedAt: 10,
    },
    freshnessOrUpdateCadence: { kind: 'known' as const, value: 'Updated every minute', source, observedAt: 10 },
  },
}

describe('closed Offering comparison profiles', () => {
  it('round-trips exactly professional_service:v1 and machine_data:v1', () => {
    expect(validateOfferingComparisonEnvelope(professionalProfile)).toEqual({
      kind: 'valid',
      envelope: professionalProfile,
    })
    expect(validateOfferingComparisonEnvelope(machineProfile)).toEqual({
      kind: 'valid',
      envelope: machineProfile,
    })
  })

  it.each([
    ['professional extra field', { ...professionalProfile, profile: { ...professionalProfile.profile, reputation: notSupplied } }],
    ['machine invalid unit', {
      ...machineProfile,
      profile: {
        ...machineProfile.profile,
        priceBasis: {
          kind: 'known',
          value: { description: 'Per thing', currency: 'AUD', amountMinor: 1, unit: 'thing' },
          source,
          observedAt: 10,
        },
      },
    }],
    ['machine unbounded string', {
      ...machineProfile,
      profile: {
        ...machineProfile.profile,
        freshnessOrUpdateCadence: {
          kind: 'known',
          value: 'x'.repeat(501),
          source,
          observedAt: 10,
        },
      },
    }],
  ])('refuses %s', (_label, input) => {
    expect(validateOfferingComparisonEnvelope(input)).toMatchObject({ kind: 'invalid' })
  })

  it('includes validated profile facts in exact revision hashing while preserving explicit no-profile authoring', () => {
    const empty: OfferingSourceState = { offerings: [], revisions: [], accessPaths: [], operations: [] }
    const base = {
      authority: { actorRef: 'owner:1', ownerRef: 'owner:1', businessOwnerRef: 'owner:1' },
      operationKey: 'create',
      businessId: brandNonEmpty('business:studio', 'BusinessId'),
      now: 10,
    }
    const professional = createOfferingInState(empty, {
      ...base,
      offeringRef: brandNonEmpty('offering:professional', 'OfferingRef'),
      facts: {
        name: 'Website delivery',
        category: 'Professional service',
        summary: 'A small website.',
        comparison: professionalProfile,
      },
    })
    const machine = createOfferingInState(empty, {
      ...base,
      operationKey: 'create-machine',
      offeringRef: brandNonEmpty('offering:machine', 'OfferingRef'),
      facts: {
        name: 'Data query',
        category: 'Machine data',
        summary: 'A GraphQL data interface.',
        comparison: machineProfile,
      },
    })
    const legacyCompatible = createOfferingInState(empty, {
      ...base,
      operationKey: 'create-compatible',
      offeringRef: brandNonEmpty('offering:compatible', 'OfferingRef'),
      facts: {
        name: 'Existing authoring',
        category: 'Service',
        summary: 'No comparison profile has been supplied.',
      },
    })

    expect(professional.kind).toBe('ok')
    expect(machine.kind).toBe('ok')
    expect(legacyCompatible.kind).toBe('ok')
    if (professional.kind !== 'ok' || machine.kind !== 'ok') return
    const professionalRevision = professional.state.revisions[0]
    const machineRevision = machine.state.revisions[0]
    expect(professionalRevision?.comparison).toEqual(professionalProfile)
    expect(professionalRevision?.sourceHash).not.toBe(machineRevision?.sourceHash)
  })
})
