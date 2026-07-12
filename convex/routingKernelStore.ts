import type { GenericDatabaseReader, GenericDatabaseWriter } from 'convex/server'
import { type Infer, v } from 'convex/values'

import { canonicalAuthorityDigest, isValidDisclosureGrant, isValidStepGrant, sameDisclosureGrant, sameStepGrant } from '@/modules/routing-kernel/runtime'
import type { DataModel, Doc } from './_generated/dataModel'
import { internalMutation, internalQuery } from './_generated/server'
import { consumeRecoveryGrantInTransaction, evaluateIncidentInTransaction } from './routingKernelIncidentControl'

const MAX_QUOTE_GRAPHS = 64
const MAX_STEPS_PER_GRAPH = 2
const MAX_LEAVES_PER_ROOT = 16
const MAX_RECORDS_PER_ROOT = 256

const money = v.object({ currency: v.string(), amountMinor: v.number() })
const caller = v.object({ agentId: v.string(), principalId: v.string() })
const graphStep = v.object({
  role: v.union(v.literal('primary'), v.literal('fallback')),
  trigger: v.optional(v.literal('on_effect_not_committed')),
  bindingId: v.string(),
  nodeId: v.string(),
  capabilityContractId: v.string(),
  expectedCost: money,
  maximumCost: money,
  expectedLatencyMs: v.number(),
  providerQuoteRef: v.optional(v.string()),
  providerQuoteExpiresAt: v.optional(v.number()),
  incidentEpochDigest: v.optional(v.string()),
  dataFields: v.array(v.string()),
  disclosures: v.array(v.string()),
})
const graph = v.object({
  bindingId: v.string(),
  nodeId: v.string(),
  capabilityContractId: v.string(),
  expectedCost: money,
  maximumCost: money,
  expectedLatencyMs: v.number(),
  dataFields: v.array(v.string()),
  disclosures: v.array(v.string()),
  steps: v.array(graphStep),
})
const bindingEvidence = v.object({
  bindingId: v.string(), disposition: v.union(v.literal('current'), v.literal('missing'), v.literal('legacy_unbound'), v.literal('expired'), v.literal('version_mismatch'), v.literal('ineligible_evidence')),
  snapshotDigest: v.optional(v.string()),
  healthState: v.union(v.literal('healthy'), v.literal('degraded'), v.literal('unavailable'), v.literal('frozen'), v.literal('unknown')),
  healthEvidenceStanding: v.optional(v.union(v.literal('eligible_observed'), v.literal('eligible_run_bound'), v.literal('eligible_corroborated'), v.literal('visible_unbound'), v.literal('ineligible_domain'), v.literal('ineligible_scope'), v.literal('held'), v.literal('retracted_or_removed'))),
  incidentRoutingEffect: v.union(v.literal('none'), v.literal('deprioritize'), v.literal('exclude_new_routes'), v.literal('freeze')),
  incidentEvidenceStanding: v.optional(v.union(v.literal('eligible_observed'), v.literal('eligible_run_bound'), v.literal('eligible_corroborated'), v.literal('visible_unbound'), v.literal('ineligible_domain'), v.literal('ineligible_scope'), v.literal('held'), v.literal('retracted_or_removed'))),
  activeIncidentIds: v.optional(v.array(v.string())),
  executionReliabilityStatus: v.union(v.literal('sufficient'), v.literal('insufficient_evidence')),
  standingEvidenceStanding: v.optional(v.union(v.literal('eligible_observed'), v.literal('eligible_run_bound'), v.literal('eligible_corroborated'), v.literal('visible_unbound'), v.literal('ineligible_domain'), v.literal('ineligible_scope'), v.literal('held'), v.literal('retracted_or_removed'))),
  executionReliabilityLowerBoundPermille: v.optional(v.number()),
})
const routingSnapshot = v.object({
  compilerVersion: v.literal('routing-compiler:v2'), optimizerVersion: v.literal('organic-cost-latency-evidence:v2'),
  networkPolicyVersion: v.literal('network-policy:binding-evidence:v2'), networkId: v.string(), caller,
  normalizedQuery: v.string(),
  constraints: v.object({ currency: v.string(), maximumSpendMinor: v.number(), optimizeFor: v.union(v.literal('cost'), v.literal('latency')) }),
  eligibleBindingIds: v.array(v.string()), relevantBindingIds: v.array(v.string()), bindingEvidence: v.array(bindingEvidence),
})
const organicDecision = v.object({
  optimizerVersion: v.literal('organic-cost-latency-evidence:v2'), optimizeFor: v.union(v.literal('cost'), v.literal('latency')),
  selectedBindingId: v.optional(v.string()),
  factors: v.array(v.object({
    bindingId: v.string(), feasible: v.boolean(), expectedCostMinor: v.optional(v.number()),
    maximumCostMinor: v.optional(v.number()), expectedLatencyMs: v.optional(v.number()), evidence: bindingEvidence,
    refusalReason: v.optional(v.union(v.literal('quote_refused'), v.literal('currency_mismatch'), v.literal('maximum_spend_exceeded'), v.literal('health_unavailable'), v.literal('incident_excluded'))),
  })),
})
const quote = v.object({
  quoteId: v.string(),
  quoteDigest: v.string(),
  routingRequestId: v.string(),
  networkId: v.string(),
  executionMode: v.union(v.literal('simulation'), v.literal('live')),
  caller,
  query: v.string(),
  routingSnapshot,
  organicDecision,
  createdAt: v.number(),
  expiresAt: v.number(),
  selectedGraph: graph,
  alternatives: v.array(graph),
  effects: v.array(v.string()),
  disclosures: v.array(v.string()),
  enforcement: v.literal('required'),
  incidentEpochDigest: v.string(),
})
const authorization = v.object({
  authorizationRef: v.string(),
  budgetAuthorityRef: v.string(),
  budgetMaximumGrossMinor: v.number(),
  dataAuthorizationBudgetRef: v.string(),
  protectedFieldSetId: v.string(),
  dataBudgetMaximumAttempts: v.number(),
  dataBudgetMaximumExposures: v.number(),
  allowedRecipientBindingIds: v.array(v.string()),
  allowedDisclosurePurposes: v.array(v.string()),
  maximumDisclosureAttempts: v.number(),
  maximumDisclosureExposures: v.number(),
  quoteId: v.string(),
  quoteDigest: v.string(),
  principalId: v.string(),
  agentId: v.string(),
  maximumSpendMinor: v.number(),
  currency: v.string(),
  expiresAt: v.number(),
  consumedAt: v.optional(v.number()),
  allowedDataFields: v.array(v.string()),
  incidentEpochDigest: v.string(),
})
const stepGrant = v.object({
  stepGrantId: v.string(), rootRunId: v.string(), leafRunId: v.string(), quoteId: v.string(), quoteDigest: v.string(),
  requestDigest: v.string(), bindingId: v.string(), nodeId: v.string(), capabilityContractId: v.string(),
  maximumCost: money, disclosedDataFields: v.array(v.string()), attempt: v.number(), issuedAt: v.number(), expiresAt: v.number(),
  enforcementPoint: v.literal('provider_release'), incidentEpochDigest: v.string(), grantDigest: v.string(),
})
const disclosureGrant = v.object({
  disclosureGrantId: v.string(), disclosureGrantDigest: v.string(), dataAuthorizationBudgetRef: v.string(),
  rootRunId: v.string(), leafRunId: v.string(), stepGrantId: v.string(), quoteId: v.string(), quoteDigest: v.string(),
  requestDigest: v.string(), recipientBindingId: v.string(), purpose: v.string(), fields: v.array(v.string()),
  projectionDigest: v.string(), attempt: v.number(), issuedAt: v.number(), expiresAt: v.number(), enforcementPoint: v.literal('data_release'), incidentEpochDigest: v.string(),
})
const providerCancellation = v.object({
  cancellationRequestId: v.string(), rootRunId: v.string(), leafRunId: v.string(), stepGrantId: v.string(),
  bindingId: v.string(), idempotencyKey: v.string(),
  disposition: v.union(v.literal('pending'), v.literal('accepted'), v.literal('rejected'), v.literal('indeterminate')),
  requestedAt: v.number(), resolvedAt: v.optional(v.number()), providerReference: v.optional(v.string()), reason: v.optional(v.string()),
})
const leaf = v.object({
  leafRunId: v.string(),
  stepGrantId: v.string(),
  bindingId: v.string(),
  nodeId: v.string(),
  capabilityContractId: v.string(),
  state: v.union(v.literal('pending'), v.literal('released'), v.literal('completed'), v.literal('outcome_unknown'), v.literal('failed'), v.literal('cancelled'), v.literal('incident_frozen')),
  attemptDisposition: v.union(v.literal('not_released'), v.literal('released'), v.literal('dispatched'), v.literal('indeterminate')),
  effectState: v.union(v.literal('not_started'), v.literal('released'), v.literal('committed'), v.literal('unknown'), v.literal('not_committed')),
  enforcement: v.literal('enforced'),
  providerReference: v.optional(v.string()),
  outcome: v.optional(v.record(v.string(), v.string())),
  failureReason: v.optional(v.string()),
})
const protocolRecord = v.object({
  recordId: v.string(),
  type: v.union(
    v.literal('root_run_admitted'),
    v.literal('step_grant_consumed'),
    v.literal('disclosure_grant_consumed'),
    v.literal('provider_attempt_released'),
    v.literal('provider_outcome_reported'),
    v.literal('provider_outcome_unknown'),
    v.literal('provider_effect_not_committed'),
    v.literal('fallback_released'),
    v.literal('fallback_release_refused'),
    v.literal('root_run_completed'),
    v.literal('root_run_outcome_unknown'),
    v.literal('root_run_failed'),
    v.literal('provider_reconciliation_observed'),
    v.literal('root_run_reconciled'),
    v.literal('cancellation_requested'),
    v.literal('root_run_cancelled'),
    v.literal('provider_cancellation_requested'),
    v.literal('provider_cancellation_accepted'),
    v.literal('provider_cancellation_rejected'),
    v.literal('provider_cancellation_unknown'),
    v.literal('incident_freeze_observed'),
    v.literal('incident_epoch_stale_observed'),
    v.literal('incident_canary_recovery_consumed'),
  ),
  rootRunId: v.string(),
  leafRunId: v.optional(v.string()),
  bindingId: v.optional(v.string()),
  providerReference: v.optional(v.string()),
  evidenceSource: v.optional(v.string()),
  disclosedDataFields: v.optional(v.array(v.string())),
  reportedCost: v.optional(money),
  financialObservation: v.optional(v.literal('provider_reported')),
  budgetAuthorityRef: v.optional(v.string()),
  budgetMaximumGrossMinor: v.optional(v.number()),
  spendReservationMinor: v.optional(v.number()),
  budgetCurrency: v.optional(v.string()),
  dataAuthorizationBudgetRef: v.optional(v.string()),
  disclosureGrantId: v.optional(v.string()),
  disclosureGrantDigest: v.optional(v.string()),
  disclosureRecipientBindingId: v.optional(v.string()),
  disclosurePurpose: v.optional(v.string()),
  disclosureDisposition: v.optional(v.literal('indeterminate')),
  cancellationRequestId: v.optional(v.string()),
  cancellationDisposition: v.optional(v.union(v.literal('accepted'), v.literal('rejected'), v.literal('indeterminate'))),
  cancellationReason: v.optional(v.string()),
  incidentId: v.optional(v.string()),
  freezeOrderId: v.optional(v.string()),
  recoveryGrantId: v.optional(v.string()),
  incidentEpochDigest: v.string(),
  stepGrantDigest: v.optional(v.string()),
  maximumCost: v.optional(money),
  attempt: v.optional(v.number()),
  expiresAt: v.optional(v.number()),
  enforcementPoint: v.optional(v.union(v.literal('provider_release'), v.literal('data_release'))),
  occurredAt: v.number(),
})
const rootRun = v.object({
  rootRunId: v.string(),
  quoteId: v.string(),
  quoteDigest: v.string(),
  incidentEpochDigest: v.string(),
  networkId: v.string(),
  executionMode: v.union(v.literal('simulation'), v.literal('live')),
  caller,
  state: v.union(v.literal('running'), v.literal('completed'), v.literal('outcome_unknown'), v.literal('failed'), v.literal('cancelled'), v.literal('incident_frozen')),
  enforcement: v.literal('enforced'),
  effectState: v.union(v.literal('not_started'), v.literal('released'), v.literal('committed'), v.literal('unknown'), v.literal('not_committed')),
  cost: v.object({
    authorized: money,
    quotedMaximum: money,
    reserved: v.union(money, v.null()),
    providerReported: v.union(money, v.null()),
    settled: v.union(money, v.null()),
  }),
  leaves: v.array(leaf),
  records: v.array(protocolRecord),
})

