import type { CandidateGraphQuote, KernelStore, RootRunSnapshot, RouteQuote } from '@/modules/routing-kernel/public'

import { internal } from './_generated/api'
import type { ActionCtx } from './_generated/server'

type KernelStoreActionContext = Pick<ActionCtx, 'runQuery' | 'runMutation'>

export function createConvexKernelStore(ctx: KernelStoreActionContext): KernelStore {
  return Object.freeze({
    incidentRecoveryAuthority: 'atomic' as const,
    putQuote: async (quote) => {
      await ctx.runMutation(internal.routingKernelStore.putQuote, { quote: writableQuote(quote) })
    },
    getQuote: async (quoteId) => {
      const result = await ctx.runQuery(internal.routingKernelStore.getQuote, { quoteId })
      return result ?? undefined
    },
    putAuthorization: async (authorization) => {
      await ctx.runMutation(internal.routingKernelStore.putAuthorization, { authorization: { ...authorization, allowedDataFields: [...authorization.allowedDataFields], allowedRecipientBindingIds: [...authorization.allowedRecipientBindingIds], allowedDisclosurePurposes: [...authorization.allowedDisclosurePurposes] } })
    },
    getAuthorization: async (authorizationRef) => {
      const result = await ctx.runQuery(internal.routingKernelStore.getAuthorization, { authorizationRef })
      return result ?? undefined
    },
    getBudgetAuthority: async (budgetAuthorityRef) => {
      const result = await ctx.runQuery(internal.routingKernelStore.getBudgetAuthority, { budgetAuthorityRef })
      if (result === null) return undefined
      return {
        budgetAuthorityRef: result.budgetAuthorityRef,
        sourceGrantId: result.sourceGrantId,
        agentId: result.agentId,
        principalId: result.principalId,
        networkId: result.networkId,
        railProfileId: result.railProfileId,
        currency: result.currency,
        maximumGrossMinor: result.maximumGrossMinor,
        reservedGrossMinor: result.reservedGrossMinor,
        committedGrossMinor: result.committedGrossMinor,
        expiresAt: result.expiresAt,
        status: result.status === 'revoked' ? 'revoked' : 'active',
        revision: result.revision,
        reservations: result.reservations.map((reservation) => ({
          rootRunId: reservation.rootRunId,
          amountMinor: reservation.amountMinor,
          state: reservation.state === 'committed' ? 'committed' : reservation.state === 'released' ? 'released' : 'reserved',
          reservedAt: reservation.reservedAt,
          ...(reservation.resolvedAt === undefined ? {} : { resolvedAt: reservation.resolvedAt }),
        })),
      }
    },
    getDataAuthorizationBudget: async (dataAuthorizationBudgetRef) => {
      const result = await ctx.runQuery(internal.routingKernelStore.getDataAuthorizationBudget, { dataAuthorizationBudgetRef })
      if (result === null) return undefined
      return {
        dataAuthorizationBudgetRef: result.dataAuthorizationBudgetRef, sourceGrantId: result.sourceGrantId,
        agentId: result.agentId, principalId: result.principalId, networkId: result.networkId,
        protectedFieldSetId: result.protectedFieldSetId, permittedFields: result.permittedFields,
        permittedRecipientBindingIds: result.permittedRecipientBindingIds, permittedPurposes: result.permittedPurposes,
        maximumAttempts: result.maximumAttempts, maximumExposures: result.maximumExposures,
        consumedAttempts: result.consumedAttempts, consumedExposures: result.consumedExposures,
        expiresAt: result.expiresAt, status: result.status === 'revoked' ? 'revoked' : 'active', revision: result.revision,
        attempts: result.attempts.map((attempt) => ({
          disclosureGrantId: attempt.disclosureGrantId, rootRunId: attempt.rootRunId, leafRunId: attempt.leafRunId,
          attempt: attempt.attempt, recipientBindingId: attempt.recipientBindingId, purpose: attempt.purpose,
          fields: attempt.fields, projectionDigest: attempt.projectionDigest,
          disposition: attempt.disposition === 'not_released' ? 'not_released' : attempt.disposition === 'released' ? 'released' : 'indeterminate',
          consumedAt: attempt.consumedAt, ...(attempt.resolvedAt === undefined ? {} : { resolvedAt: attempt.resolvedAt }),
        })),
      }
    },
    getRun: async (rootRunId) => {
      const result = await ctx.runQuery(internal.routingKernelStore.getRun, { rootRunId })
      return result ?? undefined
    },
    getExecution: async (executionScope) => {
      const result = await ctx.runQuery(internal.routingKernelStore.getExecution, { executionScope })
      return result ?? undefined
    },
    claimExecution: async (input) => await ctx.runMutation(internal.routingKernelStore.claimExecution, { ...input, run: writableRun(input.run) }),
    completeExecution: async (executionScope, run) => {
      await ctx.runMutation(internal.routingKernelStore.completeExecution, { executionScope, run: writableRun(run) })
    },
    reconcileRun: async (rootRunId, leafRunId, run) => await ctx.runMutation(internal.routingKernelStore.reconcileRun, { rootRunId, leafRunId, run: writableRun(run) }),
    requestCancellation: async (rootRunId, caller, requestedAt) => await ctx.runMutation(internal.routingKernelStore.requestCancellation, { rootRunId, caller, requestedAt }),
    authorizeProviderRelease: async (input) => await ctx.runMutation(internal.routingKernelStore.authorizeProviderRelease, {
      grant: { ...input.grant, maximumCost: { ...input.grant.maximumCost }, disclosedDataFields: [...input.grant.disclosedDataFields] },
      ...(input.disclosureGrant === undefined ? {} : { disclosureGrant: { ...input.disclosureGrant, fields: [...input.disclosureGrant.fields] } }),
      releasedAt: input.releasedAt,
      run: writableRun(input.run),
      ...(input.canaryRecoveryGrantId === undefined ? {} : { canaryRecoveryGrantId: input.canaryRecoveryGrantId }),
    }),
    resolveDisclosureAttempt: async (disclosureGrantId, disposition, resolvedAt) => await ctx.runMutation(internal.routingKernelStore.resolveDisclosureAttempt, { disclosureGrantId, disposition, resolvedAt }),
    getProviderCancellation: async (rootRunId) => {
      const result = await ctx.runQuery(internal.routingKernelStore.getProviderCancellation, { rootRunId })
      if (result === null) return undefined
      return {
        cancellationRequestId: result.cancellationRequestId, rootRunId: result.rootRunId, leafRunId: result.leafRunId,
        stepGrantId: result.stepGrantId, bindingId: result.bindingId, idempotencyKey: result.idempotencyKey,
        disposition: result.disposition === 'accepted' ? 'accepted' as const : result.disposition === 'rejected' ? 'rejected' as const
          : result.disposition === 'indeterminate' ? 'indeterminate' as const : 'pending' as const,
        requestedAt: result.requestedAt,
        ...(result.resolvedAt === undefined ? {} : { resolvedAt: result.resolvedAt }),
        ...(result.providerReference === undefined ? {} : { providerReference: result.providerReference }),
        ...(result.reason === undefined ? {} : { reason: result.reason }),
      }
    },
    claimProviderCancellation: async (cancellation, run) => await ctx.runMutation(internal.routingKernelStore.claimProviderCancellation, {
      cancellation: { ...cancellation }, run: writableRun(run),
    }),
    resolveProviderCancellation: async (cancellation, run) => await ctx.runMutation(internal.routingKernelStore.resolveProviderCancellation, {
      cancellation: { ...cancellation }, run: writableRun(run),
    }),
  })
}

