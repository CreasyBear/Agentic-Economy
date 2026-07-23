import { describe, expect, it, vi } from 'vitest'

import { encodeCapabilityContractDocumentJson } from '@/modules/capability-contract-registry/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  capabilityBindingRegistrationHash,
  capabilityOfferingRegistrationHash,
} from '@/modules/capability-supply/public'
import {
  admitPublicationDraft,
  publishCapabilityCommand,
  refreshCapabilityCommand,
  withdrawCapabilityCommand,
  type PublicationCommandPorts,
  type PublicationCommandRow,
} from '@/modules/capability-supply/internal/publication'
import type { OperationKeyRecord } from '@/modules/capability-supply/internal/operation-ledger'
import { capabilityContractV2 } from '../../fixtures/capability-contract-v2'

const digest = `sha256:${'a'.repeat(64)}`
const actor = { kind: 'owner' as const, ref: 'owner-1' }
const context = {
  operationKey: 'op-publish-1',
  correlationId: 'corr-1',
  reasonCode: 'publish',
  evidenceRefs: ['evidence:publication'],
}

function publicationSource(capabilityId = 'independent.demo.lookup', version = 1) {
  return {
    kind: 'ae_envelope' as const,
    documentJson: JSON.stringify(capabilityContractV2({ capabilityId, version, name: 'Demo lookup' })),
  }
}

function offeringDraft(suffix = 'demo') {
  return {
    offeringId: `offering:${suffix}:lookup`,
    networkId: 'ae:public',
    presentation: {
      label: `${suffix} lookup`,
      summary: 'Returns one structured result.',
      price: { kind: 'on_request' as const },
      materialTerms: [],
      commercialRelationship: {
        kind: 'none' as const,
        summary: 'No commercial influence.',
        influencesEligibility: false,
        influencesInclusion: false,
        influencesOrder: false,
        evidenceRefs: ['business:neutral'],
      },
    },
    searchTerms: ['lookup'],
    registrationEvidenceRefs: ['business:publication'],
  }
}

function bindingDraft(suffix = 'demo') {
  return {
    bindingId: `binding:${suffix}:http`,
    endpointUrl: `https://${suffix}.example.test/lookup`,
    credentialRef: `env:${suffix.toUpperCase()}_KEY`,
    continuation: { kind: 'single_response' as const, evidenceRefs: ['business:response'] },
    cancellation: { kind: 'unsupported' as const, evidenceRefs: ['business:no-cancellation'] },
    adapter: { adapterId: 'http-json:v1', config: { method: 'POST' as const, requestTimeoutMs: 5_000 } },
    registrationEvidenceRefs: ['business:binding'],
  }
}

function encodedFor(capabilityId = 'independent.demo.lookup', version = 1) {
  return encodeCapabilityContractDocumentJson(
    JSON.stringify(capabilityContractV2({ capabilityId, version, name: 'Demo lookup' })),
  )
}

function emptyPorts(overrides: Partial<PublicationCommandPorts> = {}): PublicationCommandPorts {
  return {
    findOperationKey: async () => null,
    insertOperationKey: async () => 'op-row-1',
    markOperationInProgress: async () => {},
    markOperationFailed: async () => {},
    markOperationSucceeded: async () => {},
    findAuditByEventId: async () => null,
    insertAudit: async () => {},
    registerOffering: async (registration) => ({
      kind: 'registered',
      offeringId: (registration as { offeringId: string }).offeringId,
      registrationHash: digest,
      created: true,
    }),
    registerBinding: async (registration) => ({
      kind: 'registered',
      bindingId: (registration as { bindingId: string }).bindingId,
      registrationHash: digest,
      created: true,
    }),
    setEligibility: async () => ({
      kind: 'ineligible',
      offeringId: 'offering:demo:lookup',
      bindingId: 'binding:demo:http',
      eligibilityHash: digest,
      offeringEligibilityHash: digest,
      bindingEligibilityHash: digest,
      transition: {
        offeringBefore: 'active',
        offeringAfter: 'inactive',
        bindingBefore: 'admitted:conformant',
        bindingAfter: 'not_admitted:not_conformant',
      },
    }),
    loadOfferingByOfferingId: async () => null,
    loadBindingByBindingId: async () => null,
    listAdmittedConformantBindings: async () => [],
    patchOfferingQuarantineParent: async () => {},
    patchBindingQuarantine: async () => {},
    findContractDigest: async () => null,
    loadPublicationAtRevision: async () => null,
    insertPublication: async () => {},
    patchPublicationSuperseded: async () => {},
    patchPublicationWithdrawn: async () => {},
    registerContractDocument: async () => ({
      kind: 'registered',
      ref: encodedFor().contract.ref,
      created: true,
    }),
    getExactRegisteredContract: async () => ({
      kind: 'unavailable',
      reason: 'not_found',
    }),
    scheduleReadinessProbe: async () => {},
    ...overrides,
  }
}