export const putQuote = internalMutation({
  args: { quote },
  handler: async (ctx, args) => {
    const requestQuote = await ctx.db
      .query('routingKernelQuotes')
      .withIndex('by_routingRequestId', (query) => query.eq('routingRequestId', args.quote.routingRequestId))
      .unique()
    if (requestQuote !== null && requestQuote.quoteId !== args.quote.quoteId) throw new Error('routing_request_identity_conflict')
    const existing = await ctx.db
      .query('routingKernelQuotes')
      .withIndex('by_quoteId', (query) => query.eq('quoteId', args.quote.quoteId))
      .unique()
    if (existing !== null) {
      if (existing.quoteDigest !== args.quote.quoteDigest) throw new Error('routing_quote_identity_conflict')
      return null
    }

    const graphs = [args.quote.selectedGraph, ...args.quote.alternatives]
    if (graphs.length > MAX_QUOTE_GRAPHS) throw new Error('routing_quote_graph_limit_exceeded')
    await ctx.db.insert('routingKernelQuotes', {
      incidentContract: 'epoch_v1',
      quoteId: args.quote.quoteId,
      quoteDigest: args.quote.quoteDigest,
      routingRequestId: args.quote.routingRequestId,
      networkId: args.quote.networkId,
      executionMode: args.quote.executionMode,
      agentId: args.quote.caller.agentId,
      principalId: args.quote.caller.principalId,
      query: args.quote.query,
      routingSnapshot: args.quote.routingSnapshot,
      organicDecision: args.quote.organicDecision,
      createdAt: args.quote.createdAt,
      expiresAt: args.quote.expiresAt,
      selectedBindingId: args.quote.selectedGraph.bindingId,
      effects: args.quote.effects,
      disclosures: args.quote.disclosures,
      enforcement: args.quote.enforcement,
      incidentEpochDigest: args.quote.incidentEpochDigest,
    })
    for (const [rank, candidate] of graphs.entries()) {
      if (candidate.steps.length === 0 || candidate.steps.length > MAX_STEPS_PER_GRAPH) throw new Error('routing_quote_step_limit_exceeded')
      await ctx.db.insert('routingKernelQuoteGraphs', {
        quoteId: args.quote.quoteId,
        rank,
        bindingId: candidate.bindingId,
        nodeId: candidate.nodeId,
        capabilityContractId: candidate.capabilityContractId,
        expectedCurrency: candidate.expectedCost.currency,
        expectedAmountMinor: candidate.expectedCost.amountMinor,
        maximumCurrency: candidate.maximumCost.currency,
        maximumAmountMinor: candidate.maximumCost.amountMinor,
        expectedLatencyMs: candidate.expectedLatencyMs,
        dataFields: candidate.dataFields,
        disclosures: candidate.disclosures,
      })
      for (const [stepRank, step] of candidate.steps.entries()) {
        await ctx.db.insert('routingKernelQuoteGraphSteps', {
          quoteId: args.quote.quoteId,
          graphRank: rank,
          stepRank,
          role: step.role,
          ...(step.trigger === undefined ? {} : { trigger: step.trigger }),
          bindingId: step.bindingId,
          nodeId: step.nodeId,
          capabilityContractId: step.capabilityContractId,
          expectedCurrency: step.expectedCost.currency,
          expectedAmountMinor: step.expectedCost.amountMinor,
          maximumCurrency: step.maximumCost.currency,
          maximumAmountMinor: step.maximumCost.amountMinor,
          expectedLatencyMs: step.expectedLatencyMs,
          ...(step.providerQuoteRef === undefined ? {} : { providerQuoteRef: step.providerQuoteRef }),
          ...(step.providerQuoteExpiresAt === undefined ? {} : { providerQuoteExpiresAt: step.providerQuoteExpiresAt }),
          ...(step.incidentEpochDigest === undefined ? {} : { incidentEpochDigest: step.incidentEpochDigest }),
          dataFields: step.dataFields,
          disclosures: step.disclosures,
        })
      }
    }
    return null
  },
})

export const getQuoteIdByRoutingRequestId = internalQuery({
  args: { routingRequestId: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query('routingKernelQuotes')
      .withIndex('by_routingRequestId', (query) => query.eq('routingRequestId', args.routingRequestId))
      .unique()
    return row?.quoteId ?? null
  },
})

export const getQuote = internalQuery({
  args: { quoteId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query('routingKernelQuotes')
      .withIndex('by_quoteId', (query) => query.eq('quoteId', args.quoteId))
      .unique()
    if (row === null || row.incidentContract !== 'epoch_v1' || row.incidentEpochDigest === undefined) return null
    const graphRows = await ctx.db
      .query('routingKernelQuoteGraphs')
      .withIndex('by_quoteId_rank', (query) => query.eq('quoteId', args.quoteId))
      .take(MAX_QUOTE_GRAPHS + 1)
    if (graphRows.length > MAX_QUOTE_GRAPHS) throw new Error('routing_quote_graph_limit_exceeded')
    const stepRows = await ctx.db
      .query('routingKernelQuoteGraphSteps')
      .withIndex('by_quoteId_graphRank_stepRank', (query) => query.eq('quoteId', args.quoteId))
      .take((MAX_QUOTE_GRAPHS * MAX_STEPS_PER_GRAPH) + 1)
    if (stepRows.length > MAX_QUOTE_GRAPHS * MAX_STEPS_PER_GRAPH) throw new Error('routing_quote_step_limit_exceeded')
    const graphs = graphRows.map((candidate) => ({
      bindingId: candidate.bindingId,
      nodeId: candidate.nodeId,
      capabilityContractId: candidate.capabilityContractId,
      expectedCost: { currency: candidate.expectedCurrency, amountMinor: candidate.expectedAmountMinor },
      maximumCost: { currency: candidate.maximumCurrency, amountMinor: candidate.maximumAmountMinor },
      expectedLatencyMs: candidate.expectedLatencyMs,
      dataFields: candidate.dataFields,
      disclosures: candidate.disclosures,
      steps: stepRows.filter((step) => step.graphRank === candidate.rank).map((step) => ({
        role: step.role,
        ...(step.trigger === undefined ? {} : { trigger: step.trigger }),
        bindingId: step.bindingId,
        nodeId: step.nodeId,
        capabilityContractId: step.capabilityContractId,
        expectedCost: { currency: step.expectedCurrency, amountMinor: step.expectedAmountMinor },
        maximumCost: { currency: step.maximumCurrency, amountMinor: step.maximumAmountMinor },
        expectedLatencyMs: step.expectedLatencyMs,
        ...(step.providerQuoteRef === undefined ? {} : { providerQuoteRef: step.providerQuoteRef }),
        ...(step.providerQuoteExpiresAt === undefined ? {} : { providerQuoteExpiresAt: step.providerQuoteExpiresAt }),
        ...(step.incidentEpochDigest === undefined ? {} : { incidentEpochDigest: step.incidentEpochDigest }),
        dataFields: step.dataFields,
        disclosures: step.disclosures,
      })),
    }))
    const selectedGraph = graphs.at(0)
    if (selectedGraph === undefined || selectedGraph.bindingId !== row.selectedBindingId) {
      throw new Error('routing_quote_selected_graph_missing')
    }
    if (row.routingSnapshot === undefined || row.organicDecision === undefined
      || row.routingSnapshot.compilerVersion !== 'routing-compiler:v2'
      || row.organicDecision.optimizerVersion !== 'organic-cost-latency-evidence:v2') return undefined
    return {
      quoteId: row.quoteId,
      quoteDigest: row.quoteDigest,
      routingRequestId: row.routingRequestId,
      networkId: row.networkId,
      executionMode: row.executionMode,
      caller: { agentId: row.agentId, principalId: row.principalId },
      query: row.query,
      routingSnapshot: {
        compilerVersion: 'routing-compiler:v2' as const,
        optimizerVersion: 'organic-cost-latency-evidence:v2' as const,
        networkPolicyVersion: 'network-policy:binding-evidence:v2' as const,
        networkId: row.routingSnapshot.networkId,
        caller: row.routingSnapshot.caller,
        normalizedQuery: row.routingSnapshot.normalizedQuery,
        constraints: {
          currency: row.routingSnapshot.constraints.currency,
          maximumSpendMinor: row.routingSnapshot.constraints.maximumSpendMinor,
          optimizeFor: row.routingSnapshot.constraints.optimizeFor === 'latency' ? 'latency' as const : 'cost' as const,
        },
        eligibleBindingIds: row.routingSnapshot.eligibleBindingIds,
        relevantBindingIds: row.routingSnapshot.relevantBindingIds,
        bindingEvidence: row.routingSnapshot.bindingEvidence.map((item) => {
          if (item.disposition === undefined || item.healthState === undefined || item.incidentRoutingEffect === undefined
            || item.executionReliabilityStatus === undefined) throw new Error('routing_quote_binding_evidence_invalid')
          return {
            bindingId: item.bindingId, disposition: item.disposition, healthState: item.healthState,
            incidentRoutingEffect: item.incidentRoutingEffect, executionReliabilityStatus: item.executionReliabilityStatus,
            ...(item.snapshotDigest === undefined ? {} : { snapshotDigest: item.snapshotDigest }),
            ...(item.healthEvidenceStanding === undefined ? {} : { healthEvidenceStanding: item.healthEvidenceStanding }),
            ...(item.incidentEvidenceStanding === undefined ? {} : { incidentEvidenceStanding: item.incidentEvidenceStanding }),
            ...(item.activeIncidentIds === undefined ? {} : { activeIncidentIds: item.activeIncidentIds }),
            ...(item.standingEvidenceStanding === undefined ? {} : { standingEvidenceStanding: item.standingEvidenceStanding }),
            ...(item.executionReliabilityLowerBoundPermille === undefined ? {} : { executionReliabilityLowerBoundPermille: item.executionReliabilityLowerBoundPermille }),
          }
        }),
      },
      organicDecision: {
        optimizerVersion: 'organic-cost-latency-evidence:v2' as const,
        optimizeFor: row.organicDecision.optimizeFor === 'latency' ? 'latency' as const : 'cost' as const,
        ...(row.organicDecision.selectedBindingId === undefined ? {} : { selectedBindingId: row.organicDecision.selectedBindingId }),
        factors: row.organicDecision.factors.map((factor) => {
          const evidence = factor.evidence
          if (evidence?.disposition === undefined || evidence.healthState === undefined || evidence.incidentRoutingEffect === undefined
            || evidence.executionReliabilityStatus === undefined) throw new Error('routing_quote_decision_evidence_invalid')
          return {
            bindingId: factor.bindingId, feasible: factor.feasible,
            ...(factor.expectedCostMinor === undefined ? {} : { expectedCostMinor: factor.expectedCostMinor }),
            ...(factor.maximumCostMinor === undefined ? {} : { maximumCostMinor: factor.maximumCostMinor }),
            ...(factor.expectedLatencyMs === undefined ? {} : { expectedLatencyMs: factor.expectedLatencyMs }),
            evidence: {
              bindingId: evidence.bindingId, disposition: evidence.disposition, healthState: evidence.healthState,
              incidentRoutingEffect: evidence.incidentRoutingEffect, executionReliabilityStatus: evidence.executionReliabilityStatus,
              ...(evidence.snapshotDigest === undefined ? {} : { snapshotDigest: evidence.snapshotDigest }),
              ...(evidence.healthEvidenceStanding === undefined ? {} : { healthEvidenceStanding: evidence.healthEvidenceStanding }),
              ...(evidence.incidentEvidenceStanding === undefined ? {} : { incidentEvidenceStanding: evidence.incidentEvidenceStanding }),
              ...(evidence.activeIncidentIds === undefined ? {} : { activeIncidentIds: evidence.activeIncidentIds }),
              ...(evidence.standingEvidenceStanding === undefined ? {} : { standingEvidenceStanding: evidence.standingEvidenceStanding }),
              ...(evidence.executionReliabilityLowerBoundPermille === undefined ? {} : { executionReliabilityLowerBoundPermille: evidence.executionReliabilityLowerBoundPermille }),
            },
            ...(factor.refusalReason === undefined ? {} : { refusalReason: factor.refusalReason }),
          }
        }),
      },
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      selectedGraph,
      alternatives: graphs.slice(1),
      effects: row.effects,
      disclosures: row.disclosures,
      enforcement: row.enforcement,
      incidentEpochDigest: row.incidentEpochDigest,
    }
  },
})

