import { v } from 'convex/values'

import { canonicalAuthorityDigest } from '@/modules/routing-kernel/runtime'
import {
  createPreparationCandidateSet,
  createProviderOffer,
  createQuotePreparationCommand,
  type PreparationCandidateSet,
  type ProviderOffer,
  type QuotePreparationAttempt,
  type PreparationCandidateCoverage,
} from '@/modules/routing-kernel/structured-quote-preparation-store'

import type { MutationCtx, QueryCtx } from './_generated/server'
import { internalMutation, internalQuery } from './_generated/server'

const candidate = v.object({
  bindingId: v.string(), nodeId: v.string(), businessId: v.string(), recipientName: v.string(), presentationEvidenceDigest: v.string(),
  capabilityContractId: v.string(), capabilityContractVersion: v.string(),
  registrationEnvironment: v.string(), registrationHash: v.string(), registrationEvidenceDigest: v.string(),
  incidentEpochDigest: v.string(), incidentEvidenceDigest: v.string(),
})
const preparationSource = v.object({
  kind: v.union(v.literal('plan_action'), v.literal('request_evaluation')),
  planRevisionId: v.optional(v.string()), actionId: v.optional(v.string()),
  evaluationId: v.optional(v.string()), evaluationDigest: v.optional(v.string()),
})
const candidateSet = v.object({
  preparationRequestId: v.string(), customerRequestId: v.string(), source: preparationSource,
  planRevisionId: v.optional(v.string()), actionId: v.optional(v.string()),
  generation: v.number(), capabilityContractId: v.string(), capabilityContractVersion: v.string(), createdAt: v.number(),
  candidates: v.array(candidate), candidateSetDigest: v.string(),
})
const recipient = v.object({ bindingId: v.string(), nodeId: v.string(), businessId: v.string() })
const command = v.object({
  quoteAttemptId: v.string(), preparationRequestId: v.string(), candidateSetDigest: v.string(), recipient,
  purpose: v.string(), fieldNames: v.array(v.string()), capabilityContractId: v.string(), capabilityContractVersion: v.string(),
  registrationHash: v.string(), registrationEnvironment: v.string(), registrationEvidenceDigest: v.string(),
  allocationId: v.string(), claimedAt: v.number(), commandDigest: v.string(),
})
const money = v.object({ currency: v.string(), amountMinor: v.number() })
const offer = v.object({
  providerOfferId: v.string(), offerDigest: v.string(), quoteAttemptId: v.string(), commandDigest: v.string(), candidateSetDigest: v.string(),
  issuerBindingId: v.string(), issuerNodeId: v.string(), issuerBusinessId: v.string(), capabilityContractId: v.string(), capabilityContractVersion: v.string(),
  providerOfferRef: v.string(), expectedCost: money, maximumCost: money, expectedLatencyMs: v.number(),
  executionDataFields: v.array(v.string()), materialTerms: v.array(v.string()), termsDigest: v.string(), cancellationTermsDigest: v.string(),
  offerOutputs: v.array(v.object({
    field: v.string(), valueType: v.union(v.literal('string'), v.literal('integer'), v.literal('boolean'), v.literal('url'), v.literal('money_minor')),
    value: v.union(v.string(), v.number(), v.boolean()),
  })),
  priceComponents: v.array(v.object({ label: v.string(), amountMinor: v.number() })),
  cancellation: v.object({ kind: v.union(v.literal('supported'), v.literal('conditional'), v.literal('unsupported')), summary: v.string() }),
  offerOutputsDigest: v.string(),
  providerEvidenceDigest: v.string(), issuedAt: v.number(), expiresAt: v.number(),
})
const affinity = v.object({
  providerOfferId: v.string(), candidateSetDigest: v.string(), customerRequestId: v.string(), planRevisionId: v.string(), sourceActionId: v.string(),
  expectedBindingId: v.string(), capabilityContractId: v.string(), capabilityContractVersion: v.string(), now: v.number(),
})