function currentPublication(
  overrides: Partial<PublicationCommandRow> = {},
): PublicationCommandRow {
  const ref = encodedFor().contract.ref
  return {
    id: 'pub-row-1',
    publicationRef: 'offering:demo:lookup',
    revision: 1,
    businessId: 'business-1',
    networkId: 'ae:public',
    offeringId: 'offering:demo:lookup',
    bindingId: 'binding:demo:http',
    capabilityId: ref.capabilityId,
    version: ref.version,
    contractDigest: ref.contractDigest,
    disposition: 'current',
    sourceDigest: digest,
    ...overrides,
  }
}

function supplyRows(publication: PublicationCommandRow) {
  return {
    loadOfferingByOfferingId: async () => ({
      offeringId: publication.offeringId,
      businessId: publication.businessId,
      networkId: publication.networkId,
      capabilityId: publication.capabilityId,
      version: publication.version,
      contractDigest: publication.contractDigest,
      presentation: offeringDraft().presentation,
      searchTerms: ['lookup'],
      registrationEvidenceRefs: ['business:publication'],
      registrationHash: digest,
      status: 'active' as const,
      admissionEvidenceRefs: ['evidence:admission'],
      eligibilityHash: digest,
      registeredAt: 1,
      updatedAt: 1,
    }),
    loadBindingByBindingId: async () => ({
      _id: 'binding-row',
      _creationTime: 1,
      bindingId: publication.bindingId,
      offeringId: publication.offeringId,
      networkId: publication.networkId,
      capabilityId: publication.capabilityId,
      version: publication.version,
      contractDigest: publication.contractDigest,
      endpointUrl: 'https://demo.example.test/lookup',
      credentialRef: 'env:DEMO_KEY',
      continuation: { kind: 'single_response' as const, evidenceRefs: ['business:response'] },
      cancellation: { kind: 'unsupported' as const, evidenceRefs: ['business:no-cancellation'] },
      adapterId: 'http-json:v1',
      configJson: '{}',
      configDigest: digest,
      registrationEvidenceRefs: ['business:binding'],
      registrationHash: digest,
      admission: 'admitted' as const,
      conformance: 'conformant' as const,
      admissionEvidenceRefs: ['evidence:admission'],
      conformanceEvidenceRefs: ['evidence:conformance'],
      eligibilityHash: digest,
      registeredAt: 1,
      updatedAt: 1,
    }),
  }
}

