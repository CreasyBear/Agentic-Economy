import { describe, expect, it } from 'vitest'

import type { CapabilityBindingRow } from '@/modules/capability-supply/internal/binding'
import type { CapabilityOfferingRow } from '@/modules/capability-supply/internal/offering'
import {
  INITIAL_PUBLICATION_LIFECYCLE,
  decodeConvexPublicationSource,
  isDirectPublicationSource,
  publicationLifecycle,
  publicationProjection,
} from '@/modules/capability-supply/internal/publication'
import {
  capabilityBindingEligibilityHash,
  capabilityOfferingEligibilityHash,
} from '@/modules/capability-supply/public'

const digest = `sha256:${'1'.repeat(64)}`

function offeringRow(status: 'active' | 'inactive' = 'active'): CapabilityOfferingRow {
  const registrationHash = digest
  const admissionEvidenceRefs = ['evidence:admission']
  return {
    offeringId: 'offering-1',
    businessId: 'business-1',
    networkId: 'network-1',
    capabilityId: 'cap.demo',
    version: 1,
    contractDigest: digest,
    presentation: {
      label: 'Demo',
      summary: 'Demo',
      price: { kind: 'on_request' },
      materialTerms: [],
      commercialRelationship: {
        kind: 'none',
        summary: 'Independent',
        influencesEligibility: false,
        influencesInclusion: false,
        influencesOrder: false,
        evidenceRefs: ['evidence:commercial'],
      },
    },
    searchTerms: ['demo'],
    registrationEvidenceRefs: ['evidence:registration'],
    registrationHash,
    status,
    admissionEvidenceRefs,
    eligibilityHash: capabilityOfferingEligibilityHash({
      offeringId: 'offering-1',
      registrationHash,
      status,
      admissionEvidenceRefs,
    }),
    registeredAt: 1,
    updatedAt: 1,
  }
}

function bindingRow(
  admission: 'admitted' | 'not_admitted' = 'admitted',
  conformance: 'conformant' | 'not_conformant' = 'conformant',
): CapabilityBindingRow {
  const registrationHash = digest
  const admissionEvidenceRefs = ['evidence:admission']
  const conformanceEvidenceRefs = ['evidence:conformance']
  return {
    _id: 'row-1',
    _creationTime: 1,
    bindingId: 'binding-1',
    offeringId: 'offering-1',
    networkId: 'network-1',
    capabilityId: 'cap.demo',
    version: 1,
    contractDigest: digest,
    endpointUrl: 'https://example.test',
    credentialRef: 'credential:demo',
    continuation: { kind: 'single_response', evidenceRefs: ['evidence:continuation'] },
    cancellation: { kind: 'unsupported', evidenceRefs: ['evidence:cancellation'] },
    adapterId: 'http-json:v1',
    configJson: '{}',
    configDigest: digest,
    registrationEvidenceRefs: ['evidence:binding'],
    registrationHash,
    admission,
    conformance,
    admissionEvidenceRefs,
    conformanceEvidenceRefs,
    eligibilityHash: capabilityBindingEligibilityHash({
      bindingId: 'binding-1',
      registrationHash,
      admission,
      conformance,
      admissionEvidenceRefs,
      conformanceEvidenceRefs,
    }),
    registeredAt: 1,
    updatedAt: 1,
  }
}

describe('capability-supply publication lifecycle', () => {
  it('projects published results and starts from the inactive initial lifecycle', () => {
    expect(INITIAL_PUBLICATION_LIFECYCLE.state).toBe('inactive')
    expect(publicationProjection(
      { capabilityId: 'cap.demo', version: 1, contractDigest: digest },
      'offering-1',
      'binding-1',
    )).toMatchObject({
      kind: 'published',
      publicationRef: 'offering-1',
      lifecycle: INITIAL_PUBLICATION_LIFECYCLE,
    })
  })

  it('marks withdrawn and incompatible dispositions immediately', () => {
    expect(publicationLifecycle(
      { disposition: 'withdrawn', credentialState: 'ready', healthState: 'healthy' },
      offeringRow(),
      bindingRow(),
      100,
    )).toEqual({ state: 'withdrawn', reasons: ['withdrawn'] })
    expect(publicationLifecycle(
      { disposition: 'incompatible', credentialState: 'ready', healthState: 'healthy' },
      offeringRow(),
      bindingRow(),
      100,
    )).toEqual({ state: 'incompatible', reasons: ['incompatible_revision'] })
  })

  it('requires admission, conformance, credential, and health readiness for active', () => {
    expect(publicationLifecycle(
      {
        disposition: 'current',
        credentialState: 'ready',
        healthState: 'healthy',
        readinessValidUntil: 200,
      },
      offeringRow('active'),
      bindingRow('admitted', 'conformant'),
      100,
    )).toEqual({ state: 'active', reasons: [] })
    expect(publicationLifecycle(
      {
        disposition: 'current',
        credentialState: 'unobserved',
        healthState: 'unobserved',
      },
      offeringRow('inactive'),
      bindingRow('not_admitted', 'not_conformant'),
      100,
    ).reasons).toEqual(expect.arrayContaining([
      'admission_unproven',
      'conformance_unproven',
      'credential_readiness_unobserved',
      'health_unobserved',
    ]))
  })

  it('decodes convex publication sources and recognizes direct envelopes', () => {
    expect(isDirectPublicationSource({ kind: 'ae_envelope', documentJson: '{}' })).toBe(true)
    expect(isDirectPublicationSource({ kind: 'openapi_http' })).toBe(false)
    expect(decodeConvexPublicationSource({
      kind: 'openapi_http',
      documentJson: '{"paths":{}}',
      other: true,
    })).toEqual({ kind: 'openapi_http', other: true, document: { paths: {} } })
    expect(decodeConvexPublicationSource({
      kind: 'mcp',
      toolJson: '{"name":"demo"}',
    })).toEqual({ kind: 'mcp', tool: { name: 'demo' } })
  })
})
