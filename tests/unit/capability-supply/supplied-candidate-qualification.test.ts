import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { defineCapabilityContract } from '@/modules/capability-contract/public'
import type { CapabilityBindingRow } from '@/modules/capability-supply/internal/binding'
import type {
  CapabilityGraphPorts,
  GraphPublicationRow,
  GraphPublishedBusiness,
} from '@/modules/capability-supply/internal/graph'
import type { CapabilityOfferingRow } from '@/modules/capability-supply/internal/offering'
import {
  capabilityBindingEligibilityHash,
  capabilityBindingRegistrationHash,
  capabilityOfferingEligibilityHash,
  capabilityOfferingRegistrationHash,
  defineCapabilityOfferingRegistration,
  defineCapabilityTransportBindingRegistration,
} from '@/modules/capability-supply/public'
import {
  qualifySuppliedCandidate,
  type SuppliedCandidateRef,
} from '@/modules/capability-supply/server'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { capabilityContractV2 } from '../../fixtures/capability-contract-v2'

const now = 2_000
const contract = defineCapabilityContract(capabilityContractV2())
const candidate: SuppliedCandidateRef = {
  publicationRef: 'publication:development-reference',
  revision: 3,
  businessId: 'business:development-supplier',
  offeringId: 'offering:development-reference',
  bindingId: 'binding:development-reference',
  contractRef: contract.ref,
}
const offeringRegistration = defineCapabilityOfferingRegistration({
  offeringId: candidate.offeringId,
  businessId: candidate.businessId,
  networkId: 'ae:public',
  contractRef: contract.ref,
  presentation: {
    label: 'Development reference lookup',
    summary: 'Labelled fixture supply for qualification evaluation.',
    price: { kind: 'on_request' },
    materialTerms: [],
    commercialRelationship: {
      kind: 'none',
      summary: 'No commercial influence in this development fixture.',
      influencesEligibility: false,
      influencesInclusion: false,
      influencesOrder: false,
      evidenceRefs: ['fixture:commercial'],
    },
  },
  searchTerms: ['reference'],
  registrationEvidenceRefs: ['fixture:offering-registration'],
})
const bindingRegistration = defineCapabilityTransportBindingRegistration({
  bindingId: candidate.bindingId,
  offeringId: candidate.offeringId,
  networkId: 'ae:public',
  contractRef: contract.ref,
  endpointUrl: 'https://development.invalid/reference',
  credentialRef: 'fixture:credential-access',
  continuation: { kind: 'single_response', evidenceRefs: ['fixture:continuation'] },
  cancellation: { kind: 'unsupported', evidenceRefs: ['fixture:cancellation'] },
  adapter: { adapterId: 'http-json:v1', config: null },
  registrationEvidenceRefs: ['fixture:binding-registration'],
})
const admittedTransport = { configJson: 'null', configDigest: canonicalDigest(null) }

function offering(overrides: Partial<CapabilityOfferingRow> = {}): CapabilityOfferingRow {
  const registrationHash = capabilityOfferingRegistrationHash(offeringRegistration)
  const status = overrides.status ?? 'active'
  const admissionEvidenceRefs = ['fixture:offering-admission']
  return {
    ...offeringRegistration,
    ...contract.ref,
    registrationHash,
    status,
    admissionEvidenceRefs,
    eligibilityHash: capabilityOfferingEligibilityHash({
      offeringId: candidate.offeringId,
      registrationHash,
      status,
      admissionEvidenceRefs,
    }),
    registeredAt: 1_000,
    updatedAt: 1_000,
    ...overrides,
  }
}

function binding(overrides: Partial<CapabilityBindingRow> = {}): CapabilityBindingRow {
  const registrationHash = capabilityBindingRegistrationHash(bindingRegistration, admittedTransport)
  const admission = overrides.admission ?? 'admitted'
  const conformance = overrides.conformance ?? 'conformant'
  const admissionEvidenceRefs = ['fixture:binding-admission']
  const conformanceEvidenceRefs = ['fixture:binding-conformance']
  return {
    _id: 'fixture:binding-row',
    _creationTime: 1_000,
    bindingId: candidate.bindingId,
    offeringId: candidate.offeringId,
    networkId: 'ae:public',
    ...contract.ref,
    endpointUrl: bindingRegistration.endpointUrl,
    credentialRef: bindingRegistration.credentialRef,
    continuation: bindingRegistration.continuation,
    cancellation: bindingRegistration.cancellation,
    adapterId: bindingRegistration.adapter.adapterId,
    ...admittedTransport,
    registrationEvidenceRefs: bindingRegistration.registrationEvidenceRefs,
    registrationHash,
    admission,
    conformance,
    admissionEvidenceRefs,
    conformanceEvidenceRefs,
    eligibilityHash: capabilityBindingEligibilityHash({
      bindingId: candidate.bindingId,
      registrationHash,
      admission,
      conformance,
      admissionEvidenceRefs,
      conformanceEvidenceRefs,
    }),
    registeredAt: 1_000,
    updatedAt: 1_000,
    ...overrides,
  }
}