describe('capability-supply publication commands', () => {
  it('refuses publish when source is invalid', async () => {
    const result = await publishCapabilityCommand({
      businessId: 'business-1',
      source: { kind: 'ae_envelope', documentJson: '{' },
      ...context,
      actor,
      now: 10,
    }, emptyPorts())
    expect(result).toEqual({ kind: 'refused', reason: 'source_invalid' })
  })

  it('refuses publish on contract identity conflict', async () => {
    const result = await publishCapabilityCommand({
      businessId: 'business-1',
      source: publicationSource(),
      offering: offeringDraft(),
      binding: bindingDraft(),
      ...context,
      actor,
      now: 10,
    }, emptyPorts({
      findContractDigest: async () => `sha256:${'b'.repeat(64)}`,
    }))
    expect(result).toEqual({ kind: 'refused', reason: 'contract_identity_conflict' })
  })

  it('replays publish through the operation ledger', async () => {
    const admitted = admitPublicationDraft({
      source: publicationSource(),
      offering: offeringDraft(),
      binding: bindingDraft(),
      evidenceRefs: context.evidenceRefs,
      businessId: 'business-1',
    })
    if (admitted.kind !== 'admitted') throw new Error('admit_failed')
    const expected = {
      kind: 'published' as const,
      publicationRef: 'offering:demo:lookup',
      contractRef: admitted.encoded.contract.ref,
      offeringId: 'offering:demo:lookup',
      bindingId: 'binding:demo:http',
      lifecycle: {
        state: 'inactive' as const,
        reasons: [
          'admission_unproven' as const,
          'conformance_unproven' as const,
          'credential_readiness_unobserved' as const,
          'health_unobserved' as const,
        ],
      },
    }
    const requestHash = canonicalDigest({
      requestMaterial: {
        businessId: 'business-1',
        sourceKind: admitted.draft.source.kind,
        sourceDigest: admitted.draft.source.descriptorDigest,
        contractRef: {
          capabilityId: admitted.encoded.contract.ref.capabilityId,
          version: admitted.encoded.contract.ref.version,
          contractDigest: admitted.encoded.contract.ref.contractDigest,
        },
        offeringId: admitted.draft.offering.offeringId,
        offeringRegistrationHash: capabilityOfferingRegistrationHash(admitted.offering),
        bindingId: admitted.draft.binding.bindingId,
        bindingRegistrationHash: capabilityBindingRegistrationHash(
          admitted.binding,
          admitted.admittedTransport.transport,
        ),
      },
      correlationId: context.correlationId,
      reasonCode: context.reasonCode,
      evidenceRefs: context.evidenceRefs,
    })
    const existing: OperationKeyRecord = {
      operationId: 'op-row-1',
      requestHash,
      status: 'succeeded',
      resultHash: canonicalDigest(expected),
      effectRefs: ['audit:1'],
    }
    const registerContract = vi.fn(async () => {
      throw new Error('should_not_register_on_replay')
    })
    const result = await publishCapabilityCommand({
      businessId: 'business-1',
      source: publicationSource(),
      offering: offeringDraft(),
      binding: bindingDraft(),
      ...context,
      actor,
      now: 10,
    }, emptyPorts({
      findOperationKey: async () => existing,
      registerContractDocument: registerContract,
    }))
    expect(result).toEqual(expected)
    expect(registerContract).not.toHaveBeenCalled()
  })

  it('publishes successfully and schedules readiness probe', async () => {
    const insertPublication = vi.fn(async () => {})
    const schedule = vi.fn(async () => {})
    const result = await publishCapabilityCommand({
      businessId: 'business-1',
      source: publicationSource(),
      offering: offeringDraft(),
      binding: bindingDraft(),
      ...context,
      actor,
      now: 10,
    }, emptyPorts({
      insertPublication,
      scheduleReadinessProbe: schedule,
    }))
    expect(result).toMatchObject({
      kind: 'published',
      publicationRef: 'offering:demo:lookup',
      offeringId: 'offering:demo:lookup',
      bindingId: 'binding:demo:http',
    })
    expect(insertPublication).toHaveBeenCalledOnce()
    expect(schedule).toHaveBeenCalledWith('offering:demo:lookup', 1)
  })

  it('refuses refresh when version rules fail', async () => {
    const publication = currentPublication()
    const result = await refreshCapabilityCommand({
      publication,
      source: publicationSource('other.capability.lookup', 1),
      offering: offeringDraft(),
      binding: bindingDraft(),
      ...context,
      now: 10,
    }, emptyPorts())
    expect(result).toEqual({ kind: 'refused', reason: 'refresh_invalid' })
  })

  it('refuses refresh when disposition is not current', async () => {
    const result = await refreshCapabilityCommand({
      publication: currentPublication({ disposition: 'withdrawn' }),
      source: publicationSource(),
      offering: offeringDraft(),
      binding: bindingDraft(),
      ...context,
      now: 10,
    }, emptyPorts())
    expect(result).toEqual({ kind: 'refused', reason: 'revision_changed' })
  })

  it('refreshes incompatible when schemas diverge', async () => {
    const publication = currentPublication()
    const previous = encodedFor(publication.capabilityId, publication.version)
    const nextSource = {
      kind: 'ae_envelope' as const,
      documentJson: JSON.stringify(capabilityContractV2({
        capabilityId: publication.capabilityId,
        version: publication.version + 1,
        name: 'Demo lookup',
        inputSchema: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          properties: { request: { type: 'string', minLength: 2 } },
          required: ['request'],
          additionalProperties: false,
        },
      })),
    }
    const insertPublication = vi.fn(async () => {})
    const result = await refreshCapabilityCommand({
      publication,
      source: nextSource,
      offering: offeringDraft('next'),
      binding: bindingDraft('next'),
      ...context,
      now: 10,
    }, emptyPorts({
      getExactRegisteredContract: async () => ({
        kind: 'found',
        contract: previous.contract,
        registeredAt: 1,
      }),
      ...supplyRows(publication),
      insertPublication,
    }))
    expect(result).toMatchObject({
      kind: 'refreshed',
      disposition: 'incompatible',
      revision: 2,
    })
    expect(insertPublication).toHaveBeenCalledWith(expect.objectContaining({
      disposition: 'incompatible',
      revision: 2,
    }))
  })

  it('refreshes compatible and schedules readiness probe', async () => {
    const publication = currentPublication()
    const encoded = encodedFor(publication.capabilityId, publication.version)
    const schedule = vi.fn(async () => {})
    const result = await refreshCapabilityCommand({
      publication,
      source: publicationSource(publication.capabilityId, publication.version),
      offering: offeringDraft(),
      binding: bindingDraft(),
      ...context,
      now: 10,
    }, emptyPorts({
      getExactRegisteredContract: async () => ({
        kind: 'found',
        contract: encoded.contract,
        registeredAt: 1,
      }),
      ...supplyRows(publication),
      scheduleReadinessProbe: schedule,
      registerContractDocument: async () => ({
        kind: 'registered',
        ref: encoded.contract.ref,
        created: false,
      }),
    }))
    expect(result).toMatchObject({
      kind: 'refreshed',
      disposition: 'current',
      revision: 2,
    })
    expect(schedule).toHaveBeenCalledWith(publication.publicationRef, 2)
  })

  it('refuses withdraw when disposition is not current', async () => {
    const result = await withdrawCapabilityCommand({
      publication: currentPublication({ disposition: 'withdrawn' }),
      evidenceRefs: context.evidenceRefs,
      now: 10,
    }, emptyPorts())
    expect(result).toEqual({ kind: 'refused', reason: 'revision_changed' })
  })

  it('withdraws by revoking eligibility and patching disposition', async () => {
    const publication = currentPublication()
    const setEligibility = vi.fn(async () => ({
      kind: 'ineligible' as const,
      offeringId: publication.offeringId,
      bindingId: publication.bindingId,
      eligibilityHash: digest,
      offeringEligibilityHash: digest,
      bindingEligibilityHash: digest,
      transition: {
        offeringBefore: 'active' as const,
        offeringAfter: 'inactive' as const,
        bindingBefore: 'admitted:conformant' as const,
        bindingAfter: 'not_admitted:not_conformant' as const,
      },
    }))
    const patchWithdrawn = vi.fn(async () => {})
    const result = await withdrawCapabilityCommand({
      publication,
      evidenceRefs: context.evidenceRefs,
      now: 10,
    }, emptyPorts({
      ...supplyRows(publication),
      setEligibility,
      patchPublicationWithdrawn: patchWithdrawn,
    }))
    expect(result).toEqual({
      kind: 'withdrawn',
      publicationRef: publication.publicationRef,
      revision: publication.revision,
      lifecycle: { state: 'withdrawn', reasons: ['withdrawn'] },
    })
    expect(setEligibility).toHaveBeenCalledWith(expect.objectContaining({
      offeringId: publication.offeringId,
      bindingId: publication.bindingId,
      decision: 'revoke',
      admissionEvidenceRefs: context.evidenceRefs,
      conformanceEvidenceRefs: context.evidenceRefs,
    }), 10)
    expect(patchWithdrawn).toHaveBeenCalledWith(publication.id, 10)
  })
})
