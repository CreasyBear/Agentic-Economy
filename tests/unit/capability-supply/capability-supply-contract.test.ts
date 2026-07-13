import { describe, expect, it } from 'vitest'

import {
  capabilityBindingRegistrationHash,
  capabilityOfferingRegistrationHash,
  defineCapabilityOfferingRegistration,
  defineCapabilityTransportBindingRegistration,
} from '@/modules/capability-supply/public'

const contractRef = {
  capabilityId: 'reference.lookup',
  version: 1,
  contractDigest: `sha256:${'1'.repeat(64)}`,
}

describe('capability supply registration contract', () => {
  it('keeps commercial offering identity separate from transport binding identity', () => {
    const offering = defineCapabilityOfferingRegistration(offeringInput())
    const binding = defineCapabilityTransportBindingRegistration(bindingInput())

    expect(offering).toMatchObject({
      offeringId: 'offering:sandbox-one:lookup',
      businessId: 'businesses:sandbox-one',
      presentation: { price: { kind: 'fixed', currency: 'AUD', amountMinor: 1_200 } },
    })
    expect(offering).not.toHaveProperty('adapter')
    expect(offering).not.toHaveProperty('endpointUrl')
    expect(binding).toMatchObject({
      bindingId: 'binding:sandbox-one:http',
      offeringId: offering.offeringId,
      adapter: { adapterId: 'http-json:v1' },
    })
    expect(binding).not.toHaveProperty('presentation')
    expect(binding).not.toHaveProperty('businessId')
  })

  it('strictly rejects operation and all other undeclared registration fields', () => {
    expect(() => defineCapabilityOfferingRegistration({ ...offeringInput(), operation: 'quote' }))
      .toThrowError('capability_offering_invalid')
    expect(() => defineCapabilityTransportBindingRegistration({ ...bindingInput(), operation: 'book' }))
      .toThrowError('capability_binding_invalid')
  })

  it('changes each immutable registration hash when any exact-ref member changes', () => {
    const offering = defineCapabilityOfferingRegistration(offeringInput())
    const binding = defineCapabilityTransportBindingRegistration(bindingInput())
    const admitted = {
      configJson: '{"method":"POST","requestTimeoutMs":5000}',
      configDigest: `sha256:${'2'.repeat(64)}`,
    }

    const offeringHash = capabilityOfferingRegistrationHash(offering)
    const bindingHash = capabilityBindingRegistrationHash(binding, admitted)
    for (const changedRef of [
      { ...contractRef, capabilityId: 'reference.other' },
      { ...contractRef, version: 2 },
      { ...contractRef, contractDigest: `sha256:${'3'.repeat(64)}` },
    ]) {
      expect(capabilityOfferingRegistrationHash({ ...offering, contractRef: changedRef })).not.toBe(offeringHash)
      expect(capabilityBindingRegistrationHash({ ...binding, contractRef: changedRef }, admitted)).not.toBe(bindingHash)
    }
  })

  it('hashes every persisted authority-bearing field independently', () => {
    const offering = defineCapabilityOfferingRegistration(offeringInput())
    const binding = defineCapabilityTransportBindingRegistration(bindingInput())
    const admitted = {
      configJson: '{"method":"POST","requestTimeoutMs":5000}',
      configDigest: `sha256:${'2'.repeat(64)}`,
    }
    expect(capabilityOfferingRegistrationHash({ ...offering, businessId: 'businesses:sandbox-two' }))
      .not.toBe(capabilityOfferingRegistrationHash(offering))
    expect(capabilityOfferingRegistrationHash({
      ...offering,
      presentation: { ...offering.presentation, summary: 'Changed commercial summary.' },
    })).not.toBe(capabilityOfferingRegistrationHash(offering))
    expect(capabilityBindingRegistrationHash({ ...binding, credentialRef: 'env:OTHER_KEY' }, admitted))
      .not.toBe(capabilityBindingRegistrationHash(binding, admitted))
    expect(capabilityBindingRegistrationHash(binding, {
      configJson: '{"method":"POST","requestTimeoutMs":6000}',
      configDigest: `sha256:${'4'.repeat(64)}`,
    })).not.toBe(capabilityBindingRegistrationHash(binding, admitted))
  })
})

function offeringInput() {
  return {
    offeringId: 'offering:sandbox-one:lookup',
    businessId: 'businesses:sandbox-one',
    networkId: 'ae:public',
    contractRef,
    presentation: {
      label: 'Sandbox reference lookup',
      summary: 'A labelled sandbox capability used only for source verification.',
      price: { kind: 'fixed' as const, currency: 'AUD', amountMinor: 1_200 },
      materialTerms: [{ termId: 'sandbox', label: 'Environment', value: 'Sandbox only' }],
      commercialRelationship: {
        kind: 'none' as const,
        summary: 'No payment, sponsorship, rebate, or ownership relationship.',
        influencesEligibility: false,
        influencesInclusion: false,
        influencesOrder: false,
        evidenceRefs: ['seed:sandbox-commercial-neutrality'],
      },
    },
    searchTerms: ['reference', 'lookup'],
    registrationEvidenceRefs: ['seed:sandbox-labelled-business'],
  }
}

function bindingInput() {
  return {
    bindingId: 'binding:sandbox-one:http',
    offeringId: 'offering:sandbox-one:lookup',
    networkId: 'ae:public',
    contractRef,
    endpointUrl: 'https://example.test/api/capability',
    credentialRef: 'env:AE_SANDBOX_PROVIDER_KEY',
    continuation: { kind: 'single_response' as const, evidenceRefs: ['seed:http-response'] },
    cancellation: { kind: 'unsupported' as const, evidenceRefs: ['seed:no-cancellation'] },
    adapter: {
      adapterId: 'http-json:v1',
      config: { method: 'POST', requestTimeoutMs: 5_000 },
    },
    registrationEvidenceRefs: ['seed:production-protocol-contract-test'],
  }
}
