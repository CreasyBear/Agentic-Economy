import { describe, expect, it } from 'vitest'

import {
  capabilityBindingRegistrationHash,
  capabilityOfferingRegistrationHash,
  defineCapabilityOfferingRegistration,
  defineCapabilityTransportBindingRegistration,
} from '@/modules/capability-supply/public'
import type { ExactAmount } from '@/modules/money/public'

const contractRef = {
  capabilityId: 'reference.lookup',
  version: 1,
  contractDigest: `sha256:${'1'.repeat(64)}`,
}
const audAmount: ExactAmount = { currency: 'AUD', units: '1200', exponent: 2 }

describe('capability supply registration contract', () => {
  it('keeps commercial offering identity separate from transport binding identity', () => {
    const offering = defineCapabilityOfferingRegistration(offeringInput())
    const binding = defineCapabilityTransportBindingRegistration(bindingInput())

    expect(offering).toMatchObject({
      offeringId: 'offering:sandbox-one:lookup',
      businessId: 'businesses:sandbox-one',
      presentation: { price: { kind: 'fixed', amount: audAmount } },
    })
    expect(offering.presentation.price).not.toHaveProperty('currency')
    expect(offering.presentation.price).not.toHaveProperty('amountMinor')
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
  it('compares range prices by exact value across exponent scales', () => {
    const minimum = { currency: 'USD', units: '7', exponent: 3 }
    const maximum = { currency: 'USD', units: '1', exponent: 2 }
    const offering = defineCapabilityOfferingRegistration({
      ...offeringInput(),
      presentation: {
        ...offeringInput().presentation,
        price: { kind: 'range' as const, minimum, maximum },
      },
    })

    expect(offering.presentation.price).toEqual({ kind: 'range', minimum, maximum })
    expect(() => defineCapabilityOfferingRegistration({
      ...offeringInput(),
      presentation: {
        ...offeringInput().presentation,
        price: { kind: 'range' as const, minimum: { ...maximum, units: '11' }, maximum },
      },
    })).toThrowError('capability_offering_invalid')
  })

  it('strictly rejects operation and all other undeclared registration fields', () => {
    expect(() => defineCapabilityOfferingRegistration({ ...offeringInput(), operation: 'quote' }))
      .toThrowError('capability_offering_invalid')
    expect(() => defineCapabilityTransportBindingRegistration({ ...bindingInput(), operation: 'book' }))
      .toThrowError('capability_binding_invalid')
  })

  it('retains strict rejection at nested registration authority boundaries', () => {
    const offering = offeringInput()
    const binding = bindingInput()
    expect(() => defineCapabilityOfferingRegistration({
      ...offering,
      presentation: { ...offering.presentation, undeclared: true },
    })).toThrowError('capability_offering_invalid')
    expect(() => defineCapabilityOfferingRegistration({
      ...offering,
      presentation: {
        ...offering.presentation,
        materialTerms: [{ ...offering.presentation.materialTerms[0], undeclared: true }],
      },
    })).toThrowError('capability_offering_invalid')
    for (const malformedAmount of [
      { currency: 'usd', units: '1200', exponent: 2 },
      { currency: 'AUD', units: '01200', exponent: 2 },
      { currency: 'AUD', units: '1200', exponent: 19 },
    ]) {
      expect(() => defineCapabilityOfferingRegistration({
        ...offering,
        presentation: {
          ...offering.presentation,
          price: { kind: 'fixed' as const, amount: malformedAmount },
        },
      })).toThrowError('capability_offering_invalid')
    }
    expect(() => defineCapabilityTransportBindingRegistration({
      ...binding,
      continuation: { ...binding.continuation, undeclared: true },
    })).toThrowError('capability_binding_invalid')
    expect(() => defineCapabilityTransportBindingRegistration({
      ...binding,
      adapter: { ...binding.adapter, undeclared: true },
    })).toThrowError('capability_binding_invalid')
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
    const authority = binding.authority
    if (authority.kind !== 'provider_connection') throw new Error('provider_authority_missing')
    expect(capabilityBindingRegistrationHash({
      ...binding,
      authority: { ...authority, connectionRef: 'connection:other' },
    }, admitted)).not.toBe(capabilityBindingRegistrationHash(binding, admitted))
    expect(capabilityBindingRegistrationHash(binding, {
      configJson: '{"method":"POST","requestTimeoutMs":6000}',
      configDigest: `sha256:${'4'.repeat(64)}`,
    })).not.toBe(capabilityBindingRegistrationHash(binding, admitted))
  })

  it('binds a promoted action to exact catalog Offering lineage without copying it', () => {
    const origin = {
      kind: 'catalog_offering' as const,
      offeringRef: 'offering:meridian:subgraph-query',
      offeringRevision: 2,
      offeringSourceHash: 'sha256:catalog-offering-v2',
      declaredAccessPathRef: 'access:meridian:graphql',
      accessPathSourceHash: 'sha256:declared-endpoint-v1',
    }
    const offering = defineCapabilityOfferingRegistration({ ...offeringInput(), origin })

    expect(offering.origin).toEqual(origin)
    expect(capabilityOfferingRegistrationHash({
      ...offering,
      origin: { ...origin, offeringRevision: 3 },
    })).not.toBe(capabilityOfferingRegistrationHash(offering))
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
      price: { kind: 'fixed' as const, amount: audAmount },
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
    authority: { kind: 'provider_connection', connectionRef: 'connection:sandbox-one', providerRef: 'provider:sandbox' },
    continuation: { kind: 'single_response' as const, evidenceRefs: ['seed:http-response'] },
    cancellation: { kind: 'unsupported' as const, evidenceRefs: ['seed:no-cancellation'] },
    adapter: {
      adapterId: 'http-json:v1',
      config: { method: 'POST', requestTimeoutMs: 5_000 },
    },
    registrationEvidenceRefs: ['seed:production-protocol-contract-test'],
  }
}