export const putAuthorization = internalMutation({
  args: { authorization },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('routingKernelAuthorizations')
      .withIndex('by_authorizationRef', (query) => query.eq('authorizationRef', args.authorization.authorizationRef))
      .unique()
    if (existing !== null) {
      const { _id, _creationTime, consumedAt: _consumedAt, incidentContract: _incidentContract, ...existingMaterial } = existing
      const { consumedAt: _candidateConsumedAt, ...candidateMaterial } = args.authorization
      if (canonicalAuthorityDigest(existingMaterial) !== canonicalAuthorityDigest(candidateMaterial)) throw new Error('route_authorization_identity_conflict')
      return null
    }
    await ctx.db.insert('routingKernelAuthorizations', { ...args.authorization, incidentContract: 'epoch_v1' })
    return null
  },
})

export const getAuthorization = internalQuery({
  args: { authorizationRef: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query('routingKernelAuthorizations')
      .withIndex('by_authorizationRef', (query) => query.eq('authorizationRef', args.authorizationRef))
      .unique()
    if (row === null || row.incidentContract !== 'epoch_v1' || row.incidentEpochDigest === undefined) return null
    return {
      authorizationRef: row.authorizationRef,
      budgetAuthorityRef: row.budgetAuthorityRef ?? `legacy-unbound:${row.authorizationRef}`,
      budgetMaximumGrossMinor: row.budgetMaximumGrossMinor ?? row.maximumSpendMinor,
      dataAuthorizationBudgetRef: row.dataAuthorizationBudgetRef ?? `legacy-unbound:${row.authorizationRef}`,
      protectedFieldSetId: row.protectedFieldSetId ?? 'legacy-unbound',
      dataBudgetMaximumAttempts: row.dataBudgetMaximumAttempts ?? 0,
      dataBudgetMaximumExposures: row.dataBudgetMaximumExposures ?? 0,
      allowedRecipientBindingIds: row.allowedRecipientBindingIds ?? [],
      allowedDisclosurePurposes: row.allowedDisclosurePurposes ?? [],
      maximumDisclosureAttempts: row.maximumDisclosureAttempts ?? 0,
      maximumDisclosureExposures: row.maximumDisclosureExposures ?? 0,
      quoteId: row.quoteId,
      quoteDigest: row.quoteDigest,
      principalId: row.principalId,
      agentId: row.agentId,
      maximumSpendMinor: row.maximumSpendMinor,
      currency: row.currency,
      expiresAt: row.expiresAt,
      ...(row.consumedAt === undefined ? {} : { consumedAt: row.consumedAt }),
      allowedDataFields: row.allowedDataFields,
      incidentEpochDigest: row.incidentEpochDigest,
    }
  },
})

export const getBudgetAuthority = internalQuery({
  args: { budgetAuthorityRef: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.query('routingKernelBudgetAuthorities')
      .withIndex('by_budgetAuthorityRef', (query) => query.eq('budgetAuthorityRef', args.budgetAuthorityRef))
      .unique()
    if (row === null) return null
    const { _id, _creationTime, ...authority } = row
    const reservations = await ctx.db.query('routingKernelSpendReservations')
      .withIndex('by_budgetAuthorityRef_state', (query) => query.eq('budgetAuthorityRef', args.budgetAuthorityRef))
      .collect()
    return { ...authority, reservations: reservations.map(({ _id: _reservationId, _creationTime: _created, ...reservation }) => reservation) }
  },
})

export const getDataAuthorizationBudget = internalQuery({
  args: { dataAuthorizationBudgetRef: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.query('routingKernelDataAuthorizationBudgets')
      .withIndex('by_dataAuthorizationBudgetRef', (query) => query.eq('dataAuthorizationBudgetRef', args.dataAuthorizationBudgetRef))
      .unique()
    if (row === null) return null
    const { _id, _creationTime, ...budget } = row
    const attempts = await ctx.db.query('routingKernelDisclosureAttempts')
      .withIndex('by_dataAuthorizationBudgetRef', (query) => query.eq('dataAuthorizationBudgetRef', args.dataAuthorizationBudgetRef))
      .collect()
    return { ...budget, attempts: attempts.map(({ _id: _attemptId, _creationTime: _created, disclosureGrantDigest: _digest, stepGrantId: _step, quoteId: _quote, quoteDigest: _quoteDigest, requestDigest: _requestDigest, ...attempt }) => attempt) }
  },
})

export const getExecution = internalQuery({
  args: { executionScope: v.string() },
  handler: async (ctx, args) => {
    const claim = await ctx.db
      .query('routingKernelExecutionClaims')
      .withIndex('by_executionScope', (query) => query.eq('executionScope', args.executionScope))
      .unique()
    if (claim === null) return null
    if (claim.state === 'pending') return { kind: 'pending' as const, rootRunId: claim.rootRunId, authorizationRef: claim.authorizationRef, requestDigest: claim.requestDigest, claimedAt: claim.createdAt, caller: { agentId: claim.agentId, principalId: claim.principalId }, ...(claim.cancellationRequestedAt === undefined ? {} : { cancellationRequestedAt: claim.cancellationRequestedAt }) }
    const run = await readRun(ctx.db, claim.rootRunId)
    if (run === null) throw new Error('completed_execution_run_missing')
    return { kind: 'completed' as const, run, authorizationRef: claim.authorizationRef, requestDigest: claim.requestDigest }
  },
})

