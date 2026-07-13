import { describe, expect, it } from 'vitest'

import {
  createInMemoryStructuredQuotePreparationStore,
  createPreparationCandidateSet,
  createQuotePreparationCommand,
  createProviderOffer,
} from '@/modules/routing-kernel/structured-quote-preparation-store'

const candidate = {
  bindingId: 'binding:carrier-a', nodeId: 'node:carrier-a', businessId: 'business:carrier-a',
  recipientName: 'Carrier A', presentationEvidenceDigest: 'sha256:presentation-a',
  capabilityContractId: 'shipping.quote', capabilityContractVersion: '2',
  registrationEnvironment: 'production', registrationHash: 'sha256:registration-a',
  registrationEvidenceDigest: 'sha256:registration-evidence-a', incidentEpochDigest: 'sha256:incident-epoch-a',
  incidentEvidenceDigest: 'sha256:incident-evidence-a',
} as const

function candidateSetFixture() {
  return createPreparationCandidateSet({
    preparationRequestId: 'preparation:1', customerRequestId: 'request:1', planRevisionId: 'plan:2',
    actionId: 'action:quote-shipping', generation: 3, capabilityContractId: 'shipping.quote',
    capabilityContractVersion: '2', createdAt: 1_000, candidates: [candidate],
  })
}

function commandFixture() {
  return createQuotePreparationCommand({
    quoteAttemptId: 'attempt:1', preparationRequestId: 'preparation:1', candidateSetDigest: candidateSetFixture().candidateSetDigest,
    recipient: { bindingId: candidate.bindingId, nodeId: candidate.nodeId, businessId: candidate.businessId },
    purpose: 'compare_shipping_options', fieldNames: ['destination.postcode', 'parcel.weightGrams'],
    capabilityContractId: 'shipping.quote', capabilityContractVersion: '2', allocationId: 'allocation:1', claimedAt: 1_010,
    registrationHash: candidate.registrationHash, registrationEnvironment: candidate.registrationEnvironment,
    registrationEvidenceDigest: candidate.registrationEvidenceDigest,
  })
}