function publication(overrides: Partial<GraphPublicationRow> = {}): GraphPublicationRow {
  return {
    id: 'fixture:publication-row',
    ...candidate,
    ...contract.ref,
    sourceKind: 'openapi_http',
    sourceDigest: canonicalDigest({ fixture: 'published capability' }),
    disposition: 'current',
    credentialState: 'ready',
    healthState: 'healthy',
    readinessObservedAt: 1_900,
    readinessValidUntil: 2_100,
    registrationEvidenceRefs: ['fixture:publication-registration'],
    readinessEvidenceRefs: ['fixture:readiness-probe'],
    ...overrides,
  }
}

function ports(overrides: Partial<CapabilityGraphPorts> = {}): CapabilityGraphPorts {
  return {
    loadPublicationAtRevision: async () => publication(),
    listCurrentPublicationsByNetwork: async () => [],
    loadOfferingByOfferingId: async () => offering(),
    loadBindingByBindingId: async () => binding(),
    loadPublishedBusiness: async () => ({
      businessId: candidate.businessId,
      trustTier: 'fixture_only',
      publicStatus: 'published',
      claimStatus: 'published',
      suppressed: false,
      currentlyPublished: true,
    }),
    getActiveExactCapabilityContract: async () => ({
      kind: 'found',
      ref: contract.ref,
      documentJson: '{}',
      registeredAt: 1_000,
    }),
    getExactRegisteredCapabilityContract: async () => ({
      kind: 'found',
      contract,
      registeredAt: 1_000,
    }),
    patchProbeReadiness: async () => undefined,
    ...overrides,
  }
}

