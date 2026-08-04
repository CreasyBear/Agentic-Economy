import { describe, expect, it } from 'vitest'

import type { CapabilityGraphPorts } from '@/modules/capability-supply/internal/graph'
import { qualifySuppliedCandidate } from '@/modules/capability-supply/server'
import { findAction } from '@/modules/actions'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  attachImportedCommitmentReference,
} from '@/modules/customer-request/application/public'
import {
  compileCustomerRequest,
  writableCustomerRequestV2Aggregate,
  type CustomerRequestImportedCommitmentReference,
  type CustomerRequestV2Aggregate,
} from '@/modules/customer-request/compiler'
import { aggregateIsInternallyConsistent } from '@/modules/customer-request/v2-write'
import {
  createDevelopmentImportedCommitmentStore,
  importCommitmentClaim,
  importedCommitmentValidityAt,
  readImportedCommitmentReference,
  sourceBytesDigest,
  type ImportCommitmentInput,
} from '@/modules/imported-commitment'

const NOW = 1_753_000_000_000
const sourceBytes = Object.freeze([...new TextEncoder().encode(
  'DEVELOPMENT MOCK COMMITMENT — provider has not been admitted or contacted by AE.',
)])

function input(overrides: Partial<ImportCommitmentInput> = {}): ImportCommitmentInput {
  return {
    actor: { principalRef: 'principal:development:one', callerRef: 'agent:development:one' },
    claimRef: 'claim:development:commitment:one',
    issuer: { ref: 'issuer:mock:supplier', name: 'Mock external supplier' },
    observer: { ref: 'observer:development:agent', name: 'Development fixture observer' },
    subject: { kind: 'external_order', ref: 'mock-order:42' },
    commitmentKind: 'seller_order_acknowledgement',
    terms: [
      { name: 'amount', value: '12500', unit: 'AUD minor units' },
      { name: 'delivery_window', value: '2026-08-01/2026-08-03' },
    ],
    source: {
      system: 'development_mock_erp',
      reference: 'mock-erp:order-ack:42',
      digest: sourceBytesDigest(sourceBytes),
    },
    sourceBytes,
    observedAt: NOW,
    assertedAt: NOW - 1_000,
    validity: { kind: 'valid_until', validUntil: NOW + 60_000 },
    evidenceRefs: ['fixture:development:mock-order-ack:42'],
    ...overrides,
  }
}

function aggregate(): CustomerRequestV2Aggregate {
  const compiled = compileCustomerRequest({
    requestId: 'request:development:imported-commitment',
    expectedRevision: 0,
    principalId: 'principal:development:one',
    delegatedAgentId: 'agent:development:one',
    intent: 'Keep this external commitment visible with my broader request.',
    networkId: 'network:development',
    proposal: { kind: 'unsupported_request', reason: 'requested_result_not_available' },
    interpreterId: 'interpreter:development',
    bindings: [],
    models: [],
    mappings: [],
    now: NOW,
  })
  if (compiled.kind !== 'compiled') throw new Error('development aggregate did not compile')
  return compiled.aggregate
}