export const claimExecution = internalMutation({
  args: {
    executionScope: v.string(),
    rootRunId: v.string(),
    authorizationRef: v.string(),
    consumedAt: v.number(),
    caller,
    requestDigest: v.string(),
    run: rootRun,
  },
  handler: async (ctx, args) => {
    if (args.run.rootRunId !== args.rootRunId || args.run.state !== 'running') throw new Error('invalid_execution_admission_checkpoint')
    const existing = await ctx.db
      .query('routingKernelExecutionClaims')
      .withIndex('by_executionScope', (query) => query.eq('executionScope', args.executionScope))
      .unique()
    if (existing !== null) {
      if (existing.state === 'pending') return { kind: 'pending' as const, rootRunId: existing.rootRunId, authorizationRef: existing.authorizationRef, requestDigest: existing.requestDigest, claimedAt: existing.createdAt, caller: { agentId: existing.agentId, principalId: existing.principalId }, ...(existing.cancellationRequestedAt === undefined ? {} : { cancellationRequestedAt: existing.cancellationRequestedAt }) }
      const run = await readRun(ctx.db, existing.rootRunId)
      if (run === null) throw new Error('completed_execution_run_missing')
      return { kind: 'completed' as const, run, authorizationRef: existing.authorizationRef, requestDigest: existing.requestDigest }
    }
    const authorizationRow = await ctx.db
      .query('routingKernelAuthorizations')
      .withIndex('by_authorizationRef', (query) => query.eq('authorizationRef', args.authorizationRef))
      .unique()
    if (authorizationRow === null) return { kind: 'refused' as const, reason: 'authorization_not_found' as const }
    if (authorizationRow.incidentContract !== 'epoch_v1' || authorizationRow.incidentEpochDigest === undefined) {
      return { kind: 'refused' as const, reason: 'incident_epoch_stale' as const }
    }
    if (authorizationRow.consumedAt !== undefined) return { kind: 'refused' as const, reason: 'authorization_consumed' as const }
    const admissionLeaf = args.run.leaves.at(0)
    if (admissionLeaf === undefined) throw new Error('root_admission_leaf_missing')
    const persistedSteps = await ctx.db.query('routingKernelQuoteGraphSteps')
      .withIndex('by_quoteId_graphRank_stepRank', (query) => query.eq('quoteId', args.run.quoteId))
      .take(MAX_STEPS_PER_GRAPH + 1)
    const selectedSteps = persistedSteps.filter((step) => step.graphRank === 0).sort((left, right) => left.stepRank - right.stepRank)
    if (selectedSteps.length === 0 || selectedSteps.length > MAX_STEPS_PER_GRAPH
      || selectedSteps.some((step) => step.incidentEpochDigest === undefined)) {
      return { kind: 'refused' as const, reason: 'incident_epoch_stale' as const }
    }
    let primaryEpochDigest: string | undefined
    for (const step of selectedSteps) {
      const incident = await evaluateIncidentInTransaction(ctx.db, {
        networkId: args.run.networkId, principalId: args.caller.principalId, agentId: args.caller.agentId,
        bindingId: step.bindingId, capabilityContractId: step.capabilityContractId,
      }, 'root_admission')
      if (incident.kind === 'frozen') return { kind: 'refused' as const, reason: 'incident_frozen' as const }
      if (step.incidentEpochDigest !== incident.epochDigest) return { kind: 'refused' as const, reason: 'incident_epoch_stale' as const }
      if (step.bindingId === admissionLeaf.bindingId && step.capabilityContractId === admissionLeaf.capabilityContractId) {
        primaryEpochDigest = incident.epochDigest
      }
    }
    if (primaryEpochDigest === undefined || authorizationRow.incidentEpochDigest !== primaryEpochDigest) {
      return { kind: 'refused' as const, reason: 'incident_epoch_stale' as const }
    }
    if (authorizationRow.budgetAuthorityRef === undefined || authorizationRow.budgetMaximumGrossMinor === undefined) {
      return { kind: 'refused' as const, reason: 'budget_authority_unavailable' as const }
    }
    const budgetAuthorityRef = authorizationRow.budgetAuthorityRef
    const budget = await ctx.db.query('routingKernelBudgetAuthorities')
      .withIndex('by_budgetAuthorityRef', (query) => query.eq('budgetAuthorityRef', budgetAuthorityRef))
      .unique()
    if (budget === null || budget.budgetContract !== 'cumulative_v1' || budget.status !== 'active' || budget.expiresAt <= args.consumedAt
      || budget.agentId !== args.caller.agentId || budget.principalId !== args.caller.principalId
      || budget.networkId !== args.run.networkId || budget.currency !== args.run.cost.quotedMaximum.currency
      || budget.maximumGrossMinor !== authorizationRow.budgetMaximumGrossMinor) {
      return { kind: 'refused' as const, reason: 'budget_authority_unavailable' as const }
    }
    const reservationAmount = args.run.cost.quotedMaximum.amountMinor
    if (budget.reservedGrossMinor + budget.committedGrossMinor + reservationAmount > budget.maximumGrossMinor) {
      return { kind: 'refused' as const, reason: 'budget_capacity_exceeded' as const }
    }
    const disclosureAttempts = authorizationRow.maximumDisclosureAttempts ?? 0
    const disclosureExposures = authorizationRow.maximumDisclosureExposures ?? 0
    let dataBudget: Doc<'routingKernelDataAuthorizationBudgets'> | null = null
    if (disclosureAttempts > 0 || disclosureExposures > 0) {
      const dataAuthorizationBudgetRef = authorizationRow.dataAuthorizationBudgetRef
      if (dataAuthorizationBudgetRef === undefined) return { kind: 'refused' as const, reason: 'data_authority_unavailable' as const }
      dataBudget = await ctx.db.query('routingKernelDataAuthorizationBudgets')
        .withIndex('by_dataAuthorizationBudgetRef', (query) => query.eq('dataAuthorizationBudgetRef', dataAuthorizationBudgetRef)).unique()
      if (dataBudget === null || dataBudget.dataContract !== 'cumulative_v1' || dataBudget.status !== 'active' || dataBudget.expiresAt <= args.consumedAt
        || dataBudget.agentId !== args.caller.agentId || dataBudget.principalId !== args.caller.principalId || dataBudget.networkId !== args.run.networkId) {
        return { kind: 'refused' as const, reason: 'data_authority_unavailable' as const }
      }
      const reservedAttempts = dataBudget.reservedAttempts ?? 0
      const reservedExposures = dataBudget.reservedExposures ?? 0
      if (reservedAttempts + dataBudget.consumedAttempts + disclosureAttempts > dataBudget.maximumAttempts
        || reservedExposures + dataBudget.consumedExposures + disclosureExposures > dataBudget.maximumExposures) {
        return { kind: 'refused' as const, reason: 'data_authority_capacity_exceeded' as const }
      }
    }

    await ctx.db.patch(authorizationRow._id, { consumedAt: args.consumedAt })
    await ctx.db.patch(budget._id, { reservedGrossMinor: budget.reservedGrossMinor + reservationAmount, revision: budget.revision + 1, updatedAt: args.consumedAt })
    await ctx.db.insert('routingKernelSpendReservations', {
      budgetAuthorityRef: budget.budgetAuthorityRef, rootRunId: args.rootRunId, amountMinor: reservationAmount,
      currency: budget.currency, state: 'reserved', reservedAt: args.consumedAt,
    })
    if (dataBudget !== null) {
      await ctx.db.patch(dataBudget._id, {
        reservedAttempts: (dataBudget.reservedAttempts ?? 0) + disclosureAttempts,
        reservedExposures: (dataBudget.reservedExposures ?? 0) + disclosureExposures,
        revision: dataBudget.revision + 1, updatedAt: args.consumedAt,
      })
      await ctx.db.insert('routingKernelDataAllocations', {
        dataAuthorizationBudgetRef: dataBudget.dataAuthorizationBudgetRef, rootRunId: args.rootRunId,
        allocatedAttempts: disclosureAttempts, allocatedExposures: disclosureExposures,
        remainingAttempts: disclosureAttempts, remainingExposures: disclosureExposures,
        state: 'active', createdAt: args.consumedAt,
      })
    }
    await ctx.db.insert('routingKernelExecutionClaims', {
      executionScope: args.executionScope,
      rootRunId: args.rootRunId,
      authorizationRef: args.authorizationRef,
      agentId: args.caller.agentId,
      principalId: args.caller.principalId,
      requestDigest: args.requestDigest,
      state: 'pending',
      createdAt: args.consumedAt,
    })
    await insertRun(ctx.db, args.run, args.consumedAt)
    return {
      kind: 'claimed' as const,
      authorization: {
        authorizationRef: authorizationRow.authorizationRef,
        budgetAuthorityRef: authorizationRow.budgetAuthorityRef ?? `legacy-unbound:${authorizationRow.authorizationRef}`,
        budgetMaximumGrossMinor: authorizationRow.budgetMaximumGrossMinor ?? authorizationRow.maximumSpendMinor,
        dataAuthorizationBudgetRef: authorizationRow.dataAuthorizationBudgetRef ?? `legacy-unbound:${authorizationRow.authorizationRef}`,
        protectedFieldSetId: authorizationRow.protectedFieldSetId ?? 'legacy-unbound',
        dataBudgetMaximumAttempts: authorizationRow.dataBudgetMaximumAttempts ?? 0,
        dataBudgetMaximumExposures: authorizationRow.dataBudgetMaximumExposures ?? 0,
        allowedRecipientBindingIds: authorizationRow.allowedRecipientBindingIds ?? [],
        allowedDisclosurePurposes: authorizationRow.allowedDisclosurePurposes ?? [],
        maximumDisclosureAttempts: authorizationRow.maximumDisclosureAttempts ?? 0,
        maximumDisclosureExposures: authorizationRow.maximumDisclosureExposures ?? 0,
        quoteId: authorizationRow.quoteId,
        quoteDigest: authorizationRow.quoteDigest,
        principalId: authorizationRow.principalId,
        agentId: authorizationRow.agentId,
        maximumSpendMinor: authorizationRow.maximumSpendMinor,
        currency: authorizationRow.currency,
        expiresAt: authorizationRow.expiresAt,
        consumedAt: args.consumedAt,
        allowedDataFields: authorizationRow.allowedDataFields,
        incidentEpochDigest: authorizationRow.incidentEpochDigest,
      },
    }
  },
})

export const requestCancellation = internalMutation({
  args: { rootRunId: v.string(), caller, requestedAt: v.number() },
  handler: async (ctx, args) => {
    const claim = await ctx.db.query('routingKernelExecutionClaims').withIndex('by_rootRunId', (query) => query.eq('rootRunId', args.rootRunId)).unique()
    if (claim === null) return 'not_found' as const
    if (claim.agentId !== args.caller.agentId || claim.principalId !== args.caller.principalId) return 'not_owner' as const
    if (claim.state !== 'pending') return 'not_possible' as const
    const run = await readRun(ctx.db, args.rootRunId)
    if (run === null) return 'not_found' as const
    const incident = await evaluateIncidentInTransaction(ctx.db, runIncidentScope(run), 'cancel')
    if (incident.kind === 'frozen') return incidentRefusal(incident)
    const released = await ctx.db.query('routingKernelStepReleases').withIndex('by_rootRunId_leafRunId', (query) => query.eq('rootRunId', args.rootRunId)).first()
    if (released !== null) return 'not_possible' as const
    await ctx.db.patch(claim._id, { cancellationRequestedAt: args.requestedAt })
    return 'requested' as const
  },
})

export const getProviderCancellation = internalQuery({
  args: { rootRunId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.query('routingKernelProviderCancellations').withIndex('by_rootRunId', (query) => query.eq('rootRunId', args.rootRunId)).unique()
    if (row === null) return null
    const { _id, _creationTime, ...cancellation } = row
    return cancellation
  },
})

export const claimProviderCancellation = internalMutation({
  args: { cancellation: providerCancellation, run: rootRun },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query('routingKernelProviderCancellations').withIndex('by_rootRunId', (query) => query.eq('rootRunId', args.cancellation.rootRunId)).unique()
    if (existing !== null) return sameCancellationIdentity(existing, args.cancellation) ? 'existing' as const : 'conflict' as const
    if (args.cancellation.disposition !== 'pending' || args.run.rootRunId !== args.cancellation.rootRunId) throw new Error('invalid_provider_cancellation_claim')
    const incident = await evaluateIncidentInTransaction(ctx.db, runIncidentScope(args.run), 'cancel')
    if (incident.kind === 'frozen') return incidentRefusal(incident)
    await ctx.db.insert('routingKernelProviderCancellations', args.cancellation)
    await replaceRun(ctx.db, args.run, args.cancellation.requestedAt)
    return 'claimed' as const
  },
})