export const putCandidateSet = internalMutation({
  args: { candidateSet },
  handler: async (ctx, args) => {
    const source = exactPreparationSource(args.candidateSet.source)
    const common = {
      preparationRequestId: args.candidateSet.preparationRequestId,
      customerRequestId: args.candidateSet.customerRequestId,
      generation: args.candidateSet.generation,
      capabilityContractId: args.candidateSet.capabilityContractId,
      capabilityContractVersion: args.candidateSet.capabilityContractVersion,
      createdAt: args.candidateSet.createdAt,
      candidates: args.candidateSet.candidates,
      candidateSetDigest: args.candidateSet.candidateSetDigest,
    }
    const exact = source.kind === 'plan_action'
      ? createPreparationCandidateSet({ ...common, source, planRevisionId: source.planRevisionId, actionId: source.actionId })
      : createPreparationCandidateSet({ ...common, source })
    const existing = await ctx.db.query('routingKernelPreparationCandidateSets')
      .withIndex('by_preparationRequestId', (query) => query.eq('preparationRequestId', exact.preparationRequestId)).unique()
    if (existing !== null) {
      const stored = await readCandidateSet(ctx, existing.preparationRequestId)
      if (stored === undefined) throw new Error('preparation_candidate_set_corrupt')
      return existing.candidateSetDigest === exact.candidateSetDigest
        ? { kind: 'existing' as const, candidateSet: stored }
        : { kind: 'conflict' as const, existing: stored }
    }
    await ctx.db.insert('routingKernelPreparationCandidateSets', {
      preparationRequestId: exact.preparationRequestId, customerRequestId: exact.customerRequestId,
      sourceKind: exact.source.kind,
      sourceRef: exact.source.kind === 'plan_action' ? exact.source.planRevisionId : exact.source.evaluationId,
      ...(exact.source.kind === 'request_evaluation' ? { sourceDigest: exact.source.evaluationDigest } : {}),
      ...(exact.source.kind === 'plan_action' ? {
        planRevisionId: exact.source.planRevisionId, actionId: exact.source.actionId,
      } : {}),
      generation: exact.generation, capabilityContractId: exact.capabilityContractId,
      capabilityContractVersion: exact.capabilityContractVersion, createdAt: exact.createdAt, candidateSetDigest: exact.candidateSetDigest,
    })
    for (const [position, item] of exact.candidates.entries()) await ctx.db.insert('routingKernelPreparationCandidates', {
      preparationRequestId: exact.preparationRequestId, candidateSetDigest: exact.candidateSetDigest, position, ...item,
      coverageDisposition: 'eligible_not_contacted', protectedDataDisposition: 'not_released',
      providerContactDisposition: 'none', coverageReasonCode: 'eligible_not_contacted', coverageRecordedAt: exact.createdAt,
    })
    return { kind: 'stored' as const, candidateSet: exact }
  },
})

function validCoverageState(input: PreparationCandidateCoverage): boolean {
  if (input.disposition === 'eligible_not_contacted' || input.disposition === 'registration_stale'
    || input.disposition === 'incident_frozen' || input.disposition === 'release_refused'
    || input.disposition === 'allocated') {
    return input.protectedData === 'not_released' && input.providerContact === 'none'
  }
  if (input.disposition === 'uncertain') return input.protectedData === 'uncertain' && input.providerContact === 'attempted'
  return input.protectedData === 'released' && input.providerContact === 'attempted'
}

const coverageDisposition = v.union(
  v.literal('eligible_not_contacted'), v.literal('registration_stale'), v.literal('incident_frozen'),
  v.literal('release_refused'), v.literal('allocated'), v.literal('dispatch_attempted'), v.literal('option_received'), v.literal('provider_refused'), v.literal('uncertain'),
)

export const recordCandidateCoverage = internalMutation({
  args: { coverage: v.object({
    candidateSetDigest: v.string(), bindingId: v.string(), nodeId: v.string(), disposition: coverageDisposition,
    protectedData: v.union(v.literal('not_released'), v.literal('released'), v.literal('uncertain')),
    providerContact: v.union(v.literal('none'), v.literal('attempted')), reasonCode: v.string(), recordedAt: v.number(),
  }) },
  handler: async (ctx, args) => {
    if (!validCoverageState(args.coverage)) throw new Error('preparation_candidate_coverage_invalid')
    const row = await ctx.db.query('routingKernelPreparationCandidates')
      .withIndex('by_candidateSetDigest_and_bindingId', (query) => query
        .eq('candidateSetDigest', args.coverage.candidateSetDigest).eq('bindingId', args.coverage.bindingId)).unique()
    if (row === null || row.nodeId !== args.coverage.nodeId) throw new Error('preparation_candidate_coverage_not_bound')
    if (!coverageMayAdvance(row.coverageDisposition, row.coverageRecordedAt, args.coverage.disposition, args.coverage.recordedAt)) return {
      candidateSetDigest: row.candidateSetDigest, bindingId: row.bindingId, nodeId: row.nodeId,
      disposition: row.coverageDisposition, protectedData: row.protectedDataDisposition,
      providerContact: row.providerContactDisposition, reasonCode: row.coverageReasonCode, recordedAt: row.coverageRecordedAt,
    }
    await ctx.db.patch(row._id, {
      coverageDisposition: args.coverage.disposition, protectedDataDisposition: args.coverage.protectedData,
      providerContactDisposition: args.coverage.providerContact, coverageReasonCode: args.coverage.reasonCode,
      coverageRecordedAt: args.coverage.recordedAt,
    })
    return args.coverage
  },
})