describe('ADR-009 gate 3 imported commitment attribution', () => {
  it('imports exact source bytes as an attributable unverified claim and replays idempotently', () => {
    const store = createDevelopmentImportedCommitmentStore()
    const first = importCommitmentClaim(input(), store)
    const replay = importCommitmentClaim(input(), store)

    expect(first).toMatchObject({
      kind: 'imported',
      noEffect: true,
      claim: {
        claimRef: 'claim:development:commitment:one',
        principalRef: 'principal:development:one',
        issuer: { ref: 'issuer:mock:supplier' },
        observer: { ref: 'observer:development:agent' },
        verification: 'imported_unverified',
        observationPosture: 'imported_claim_only',
      },
    })
    expect(replay).toMatchObject({ kind: 'replayed', noEffect: true })
    expect(store.snapshot()).toHaveLength(1)
    expect(store.snapshot()[0]?.sourceBytes).toEqual(sourceBytes)
    expect(replay.kind === 'replayed' && first.kind === 'imported'
      ? replay.claim.claimDigest : null).toBe(first.kind === 'imported' ? first.claim.claimDigest : null)
  })

  it('conflicts changed material under the same claim key and refuses tampered source bytes', () => {
    const store = createDevelopmentImportedCommitmentStore()
    expect(importCommitmentClaim(input(), store).kind).toBe('imported')
    expect(importCommitmentClaim(input({
      terms: [{ name: 'amount', value: '99999', unit: 'AUD minor units' }],
    }), store)).toEqual({ kind: 'refused', reason: 'claim_key_conflict' })
    expect(importCommitmentClaim(input({
      sourceBytes: [...sourceBytes, 0],
    }), createDevelopmentImportedCommitmentStore())).toEqual({
      kind: 'refused',
      reason: 'source_digest_mismatch',
    })
  })

  it('refuses cross-principal and tampered source identity reads', () => {
    const store = createDevelopmentImportedCommitmentStore()
    expect(importCommitmentClaim(input(), store).kind).toBe('imported')
    expect(readImportedCommitmentReference(store, {
      actor: { principalRef: 'principal:development:other', callerRef: 'agent:development:other' },
      claimRef: input().claimRef,
      expectedSourceReference: input().source.reference,
      expectedSourceDigest: input().source.digest,
    })).toEqual({ kind: 'refused', reason: 'cross_principal_refused' })
    expect(readImportedCommitmentReference(store, {
      actor: input().actor,
      claimRef: input().claimRef,
      expectedSourceReference: 'mock-erp:order-ack:tampered',
      expectedSourceDigest: input().source.digest,
    })).toEqual({ kind: 'refused', reason: 'source_identity_mismatch' })
  })

  it('makes expired, withdrawn and unknown validity explicit', () => {
    expect(importedCommitmentValidityAt({ kind: 'valid_until', validUntil: NOW - 1 }, NOW))
      .toBe('expired')
    expect(importedCommitmentValidityAt({ kind: 'unknown' }, NOW)).toBe('unknown')
    expect(importedCommitmentValidityAt({ kind: 'valid_until', validUntil: NOW }, NOW))
      .toBe('expired')
    expect(importedCommitmentValidityAt({
      kind: 'withdrawn',
      withdrawnAt: NOW - 1,
      evidenceRefs: ['fixture:withdrawal'],
    }, NOW)).toBe('withdrawn')
  })

  it('refuses asserted or withdrawn events dated after observation', () => {
    expect(importCommitmentClaim(input({
      assertedAt: NOW + 1,
    }), createDevelopmentImportedCommitmentStore())).toEqual({
      kind: 'refused',
      reason: 'invalid_claim',
    })
    expect(importCommitmentClaim(input({
      validity: {
        kind: 'withdrawn',
        withdrawnAt: NOW + 1,
        evidenceRefs: ['fixture:future-withdrawal'],
      },
    }), createDevelopmentImportedCommitmentStore())).toEqual({
      kind: 'refused',
      reason: 'invalid_claim',
    })
  })

  it('cold-reconstructs source custody and attaches reference-only meaning to canonical V2', () => {
    const liveStore = createDevelopmentImportedCommitmentStore()
    expect(importCommitmentClaim(input(), liveStore).kind).toBe('imported')
    const persistedRows = JSON.parse(JSON.stringify(liveStore.snapshot()))
    const coldStore = createDevelopmentImportedCommitmentStore(persistedRows)
    const candidate = aggregate()
    const attached = attachImportedCommitmentReference({
      principalRef: input().actor.principalRef,
      callerRef: input().actor.callerRef,
      claimRef: input().claimRef,
      expectedSourceReference: input().source.reference,
      expectedSourceDigest: input().source.digest,
      referencedAt: NOW + 2_000,
      candidateAggregate: candidate,
    }, { readReference: (readInput) => readImportedCommitmentReference(coldStore, readInput) })

    expect(attached).toMatchObject({
      kind: 'attached',
      noEffect: true,
      authority: 'none',
      providerAdmission: 'not_established',
      reference: {
        role: 'imported_commitment_claim',
        verification: 'imported_unverified',
        observationPosture: 'imported_claim_only',
        issuerRef: 'issuer:mock:supplier',
      },
    })
    if (attached.kind !== 'attached') throw new Error('development attachment refused')
    expect('terms' in attached.reference).toBe(false)
    expect('sourceBytes' in attached.reference).toBe(false)
    expect('invocationRef' in attached.reference).toBe(false)
    expect(aggregateIsInternallyConsistent(
      JSON.parse(JSON.stringify(writableCustomerRequestV2Aggregate(attached.aggregate))),
      0,
    )).toBe(true)
    const replay = attachImportedCommitmentReference({
      principalRef: input().actor.principalRef,
      callerRef: input().actor.callerRef,
      claimRef: input().claimRef,
      expectedSourceReference: input().source.reference,
      expectedSourceDigest: input().source.digest,
      referencedAt: NOW + 3_000,
      candidateAggregate: attached.aggregate,
    }, { readReference: (readInput) => readImportedCommitmentReference(coldStore, readInput) })
    expect(replay.kind).toBe('replayed')
    expect(replay.kind === 'replayed' ? replay.aggregate.aggregateDigest : null)
      .toBe(attached.aggregate.aggregateDigest)
  })

  it('refuses replay when any source-owned reference semantic was tampered', () => {
    const store = createDevelopmentImportedCommitmentStore()
    expect(importCommitmentClaim(input(), store).kind).toBe('imported')
    const attached = attachImportedCommitmentReference({
      principalRef: input().actor.principalRef,
      callerRef: input().actor.callerRef,
      claimRef: input().claimRef,
      expectedSourceReference: input().source.reference,
      expectedSourceDigest: input().source.digest,
      referencedAt: NOW + 2_000,
      candidateAggregate: aggregate(),
    }, { readReference: (readInput) => readImportedCommitmentReference(store, readInput) })
    if (attached.kind !== 'attached') throw new Error('development attachment refused')
    const original = attached.reference
    const { assertedAt: _missingAssertedAt, ...withoutAssertedAt } = original
    const tampered: readonly CustomerRequestImportedCommitmentReference[] = [
      { ...original, issuerRef: 'issuer:tampered' },
      { ...original, observerRef: 'observer:tampered' },
      { ...original, source: { ...original.source, system: 'tampered_system' } },
      { ...original, validity: { kind: 'unknown' } },
      { ...original, evidenceRefs: [] },
      withoutAssertedAt,
    ]
    for (const reference of tampered) {
      const replay = attachImportedCommitmentReference({
        principalRef: input().actor.principalRef,
        callerRef: input().actor.callerRef,
        claimRef: input().claimRef,
        expectedSourceReference: input().source.reference,
        expectedSourceDigest: input().source.digest,
        referencedAt: NOW + 3_000,
        candidateAggregate: {
          ...attached.aggregate,
          importedCommitmentReferences: [reference],
        },
      }, { readReference: (readInput) => readImportedCommitmentReference(store, readInput) })
      expect(replay).toEqual({ kind: 'refused', reason: 'reference_integrity_failure' })
    }
  })

  it('preserves historical Request replay without manufacturing the new field', () => {
    const historical = aggregate()
    const replayed = JSON.parse(JSON.stringify(writableCustomerRequestV2Aggregate(historical)))
    expect(replayed.importedCommitmentReferences).toBeUndefined()
    expect(aggregateIsInternallyConsistent(replayed, 0)).toBe(true)
  })

  it('cannot qualify an imported commitment as P1-H supply without admitted provider evidence', async () => {
    const result = await qualifySuppliedCandidate({
      loadPublicationAtRevision: async () => null,
    } as unknown as CapabilityGraphPorts, {
      candidate: {
        publicationRef: input().claimRef,
        revision: 1,
        businessId: input().issuer.ref,
        offeringId: input().subject.ref,
        bindingId: input().source.reference,
        contractRef: {
          capabilityId: 'external_commitment_is_not_a_capability_contract',
          version: 1,
          contractDigest: canonicalDigest({ fixture: 'not-admitted' }),
        },
      },
      now: NOW,
    })
    expect(result).toMatchObject({
      kind: 'supplied_candidate_qualification',
      status: 'blocked',
      reasons: ['publication_missing'],
    })
    expect(findAction('imported-commitment.observe')).toBeUndefined()
  })
})
