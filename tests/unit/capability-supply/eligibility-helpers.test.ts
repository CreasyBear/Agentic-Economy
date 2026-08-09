import { describe, expect, it } from 'vitest'

import {
  compareStableIdentifier,
  desiredEligibility,
  eligibilityPublicResult,
  eligibilityReplayAudits,
  eligibleBindingProjection,
  eligibleOfferingProjection,
  validEligibilityInput,
} from '@/modules/capability-supply/internal/eligibility'
import {
  connectionAuthoritySnapshotFromProviderConnection,
  type CapabilityBindingRow,
} from '@/modules/capability-supply/internal/binding'
import type { CapabilityOfferingRow } from '@/modules/capability-supply/internal/offering'
import { createProviderConnection, type CreateProviderConnectionCommand } from '@/modules/capability-supply/provider-connection'

const digest = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const eligibility = {
  offeringId: 'offering-1',
  bindingId: 'binding-1',
  contractRef: { capabilityId: 'cap.demo', version: 1, contractDigest: digest },
  decision: 'admit' as const,
  expectedOfferingRegistrationHash: digest,
  expectedBindingRegistrationHash: digest,
  admissionEvidenceRefs: ['evidence:admission'],
  conformanceEvidenceRefs: ['evidence:conformance'],
}
const providerConnectionCommand: CreateProviderConnectionCommand = {
  commandId: 'command:create:eligibility',
  connectionRef: 'connection:demo',
  businessId: 'business-1',
  providerRef: 'provider:demo',
  providerAccountRef: 'account:demo',
  adapterId: 'http.json',
  credentialRef: 'env:DEMO_PROVIDER_SECRET',
  requestedScopes: ['demo:read'],
  grantedScopes: ['demo:read'],
  requestedResources: ['account:demo'],
  grantedResources: ['account:demo'],
  evidenceRefs: ['evidence:connection'],
}
const providerConnectionResult = createProviderConnection(providerConnectionCommand, 1)
if (providerConnectionResult.kind !== 'applied') throw new Error('eligibility_provider_connection_fixture_failed')
const connectionAuthority = connectionAuthoritySnapshotFromProviderConnection(
  providerConnectionResult.connection,
  'operation:demo',
)

describe('capability-supply eligibility helpers', () => {
  it('validates input and shapes desired admit/revoke state', () => {
    expect(validEligibilityInput(eligibility)).toBe(true)
    expect(validEligibilityInput({ ...eligibility, offeringId: '' })).toBe(false)
    expect(desiredEligibility('admit', 'inactive')).toEqual({
      offeringStatus: 'active',
      bindingAdmission: 'admitted',
      bindingConformance: 'conformant',
    })
    expect(desiredEligibility('revoke', 'inactive')).toEqual({
      offeringStatus: 'inactive',
      bindingAdmission: 'not_admitted',
      bindingConformance: 'not_conformant',
    })
  })

  it('builds public result and replay audit plans', () => {
    const desired = desiredEligibility('admit', 'inactive')
    const result = eligibilityPublicResult(eligibility, desired)
    expect(result.kind).toBe('eligible')
    expect(result.offeringId).toBe('offering-1')
    expect(result.eligibilityHash.startsWith('sha256:')).toBe(true)

    const audits = eligibilityReplayAudits(
      {
        actor: { kind: 'system', ref: 'system-1' },
        eligibility,
        context: {
          operationKey: 'op-1',
          correlationId: 'corr-1',
          reasonCode: 'admit',
          evidenceRefs: ['evidence:1'],
        },
      },
      desired,
      42,
    )
    expect(audits).toHaveLength(2)
    expect(audits[0]?.audit.targetType).toBe('capability_offering')
    expect(audits[1]?.audit.targetType).toBe('capability_binding')
    expect(audits[1]?.audit.afterState).toBe('admitted:conformant')
  })

  it('projects eligible rows and compares identifiers stably', () => {
    const offering = {
      offeringId: 'offering-1',
      businessId: 'business-1',
      networkId: 'network-1',
      capabilityId: 'cap.demo',
      version: 1,
      contractDigest: digest,
      presentation: {
        label: 'Demo',
        summary: 'Demo',
        price: { kind: 'on_request' as const },
        materialTerms: [],
        commercialRelationship: {
          kind: 'none' as const,
          summary: 'Independent',
          influencesEligibility: false,
          influencesInclusion: false,
          influencesOrder: false,
          evidenceRefs: ['evidence:commercial'],
        },
      },
      searchTerms: ['demo'],
      registrationEvidenceRefs: ['evidence:registration'],
      registrationHash: digest,
      status: 'active' as const,
      admissionEvidenceRefs: ['evidence:admission'],
      eligibilityHash: digest,
      registeredAt: 1,
      updatedAt: 1,
    } satisfies CapabilityOfferingRow
    const binding = {
      _id: 'row-1',
      _creationTime: 1,
      bindingId: 'binding-1',
      offeringId: 'offering-1',
      networkId: 'network-1',
      capabilityId: 'cap.demo',
      version: 1,
      contractDigest: digest,
      endpointUrl: 'https://example.test',
      authority: { kind: 'provider_connection', connectionRef: 'connection:demo', providerRef: 'provider:demo' },
      connectionAuthority,
      continuation: { kind: 'single_response' as const, evidenceRefs: ['evidence:continuation'] },
      cancellation: { kind: 'unsupported' as const, evidenceRefs: ['evidence:cancellation'] },
      adapterId: 'http.json',
      configJson: '{}',
      configDigest: digest,
      registrationEvidenceRefs: ['evidence:binding'],
      registrationHash: digest,
      admission: 'admitted' as const,
      conformance: 'conformant' as const,
      admissionEvidenceRefs: ['evidence:admission'],
      conformanceEvidenceRefs: ['evidence:conformance'],
      eligibilityHash: digest,
      registeredAt: 1,
      updatedAt: 1,
    } satisfies CapabilityBindingRow

    expect(eligibleOfferingProjection(offering).status).toBe('active')
    expect(eligibleBindingProjection(binding)).toMatchObject({
      admission: 'admitted',
      conformance: 'conformant',
    })
    expect(compareStableIdentifier('a', 'b')).toBeLessThan(0)
    expect(compareStableIdentifier('b', 'a')).toBeGreaterThan(0)
    expect(compareStableIdentifier('a', 'a')).toBe(0)
  })
})