function coverageMayAdvance(
  current: PreparationCandidateCoverage['disposition'], currentAt: number,
  next: PreparationCandidateCoverage['disposition'], nextAt: number,
): boolean {
  if (current === next || nextAt < currentAt) return false
  const allowed: Record<PreparationCandidateCoverage['disposition'], readonly PreparationCandidateCoverage['disposition'][]> = {
    eligible_not_contacted: ['registration_stale', 'incident_frozen', 'release_refused', 'allocated'],
    allocated: ['registration_stale', 'incident_frozen', 'release_refused', 'dispatch_attempted'],
    dispatch_attempted: ['uncertain', 'provider_refused', 'option_received'],
    uncertain: ['provider_refused', 'option_received'],
    registration_stale: [], incident_frozen: [], release_refused: [], provider_refused: [], option_received: [],
  }
  return allowed[current].includes(next)
}

export const listCandidateCoverage = internalQuery({
  args: { candidateSetDigest: v.string() },
  handler: async (ctx, args): Promise<PreparationCandidateCoverage[]> => {
    const rows = await ctx.db.query('routingKernelPreparationCandidates')
      .withIndex('by_candidateSetDigest_and_bindingId', (query) => query.eq('candidateSetDigest', args.candidateSetDigest)).take(65)
    return rows.map((row) => ({
      candidateSetDigest: row.candidateSetDigest, bindingId: row.bindingId, nodeId: row.nodeId,
      disposition: row.coverageDisposition, protectedData: row.protectedDataDisposition,
      providerContact: row.providerContactDisposition, reasonCode: row.coverageReasonCode, recordedAt: row.coverageRecordedAt,
    })).sort((left, right) => left.bindingId.localeCompare(right.bindingId))
  },
})

export const getCandidateSet = internalQuery({
  args: { preparationRequestId: v.string() },
  handler: async (ctx, args) => await readCandidateSet(ctx, args.preparationRequestId) ?? null,
})

export const getCandidateSetByDigest = internalQuery({
  args: { candidateSetDigest: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.query('routingKernelPreparationCandidateSets')
      .withIndex('by_candidateSetDigest', (query) => query.eq('candidateSetDigest', args.candidateSetDigest)).unique()
    return row === null ? null : await readCandidateSet(ctx, row.preparationRequestId) ?? null
  },
})

export const claimQuoteAttempt = internalMutation({
  args: { command },
  handler: async (ctx, args) => {
    const exact = createQuotePreparationCommand(args.command)
    const existing = await readAttempt(ctx, exact.quoteAttemptId)
    if (existing !== undefined) return existing.commandDigest === exact.commandDigest
      ? { kind: 'existing' as const, attempt: existing }
      : { kind: 'conflict' as const, existing }
    const set = await readCandidateSet(ctx, exact.preparationRequestId)
    if (set === undefined || set.candidateSetDigest !== exact.candidateSetDigest) return { kind: 'candidate_set_not_found' as const }
    const bound = set.candidates.find((item) => item.bindingId === exact.recipient.bindingId
      && item.nodeId === exact.recipient.nodeId && item.businessId === exact.recipient.businessId)
    if (bound === undefined) return { kind: 'candidate_not_bound' as const }
    if (bound.capabilityContractId !== exact.capabilityContractId || bound.capabilityContractVersion !== exact.capabilityContractVersion) {
      return { kind: 'candidate_evidence_stale' as const }
    }
    if (bound.registrationHash !== exact.registrationHash || bound.registrationEnvironment !== exact.registrationEnvironment
      || bound.registrationEvidenceDigest !== exact.registrationEvidenceDigest) return { kind: 'candidate_evidence_stale' as const }
    await ctx.db.insert('routingKernelPreparationQuoteAttempts', {
      quoteAttemptId: exact.quoteAttemptId, commandDigest: exact.commandDigest, preparationRequestId: exact.preparationRequestId,
      candidateSetDigest: exact.candidateSetDigest, recipientBindingId: exact.recipient.bindingId, recipientNodeId: exact.recipient.nodeId,
      recipientBusinessId: exact.recipient.businessId, purpose: exact.purpose, capabilityContractId: exact.capabilityContractId,
      capabilityContractVersion: exact.capabilityContractVersion, registrationHash: exact.registrationHash,
      registrationEnvironment: exact.registrationEnvironment, registrationEvidenceDigest: exact.registrationEvidenceDigest,
      allocationId: exact.allocationId, claimedAt: exact.claimedAt, disposition: 'allocated',
    })
    for (const [position, fieldName] of exact.fieldNames.entries()) await ctx.db.insert('routingKernelPreparationQuoteAttemptFields', {
      quoteAttemptId: exact.quoteAttemptId, commandDigest: exact.commandDigest, position, fieldName,
    })
    return { kind: 'claimed' as const, attempt: allocatedAttempt(exact) }
  },
})

