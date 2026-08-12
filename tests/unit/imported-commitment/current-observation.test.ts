import { describe, expect, it } from 'vitest'

import type {
  SuppliedCandidateQualification,
  SuppliedCandidateRef,
} from '@/modules/capability-supply/server'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  createDevelopmentImportedCommitmentStore,
  importCommitmentClaim,
  observeImportedCommitmentAsCurrent,
  sourceBytesDigest,
  type ImportedCommitmentObservationPort,
  type ImportedCommitmentProviderObservation,
} from '@/modules/imported-commitment'

const NOW = 1_753_000_000_000
const bytes = [...new TextEncoder().encode('MOCK/DEVELOPMENT ONLY provider commitment observation')]
const contractRef = {
  capabilityId: 'commitment.observe.development',
  version: 1,
  contractDigest: canonicalDigest({ contract: 'MOCK/DEVELOPMENT ONLY' }),
}
const provider: SuppliedCandidateRef = {
  publicationRef: 'publication:mock:provider',
  revision: 2,
  networkId: 'network:development',
  businessId: 'business:mock:provider',
  offeringId: 'offering:mock:observation',
  bindingId: 'binding:mock:admitted-adapter',
  contractRef,
}

function importedClaim() {
  const store = createDevelopmentImportedCommitmentStore()
  const imported = importCommitmentClaim({
    actor: { principalRef: 'principal:development', callerRef: 'caller:development' },
    claimRef: 'claim:development:one',
    issuer: { ref: provider.businessId },
    observer: { ref: 'caller:development' },
    subject: { kind: 'external_order', ref: 'order:mock:42' },
    commitmentKind: 'seller_order_acknowledgement',
    terms: [{ name: 'status', value: 'acknowledged' }],
    source: {
      system: 'mock_provider_adapter',
      reference: 'mock-provider:order:42',
      digest: sourceBytesDigest(bytes),
    },
    sourceBytes: bytes,
    observedAt: NOW - 1_000,
    validity: { kind: 'valid_until', validUntil: NOW + 60_000 },
    evidenceRefs: ['fixture:caller-supplied-claim'],
  }, store)
  if (imported.kind === 'refused') throw new Error('development claim refused')
  return imported.claim
}

function qualification(overrides: Partial<SuppliedCandidateQualification> = {}): SuppliedCandidateQualification {
  const material = {
    candidate: provider,
    observedAt: NOW,
    validUntil: NOW + 30_000,
    reasons: [] as const,
    sources: ([
      ['publication', `${provider.publicationRef}@${provider.revision}`],
      ['business', provider.businessId],
      ['contract', provider.contractRef.capabilityId],
      ['offering', provider.offeringId],
      ['binding', provider.bindingId],
      ['readiness', provider.publicationRef],
    ] as const).map(([kind, ref]) => ({
      kind,
      ref,
      digest: canonicalDigest({ kind, ref, state: 'MOCK/DEVELOPMENT ONLY admitted and current' }),
      evidenceRefs: [`fixture:${kind}`],
    })),
  }
  return {
    kind: 'supplied_candidate_qualification',
    environment: 'SOURCE-OWNED DEVELOPMENT EVIDENCE',
    status: 'eligible',
    ...material,
    qualificationDigest: canonicalDigest(material),
    ...overrides,
  }
}

function adapterObservation(claim = importedClaim()): ImportedCommitmentProviderObservation {
  const material = {
    observationRef: 'observation:mock:provider:42',
    claimRef: claim.claimRef,
    claimDigest: claim.claimDigest,
    providerBusinessId: provider.businessId,
    publicationRef: provider.publicationRef,
    publicationRevision: provider.revision,
    contractRef,
    source: claim.source,
    observedAt: NOW,
    validUntil: NOW + 20_000,
    evidenceRefs: ['fixture:admitted-adapter-response'],
  }
  return { ...material, evidenceDigest: canonicalDigest(material) }
}

function ports(overrides: Partial<ImportedCommitmentObservationPort> = {}): ImportedCommitmentObservationPort {
  return {
    qualifyProvider: async () => qualification(),
    observeThroughAdmittedAdapter: async (input) => adapterObservation({
      ...importedClaim(),
      claimRef: input.claimRef,
      claimDigest: input.claimDigest,
      source: input.source,
    }),
    ...overrides,
  }
}