describe('structured quote preparation store', () => {
  it('binds exploratory preparation to an exact Request evaluation without Plan identifiers', () => {
    const set = createPreparationCandidateSet({
      preparationRequestId: 'preparation:evaluation:1', customerRequestId: 'request:1',
      source: {
        kind: 'request_evaluation', evaluationId: 'evaluation:1',
        evaluationDigest: 'sha256:evaluation-1',
      },
      generation: 1, capabilityContractId: 'shipping.quote', capabilityContractVersion: '2',
      createdAt: 1_000, candidates: [candidate],
    })

    expect(set.source).toEqual({
      kind: 'request_evaluation', evaluationId: 'evaluation:1', evaluationDigest: 'sha256:evaluation-1',
    })
    expect(set).not.toHaveProperty('planRevisionId')
    expect(set).not.toHaveProperty('actionId')
  })

  it('persists an exact evidence-bound candidate set and rejects identity reuse with different evidence', async () => {
    const store = createInMemoryStructuredQuotePreparationStore()
    const set = candidateSetFixture()

    expect(await store.putCandidateSet(set)).toEqual({ kind: 'stored', candidateSet: set })
    expect(await store.putCandidateSet(set)).toEqual({ kind: 'existing', candidateSet: set })
    expect(await store.getCandidateSet('preparation:1')).toEqual(set)

    const { candidateSetDigest: _digest, ...setInput } = set
    const changed = createPreparationCandidateSet({ ...setInput, candidates: [{ ...candidate, incidentEpochDigest: 'sha256:new-epoch' }] })
    expect(await store.putCandidateSet(changed)).toEqual({ kind: 'conflict', existing: set })
  })

  it('claims the exact value-redacted provider command before dispatch and detects replay conflicts', async () => {
    const store = createInMemoryStructuredQuotePreparationStore()
    const set = candidateSetFixture()
    await store.putCandidateSet(set)
    const command = commandFixture()

    const claimed = await store.claimQuoteAttempt(command)
    expect(claimed.kind).toBe('claimed')
    if (claimed.kind !== 'claimed') throw new Error('expected claim')
    expect(claimed.attempt.disposition).toBe('allocated')
    expect(await store.claimQuoteAttempt(command)).toEqual({ kind: 'existing', attempt: claimed.attempt })
    const { commandDigest: _digest, ...commandInput } = command
    expect(await store.claimQuoteAttempt(createQuotePreparationCommand({ ...commandInput, purpose: 'purchase_shipping' })))
      .toEqual({ kind: 'conflict', existing: claimed.attempt })
  })

  it('records dispatch then one immutable issuer-bound offer and replays it exactly', async () => {
    const store = createInMemoryStructuredQuotePreparationStore()
    await store.putCandidateSet(candidateSetFixture())
    const command = commandFixture()
    await store.claimQuoteAttempt(command)
    expect((await store.markDispatched({ quoteAttemptId: command.quoteAttemptId, commandDigest: command.commandDigest, dispatchedAt: 1_020 })).kind).toBe('updated')

    const offer = createProviderOffer({
      providerOfferId: 'provider-offer:1', quoteAttemptId: command.quoteAttemptId, commandDigest: command.commandDigest,
      candidateSetDigest: command.candidateSetDigest, issuerBindingId: candidate.bindingId, issuerNodeId: candidate.nodeId,
      issuerBusinessId: candidate.businessId, capabilityContractId: command.capabilityContractId,
      capabilityContractVersion: command.capabilityContractVersion, providerOfferRef: 'carrier-a:quote:7',
      expectedCost: { currency: 'AUD', amountMinor: 2_450 }, maximumCost: { currency: 'AUD', amountMinor: 2_600 },
      expectedLatencyMs: 800, executionDataFields: [], materialTerms: ['Tracked service'], termsDigest: 'sha256:terms-a',
      offerOutputs: [], priceComponents: [{ label: 'Service', amountMinor: 2_450 }],
      cancellation: { kind: 'conditional', summary: 'Cancellation terms are bound to this offer.' }, offerOutputsDigest: 'sha256:outputs-a',
      cancellationTermsDigest: 'sha256:cancellation-a', providerEvidenceDigest: 'sha256:provider-evidence-a',
      issuedAt: 1_030, expiresAt: 61_030,
    })
    expect((await store.resolveQuoteAttempt({ quoteAttemptId: command.quoteAttemptId, commandDigest: command.commandDigest, disposition: 'quoted', resolvedAt: 1_030, offer })).kind).toBe('updated')
    const attempt = await store.getQuoteAttempt('attempt:1')
    expect(attempt?.disposition).toBe('quoted')
    if (attempt?.disposition !== 'quoted') throw new Error('expected quoted attempt')
    expect(attempt.offer).toEqual(offer)
    expect(await store.getProviderOffer('provider-offer:1')).toEqual(offer)
    expect((await store.resolveQuoteAttempt({ quoteAttemptId: command.quoteAttemptId, commandDigest: command.commandDigest, disposition: 'quoted', resolvedAt: 1_030, offer })).kind).toBe('existing')
  })

  it('qualifies uncertainty with a later provider refusal while preserving uncertainty evidence', async () => {
    const store = createInMemoryStructuredQuotePreparationStore()
    await store.putCandidateSet(candidateSetFixture())
    const command = commandFixture()
    await store.claimQuoteAttempt(command)
    await store.markDispatched({ quoteAttemptId: command.quoteAttemptId, commandDigest: command.commandDigest, dispatchedAt: 1_020 })
    expect((await store.resolveQuoteAttempt({ quoteAttemptId: command.quoteAttemptId, commandDigest: command.commandDigest, disposition: 'uncertain', resolvedAt: 1_030, reasonCode: 'provider_timeout' })).kind).toBe('updated')
    expect((await store.resolveQuoteAttempt({ quoteAttemptId: command.quoteAttemptId, commandDigest: command.commandDigest, disposition: 'refused', resolvedAt: 1_040, reasonCode: 'late_response' })).kind).toBe('updated')
    expect(await store.getQuoteAttempt(command.quoteAttemptId)).toMatchObject({
      disposition: 'refused', uncertainAt: 1_030, reasonCode: 'late_response',
    })
  })

  it('records a pre-dispatch refusal as an exact terminal result', async () => {
    const store = createInMemoryStructuredQuotePreparationStore()
    await store.putCandidateSet(candidateSetFixture())
    const command = commandFixture()
    await store.claimQuoteAttempt(command)
    const refusal = { quoteAttemptId: command.quoteAttemptId, commandDigest: command.commandDigest, disposition: 'refused' as const, resolvedAt: 1_015, reasonCode: 'provider_not_available' }
    expect((await store.resolveQuoteAttempt(refusal)).kind).toBe('updated')
    expect((await store.getQuoteAttempt(command.quoteAttemptId))?.disposition).toBe('refused')
    expect((await store.resolveQuoteAttempt(refusal)).kind).toBe('existing')
  })

  it('keeps candidate coverage monotonic when equal-timestamp writes race', async () => {
    const store = createInMemoryStructuredQuotePreparationStore()
    const set = candidateSetFixture()
    await store.putCandidateSet(set)
    const base = {
      candidateSetDigest: set.candidateSetDigest, bindingId: set.candidates[0]!.bindingId,
      nodeId: set.candidates[0]!.nodeId, recordedAt: 1_100,
    }
    await store.recordCandidateCoverage({
      ...base, disposition: 'option_received', protectedData: 'released', providerContact: 'attempted', reasonCode: 'quoted',
    })
    await store.recordCandidateCoverage({
      ...base, disposition: 'uncertain', protectedData: 'uncertain', providerContact: 'attempted', reasonCode: 'timeout',
    })
    expect(await store.listCandidateCoverage(set.candidateSetDigest)).toEqual([
      expect.objectContaining({ disposition: 'option_received', protectedData: 'released', reasonCode: 'quoted' }),
    ])
    expect(() => store.recordCandidateCoverage({
      ...base, disposition: 'allocated', protectedData: 'released', providerContact: 'attempted', reasonCode: 'invalid',
    })).toThrow('preparation_candidate_coverage_invalid')
  })

  it('rejects unexpected value-bearing input instead of persisting it', () => {
    expect(() => createQuotePreparationCommand({ ...commandFixture(), protectedValues: { postcode: '6000' } } as never))
      .toThrow('quote_preparation_command_unexpected_field:protectedValues')
    expect(() => createPreparationCandidateSet({ ...candidateSetFixture(), customerData: 'secret' } as never))
      .toThrow('preparation_candidate_set_unexpected_field:customerData')
    expect(() => createQuotePreparationCommand({ ...commandFixture(), fieldNames: ['destination.postcode', { value: '6000' }] } as never))
      .toThrow('quote_preparation_command_field_name_invalid')
    const { candidateSetDigest: _digest, ...set } = candidateSetFixture()
    expect(() => createPreparationCandidateSet({
      ...set,
      candidates: [{
        ...candidate,
        commercialRelationship: {
          kind: 'commission', summary: 'A fee may be paid.', influencesEligibility: false,
          influencesInclusion: false, influencesOrder: false, evidenceRefs: ['registration:commercial'],
        },
      }],
    } as never)).toThrow('preparation_candidate_commercial_relationship_invalid')
  })

  it('resolves only a current exact issuer-bound offer affinity', async () => {
    const store = createInMemoryStructuredQuotePreparationStore()
    const set = candidateSetFixture()
    await store.putCandidateSet(set)
    const command = commandFixture()
    await store.claimQuoteAttempt(command)
    await store.markDispatched({ quoteAttemptId: command.quoteAttemptId, commandDigest: command.commandDigest, dispatchedAt: 1_020 })
    const offer = createProviderOffer({
      providerOfferId: 'provider-offer:affinity', quoteAttemptId: command.quoteAttemptId, commandDigest: command.commandDigest,
      candidateSetDigest: command.candidateSetDigest, issuerBindingId: candidate.bindingId, issuerNodeId: candidate.nodeId,
      issuerBusinessId: candidate.businessId, capabilityContractId: command.capabilityContractId,
      capabilityContractVersion: command.capabilityContractVersion, providerOfferRef: 'carrier-a:quote:affinity',
      expectedCost: { currency: 'AUD', amountMinor: 2_450 }, maximumCost: { currency: 'AUD', amountMinor: 2_600 },
      expectedLatencyMs: 800, executionDataFields: [], materialTerms: ['Tracked service'],
      offerOutputs: [], priceComponents: [{ label: 'Service', amountMinor: 2_450 }],
      cancellation: { kind: 'conditional', summary: 'Cancellation terms are bound to this offer.' }, offerOutputsDigest: 'sha256:outputs-a',
      termsDigest: 'sha256:terms-a', cancellationTermsDigest: 'sha256:cancellation-a',
      providerEvidenceDigest: 'sha256:evidence-a', issuedAt: 1_030, expiresAt: 2_000,
    })
    await store.resolveQuoteAttempt({ quoteAttemptId: command.quoteAttemptId, commandDigest: command.commandDigest, disposition: 'quoted', resolvedAt: 1_030, offer })
    const affinity = {
      providerOfferId: offer.providerOfferId, candidateSetDigest: set.candidateSetDigest,
      customerRequestId: set.customerRequestId, planRevisionId: set.planRevisionId, sourceActionId: set.actionId,
      expectedBindingId: candidate.bindingId, capabilityContractId: candidate.capabilityContractId,
      capabilityContractVersion: candidate.capabilityContractVersion, now: 1_100,
    }
    expect(await store.resolveProviderOfferAffinity(affinity)).toEqual({ kind: 'matched', offer })
    expect(await store.resolveProviderOfferAffinity({ ...affinity, providerOfferId: 'forged' })).toEqual({ kind: 'refused', reason: 'not_found' })
    expect(await store.resolveProviderOfferAffinity({ ...affinity, candidateSetDigest: 'sha256:copied' })).toEqual({ kind: 'refused', reason: 'foreign' })
    expect(await store.resolveProviderOfferAffinity({ ...affinity, now: 2_000 })).toEqual({ kind: 'refused', reason: 'expired' })
    expect(await store.resolveProviderOfferAffinity({ ...affinity, expectedBindingId: 'binding:substituted' })).toEqual({ kind: 'refused', reason: 'issuer_mismatch' })
    expect(await store.resolveProviderOfferAffinity({ ...affinity, customerRequestId: 'request:copied' })).toEqual({ kind: 'refused', reason: 'lineage_mismatch' })
    expect(await store.resolveProviderOfferAffinity({ ...affinity, capabilityContractVersion: '3' })).toEqual({ kind: 'refused', reason: 'contract_mismatch' })

    const { candidateSetDigest: _digest, ...latest } = set
    await store.putCandidateSet(createPreparationCandidateSet({ ...latest, preparationRequestId: 'preparation:2', generation: 4 }))
    expect(await store.resolveProviderOfferAffinity(affinity)).toEqual({ kind: 'refused', reason: 'stale' })
  })
})