export const getQuoteAttempt = internalQuery({
  args: { quoteAttemptId: v.string() },
  handler: async (ctx, args) => await readAttempt(ctx, args.quoteAttemptId) ?? null,
})

export const markDispatched = internalMutation({
  args: { quoteAttemptId: v.string(), commandDigest: v.string(), dispatchedAt: v.number() },
  handler: async (ctx, args) => {
    const row = await ctx.db.query('routingKernelPreparationQuoteAttempts')
      .withIndex('by_quoteAttemptId', (query) => query.eq('quoteAttemptId', args.quoteAttemptId)).unique()
    if (row === null) return { kind: 'not_found' as const }
    if (row.commandDigest !== args.commandDigest) return { kind: 'conflict' as const }
    const current = await readAttempt(ctx, args.quoteAttemptId)
    if (current === undefined) throw new Error('preparation_quote_attempt_corrupt')
    if (current.disposition === 'dispatched' && current.dispatchedAt === args.dispatchedAt) return { kind: 'existing' as const, attempt: current }
    if (current.disposition !== 'allocated') return { kind: 'invalid_transition' as const }
    await ctx.db.patch(row._id, { disposition: 'dispatched', dispatchedAt: args.dispatchedAt })
    return { kind: 'updated' as const, attempt: { ...current, disposition: 'dispatched' as const, dispatchedAt: args.dispatchedAt } }
  },
})