describe('ADR-009 supplied-candidate qualification', () => {
  it('qualifies labelled supplied development evidence only when every source-owned condition is current', async () => {
    const result = await qualifySuppliedCandidate(ports(), { candidate, now })

    expect(result).toMatchObject({
      environment: 'SOURCE-OWNED DEVELOPMENT EVIDENCE',
      status: 'eligible',
      reasons: [],
      validUntil: 2_100,
      qualificationDigest: expect.stringMatching(/^sha256:/),
    })
    expect(result.sources.map(({ kind }) => kind)).toEqual([
      'binding', 'business', 'contract', 'offering', 'publication', 'readiness',
    ])
    expect(result.sources.every(({ ref, digest }) => ref.length > 0 && digest.startsWith('sha256:')))
      .toBe(true)
  })

  it.each([
    ['listing only', {
      loadPublicationAtRevision: async (): Promise<GraphPublicationRow | null> => null,
    }, ['publication_missing']],
    ['non-current publication', {
      loadPublicationAtRevision: async () => publication({ disposition: 'superseded' }),
    }, ['publication_not_current']],
    ['mismatched candidate references', {
      loadPublicationAtRevision: async () => publication({ businessId: 'business:other' }),
    }, ['candidate_reference_mismatch']],
    ['missing offering', {
      loadOfferingByOfferingId: async (): Promise<CapabilityOfferingRow | null> => null,
    }, ['offering_missing']],
    ['missing binding', {
      loadBindingByBindingId: async (): Promise<CapabilityBindingRow | null> => null,
    }, ['binding_missing']],
    ['missing contract', {
      getActiveExactCapabilityContract: async () => ({ kind: 'unavailable' as const, reason: 'not_found' as const }),
    }, ['contract_missing_or_inactive']],
    ['unpublished business', {
      loadPublishedBusiness: async () => null,
    }, ['business_not_currently_published']],
    ['ineligible offering', {
      loadOfferingByOfferingId: async () => offering({ status: 'inactive' }),
    }, ['offering_ineligible_or_unpublished']],
    ['unadmitted and nonconformant binding', {
      loadBindingByBindingId: async () => binding({
        admission: 'not_admitted',
        conformance: 'not_conformant',
      }),
    }, ['binding_not_admitted', 'binding_not_conformant']],
    ['credential access failure', {
      loadPublicationAtRevision: async () => publication({ credentialState: 'unavailable' }),
    }, ['credential_access_unavailable']],
    ['missing readiness', {
      loadPublicationAtRevision: async () => publication({
        healthState: 'unobserved',
        readinessObservedAt: undefined,
        readinessValidUntil: undefined,
      }),
    }, ['readiness_unobserved']],
    ['stale readiness', {
      loadPublicationAtRevision: async () => publication({ readinessValidUntil: 1_999 }),
    }, ['readiness_stale']],
  ] as const)('blocks %s with inspectable reasons', async (_label, overrides, expectedReasons) => {
    const result = await qualifySuppliedCandidate(ports(overrides), { candidate, now })
    expect(result.status).toBe('blocked')
    expect(result.reasons).toEqual(expect.arrayContaining([...expectedReasons]))
  })

  it('gives Request-owned and standalone callers identical qualification meaning', async () => {
    const origins = [
      { kind: 'request_owned', requestRef: 'request:fixture', revision: 4 },
      { kind: 'standalone', callerRef: 'caller:fixture', principalRef: 'principal:fixture' },
    ] as const
    const results = await Promise.all(origins.map(async () => (
      await qualifySuppliedCandidate(ports(), { candidate, now })
    )))
    expect(results[0]).toEqual(results[1])
  })

  it('blocks a tampered business-currentness projection and changes its source evidence', async () => {
    const current = await qualifySuppliedCandidate(ports(), { candidate, now })
    const tamperedBusiness = {
      businessId: candidate.businessId,
      trustTier: 'fixture_only',
      publicStatus: 'published',
      claimStatus: 'unpublished',
      suppressed: false,
      currentlyPublished: false,
    } as unknown as GraphPublishedBusiness
    const tampered = await qualifySuppliedCandidate(ports({
      loadPublishedBusiness: async () => tamperedBusiness,
    }), { candidate, now })

    expect(tampered).toMatchObject({
      status: 'blocked',
      reasons: ['business_not_currently_published'],
    })
    expect(sourceDigest(tampered, 'business')).toBeUndefined()
    expect(sourceDigest(current, 'business')).toMatch(/^sha256:/)
  })

  it('binds active contract registration metadata and blocks a mismatched returned contract', async () => {
    const first = await qualifySuppliedCandidate(ports(), { candidate, now })
    const changedRegistration = await qualifySuppliedCandidate(ports({
      getActiveExactCapabilityContract: async () => ({
        kind: 'found',
        ref: contract.ref,
        documentJson: '{}',
        registeredAt: 1_001,
      }),
    }), { candidate, now })
    const mismatchedContract = defineCapabilityContract(capabilityContractV2({
      version: 2,
    }))
    const mismatched = await qualifySuppliedCandidate(ports({
      getActiveExactCapabilityContract: async () => ({
        kind: 'found',
        ref: mismatchedContract.ref,
        documentJson: '{}',
        registeredAt: 1_000,
      }),
    }), { candidate, now })

    expect(sourceDigest(changedRegistration, 'contract'))
      .not.toBe(sourceDigest(first, 'contract'))
    expect(changedRegistration.qualificationDigest).not.toBe(first.qualificationDigest)
    expect(mismatched).toMatchObject({
      status: 'blocked',
      reasons: ['source_integrity_failure'],
    })
  })

  it('is deterministic, reference-only, and does not introduce an action runner or effect path', async () => {
    const first = await qualifySuppliedCandidate(ports(), { candidate, now })
    const second = await qualifySuppliedCandidate(ports(), { candidate, now })
    expect(second).toEqual(first)
    expect(JSON.stringify(first)).not.toContain('https://development.invalid')
    expect(JSON.stringify(first)).not.toContain('fixture:credential-access')

    const source = readFileSync(
      'src/modules/capability-supply/internal/graph/qualify-candidate.ts',
      'utf8',
    )
    expect(source).not.toMatch(/defineAction|ActionInvocationTracer|\.run\(|execute|fetch\(/)
  })
})

function sourceDigest(
  result: Awaited<ReturnType<typeof qualifySuppliedCandidate>>,
  kind: 'business' | 'contract',
): string | undefined {
  return result.sources.find((source) => source.kind === kind)?.digest
}
