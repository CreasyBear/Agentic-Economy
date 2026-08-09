import { describe, expect, it } from 'vitest'

import {
  capabilityOfferingRegistrationHash,
  defineCapabilityOfferingRegistration,
} from '@/modules/capability-supply/public'
import {
  contractRefFromRow,
  offeringIntegrityIsValid,
  offeringRegistrationFromRow,
  writablePresentation,
  type CapabilityOfferingRow,
} from '@/modules/capability-supply/internal/offering'
import type { ExactAmount } from '@/modules/money/public'

const contractRef = {
  capabilityId: 'reference.lookup',
  version: 1,
  contractDigest: `sha256:${'1'.repeat(64)}`,
}
const audAmount: ExactAmount = { currency: 'AUD', units: '1200', exponent: 2 }

const registration = defineCapabilityOfferingRegistration({
  offeringId: 'offering:sandbox-one:lookup',
  businessId: 'businesses:sandbox-one',
  networkId: 'ae:public',
  contractRef,
  presentation: {
    label: 'Sandbox reference lookup',
    summary: 'A labelled sandbox capability used only for source verification.',
    price: { kind: 'fixed', amount: audAmount },
    materialTerms: [{ termId: 'sandbox', label: 'Environment', value: 'Sandbox only' }],
    commercialRelationship: {
      kind: 'none',
      summary: 'No payment, sponsorship, rebate, or ownership relationship.',
      influencesEligibility: false,
      influencesInclusion: false,
      influencesOrder: false,
      evidenceRefs: ['seed:sandbox-commercial-neutrality'],
    },
  },
  searchTerms: ['reference', 'lookup'],
  registrationEvidenceRefs: ['seed:sandbox-labelled-business'],
})

function validRow(overrides: Partial<CapabilityOfferingRow> = {}): CapabilityOfferingRow {
  return {
    offeringId: registration.offeringId,
    businessId: registration.businessId,
    networkId: registration.networkId,
    capabilityId: registration.contractRef.capabilityId,
    version: registration.contractRef.version,
    contractDigest: registration.contractRef.contractDigest,
    presentation: registration.presentation,
    searchTerms: registration.searchTerms,
    registrationEvidenceRefs: registration.registrationEvidenceRefs,
    registrationHash: capabilityOfferingRegistrationHash(registration),
    status: 'inactive',
    admissionEvidenceRefs: [],
    eligibilityHash: `sha256:${'2'.repeat(64)}`,
    registeredAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

describe('capability-supply offering helpers', () => {
  it('reconstructs registration and validates integrity fail-closed', () => {
    const row = validRow()
    expect(offeringRegistrationFromRow(row)).toEqual(registration)
    expect(contractRefFromRow(row)).toEqual(registration.contractRef)
    expect(offeringIntegrityIsValid(row)).toBe(true)
    expect(offeringIntegrityIsValid(validRow({
      registrationHash: `sha256:${'3'.repeat(64)}`,
    }))).toBe(false)
  })

  it('copies presentation into writable structures', () => {
    const writable = writablePresentation(registration.presentation)
    expect(writable.materialTerms).toEqual(registration.presentation.materialTerms)
    expect(writable.materialTerms).not.toBe(registration.presentation.materialTerms)
    expect(writable.commercialRelationship.evidenceRefs).not.toBe(
      registration.presentation.commercialRelationship.evidenceRefs,
    )
  })
})