export const resolveQuoteAttempt = internalMutation({
  args: { resolution: v.union(
    v.object({ quoteAttemptId: v.string(), commandDigest: v.string(), disposition: v.literal('quoted'), resolvedAt: v.number(), offer }),
    v.object({ quoteAttemptId: v.string(), commandDigest: v.string(), disposition: v.union(v.literal('refused'), v.literal('uncertain')), resolvedAt: v.number(), reasonCode: v.string() }),
  ) },
  handler: async (ctx, args) => {
    const input = args.resolution
    const row = await ctx.db.query('routingKernelPreparationQuoteAttempts')
      .withIndex('by_quoteAttemptId', (query) => query.eq('quoteAttemptId', input.quoteAttemptId)).unique()
    if (row === null) return { kind: 'not_found' as const }
    if (row.commandDigest !== input.commandDigest) return { kind: 'conflict' as const }
    const current = await readAttempt(ctx, input.quoteAttemptId)
    if (current === undefined) throw new Error('preparation_quote_attempt_corrupt')
    const resolutionDigest = canonicalAuthorityDigest(input.disposition === 'quoted'
      ? { disposition: input.disposition, resolvedAt: input.resolvedAt, offerDigest: input.offer.offerDigest }
      : { disposition: input.disposition, resolvedAt: input.resolvedAt, reasonCode: input.reasonCode })
    if (current.disposition === 'uncertain' && input.disposition === 'quoted') {
      const exactOffer = createProviderOffer(input.offer)
      if (!offerMatches(exactOffer, current)) return { kind: 'conflict' as const }
      const existingOffer = await ctx.db.query('routingKernelProviderOffers')
        .withIndex('by_providerOfferId', (query) => query.eq('providerOfferId', exactOffer.providerOfferId)).unique()
      if (existingOffer !== null && existingOffer.offerDigest !== exactOffer.offerDigest) return { kind: 'conflict' as const }
      if (existingOffer === null) await insertOffer(ctx, exactOffer)
      await ctx.db.patch(row._id, {
        disposition: 'quoted', resolvedAt: input.resolvedAt, providerOfferId: exactOffer.providerOfferId, resolutionDigest,
        uncertainAt: current.resolvedAt, uncertaintyDigest: current.resolutionDigest,
      })
      return { kind: 'updated' as const, attempt: {
        ...current, disposition: 'quoted' as const, resolvedAt: input.resolvedAt, offer: exactOffer, resolutionDigest,
        uncertainAt: current.resolvedAt, uncertaintyDigest: current.resolutionDigest,
      } }
    }
    if (current.disposition === 'uncertain' && input.disposition === 'refused') {
      await ctx.db.patch(row._id, {
        disposition: 'refused', resolvedAt: input.resolvedAt, reasonCode: input.reasonCode, resolutionDigest,
        uncertainAt: current.resolvedAt, uncertaintyDigest: current.resolutionDigest,
      })
      return { kind: 'updated' as const, attempt: {
        ...current, disposition: 'refused' as const, resolvedAt: input.resolvedAt, reasonCode: input.reasonCode,
        resolutionDigest, uncertainAt: current.resolvedAt, uncertaintyDigest: current.resolutionDigest,
      } }
    }
    if ('resolutionDigest' in current) return current.resolutionDigest === resolutionDigest
      ? { kind: 'existing' as const, attempt: current } : { kind: 'invalid_transition' as const }
    if (input.disposition !== 'refused' && current.disposition !== 'dispatched') return { kind: 'invalid_transition' as const }
    if (input.disposition === 'quoted') {
      if (current.disposition !== 'dispatched') return { kind: 'invalid_transition' as const }
      const exactOffer = createProviderOffer(input.offer)
      if (!offerMatches(exactOffer, current)) return { kind: 'conflict' as const }
      const existingOffer = await ctx.db.query('routingKernelProviderOffers')
        .withIndex('by_providerOfferId', (query) => query.eq('providerOfferId', exactOffer.providerOfferId)).unique()
      if (existingOffer !== null && existingOffer.offerDigest !== exactOffer.offerDigest) return { kind: 'conflict' as const }
      if (existingOffer === null) await insertOffer(ctx, exactOffer)
      await ctx.db.patch(row._id, { disposition: 'quoted', resolvedAt: input.resolvedAt, providerOfferId: exactOffer.providerOfferId, resolutionDigest })
      return { kind: 'updated' as const, attempt: { ...current, disposition: 'quoted' as const, dispatchedAt: current.dispatchedAt, resolvedAt: input.resolvedAt, offer: exactOffer, resolutionDigest } }
    }
    if (input.disposition === 'uncertain') {
      if (current.disposition !== 'dispatched') return { kind: 'invalid_transition' as const }
      await ctx.db.patch(row._id, { disposition: input.disposition, resolvedAt: input.resolvedAt, reasonCode: input.reasonCode, resolutionDigest })
      return { kind: 'updated' as const, attempt: { ...current, disposition: 'uncertain' as const, dispatchedAt: current.dispatchedAt, resolvedAt: input.resolvedAt, reasonCode: input.reasonCode, resolutionDigest } }
    }
    await ctx.db.patch(row._id, { disposition: input.disposition, resolvedAt: input.resolvedAt, reasonCode: input.reasonCode, resolutionDigest })
    return { kind: 'updated' as const, attempt: { ...current, disposition: 'refused' as const, resolvedAt: input.resolvedAt, reasonCode: input.reasonCode, resolutionDigest } }
  },
})

export const getProviderOffer = internalQuery({
  args: { providerOfferId: v.string() },
  handler: async (ctx, args) => await readOffer(ctx, args.providerOfferId) ?? null,
})

export const getProviderOfferByDigest = internalQuery({
  args: { offerDigest: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.query('routingKernelProviderOffers')
      .withIndex('by_offerDigest', (query) => query.eq('offerDigest', args.offerDigest)).unique()
    return row === null ? null : await readOffer(ctx, row.providerOfferId) ?? null
  },
})

