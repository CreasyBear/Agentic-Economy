// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import {
  createPreparationCandidateSet,
  createProviderOffer,
  createQuotePreparationCommand,
  type ProviderOfferAffinityInput,
} from '@/modules/routing-kernel/structured-quote-preparation-store'

import { internal } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')
const boundCandidate = {
  bindingId: 'binding:carrier-a', nodeId: 'node:carrier-a', businessId: 'business:carrier-a',
  recipientName: 'Carrier A', presentationEvidenceDigest: 'sha256:presentation-a',
  commercialRelationship: {
    kind: 'none', summary: 'No registered commercial relationship.',
    influencesEligibility: false, influencesInclusion: false, influencesOrder: false,
    evidenceRefs: ['registration:carrier-a:commercial'],
  },
  capabilityContractId: 'shipping.quote', capabilityContractVersion: '2', registrationEnvironment: 'production',
  registrationHash: 'sha256:registration-a', registrationEvidenceDigest: 'sha256:registration-evidence-a',
  incidentEpochDigest: 'sha256:incident-epoch-a', incidentEvidenceDigest: 'sha256:incident-evidence-a',
} as const

describe('durable structured quote preparation', () => {
  it('atomically stores one candidate set and replays an exact concurrent claim without protected values', async () => {
    const t = convexTest(schema, modules)
    const set = candidateSet()
    const stored = await Promise.all([
      t.mutation(internal.routingKernelStructuredPreparation.putCandidateSet, { candidateSet: writableSet(set) }),
      t.mutation(internal.routingKernelStructuredPreparation.putCandidateSet, { candidateSet: writableSet(set) }),
    ])
    expect(stored.map((result) => result.kind).sort()).toEqual(['existing', 'stored'])

    const exactCommand = command(set)
    const claims = await Promise.all([
      t.mutation(internal.routingKernelStructuredPreparation.claimQuoteAttempt, { command: writableCommand(exactCommand) }),
      t.mutation(internal.routingKernelStructuredPreparation.claimQuoteAttempt, { command: writableCommand(exactCommand) }),
    ])
    expect(claims.map((result) => result.kind).sort()).toEqual(['claimed', 'existing'])
    const rows = await t.run(async (ctx) => ({
      sets: await ctx.db.query('routingKernelPreparationCandidateSets').collect(),
      candidates: await ctx.db.query('routingKernelPreparationCandidates').collect(),
      attempts: await ctx.db.query('routingKernelPreparationQuoteAttempts').collect(),
      fields: await ctx.db.query('routingKernelPreparationQuoteAttemptFields').collect(),
    }))
    expect(rows.sets).toHaveLength(1)
    expect(rows.candidates).toHaveLength(1)
    expect(rows.attempts).toHaveLength(1)
    expect(rows.fields.map((field) => field.fieldName)).toEqual(['destination.postcode', 'parcel.weightGrams'])
    expect(JSON.stringify(rows)).not.toMatch(/6000|protectedValues|customerData|resolvedInput|projectionValue/)
    expect((await t.mutation(internal.routingKernelStructuredPreparation.resolveQuoteAttempt, {
      resolution: {
        quoteAttemptId: exactCommand.quoteAttemptId, commandDigest: exactCommand.commandDigest,
        disposition: 'uncertain', resolvedAt: 1_015, reasonCode: 'not_dispatched',
      },
    })).kind).toBe('invalid_transition')
    expect((await t.query(internal.routingKernelStructuredPreparation.getQuoteAttempt, {
      quoteAttemptId: exactCommand.quoteAttemptId,
    }))?.disposition).toBe('allocated')
  })

  it('qualifies uncertainty with a later provider refusal while preserving uncertainty evidence', async () => {
    const t = convexTest(schema, modules)
    const set = candidateSet()
    await t.mutation(internal.routingKernelStructuredPreparation.putCandidateSet, { candidateSet: writableSet(set) })
    const exactCommand = command(set)
    await t.mutation(internal.routingKernelStructuredPreparation.claimQuoteAttempt, { command: writableCommand(exactCommand) })
    await t.mutation(internal.routingKernelStructuredPreparation.markDispatched, {
      quoteAttemptId: exactCommand.quoteAttemptId, commandDigest: exactCommand.commandDigest, dispatchedAt: 1_020,
    })
    const uncertain = { quoteAttemptId: exactCommand.quoteAttemptId, commandDigest: exactCommand.commandDigest, disposition: 'uncertain' as const, resolvedAt: 1_030, reasonCode: 'provider_timeout' }
    expect((await t.mutation(internal.routingKernelStructuredPreparation.resolveQuoteAttempt, { resolution: uncertain })).kind).toBe('updated')
    expect((await t.mutation(internal.routingKernelStructuredPreparation.resolveQuoteAttempt, { resolution: uncertain })).kind).toBe('existing')
    expect((await t.mutation(internal.routingKernelStructuredPreparation.resolveQuoteAttempt, {
      resolution: { ...uncertain, disposition: 'refused', resolvedAt: 1_040, reasonCode: 'late_refusal' },
    })).kind).toBe('updated')
    expect(await t.query(internal.routingKernelStructuredPreparation.getQuoteAttempt, { quoteAttemptId: exactCommand.quoteAttemptId })).toMatchObject({
      disposition: 'refused', uncertainAt: 1_030, reasonCode: 'late_refusal',
    })
  })

  it('qualifies uncertainty with the exact durable offer without a second attempt', async () => {
    const t = convexTest(schema, modules)
    const set = candidateSet()
    await t.mutation(internal.routingKernelStructuredPreparation.putCandidateSet, { candidateSet: writableSet(set) })
    const exactCommand = command(set)
    await t.mutation(internal.routingKernelStructuredPreparation.claimQuoteAttempt, { command: writableCommand(exactCommand) })
    await t.mutation(internal.routingKernelStructuredPreparation.markDispatched, {
      quoteAttemptId: exactCommand.quoteAttemptId, commandDigest: exactCommand.commandDigest, dispatchedAt: 1_020,
    })
    await t.mutation(internal.routingKernelStructuredPreparation.resolveQuoteAttempt, { resolution: {
      quoteAttemptId: exactCommand.quoteAttemptId, commandDigest: exactCommand.commandDigest,
      disposition: 'uncertain', resolvedAt: 1_030, reasonCode: 'provider_timeout',
    } })
    const exactOffer = providerOffer(exactCommand)
    const result = await t.mutation(internal.routingKernelStructuredPreparation.resolveQuoteAttempt, { resolution: {
      quoteAttemptId: exactCommand.quoteAttemptId, commandDigest: exactCommand.commandDigest,
      disposition: 'quoted', resolvedAt: 1_040, offer: writableOffer(exactOffer),
    } })
    expect(result).toMatchObject({ kind: 'updated', attempt: { disposition: 'quoted', uncertainAt: 1_030 } })
    expect(await t.query(internal.routingKernelStructuredPreparation.getProviderOffer, {
      providerOfferId: exactOffer.providerOfferId,
    })).toEqual(exactOffer)
  })

  it('matches exact offer affinity and refuses forged, copied, expired, stale, substituted, lineage, and contract refs', async () => {
    const t = convexTest(schema, modules)
    const set = candidateSet()
    await t.mutation(internal.routingKernelStructuredPreparation.putCandidateSet, { candidateSet: writableSet(set) })
    const exactCommand = command(set)
    await t.mutation(internal.routingKernelStructuredPreparation.claimQuoteAttempt, { command: writableCommand(exactCommand) })
    await t.mutation(internal.routingKernelStructuredPreparation.markDispatched, {
      quoteAttemptId: exactCommand.quoteAttemptId, commandDigest: exactCommand.commandDigest, dispatchedAt: 1_020,
    })
    const exactOffer = providerOffer(exactCommand)
    await t.mutation(internal.routingKernelStructuredPreparation.resolveQuoteAttempt, {
      resolution: { quoteAttemptId: exactCommand.quoteAttemptId, commandDigest: exactCommand.commandDigest, disposition: 'quoted', resolvedAt: 1_030, offer: writableOffer(exactOffer) },
    })
    const affinity: ProviderOfferAffinityInput = {
      providerOfferId: exactOffer.providerOfferId, candidateSetDigest: set.candidateSetDigest,
      customerRequestId: set.customerRequestId, planRevisionId: set.planRevisionId, sourceActionId: set.actionId,
      expectedBindingId: boundCandidate.bindingId, capabilityContractId: boundCandidate.capabilityContractId,
      capabilityContractVersion: boundCandidate.capabilityContractVersion, now: 1_100,
    }
    const resolve = async (input: ProviderOfferAffinityInput) => await t.query(
      internal.routingKernelStructuredPreparation.resolveProviderOfferAffinity, { input },
    )
    expect(await resolve(affinity)).toEqual({ kind: 'matched', offer: exactOffer })
    expect(await resolve({ ...affinity, providerOfferId: 'forged' })).toEqual({ kind: 'refused', reason: 'not_found' })
    expect(await resolve({ ...affinity, candidateSetDigest: 'sha256:copied' })).toEqual({ kind: 'refused', reason: 'foreign' })
    expect(await resolve({ ...affinity, now: 2_000 })).toEqual({ kind: 'refused', reason: 'expired' })
    expect(await resolve({ ...affinity, expectedBindingId: 'binding:substituted' })).toEqual({ kind: 'refused', reason: 'issuer_mismatch' })
    expect(await resolve({ ...affinity, customerRequestId: 'request:copied' })).toEqual({ kind: 'refused', reason: 'lineage_mismatch' })
    expect(await resolve({ ...affinity, capabilityContractVersion: '3' })).toEqual({ kind: 'refused', reason: 'contract_mismatch' })

    const { candidateSetDigest: _digest, ...latest } = set
    const next = createPreparationCandidateSet({ ...latest, preparationRequestId: 'preparation:2', generation: 4 })
    await t.mutation(internal.routingKernelStructuredPreparation.putCandidateSet, { candidateSet: writableSet(next) })
    expect(await resolve(affinity)).toEqual({ kind: 'refused', reason: 'stale' })
  })
})