function writableQuote(quote: RouteQuote) {
  return {
    ...quote,
    caller: { ...quote.caller },
    routingSnapshot: {
      ...quote.routingSnapshot,
      caller: { ...quote.routingSnapshot.caller },
      constraints: { ...quote.routingSnapshot.constraints },
      eligibleBindingIds: [...quote.routingSnapshot.eligibleBindingIds],
      relevantBindingIds: [...quote.routingSnapshot.relevantBindingIds],
      bindingEvidence: quote.routingSnapshot.bindingEvidence.map(({ activeIncidentIds, ...item }) => ({ ...item, ...(activeIncidentIds === undefined ? {} : { activeIncidentIds: [...activeIncidentIds] }) })),
    },
    organicDecision: {
      ...quote.organicDecision,
      factors: quote.organicDecision.factors.map((factor) => {
        const { activeIncidentIds, ...evidence } = factor.evidence
        return { ...factor, evidence: { ...evidence, ...(activeIncidentIds === undefined ? {} : { activeIncidentIds: [...activeIncidentIds] }) } }
      }),
    },
    selectedGraph: writableGraph(quote.selectedGraph),
    alternatives: quote.alternatives.map(writableGraph),
    effects: [...quote.effects],
    disclosures: [...quote.disclosures],
  }
}

function writableGraph(graph: CandidateGraphQuote) {
  return {
    ...graph,
    expectedCost: { ...graph.expectedCost },
    maximumCost: { ...graph.maximumCost },
    dataFields: [...graph.dataFields],
    disclosures: [...graph.disclosures],
    steps: graph.steps.map((step) => ({
      ...step,
      expectedCost: { ...step.expectedCost },
      maximumCost: { ...step.maximumCost },
      dataFields: [...step.dataFields],
      disclosures: [...step.disclosures],
    })),
  }
}

function writableRun(run: RootRunSnapshot) {
  return {
    ...run,
    caller: { ...run.caller },
    cost: {
      authorized: { ...run.cost.authorized },
      quotedMaximum: { ...run.cost.quotedMaximum },
      reserved: run.cost.reserved === null ? null : { ...run.cost.reserved },
      providerReported: run.cost.providerReported === null ? null : { ...run.cost.providerReported },
      settled: run.cost.settled === null ? null : { ...run.cost.settled },
    },
    leaves: run.leaves.map((leaf) => ({
      ...leaf,
      ...(leaf.outcome === undefined ? {} : { outcome: { ...leaf.outcome } }),
    })),
    records: run.records.map((record) => {
      const { disclosedDataFields, reportedCost, ...rest } = record
      return {
        ...rest,
        ...(disclosedDataFields === undefined ? {} : { disclosedDataFields: [...disclosedDataFields] }),
        ...(reportedCost === undefined ? {} : { reportedCost: { ...reportedCost } }),
      }
    }),
  }
}