export const resolveProviderOfferAffinity = internalQuery({
  args: { input: affinity },
  handler: async (ctx, args) => {
    const input = args.input
    const found = await readOffer(ctx, input.providerOfferId)
    if (found === undefined) return { kind: 'refused' as const, reason: 'not_found' as const }
    if (found.candidateSetDigest !== input.candidateSetDigest) return { kind: 'refused' as const, reason: 'foreign' as const }
    const setRow = await ctx.db.query('routingKernelPreparationCandidateSets')
      .withIndex('by_candidateSetDigest', (query) => query.eq('candidateSetDigest', found.candidateSetDigest)).unique()
    if (setRow === null || setRow.customerRequestId !== input.customerRequestId || setRow.planRevisionId !== input.planRevisionId
      || setRow.actionId !== input.sourceActionId) return { kind: 'refused' as const, reason: 'lineage_mismatch' as const }
    const latest = await ctx.db.query('routingKernelPreparationCandidateSets')
      .withIndex('by_customerRequestId_planRevisionId_actionId_generation', (query) => query
        .eq('customerRequestId', input.customerRequestId).eq('planRevisionId', input.planRevisionId).eq('actionId', input.sourceActionId))
      .order('desc').first()
    if (latest !== null && latest.generation > setRow.generation) return { kind: 'refused' as const, reason: 'stale' as const }
    if (input.now >= found.expiresAt) return { kind: 'refused' as const, reason: 'expired' as const }
    if (found.issuerBindingId !== input.expectedBindingId) return { kind: 'refused' as const, reason: 'issuer_mismatch' as const }
    if (found.capabilityContractId !== input.capabilityContractId || found.capabilityContractVersion !== input.capabilityContractVersion) {
      return { kind: 'refused' as const, reason: 'contract_mismatch' as const }
    }
    return { kind: 'matched' as const, offer: found }
  },
})

async function readCandidateSet(ctx: QueryCtx | MutationCtx, preparationRequestId: string): Promise<PreparationCandidateSet | undefined> {
  const row = await ctx.db.query('routingKernelPreparationCandidateSets')
    .withIndex('by_preparationRequestId', (query) => query.eq('preparationRequestId', preparationRequestId)).unique()
  if (row === null) return undefined
  const candidates = await ctx.db.query('routingKernelPreparationCandidates')
    .withIndex('by_preparationRequestId_and_position', (query) => query.eq('preparationRequestId', preparationRequestId)).take(65)
  if (candidates.length === 0 || candidates.length > 64) throw new Error('preparation_candidate_set_corrupt')
  const source = row.sourceKind === 'request_evaluation'
    ? { kind: 'request_evaluation' as const, evaluationId: row.sourceRef ?? '', evaluationDigest: row.sourceDigest ?? '' }
    : { kind: 'plan_action' as const, planRevisionId: row.planRevisionId ?? row.sourceRef ?? '', actionId: row.actionId ?? '' }
  const common = {
    preparationRequestId: row.preparationRequestId, customerRequestId: row.customerRequestId,
    generation: row.generation, capabilityContractId: row.capabilityContractId,
    capabilityContractVersion: row.capabilityContractVersion, createdAt: row.createdAt, candidateSetDigest: row.candidateSetDigest,
    candidates: candidates.map(({ bindingId, nodeId, businessId, recipientName, presentationEvidenceDigest, capabilityContractId, capabilityContractVersion, registrationEnvironment,
      registrationHash, registrationEvidenceDigest, incidentEpochDigest, incidentEvidenceDigest }) => ({
      bindingId, nodeId, businessId, recipientName, presentationEvidenceDigest, capabilityContractId, capabilityContractVersion, registrationEnvironment,
      registrationHash, registrationEvidenceDigest, incidentEpochDigest, incidentEvidenceDigest,
    })),
  }
  return source.kind === 'plan_action'
    ? createPreparationCandidateSet({ ...common, source, planRevisionId: source.planRevisionId, actionId: source.actionId })
    : createPreparationCandidateSet({ ...common, source })
}

function exactPreparationSource(source: {
  kind: 'plan_action' | 'request_evaluation'
  planRevisionId?: string; actionId?: string; evaluationId?: string; evaluationDigest?: string
}) {
  if (source.kind === 'plan_action') {
    if (source.planRevisionId === undefined || source.actionId === undefined
      || source.evaluationId !== undefined || source.evaluationDigest !== undefined) throw new Error('preparation_source_invalid')
    return { kind: 'plan_action' as const, planRevisionId: source.planRevisionId, actionId: source.actionId }
  }
  if (source.evaluationId === undefined || source.evaluationDigest === undefined
    || source.planRevisionId !== undefined || source.actionId !== undefined) throw new Error('preparation_source_invalid')
  return { kind: 'request_evaluation' as const, evaluationId: source.evaluationId, evaluationDigest: source.evaluationDigest }
}