export const resolveProviderCancellation = internalMutation({
  args: { cancellation: providerCancellation, run: rootRun },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query('routingKernelProviderCancellations').withIndex('by_rootRunId', (query) => query.eq('rootRunId', args.cancellation.rootRunId)).unique()
    if (existing === null) return 'not_found' as const
    if (existing.disposition !== 'pending' && existing.disposition !== 'indeterminate') return 'already_resolved' as const
    if (!sameCancellationIdentity(existing, args.cancellation) || args.cancellation.disposition === 'pending' || args.cancellation.resolvedAt === undefined) {
      throw new Error('invalid_provider_cancellation_resolution')
    }
    const currentRun = await readRun(ctx.db, args.cancellation.rootRunId)
    if (currentRun === null) return 'not_found' as const
    const incident = await evaluateIncidentInTransaction(ctx.db, runIncidentScope(currentRun), 'reconcile')
    if (incident.kind === 'frozen') return incidentRefusal(incident)
    await ctx.db.patch(existing._id, {
      disposition: args.cancellation.disposition, resolvedAt: args.cancellation.resolvedAt,
      ...(args.cancellation.providerReference === undefined ? {} : { providerReference: args.cancellation.providerReference }),
      ...(args.cancellation.reason === undefined ? {} : { reason: args.cancellation.reason }),
    })
    await replaceRun(ctx.db, args.run, args.cancellation.resolvedAt)
    return 'resolved' as const
  },
})

export const authorizeProviderRelease = internalMutation({
  args: {
    grant: stepGrant, disclosureGrant: v.optional(disclosureGrant), releasedAt: v.number(), run: rootRun,
    canaryRecoveryGrantId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { grant, disclosureGrant: disclosure } = args
    if (!isValidStepGrant(grant) || args.releasedAt >= grant.expiresAt
      || (grant.disclosedDataFields.length === 0) !== (disclosure === undefined)
      || (disclosure !== undefined && (!isValidDisclosureGrant(disclosure) || args.releasedAt >= disclosure.expiresAt))) return 'release_conflict' as const
    const persistedSteps = await ctx.db.query('routingKernelQuoteGraphSteps')
      .withIndex('by_quoteId_graphRank_stepRank', (query) => query.eq('quoteId', grant.quoteId))
      .take(MAX_STEPS_PER_GRAPH + 1)
    const selectedSteps = persistedSteps.filter((step) => step.graphRank === 0).sort((left, right) => left.stepRank - right.stepRank)
    if (selectedSteps.length === 0 || selectedSteps.length > MAX_STEPS_PER_GRAPH
      || selectedSteps.some((step) => step.incidentEpochDigest === undefined)) {
      return { kind: 'incident_epoch_stale' as const, epochDigest: grant.incidentEpochDigest }
    }
    for (const selectedStep of selectedSteps) {
      const admission = await evaluateIncidentInTransaction(ctx.db, {
        networkId: args.run.networkId, principalId: args.run.caller.principalId, agentId: args.run.caller.agentId,
        bindingId: selectedStep.bindingId, capabilityContractId: selectedStep.capabilityContractId,
      }, 'root_admission')
      if (admission.kind === 'frozen') return incidentRefusal(admission)
      if (selectedStep.incidentEpochDigest !== admission.epochDigest) {
        return { kind: 'incident_epoch_stale' as const, epochDigest: admission.epochDigest }
      }
    }
    const incidentScope = {
      networkId: args.run.networkId, principalId: args.run.caller.principalId, agentId: args.run.caller.agentId,
      bindingId: grant.bindingId, capabilityContractId: grant.capabilityContractId,
    }
    const providerIncident = await evaluateIncidentInTransaction(ctx.db, incidentScope, 'provider_release')
    if (providerIncident.kind === 'frozen' && args.canaryRecoveryGrantId === undefined) {
      return {
        kind: 'incident_frozen' as const, freezeOrderId: providerIncident.freezeOrderId,
        incidentId: providerIncident.incidentId, reason: providerIncident.reason, epochDigest: providerIncident.epochDigest,
      }
    }
    if (grant.incidentEpochDigest !== providerIncident.epochDigest) {
      return { kind: 'incident_epoch_stale' as const, epochDigest: providerIncident.epochDigest }
    }
    let dataIncident: Awaited<ReturnType<typeof evaluateIncidentInTransaction>> | undefined
    if (disclosure !== undefined) {
      dataIncident = await evaluateIncidentInTransaction(ctx.db, incidentScope, 'data_release')
      if (dataIncident.kind === 'frozen' && args.canaryRecoveryGrantId === undefined) {
        return {
          kind: 'incident_frozen' as const, freezeOrderId: dataIncident.freezeOrderId,
          incidentId: dataIncident.incidentId, reason: dataIncident.reason, epochDigest: dataIncident.epochDigest,
        }
      }
      if (disclosure.incidentEpochDigest !== dataIncident.epochDigest) {
        return { kind: 'incident_epoch_stale' as const, epochDigest: dataIncident.epochDigest }
      }
    }
    const existing = await ctx.db.query('routingKernelStepReleases').withIndex('by_stepGrantId', (query) => query.eq('stepGrantId', grant.stepGrantId)).unique()
    if (existing !== null) {
      const existingGrant = storedStepGrant(existing)
      if (existingGrant === undefined || !sameStepGrant(existingGrant, grant)) return 'release_conflict' as const
      const existingDisclosure = await ctx.db.query('routingKernelDisclosureAttempts').withIndex('by_rootRunId_leafRunId', (query) => query.eq('rootRunId', grant.rootRunId).eq('leafRunId', grant.leafRunId)).unique()
      if (disclosure === undefined) return existingDisclosure === null ? 'already_released' as const : 'release_conflict' as const
      const existingDisclosureGrant = existingDisclosure === null ? undefined : storedDisclosureGrant(existingDisclosure)
      return existingDisclosureGrant !== undefined && sameDisclosureGrant(existingDisclosureGrant, disclosure)
        ? 'already_released' as const : 'release_conflict' as const
    }
    if (args.run.rootRunId !== grant.rootRunId || args.run.quoteId !== grant.quoteId || args.run.quoteDigest !== grant.quoteDigest || args.run.state !== 'running') throw new Error('invalid_provider_release_checkpoint')
    const releasedLeaf = args.run.leaves.find((item) => item.leafRunId === grant.leafRunId)
    if (releasedLeaf?.stepGrantId !== grant.stepGrantId || releasedLeaf.bindingId !== grant.bindingId
      || releasedLeaf.nodeId !== grant.nodeId || releasedLeaf.capabilityContractId !== grant.capabilityContractId
      || releasedLeaf.state !== 'released') {
      throw new Error('provider_release_checkpoint_mismatch')
    }
    const claim = await ctx.db.query('routingKernelExecutionClaims').withIndex('by_rootRunId', (query) => query.eq('rootRunId', grant.rootRunId)).unique()
    if (claim === null || claim.state !== 'pending') return 'not_found' as const
    if (claim.requestDigest !== grant.requestDigest) return 'release_conflict' as const
    if (claim.cancellationRequestedAt !== undefined) return 'cancelled' as const
    const quotedStep = selectedSteps.find((candidate) => candidate.bindingId === grant.bindingId)
    if (quotedStep === undefined || quotedStep.nodeId !== grant.nodeId || quotedStep.capabilityContractId !== grant.capabilityContractId
      || quotedStep.maximumCurrency !== grant.maximumCost.currency || quotedStep.maximumAmountMinor !== grant.maximumCost.amountMinor
      || grant.disclosedDataFields.some((field) => !quotedStep.dataFields.includes(field))
      || grant.maximumCost.currency !== args.run.cost.authorized.currency
      || grant.maximumCost.amountMinor > args.run.cost.authorized.amountMinor) return 'release_conflict' as const
    const frozenDecision = providerIncident.kind === 'frozen' ? providerIncident
      : dataIncident?.kind === 'frozen' ? dataIncident : undefined
    if (args.canaryRecoveryGrantId !== undefined && frozenDecision === undefined) return 'release_conflict' as const
    if (frozenDecision !== undefined && !await authorizeCanaryRelease(
      ctx.db, args.canaryRecoveryGrantId, incidentScope, grant.stepGrantId, args.releasedAt, {
        quoteId: grant.quoteId, quoteDigest: grant.quoteDigest, authorizationRef: claim.authorizationRef,
        requestDigest: grant.requestDigest, bindingId: grant.bindingId,
        capabilityContractId: grant.capabilityContractId,
        maximumSpendMinor: args.run.cost.authorized.amountMinor, currency: args.run.cost.authorized.currency,
        allowedDataFields: [...grant.disclosedDataFields].sort(),
      },
    )) {
      return {
        kind: 'incident_frozen' as const, freezeOrderId: frozenDecision.freezeOrderId,
        incidentId: frozenDecision.incidentId, reason: frozenDecision.reason, epochDigest: frozenDecision.epochDigest,
      }
    }
    if (disclosure !== undefined) {
      if (disclosure.rootRunId !== grant.rootRunId || disclosure.leafRunId !== grant.leafRunId
        || disclosure.stepGrantId !== grant.stepGrantId || disclosure.quoteId !== grant.quoteId
        || disclosure.quoteDigest !== grant.quoteDigest || disclosure.requestDigest !== grant.requestDigest
        || disclosure.recipientBindingId !== grant.bindingId || disclosure.purpose !== grant.capabilityContractId
        || JSON.stringify(disclosure.fields) !== JSON.stringify(grant.disclosedDataFields)) return 'release_conflict' as const
      const authorization = await ctx.db.query('routingKernelAuthorizations').withIndex('by_authorizationRef', (query) => query.eq('authorizationRef', claim.authorizationRef)).unique()
      if (authorization === null || authorization.dataAuthorizationBudgetRef !== disclosure.dataAuthorizationBudgetRef
        || !(authorization.allowedRecipientBindingIds ?? []).includes(disclosure.recipientBindingId)
        || !(authorization.allowedDisclosurePurposes ?? []).includes(disclosure.purpose)
        || disclosure.fields.some((field) => !authorization.allowedDataFields.includes(field))) return 'release_conflict' as const
      const dataBudget = await ctx.db.query('routingKernelDataAuthorizationBudgets').withIndex('by_dataAuthorizationBudgetRef', (query) => query.eq('dataAuthorizationBudgetRef', disclosure.dataAuthorizationBudgetRef)).unique()
      if (dataBudget === null || dataBudget.dataContract !== 'cumulative_v1' || dataBudget.status !== 'active' || dataBudget.expiresAt <= args.releasedAt
        || dataBudget.agentId !== claim.agentId || dataBudget.principalId !== claim.principalId || dataBudget.networkId !== args.run.networkId
        || !dataBudget.permittedRecipientBindingIds.includes(disclosure.recipientBindingId)
        || !dataBudget.permittedPurposes.includes(disclosure.purpose)
        || disclosure.fields.some((field) => !dataBudget.permittedFields.includes(field))) return 'release_conflict' as const
      const allocation = await ctx.db.query('routingKernelDataAllocations').withIndex('by_rootRunId', (query) => query.eq('rootRunId', grant.rootRunId)).unique()
      if (allocation === null || allocation.state !== 'active' || allocation.dataAuthorizationBudgetRef !== dataBudget.dataAuthorizationBudgetRef
        || allocation.remainingAttempts < 1 || allocation.remainingExposures < 1) return 'release_conflict' as const
      await ctx.db.patch(dataBudget._id, {
        reservedAttempts: (dataBudget.reservedAttempts ?? 0) - 1,
        reservedExposures: (dataBudget.reservedExposures ?? 0) - 1,
        consumedAttempts: dataBudget.consumedAttempts + 1, consumedExposures: dataBudget.consumedExposures + 1,
        revision: dataBudget.revision + 1, updatedAt: args.releasedAt,
      })
      await ctx.db.patch(allocation._id, { remainingAttempts: allocation.remainingAttempts - 1, remainingExposures: allocation.remainingExposures - 1 })
      await ctx.db.insert('routingKernelDisclosureAttempts', {
        incidentContract: 'epoch_v1',
        ...disclosure, fields: disclosure.fields, disposition: 'indeterminate', consumedAt: args.releasedAt,
      })
    }
    await ctx.db.insert('routingKernelStepReleases', {
      incidentContract: 'epoch_v1',
      grantContract: 'exact_v2_sha256',
      rootRunId: grant.rootRunId, leafRunId: grant.leafRunId, stepGrantId: grant.stepGrantId,
      quoteId: grant.quoteId, quoteDigest: grant.quoteDigest, requestDigest: grant.requestDigest,
      bindingId: grant.bindingId, nodeId: grant.nodeId, capabilityContractId: grant.capabilityContractId,
      maximumCostCurrency: grant.maximumCost.currency, maximumCostAmountMinor: grant.maximumCost.amountMinor,
      disclosedDataFields: grant.disclosedDataFields, attempt: grant.attempt, issuedAt: grant.issuedAt,
      expiresAt: grant.expiresAt, enforcementPoint: grant.enforcementPoint, grantDigest: grant.grantDigest,
      incidentEpochDigest: grant.incidentEpochDigest,
      releasedAt: args.releasedAt,
    })
    await replaceRun(ctx.db, args.run, args.releasedAt)
    return 'released' as const
  },
})