describe('ADR-009 gate 3 current imported observation boundary', () => {
  it('creates a MOCK/DEVELOPMENT ONLY current observation from fresh exact admitted-adapter evidence', async () => {
    const claim = importedClaim()
    const result = await observeImportedCommitmentAsCurrent({ claim, provider, now: NOW }, ports({
      observeThroughAdmittedAdapter: async () => adapterObservation(claim),
    }))

    expect(result).toMatchObject({
      kind: 'observed',
      noEffect: true,
      observation: {
        kind: 'current_ae_observation',
        claimRef: claim.claimRef,
        claimDigest: claim.claimDigest,
        providerBusinessId: provider.businessId,
        publicationRef: provider.publicationRef,
        publicationRevision: provider.revision,
        contractRef,
        source: claim.source,
        providerAdmission: 'admitted',
        authority: 'none',
        effect: 'none',
      },
    })
    expect(claim).toMatchObject({
      verification: 'imported_unverified',
      observationPosture: 'imported_claim_only',
    })
    expect('attemptRef' in (result.kind === 'observed' ? result.observation : {})).toBe(false)
    expect('invocationRef' in (result.kind === 'observed' ? result.observation : {})).toBe(false)
  })

  it.each([
    ['unadmitted', ports({ qualifyProvider: async () => qualification({
      status: 'blocked',
      reasons: ['binding_not_admitted'],
      qualificationDigest: canonicalDigest({
        candidate: provider,
        observedAt: NOW,
        validUntil: NOW + 30_000,
        reasons: ['binding_not_admitted'],
        sources: qualification().sources,
      }),
    }) }), 'provider_not_admitted'],
    ['provider-mismatched qualification', ports({ qualifyProvider: async () => {
      const mismatchedCandidate = { ...provider, bindingId: 'binding:mock:other' }
      const qualified = qualification()
      const material = {
        candidate: mismatchedCandidate,
        observedAt: qualified.observedAt,
        validUntil: qualified.validUntil ?? null,
        reasons: qualified.reasons,
        sources: qualified.sources,
      }
      return {
        ...qualified,
        candidate: mismatchedCandidate,
        qualificationDigest: canonicalDigest(material),
      }
    } }), 'provider_not_admitted'],
    ['stale', ports({ observeThroughAdmittedAdapter: async () => {
      const observed = adapterObservation()
      const material = { ...observed, observedAt: NOW - 1, validUntil: NOW }
      const { evidenceDigest: _digest, ...withoutDigest } = material
      return { ...withoutDigest, evidenceDigest: canonicalDigest(withoutDigest) }
    } }), 'provider_evidence_stale'],
    ['mismatched', ports({ observeThroughAdmittedAdapter: async () => {
      const observed = adapterObservation()
      const material = { ...observed, claimRef: 'claim:other' }
      const { evidenceDigest: _digest, ...withoutDigest } = material
      return { ...withoutDigest, evidenceDigest: canonicalDigest(withoutDigest) }
    } }), 'provider_evidence_mismatch'],
    ['tampered', ports({ observeThroughAdmittedAdapter: async () => ({
      ...adapterObservation(),
      evidenceDigest: canonicalDigest({ tampered: true }),
    }) }), 'provider_evidence_invalid'],
  ] as const)('keeps %s provider evidence claim-only', async (_case, port, reason) => {
    const result = await observeImportedCommitmentAsCurrent({
      claim: importedClaim(),
      provider,
      now: NOW,
    }, port)
    expect(result).toEqual({ kind: 'refused', reason })
  })

  it('keeps expired and merely caller-supplied evidence claim-only without invoking the adapter', async () => {
    const claim = importedClaim()
    let called = false
    const result = await observeImportedCommitmentAsCurrent({
      claim,
      provider,
      now: NOW + 60_000,
    }, ports({
      observeThroughAdmittedAdapter: async () => {
        called = true
        return adapterObservation(claim)
      },
    }))
    expect(result).toEqual({ kind: 'refused', reason: 'claim_not_current' })
    expect(called).toBe(false)
    expect(claim.evidenceRefs).toEqual(['fixture:caller-supplied-claim'])
  })
})