async function readAttempt(ctx: QueryCtx | MutationCtx, quoteAttemptId: string): Promise<QuotePreparationAttempt | undefined> {
  const row = await ctx.db.query('routingKernelPreparationQuoteAttempts')
    .withIndex('by_quoteAttemptId', (query) => query.eq('quoteAttemptId', quoteAttemptId)).unique()
  if (row === null) return undefined
  const fields = await ctx.db.query('routingKernelPreparationQuoteAttemptFields')
    .withIndex('by_quoteAttemptId_and_position', (query) => query.eq('quoteAttemptId', quoteAttemptId)).take(65)
  if (fields.length > 64) throw new Error('preparation_quote_attempt_corrupt')
  const exactCommand = createQuotePreparationCommand({
    quoteAttemptId: row.quoteAttemptId, preparationRequestId: row.preparationRequestId, candidateSetDigest: row.candidateSetDigest,
    recipient: { bindingId: row.recipientBindingId, nodeId: row.recipientNodeId, businessId: row.recipientBusinessId }, purpose: row.purpose,
    fieldNames: fields.map((field) => field.fieldName), capabilityContractId: row.capabilityContractId,
    capabilityContractVersion: row.capabilityContractVersion, allocationId: row.allocationId, claimedAt: row.claimedAt, commandDigest: row.commandDigest,
    registrationHash: row.registrationHash, registrationEnvironment: row.registrationEnvironment,
    registrationEvidenceDigest: row.registrationEvidenceDigest,
  })
  const base = { quoteAttemptId: row.quoteAttemptId, commandDigest: row.commandDigest, command: exactCommand }
  if (row.disposition === 'allocated') return { ...base, disposition: 'allocated' }
  if (row.disposition === 'dispatched') {
    if (row.dispatchedAt === undefined) throw new Error('preparation_quote_attempt_corrupt')
    return { ...base, disposition: 'dispatched', dispatchedAt: row.dispatchedAt }
  }
  if (row.resolvedAt === undefined || row.resolutionDigest === undefined) throw new Error('preparation_quote_attempt_corrupt')
  if (row.disposition === 'quoted') {
    if (row.dispatchedAt === undefined || row.providerOfferId === undefined) throw new Error('preparation_quote_attempt_corrupt')
    const storedOffer = await readOffer(ctx, row.providerOfferId)
    if (storedOffer === undefined) throw new Error('preparation_provider_offer_corrupt')
    return {
      ...base, disposition: 'quoted', dispatchedAt: row.dispatchedAt, resolvedAt: row.resolvedAt,
      offer: storedOffer, resolutionDigest: row.resolutionDigest,
      ...(row.uncertainAt === undefined ? {} : { uncertainAt: row.uncertainAt }),
      ...(row.uncertaintyDigest === undefined ? {} : { uncertaintyDigest: row.uncertaintyDigest }),
    }
  }
  if (row.reasonCode === undefined) throw new Error('preparation_quote_attempt_corrupt')
  if (row.disposition === 'uncertain') {
    if (row.dispatchedAt === undefined) throw new Error('preparation_quote_attempt_corrupt')
    return { ...base, disposition: 'uncertain', dispatchedAt: row.dispatchedAt, resolvedAt: row.resolvedAt, reasonCode: row.reasonCode, resolutionDigest: row.resolutionDigest }
  }
  return {
    ...base, disposition: 'refused', ...(row.dispatchedAt === undefined ? {} : { dispatchedAt: row.dispatchedAt }),
    resolvedAt: row.resolvedAt, reasonCode: row.reasonCode, resolutionDigest: row.resolutionDigest,
    ...(row.uncertainAt === undefined ? {} : { uncertainAt: row.uncertainAt }),
    ...(row.uncertaintyDigest === undefined ? {} : { uncertaintyDigest: row.uncertaintyDigest }),
  }
}