async function authorizeCanaryRelease(
  db: GenericDatabaseWriter<DataModel>,
  recoveryGrantId: string | undefined,
  scope: { networkId: string; principalId: string; agentId: string; bindingId: string; capabilityContractId: string },
  stepGrantId: string,
  usedAt: number,
  canaryExecution: {
    quoteId: string; quoteDigest: string; authorizationRef: string; requestDigest: string
    bindingId: string; capabilityContractId: string; maximumSpendMinor: number
    currency: string; allowedDataFields: string[]
  },
): Promise<boolean> {
  if (recoveryGrantId === undefined) return false
  const result = await consumeRecoveryGrantInTransaction(db, {
    recoveryGrantId, lane: 'canary', scope, operationRef: stepGrantId, usedAt, canaryExecution,
  })
  return result.kind === 'recovery_authorized'
}

export const resolveDisclosureAttempt = internalMutation({
  args: { disclosureGrantId: v.string(), disposition: v.union(v.literal('not_released'), v.literal('released')), resolvedAt: v.number() },
  handler: async (ctx, args) => {
    const attempt = await ctx.db.query('routingKernelDisclosureAttempts').withIndex('by_disclosureGrantId', (query) => query.eq('disclosureGrantId', args.disclosureGrantId)).unique()
    if (attempt === null) return 'not_found' as const
    if (attempt.disposition !== 'indeterminate') return 'already_resolved' as const
    const budget = await ctx.db.query('routingKernelDataAuthorizationBudgets').withIndex('by_dataAuthorizationBudgetRef', (query) => query.eq('dataAuthorizationBudgetRef', attempt.dataAuthorizationBudgetRef)).unique()
    if (budget === null) throw new Error('data_authorization_budget_missing')
    await ctx.db.patch(attempt._id, { disposition: args.disposition, resolvedAt: args.resolvedAt })
    await ctx.db.patch(budget._id, {
      consumedExposures: budget.consumedExposures - (args.disposition === 'not_released' ? 1 : 0),
      revision: budget.revision + 1, updatedAt: args.resolvedAt,
    })
    return 'resolved' as const
  },
})

export const completeExecution = internalMutation({
  args: { executionScope: v.string(), run: rootRun },
  handler: async (ctx, args) => {
    if (args.run.leaves.length > MAX_LEAVES_PER_ROOT) throw new Error('root_leaf_limit_exceeded')
    if (args.run.records.length > MAX_RECORDS_PER_ROOT) throw new Error('root_record_limit_exceeded')
    const claim = await ctx.db
      .query('routingKernelExecutionClaims')
      .withIndex('by_executionScope', (query) => query.eq('executionScope', args.executionScope))
      .unique()
    if (claim === null || claim.rootRunId !== args.run.rootRunId) throw new Error('execution_claim_missing')
    if (claim.state === 'completed') return null

    const completedAt = args.run.records.at(-1)?.occurredAt ?? claim.createdAt
    await replaceRun(ctx.db, args.run, completedAt)
    await ctx.db.patch(claim._id, {
      state: 'completed',
      completedAt,
    })
    await resolveStoredBudget(ctx.db, args.run, completedAt)
    await releaseStoredDataAllocation(ctx.db, args.run.rootRunId, completedAt)
    return null
  },
})

export const reconcileRun = internalMutation({
  args: { rootRunId: v.string(), leafRunId: v.string(), run: rootRun },
  handler: async (ctx, args) => {
    const current = await ctx.db.query('routingKernelRootRuns').withIndex('by_rootRunId', (query) => query.eq('rootRunId', args.rootRunId)).unique()
    if (current === null) return 'not_found' as const
    if (current.state !== 'outcome_unknown') return 'not_unknown' as const
    if (args.run.rootRunId !== args.rootRunId || args.run.state === 'outcome_unknown') throw new Error('invalid_reconciliation_transition')
    const currentRun = await readRun(ctx.db, args.rootRunId)
    if (currentRun === null) return 'not_found' as const
    const leaf = currentRun.leaves.find((candidate) => candidate.leafRunId === args.leafRunId && candidate.state === 'outcome_unknown')
    if (leaf === undefined) return 'not_unknown' as const
    const incident = await evaluateIncidentInTransaction(ctx.db, runIncidentScope(currentRun, leaf), 'reconcile')
    if (incident.kind === 'frozen') return incidentRefusal(incident)
    await replaceRun(ctx.db, args.run, args.run.records.at(-1)?.occurredAt ?? current.updatedAt)
    await resolveStoredBudget(ctx.db, args.run, args.run.records.at(-1)?.occurredAt ?? current.updatedAt)
    await releaseStoredDataAllocation(ctx.db, args.run.rootRunId, args.run.records.at(-1)?.occurredAt ?? current.updatedAt)
    return 'applied' as const
  },
})

export const getRun = internalQuery({
  args: { rootRunId: v.string() },
  handler: async (ctx, args) => await readRun(ctx.db, args.rootRunId),
})

export const migrateAttributedRunCosts = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const page = await ctx.db.query('routingKernelRootRuns').paginate({ cursor: args.cursor, numItems: 100 })
    let migrated = 0
    for (const row of page.page) {
      if (row.costContract === 'attributed_v2') continue
      const graph = await ctx.db.query('routingKernelQuoteGraphs')
        .withIndex('by_quoteId_rank', (query) => query.eq('quoteId', row.quoteId).eq('rank', 0))
        .unique()
      const quotedMaximumCurrency = graph?.maximumCurrency ?? row.authorizedCurrency
      const quotedMaximumAmountMinor = graph?.maximumAmountMinor ?? row.authorizedAmountMinor
      const discardedAt = Date.now()
      await ctx.db.patch(row._id, {
        costContract: 'attributed_v2', quotedMaximumCurrency, quotedMaximumAmountMinor,
        ...(row.heldCurrency === undefined || row.heldAmountMinor === undefined
          ? { reservedCurrency: undefined, reservedAmountMinor: undefined }
          : { reservedCurrency: row.heldCurrency, reservedAmountMinor: row.heldAmountMinor }),
        providerReportedCurrency: undefined, providerReportedAmountMinor: undefined,
        settledCurrency: undefined, settledAmountMinor: undefined,
        ...(row.committedCurrency === undefined || row.committedAmountMinor === undefined
          ? {}
          : { legacyCommittedEstimateDiscardedAt: discardedAt }),
        committedCurrency: undefined, committedAmountMinor: undefined,
        heldCurrency: undefined, heldAmountMinor: undefined,
      })
      migrated += 1
    }
    return { migrated, isDone: page.isDone, continueCursor: page.continueCursor }
  },
})