function candidateSet() {
  return createPreparationCandidateSet({
    preparationRequestId: 'preparation:1', customerRequestId: 'request:1', planRevisionId: 'plan:2', actionId: 'action:quote-shipping',
    generation: 3, capabilityContractId: 'shipping.quote', capabilityContractVersion: '2', createdAt: 1_000, candidates: [boundCandidate],
  })
}

function command(set: ReturnType<typeof candidateSet>) {
  return createQuotePreparationCommand({
    quoteAttemptId: 'attempt:1', preparationRequestId: set.preparationRequestId, candidateSetDigest: set.candidateSetDigest,
    recipient: { bindingId: boundCandidate.bindingId, nodeId: boundCandidate.nodeId, businessId: boundCandidate.businessId },
    purpose: 'compare_shipping_options', fieldNames: ['destination.postcode', 'parcel.weightGrams'],
    capabilityContractId: boundCandidate.capabilityContractId, capabilityContractVersion: boundCandidate.capabilityContractVersion,
    registrationHash: boundCandidate.registrationHash, registrationEnvironment: boundCandidate.registrationEnvironment,
    registrationEvidenceDigest: boundCandidate.registrationEvidenceDigest,
    allocationId: 'allocation:1', claimedAt: 1_010,
  })
}

function providerOffer(exactCommand: ReturnType<typeof command>) {
  return createProviderOffer({
    providerOfferId: 'provider-offer:1', quoteAttemptId: exactCommand.quoteAttemptId, commandDigest: exactCommand.commandDigest,
    candidateSetDigest: exactCommand.candidateSetDigest, issuerBindingId: boundCandidate.bindingId, issuerNodeId: boundCandidate.nodeId,
    issuerBusinessId: boundCandidate.businessId, capabilityContractId: exactCommand.capabilityContractId,
    capabilityContractVersion: exactCommand.capabilityContractVersion, providerOfferRef: 'carrier-a:quote:7',
    expectedCost: { currency: 'AUD', amountMinor: 2_450 }, maximumCost: { currency: 'AUD', amountMinor: 2_600 },
    expectedLatencyMs: 800, executionDataFields: ['sender.accountId'], materialTerms: ['Tracked service'], termsDigest: 'sha256:terms-a',
    offerOutputs: [], priceComponents: [{ label: 'Service', amountMinor: 2_450 }],
    cancellation: { kind: 'conditional', summary: 'Cancellation terms are bound to this offer.' }, offerOutputsDigest: 'sha256:outputs-a',
    cancellationTermsDigest: 'sha256:cancellation-a', providerEvidenceDigest: 'sha256:evidence-a', issuedAt: 1_030, expiresAt: 2_000,
  })
}

function writableSet(set: ReturnType<typeof candidateSet>) {
  return { ...set, candidates: set.candidates.map((candidate) => {
    const { commercialRelationship, ...candidateWithoutRelationship } = candidate
    return {
      ...candidateWithoutRelationship,
      ...(commercialRelationship === undefined ? {} : { commercialRelationship: {
        ...commercialRelationship, evidenceRefs: [...commercialRelationship.evidenceRefs],
      } }),
    }
  }) }
}

function writableCommand(exactCommand: ReturnType<typeof command>) {
  return { ...exactCommand, recipient: { ...exactCommand.recipient }, fieldNames: [...exactCommand.fieldNames] }
}

function writableOffer(exactOffer: ReturnType<typeof providerOffer>) {
  return {
    ...exactOffer, expectedCost: { ...exactOffer.expectedCost }, maximumCost: { ...exactOffer.maximumCost },
    executionDataFields: [...exactOffer.executionDataFields], materialTerms: [...exactOffer.materialTerms],
    offerOutputs: exactOffer.offerOutputs.map((output) => ({ ...output })),
    priceComponents: exactOffer.priceComponents.map((component) => ({ ...component })), cancellation: { ...exactOffer.cancellation },
  }
}