async function insertOffer(ctx: MutationCtx, input: ProviderOffer): Promise<void> {
  await ctx.db.insert('routingKernelProviderOffers', {
    providerOfferId: input.providerOfferId, offerDigest: input.offerDigest, quoteAttemptId: input.quoteAttemptId, commandDigest: input.commandDigest,
    candidateSetDigest: input.candidateSetDigest, issuerBindingId: input.issuerBindingId, issuerNodeId: input.issuerNodeId,
    issuerBusinessId: input.issuerBusinessId, capabilityContractId: input.capabilityContractId, capabilityContractVersion: input.capabilityContractVersion,
    providerOfferRef: input.providerOfferRef, expectedCurrency: input.expectedCost.currency, expectedAmountMinor: input.expectedCost.amountMinor,
    maximumCurrency: input.maximumCost.currency, maximumAmountMinor: input.maximumCost.amountMinor, expectedLatencyMs: input.expectedLatencyMs,
    offerOutputs: input.offerOutputs.map((output) => ({ ...output })),
    priceComponents: input.priceComponents.map((component) => ({ ...component })), cancellation: { ...input.cancellation },
    offerOutputsDigest: input.offerOutputsDigest,
    termsDigest: input.termsDigest, cancellationTermsDigest: input.cancellationTermsDigest, providerEvidenceDigest: input.providerEvidenceDigest,
    issuedAt: input.issuedAt, expiresAt: input.expiresAt,
  })
  for (const [position, fieldName] of input.executionDataFields.entries()) await ctx.db.insert('routingKernelProviderOfferExecutionFields', {
    providerOfferId: input.providerOfferId, offerDigest: input.offerDigest, position, fieldName,
  })
  for (const [position, term] of input.materialTerms.entries()) await ctx.db.insert('routingKernelProviderOfferMaterialTerms', {
    providerOfferId: input.providerOfferId, offerDigest: input.offerDigest, position, term,
  })
}

async function readOffer(ctx: QueryCtx | MutationCtx, providerOfferId: string): Promise<ProviderOffer | undefined> {
  const row = await ctx.db.query('routingKernelProviderOffers')
    .withIndex('by_providerOfferId', (query) => query.eq('providerOfferId', providerOfferId)).unique()
  if (row === null) return undefined
  const fields = await ctx.db.query('routingKernelProviderOfferExecutionFields')
    .withIndex('by_providerOfferId_and_position', (query) => query.eq('providerOfferId', providerOfferId)).take(65)
  const terms = await ctx.db.query('routingKernelProviderOfferMaterialTerms')
    .withIndex('by_providerOfferId_and_position', (query) => query.eq('providerOfferId', providerOfferId)).take(65)
  if (fields.length > 64 || terms.length > 64) throw new Error('preparation_provider_offer_corrupt')
  return createProviderOffer({
    providerOfferId: row.providerOfferId, offerDigest: row.offerDigest, quoteAttemptId: row.quoteAttemptId, commandDigest: row.commandDigest,
    candidateSetDigest: row.candidateSetDigest, issuerBindingId: row.issuerBindingId, issuerNodeId: row.issuerNodeId,
    issuerBusinessId: row.issuerBusinessId, capabilityContractId: row.capabilityContractId, capabilityContractVersion: row.capabilityContractVersion,
    providerOfferRef: row.providerOfferRef, expectedCost: { currency: row.expectedCurrency, amountMinor: row.expectedAmountMinor },
    maximumCost: { currency: row.maximumCurrency, amountMinor: row.maximumAmountMinor }, expectedLatencyMs: row.expectedLatencyMs,
    executionDataFields: fields.map((field) => field.fieldName), materialTerms: terms.map((term) => term.term), termsDigest: row.termsDigest,
    offerOutputs: row.offerOutputs.map((output) => ({
      field: output.field,
      valueType: output.valueType as 'string' | 'integer' | 'boolean' | 'url' | 'money_minor', value: output.value,
    })),
    priceComponents: row.priceComponents.map((component) => ({ ...component })), cancellation: {
      kind: row.cancellation.kind as 'supported' | 'conditional' | 'unsupported', summary: row.cancellation.summary,
    },
    offerOutputsDigest: row.offerOutputsDigest,
    cancellationTermsDigest: row.cancellationTermsDigest, providerEvidenceDigest: row.providerEvidenceDigest, issuedAt: row.issuedAt, expiresAt: row.expiresAt,
  })
}

function allocatedAttempt(input: ReturnType<typeof createQuotePreparationCommand>): QuotePreparationAttempt {
  return { quoteAttemptId: input.quoteAttemptId, commandDigest: input.commandDigest, command: input, disposition: 'allocated' }
}

function offerMatches(input: ProviderOffer, attempt: QuotePreparationAttempt): boolean {
  return input.quoteAttemptId === attempt.quoteAttemptId && input.commandDigest === attempt.commandDigest
    && input.candidateSetDigest === attempt.command.candidateSetDigest && input.issuerBindingId === attempt.command.recipient.bindingId
    && input.issuerNodeId === attempt.command.recipient.nodeId && input.issuerBusinessId === attempt.command.recipient.businessId
    && input.capabilityContractId === attempt.command.capabilityContractId
    && input.capabilityContractVersion === attempt.command.capabilityContractVersion
}