async function readRun(db: GenericDatabaseReader<DataModel>, rootRunId: string) {
  const root = await db.query('routingKernelRootRuns')
    .withIndex('by_rootRunId', (query) => query.eq('rootRunId', rootRunId))
    .unique()
  if (root === null || root.incidentContract !== 'epoch_v1' || root.incidentEpochDigest === undefined) return null
  const leaves = await db.query('routingKernelLeafRuns')
    .withIndex('by_rootRunId_leafRunId', (query) => query.eq('rootRunId', rootRunId))
    .take(MAX_LEAVES_PER_ROOT + 1)
  const records = await db.query('routingKernelProtocolRecords')
    .withIndex('by_rootRunId_sequence', (query) => query.eq('rootRunId', rootRunId))
    .take(MAX_RECORDS_PER_ROOT + 1)
  if (leaves.length > MAX_LEAVES_PER_ROOT) throw new Error('root_leaf_limit_exceeded')
  if (records.length > MAX_RECORDS_PER_ROOT) throw new Error('root_record_limit_exceeded')
  if (records.some((record) => record.incidentContract !== 'epoch_v1' || record.incidentEpochDigest === undefined)) return null
  return {
    rootRunId: root.rootRunId,
    quoteId: root.quoteId,
    quoteDigest: root.quoteDigest,
    incidentEpochDigest: root.incidentEpochDigest,
    networkId: root.networkId,
    executionMode: root.executionMode,
    caller: { agentId: root.agentId, principalId: root.principalId },
    state: root.state,
    enforcement: root.enforcement,
    effectState: root.effectState,
    cost: {
      authorized: { currency: root.authorizedCurrency, amountMinor: root.authorizedAmountMinor },
      quotedMaximum: { currency: root.quotedMaximumCurrency, amountMinor: root.quotedMaximumAmountMinor },
      reserved: root.reservedCurrency === undefined || root.reservedAmountMinor === undefined
        ? null
        : { currency: root.reservedCurrency, amountMinor: root.reservedAmountMinor },
      providerReported: root.providerReportedCurrency === undefined || root.providerReportedAmountMinor === undefined
        ? null
        : { currency: root.providerReportedCurrency, amountMinor: root.providerReportedAmountMinor },
      settled: root.settledCurrency === undefined || root.settledAmountMinor === undefined
        ? null
        : { currency: root.settledCurrency, amountMinor: root.settledAmountMinor },
    },
    leaves: leaves.map((item) => ({
      leafRunId: item.leafRunId,
      stepGrantId: item.stepGrantId,
      bindingId: item.bindingId,
      nodeId: item.nodeId,
      capabilityContractId: item.capabilityContractId,
      state: item.state,
      attemptDisposition: item.attemptDisposition,
      effectState: item.effectState,
      enforcement: item.enforcement,
      ...(item.providerReference === undefined ? {} : { providerReference: item.providerReference }),
      ...(item.outcome === undefined ? {} : { outcome: item.outcome }),
      ...(item.failureReason === undefined ? {} : { failureReason: item.failureReason }),
    })),
    records: records.map((item) => {
      if (item.incidentContract !== 'epoch_v1' || item.incidentEpochDigest === undefined) {
        throw new Error('root_record_incident_epoch_missing')
      }
      return {
      recordId: item.recordId,
      type: item.type,
      rootRunId: item.rootRunId,
      ...(item.leafRunId === undefined ? {} : { leafRunId: item.leafRunId }),
      ...(item.bindingId === undefined ? {} : { bindingId: item.bindingId }),
      ...(item.providerReference === undefined ? {} : { providerReference: item.providerReference }),
      ...(item.evidenceSource === undefined ? {} : { evidenceSource: item.evidenceSource }),
      ...(item.disclosedDataFields === undefined ? {} : { disclosedDataFields: item.disclosedDataFields }),
      ...(item.reportedCost === undefined ? {} : { reportedCost: item.reportedCost }),
      ...(item.financialObservation === undefined ? {} : { financialObservation: item.financialObservation }),
      ...(item.budgetAuthorityRef === undefined ? {} : { budgetAuthorityRef: item.budgetAuthorityRef }),
      ...(item.budgetMaximumGrossMinor === undefined ? {} : { budgetMaximumGrossMinor: item.budgetMaximumGrossMinor }),
      ...(item.spendReservationMinor === undefined ? {} : { spendReservationMinor: item.spendReservationMinor }),
      ...(item.budgetCurrency === undefined ? {} : { budgetCurrency: item.budgetCurrency }),
      ...(item.dataAuthorizationBudgetRef === undefined ? {} : { dataAuthorizationBudgetRef: item.dataAuthorizationBudgetRef }),
      ...(item.disclosureGrantId === undefined ? {} : { disclosureGrantId: item.disclosureGrantId }),
      ...(item.disclosureGrantDigest === undefined ? {} : { disclosureGrantDigest: item.disclosureGrantDigest }),
      ...(item.disclosureRecipientBindingId === undefined ? {} : { disclosureRecipientBindingId: item.disclosureRecipientBindingId }),
      ...(item.disclosurePurpose === undefined ? {} : { disclosurePurpose: item.disclosurePurpose }),
      ...(item.disclosureDisposition === undefined ? {} : { disclosureDisposition: item.disclosureDisposition }),
      ...(item.cancellationRequestId === undefined ? {} : { cancellationRequestId: item.cancellationRequestId }),
      ...(item.cancellationDisposition === undefined ? {} : { cancellationDisposition: item.cancellationDisposition }),
      ...(item.cancellationReason === undefined ? {} : { cancellationReason: item.cancellationReason }),
      incidentEpochDigest: item.incidentEpochDigest,
      ...(item.stepGrantDigest === undefined ? {} : { stepGrantDigest: item.stepGrantDigest }),
      ...(item.maximumCost === undefined ? {} : { maximumCost: item.maximumCost }),
      ...(item.attempt === undefined ? {} : { attempt: item.attempt }),
      ...(item.expiresAt === undefined ? {} : { expiresAt: item.expiresAt }),
      ...(item.enforcementPoint === undefined ? {} : { enforcementPoint: item.enforcementPoint }),
      occurredAt: item.occurredAt,
      }
    }),
  }
}

async function resolveStoredBudget(db: GenericDatabaseWriter<DataModel>, run: Infer<typeof rootRun>, resolvedAt: number) {
  const reservation = await db.query('routingKernelSpendReservations')
    .withIndex('by_rootRunId', (query) => query.eq('rootRunId', run.rootRunId))
    .unique()
  if (reservation === null || reservation.state !== 'reserved') return
  if (run.effectState === 'unknown' || run.effectState === 'released') return
  const authority = await db.query('routingKernelBudgetAuthorities')
    .withIndex('by_budgetAuthorityRef', (query) => query.eq('budgetAuthorityRef', reservation.budgetAuthorityRef))
    .unique()
  if (authority === null) throw new Error('budget_authority_missing')
  const committed = run.effectState === 'committed'
  await db.patch(reservation._id, { state: committed ? 'committed' : 'released', resolvedAt })
  await db.patch(authority._id, {
    reservedGrossMinor: authority.reservedGrossMinor - reservation.amountMinor,
    committedGrossMinor: authority.committedGrossMinor + (committed ? reservation.amountMinor : 0),
    revision: authority.revision + 1,
    updatedAt: resolvedAt,
  })
}

async function releaseStoredDataAllocation(db: GenericDatabaseWriter<DataModel>, rootRunId: string, releasedAt: number) {
  const allocation = await db.query('routingKernelDataAllocations').withIndex('by_rootRunId', (query) => query.eq('rootRunId', rootRunId)).unique()
  if (allocation === null || allocation.state !== 'active') return
  const budget = await db.query('routingKernelDataAuthorizationBudgets')
    .withIndex('by_dataAuthorizationBudgetRef', (query) => query.eq('dataAuthorizationBudgetRef', allocation.dataAuthorizationBudgetRef)).unique()
  if (budget === null) throw new Error('data_authorization_budget_missing')
  await db.patch(budget._id, {
    reservedAttempts: (budget.reservedAttempts ?? 0) - allocation.remainingAttempts,
    reservedExposures: (budget.reservedExposures ?? 0) - allocation.remainingExposures,
    revision: budget.revision + 1, updatedAt: releasedAt,
  })
  await db.patch(allocation._id, { remainingAttempts: 0, remainingExposures: 0, state: 'released', releasedAt })
}

type RootRun = Infer<typeof rootRun>

async function insertRun(db: GenericDatabaseWriter<DataModel>, run: RootRun, updatedAt: number) {
  if (run.leaves.length > MAX_LEAVES_PER_ROOT) throw new Error('root_leaf_limit_exceeded')
  if (run.records.length > MAX_RECORDS_PER_ROOT) throw new Error('root_record_limit_exceeded')
  validateSubmittedProtocolRecords(run)
  await assertProtocolRecordIdsAvailable(db, run.records)
  await db.insert('routingKernelRootRuns', rootRow(run, updatedAt))
  for (const item of run.leaves) await db.insert('routingKernelLeafRuns', { rootRunId: run.rootRunId, ...item })
  for (const [sequence, item] of run.records.entries()) await db.insert('routingKernelProtocolRecords', { ...item, incidentContract: 'epoch_v1', sequence })
}

async function replaceRun(db: GenericDatabaseWriter<DataModel>, run: RootRun, updatedAt: number) {
  if (run.leaves.length > MAX_LEAVES_PER_ROOT) throw new Error('root_leaf_limit_exceeded')
  if (run.records.length > MAX_RECORDS_PER_ROOT) throw new Error('root_record_limit_exceeded')
  const current = await db.query('routingKernelRootRuns').withIndex('by_rootRunId', (query) => query.eq('rootRunId', run.rootRunId)).unique()
  if (current === null) throw new Error('running_execution_checkpoint_missing')
  const leaves = await db.query('routingKernelLeafRuns').withIndex('by_rootRunId_leafRunId', (query) => query.eq('rootRunId', run.rootRunId)).collect()
  const existingRecords = await db.query('routingKernelProtocolRecords').withIndex('by_rootRunId_sequence', (query) => query.eq('rootRunId', run.rootRunId)).collect()
  const suffix = await validateProtocolRecordAppend(db, run, existingRecords)
  for (const row of leaves) await db.delete(row._id)
  await db.replace(current._id, rootRow(run, updatedAt))
  for (const item of run.leaves) await db.insert('routingKernelLeafRuns', { rootRunId: run.rootRunId, ...item })
  for (const [offset, item] of suffix.entries()) {
    await db.insert('routingKernelProtocolRecords', { ...item, incidentContract: 'epoch_v1', sequence: existingRecords.length + offset })
  }
}

type ProtocolRecord = RootRun['records'][number]
type StoredProtocolRecord = Readonly<{
  incidentContract?: 'epoch_v1' | 'legacy_quarantined'
  sequence: number
  recordId: string
  type?: unknown
  rootRunId: string
  incidentEpochDigest?: string | undefined
  leafRunId?: string | undefined
  bindingId?: string | undefined
  providerReference?: string | undefined
  evidenceSource?: string | undefined
  disclosedDataFields?: string[] | undefined
  reportedCost?: { currency: string; amountMinor: number } | undefined
  financialObservation?: 'provider_reported' | undefined
  budgetAuthorityRef?: string | undefined
  budgetMaximumGrossMinor?: number | undefined
  spendReservationMinor?: number | undefined
  budgetCurrency?: string | undefined
  dataAuthorizationBudgetRef?: string | undefined
  disclosureGrantId?: string | undefined
  disclosureGrantDigest?: string | undefined
  disclosureRecipientBindingId?: string | undefined
  disclosurePurpose?: string | undefined
  disclosureDisposition?: 'indeterminate' | undefined
  cancellationRequestId?: string | undefined
  cancellationDisposition?: 'accepted' | 'rejected' | 'indeterminate' | undefined
  cancellationReason?: string | undefined
  stepGrantDigest?: string | undefined
  maximumCost?: { currency: string; amountMinor: number } | undefined
  attempt?: number | undefined
  expiresAt?: number | undefined
  enforcementPoint?: 'provider_release' | 'data_release' | undefined
  occurredAt: number
}>

async function validateProtocolRecordAppend(
  db: GenericDatabaseWriter<DataModel>,
  run: RootRun,
  existing: readonly StoredProtocolRecord[],
): Promise<readonly ProtocolRecord[]> {
  validateSubmittedProtocolRecords(run)
  if (run.records.length < existing.length) throw new Error('protocol_record_prefix_changed')
  for (const [sequence, stored] of existing.entries()) {
    const submitted = run.records.at(sequence)
    if (submitted === undefined || stored.sequence !== sequence || protocolRecordDigest(stored) !== protocolRecordDigest(submitted)) {
      throw new Error('protocol_record_prefix_changed')
    }
  }
  const suffix = run.records.slice(existing.length)
  await assertProtocolRecordIdsAvailable(db, suffix)
  return suffix
}

function validateSubmittedProtocolRecords(run: RootRun): void {
  const ids = new Set<string>()
  for (const item of run.records) {
    if (item.rootRunId !== run.rootRunId) throw new Error('protocol_record_root_mismatch')
    if (ids.has(item.recordId)) throw new Error('protocol_record_id_conflict')
    ids.add(item.recordId)
  }
}

async function assertProtocolRecordIdsAvailable(db: GenericDatabaseWriter<DataModel>, records: readonly ProtocolRecord[]): Promise<void> {
  for (const item of records) {
    const existing = await db.query('routingKernelProtocolRecords').withIndex('by_recordId', (query) => query.eq('recordId', item.recordId)).unique()
    if (existing !== null) throw new Error('protocol_record_id_conflict')
  }
}

function protocolRecordDigest(item: ProtocolRecord | StoredProtocolRecord): string {
  return canonicalAuthorityDigest({
    recordId: String(item.recordId),
    type: String(item.type),
    rootRunId: String(item.rootRunId),
    ...(item.leafRunId === undefined ? {} : { leafRunId: String(item.leafRunId) }),
    ...(item.bindingId === undefined ? {} : { bindingId: String(item.bindingId) }),
    ...(item.providerReference === undefined ? {} : { providerReference: String(item.providerReference) }),
    ...(item.evidenceSource === undefined ? {} : { evidenceSource: String(item.evidenceSource) }),
    ...(item.disclosedDataFields === undefined ? {} : { disclosedDataFields: [...item.disclosedDataFields] }),
    ...(item.reportedCost === undefined ? {} : { reportedCost: item.reportedCost }),
    ...(item.financialObservation === undefined ? {} : { financialObservation: String(item.financialObservation) }),
    ...(item.budgetAuthorityRef === undefined ? {} : { budgetAuthorityRef: String(item.budgetAuthorityRef) }),
    ...(item.budgetMaximumGrossMinor === undefined ? {} : { budgetMaximumGrossMinor: Number(item.budgetMaximumGrossMinor) }),
    ...(item.spendReservationMinor === undefined ? {} : { spendReservationMinor: Number(item.spendReservationMinor) }),
    ...(item.budgetCurrency === undefined ? {} : { budgetCurrency: String(item.budgetCurrency) }),
    ...(item.dataAuthorizationBudgetRef === undefined ? {} : { dataAuthorizationBudgetRef: String(item.dataAuthorizationBudgetRef) }),
    ...(item.disclosureGrantId === undefined ? {} : { disclosureGrantId: String(item.disclosureGrantId) }),
    ...(item.disclosureGrantDigest === undefined ? {} : { disclosureGrantDigest: String(item.disclosureGrantDigest) }),
    ...(item.disclosureRecipientBindingId === undefined ? {} : { disclosureRecipientBindingId: String(item.disclosureRecipientBindingId) }),
    ...(item.disclosurePurpose === undefined ? {} : { disclosurePurpose: String(item.disclosurePurpose) }),
    ...(item.disclosureDisposition === undefined ? {} : { disclosureDisposition: String(item.disclosureDisposition) }),
    ...(item.cancellationRequestId === undefined ? {} : { cancellationRequestId: String(item.cancellationRequestId) }),
    ...(item.cancellationDisposition === undefined ? {} : { cancellationDisposition: String(item.cancellationDisposition) }),
    ...(item.cancellationReason === undefined ? {} : { cancellationReason: String(item.cancellationReason) }),
    ...(item.incidentEpochDigest === undefined ? {} : { incidentEpochDigest: String(item.incidentEpochDigest) }),
    ...(item.stepGrantDigest === undefined ? {} : { stepGrantDigest: String(item.stepGrantDigest) }),
    ...(item.maximumCost === undefined ? {} : { maximumCost: item.maximumCost }),
    ...(item.attempt === undefined ? {} : { attempt: Number(item.attempt) }),
    ...(item.expiresAt === undefined ? {} : { expiresAt: Number(item.expiresAt) }),
    ...(item.enforcementPoint === undefined ? {} : { enforcementPoint: String(item.enforcementPoint) }),
    occurredAt: Number(item.occurredAt),
  })
}

function storedStepGrant(row: {
  incidentContract?: 'epoch_v1' | 'legacy_quarantined'
  grantContract?: 'legacy_opaque' | 'exact_v1' | 'exact_v2_sha256'; stepGrantId: string; rootRunId: string; leafRunId: string
  quoteId?: string; quoteDigest?: string; requestDigest?: string; bindingId: string; nodeId?: string; capabilityContractId?: string
  maximumCostCurrency?: string; maximumCostAmountMinor?: number; disclosedDataFields?: string[]; attempt?: number
  issuedAt?: number; expiresAt?: number; enforcementPoint?: 'provider_release'; grantDigest?: string
  incidentEpochDigest?: string
}) {
  if (row.incidentContract !== 'epoch_v1' || row.grantContract !== 'exact_v2_sha256' || row.quoteId === undefined || row.quoteDigest === undefined || row.requestDigest === undefined
    || row.nodeId === undefined || row.capabilityContractId === undefined || row.maximumCostCurrency === undefined
    || row.maximumCostAmountMinor === undefined || row.disclosedDataFields === undefined || row.attempt === undefined
    || row.issuedAt === undefined || row.expiresAt === undefined || row.enforcementPoint === undefined || row.grantDigest === undefined
    || row.incidentEpochDigest === undefined) return undefined
  return {
    stepGrantId: row.stepGrantId, rootRunId: row.rootRunId, leafRunId: row.leafRunId,
    quoteId: row.quoteId, quoteDigest: row.quoteDigest, requestDigest: row.requestDigest,
    bindingId: row.bindingId, nodeId: row.nodeId, capabilityContractId: row.capabilityContractId,
    maximumCost: { currency: row.maximumCostCurrency, amountMinor: row.maximumCostAmountMinor },
    disclosedDataFields: row.disclosedDataFields, attempt: row.attempt, issuedAt: row.issuedAt,
    expiresAt: row.expiresAt, enforcementPoint: row.enforcementPoint, grantDigest: row.grantDigest,
    incidentEpochDigest: row.incidentEpochDigest,
  }
}

function storedDisclosureGrant(row: {
  incidentContract?: 'epoch_v1' | 'legacy_quarantined'
  disclosureGrantId: string; disclosureGrantDigest: string; dataAuthorizationBudgetRef: string
  rootRunId: string; leafRunId: string; stepGrantId: string; quoteId: string; quoteDigest: string; requestDigest: string
  recipientBindingId: string; purpose: string; fields: string[]; projectionDigest: string; attempt: number
  issuedAt: number; expiresAt: number; enforcementPoint: 'data_release'; consumedAt: number
  incidentEpochDigest?: string
}) {
  if (row.incidentContract !== 'epoch_v1' || row.incidentEpochDigest === undefined) return undefined
  return {
    disclosureGrantId: row.disclosureGrantId, disclosureGrantDigest: row.disclosureGrantDigest,
    dataAuthorizationBudgetRef: row.dataAuthorizationBudgetRef, rootRunId: row.rootRunId, leafRunId: row.leafRunId,
    stepGrantId: row.stepGrantId, quoteId: row.quoteId, quoteDigest: row.quoteDigest, requestDigest: row.requestDigest,
    recipientBindingId: row.recipientBindingId, purpose: row.purpose, fields: row.fields,
    projectionDigest: row.projectionDigest, attempt: row.attempt, issuedAt: row.issuedAt,
    expiresAt: row.expiresAt, enforcementPoint: row.enforcementPoint,
    incidentEpochDigest: row.incidentEpochDigest,
  }
}

function sameCancellationIdentity(
  left: Pick<Doc<'routingKernelProviderCancellations'>, 'cancellationRequestId' | 'rootRunId' | 'leafRunId' | 'stepGrantId' | 'bindingId' | 'idempotencyKey'>,
  right: Infer<typeof providerCancellation>,
) {
  return left.cancellationRequestId === right.cancellationRequestId && left.rootRunId === right.rootRunId
    && left.leafRunId === right.leafRunId && left.stepGrantId === right.stepGrantId
    && left.bindingId === right.bindingId && left.idempotencyKey === right.idempotencyKey
}

function runIncidentScope(run: Infer<typeof rootRun>, leaf?: Infer<typeof rootRun>['leaves'][number]) {
  if (leaf !== undefined) return {
    networkId: run.networkId,
    principalId: run.caller.principalId,
    agentId: run.caller.agentId,
    bindingId: leaf.bindingId,
    capabilityContractId: leaf.capabilityContractId,
  }
  const bindingIds = [...new Set(run.leaves.map((leaf) => leaf.bindingId))]
  const capabilityContractIds = [...new Set(run.leaves.map((leaf) => leaf.capabilityContractId))]
  return {
    networkId: run.networkId,
    principalId: run.caller.principalId,
    agentId: run.caller.agentId,
    ...(bindingIds.length === 1 ? { bindingId: bindingIds[0] } : {}),
    ...(capabilityContractIds.length === 1 ? { capabilityContractId: capabilityContractIds[0] } : {}),
  }
}

function incidentRefusal(incident: Readonly<{
  freezeOrderId: string
  incidentId: string
  reason: string
  epochDigest: string
}>) {
  return {
    kind: 'incident_frozen' as const,
    freezeOrderId: incident.freezeOrderId,
    incidentId: incident.incidentId,
    reason: incident.reason,
    epochDigest: incident.epochDigest,
  }
}

function rootRow(run: RootRun, updatedAt: number) {
  return {
    incidentContract: 'epoch_v1' as const,
    costContract: 'attributed_v2' as const,
    rootRunId: run.rootRunId,
    quoteId: run.quoteId,
    quoteDigest: run.quoteDigest,
    incidentEpochDigest: run.incidentEpochDigest,
    networkId: run.networkId,
    executionMode: run.executionMode,
    agentId: run.caller.agentId,
    principalId: run.caller.principalId,
    state: run.state,
    enforcement: run.enforcement,
    effectState: run.effectState,
    authorizedCurrency: run.cost.authorized.currency,
    authorizedAmountMinor: run.cost.authorized.amountMinor,
    quotedMaximumCurrency: run.cost.quotedMaximum.currency,
    quotedMaximumAmountMinor: run.cost.quotedMaximum.amountMinor,
    ...(run.cost.reserved === null ? {} : { reservedCurrency: run.cost.reserved.currency, reservedAmountMinor: run.cost.reserved.amountMinor }),
    ...(run.cost.providerReported === null ? {} : { providerReportedCurrency: run.cost.providerReported.currency, providerReportedAmountMinor: run.cost.providerReported.amountMinor }),
    ...(run.cost.settled === null ? {} : { settledCurrency: run.cost.settled.currency, settledAmountMinor: run.cost.settled.amountMinor }),
    updatedAt,
    ...(run.state === 'running' ? {} : { completedAt: updatedAt }),
  }
}
