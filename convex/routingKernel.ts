import { v } from 'convex/values'

import { createRuntimeId } from '@/modules/common/runtime-id'
import { authorizeRouteForPrincipal } from '@/modules/routing-kernel/authorization'
import {
  createNeutralRoutingKernel,
  type CapabilityBindingAdapter,
  type NeutralRoutingKernel,
} from '@/modules/routing-kernel/application'
import type { BindingRoutingEvidenceSnapshot, EvidenceStanding } from '@/modules/routing-kernel/runtime'
import { createHttpCapabilityBinding } from '@/modules/routing-kernel/http-capability-binding'

import { action, internalAction, type ActionCtx } from './_generated/server'
import { createConvexKernelStore } from './routingKernelStoreAdapter'
import { internal } from './_generated/api'

const routeAuthorization = v.object({
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
})
const authorizationResult = v.union(
  v.object({ kind: v.literal('authorized'), authorization: routeAuthorization }),
  v.object({ kind: v.literal('authorization_refused'), reason: v.string() }),
)

const cancellationReconciliationResult = v.union(
  v.object({
    kind: v.literal('provider_cancellation_reconciled'), disposition: v.union(v.literal('accepted'), v.literal('rejected')),
    rootRunId: v.string(), state: v.union(v.literal('running'), v.literal('completed'), v.literal('outcome_unknown'), v.literal('failed'), v.literal('cancelled'), v.literal('incident_frozen')),
  }),
  v.object({ kind: v.literal('cancellation_reconciliation_refused'), reason: v.string() }),
)

export const reconcileProviderCancellationInternal = internalAction({
  args: {
    cancellationRequestId: v.string(), rootRunId: v.string(), leafRunId: v.string(), stepGrantId: v.string(), idempotencyKey: v.string(),
    recoveryGrantId: v.optional(v.string()),
    evidence: v.object({
      source: v.string(), observedAt: v.number(), disposition: v.union(v.literal('accepted'), v.literal('rejected')),
      providerReference: v.optional(v.string()), reason: v.optional(v.string()),
    }),
  },
  returns: cancellationReconciliationResult,
  handler: async (ctx, args) => {
    const result = await createRegisteredRoutingKernel(ctx).authority.reconcileProviderCancellation(args)
    return result.kind === 'provider_cancellation_reconciled'
      ? { kind: result.kind, disposition: result.disposition, rootRunId: result.run.rootRunId, state: result.run.state }
      : result
  },
})

export const authorizeRoute = action({
  args: {
    quoteId: v.string(),
    quoteDigest: v.string(),
    maximumSpendMinor: v.number(),
    currency: v.string(),
    expiresAt: v.number(),
    allowedDataFields: v.optional(v.array(v.string())),
  },
  returns: authorizationResult,
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) return { kind: 'authorization_refused' as const, reason: 'authentication_required' }

    const kernel = createRegisteredRoutingKernel(ctx)
    const quote = await createConvexKernelStore(ctx).getQuote(args.quoteId)
    if (quote === undefined) return { kind: 'authorization_refused' as const, reason: 'quote_not_found' }
    const grant = await ctx.runQuery(internal.routingKernelAgentGrants.resolve, { agentId: quote.caller.agentId, networkId: quote.networkId, now: Date.now() })
    if (grant === null || grant.principalId !== identity.tokenIdentifier) return { kind: 'authorization_refused' as const, reason: 'budget_authority_unavailable' }
    const budget = await ctx.runQuery(internal.routingKernelAgentGrants.resolveBudgetAuthority, { sourceGrantId: grant.grantId, networkId: quote.networkId, now: Date.now() })
    if (budget === null) return { kind: 'authorization_refused' as const, reason: 'budget_authority_unavailable' }
    const dataBudget = await ctx.runQuery(internal.routingKernelAgentGrants.resolveDataAuthorizationBudget, { sourceGrantId: grant.grantId, networkId: quote.networkId, now: Date.now() })
    if (dataBudget === null) return { kind: 'authorization_refused' as const, reason: 'data_authorization_unavailable' }
    const result = await authorizeRouteForPrincipal({
      ...args,
      budgetAuthorityRef: budget.budgetAuthorityRef,
      budgetMaximumGrossMinor: budget.maximumGrossMinor,
      dataAuthorizationBudgetRef: dataBudget.dataAuthorizationBudgetRef,
      protectedFieldSetId: dataBudget.protectedFieldSetId,
      dataBudgetMaximumAttempts: dataBudget.maximumAttempts,
      dataBudgetMaximumExposures: dataBudget.maximumExposures,
      allowedRecipientBindingIds: dataBudget.permittedRecipientBindingIds,
      allowedDisclosurePurposes: dataBudget.permittedPurposes,
      maximumDisclosureAttempts: dataBudget.maximumAttempts,
      maximumDisclosureExposures: dataBudget.maximumExposures,
      principalId: identity.tokenIdentifier,
      agentId: quote.caller.agentId,
      now: Date.now(),
    }, {
      getQuote: async (quoteId) => await createConvexKernelStore(ctx).getQuote(quoteId),
      issue: async (input) => await kernel.authority.authorize(input),
    })
    return result.kind === 'authorized'
      ? { kind: 'authorized' as const, authorization: { ...result.authorization, allowedDataFields: [...result.authorization.allowedDataFields], allowedRecipientBindingIds: [...result.authorization.allowedRecipientBindingIds], allowedDisclosurePurposes: [...result.authorization.allowedDisclosurePurposes] } }
      : result
  },
})

type RegisteredBindingRow = {
  bindingId: string; nodeId: string; networkId: string; capabilityContractId: string; operation: string
  admission: 'admitted' | 'not_admitted'; conformance: 'conformant' | 'not_conformant'; queryTerms: string[]
  adapterFeatures: { requestCancellation: 'supported' | 'unsupported' }
  endpointUrl: string; credentialRef: string; registrationHash: string
}

export function createRegisteredRoutingKernel(
  ctx: ActionCtx,
  lifecycle?: Parameters<typeof createNeutralRoutingKernel>[0]['lifecycle'],
  observeProviderWait?: NonNullable<Parameters<typeof createHttpCapabilityBinding>[1]['observeProviderWait']>,
): NeutralRoutingKernel {
  const store = createConvexKernelStore(ctx)
  const kernelFor = async (networkId?: string): Promise<NeutralRoutingKernel> => {
    const rawRows = networkId === undefined ? [] : await ctx.runQuery(internal.routingKernelBindings.listEligible, { networkId })
    const rawRoutingEvidenceSnapshots = networkId === undefined ? [] : await ctx.runQuery(internal.routingKernelEvidence.listCurrent, { networkId })
    const routingEvidenceSnapshots = rawRoutingEvidenceSnapshots.map(normalizeRoutingEvidence)
    const rows: RegisteredBindingRow[] = rawRows.map((row) => ({
      ...row,
      adapterFeatures: { requestCancellation: row.adapterFeatures?.requestCancellation === 'supported' ? 'supported' as const : 'unsupported' as const },
    }))
    const bindings: CapabilityBindingAdapter[] = rows.map((row) => createHttpCapabilityBinding({
      binding: { bindingId: row.bindingId, nodeId: row.nodeId, networkId: row.networkId, capabilityContractId: row.capabilityContractId, operation: row.operation, admission: row.admission, conformance: row.conformance, queryTerms: row.queryTerms, registrationHash: row.registrationHash, environment: new URL(row.endpointUrl).origin, adapterFeatures: row.adapterFeatures },
      endpointUrl: row.endpointUrl, credentialRef: row.credentialRef,
    }, {
      validateTarget: async () => true,
      resolveCredential: async (reference) => reference,
      ...(observeProviderWait === undefined ? {} : { observeProviderWait }),
      send: async (request) => {
        const idempotencyKey = request.headers.get('Idempotency-Key')
        const result = await ctx.runAction(internal.routingKernelTransport.send, { endpointUrl: row.endpointUrl, credentialRef: row.credentialRef, bodyText: await request.text(), ...(idempotencyKey === null ? {} : { idempotencyKey }) })
        return new Response(result.bodyText, { status: result.status, headers: { 'Content-Type': result.contentType } })
      },
    }))
    return createNeutralRoutingKernel({
      now: Date.now,
      executionMode: 'live',
      ids: Object.freeze({ next: createRuntimeId }),
      quoteTtlMs: 60_000,
      bindings,
      routingEvidenceSnapshots,
      store,
      incidentControl: {
        evaluate: async (scope, action) => await ctx.runQuery(internal.routingKernelIncidentControl.evaluate, { scope, action }),
        claimRecovery: async (input) => {
          const { canaryExecution, ...recovery } = input
          return await ctx.runMutation(internal.routingKernelIncidentControl.consumeRecoveryGrant, {
            ...recovery,
            ...(canaryExecution === undefined ? {} : {
              canaryExecution: { ...canaryExecution, allowedDataFields: [...canaryExecution.allowedDataFields] },
            }),
          })
        },
      },
      ...(lifecycle === undefined ? {} : { lifecycle }),
    })
  }
  return {
    operations: {
      route: async (input: Parameters<ReturnType<typeof createNeutralRoutingKernel>['operations']['route']>[0]) => await (await kernelFor(input.networkId)).operations.route(input),
      execute: async (input: Parameters<ReturnType<typeof createNeutralRoutingKernel>['operations']['execute']>[0]) => { const quote = await store.getQuote(input.quoteId); return await (await kernelFor(quote?.networkId)).operations.execute(input) },
      inspect: async (input: Parameters<ReturnType<typeof createNeutralRoutingKernel>['operations']['inspect']>[0]) => await (await kernelFor()).operations.inspect(input),
      reconcileProviderOutcome: async (input: Parameters<ReturnType<typeof createNeutralRoutingKernel>['operations']['reconcileProviderOutcome']>[0]) => {
        const run = await store.getRun(input.rootRunId)
        return await (await kernelFor(run?.networkId)).operations.reconcileProviderOutcome(input)
      },
      cancel: async (input: Parameters<ReturnType<typeof createNeutralRoutingKernel>['operations']['cancel']>[0]) => {
        const run = await store.getRun(input.rootRunId)
        return await (await kernelFor(run?.networkId)).operations.cancel(input)
      },
    },
    authority: {
      authorize: async (input: Parameters<ReturnType<typeof createNeutralRoutingKernel>['authority']['authorize']>[0]) => await (await kernelFor()).authority.authorize(input),
      reconcileProviderCancellation: async (input: Parameters<ReturnType<typeof createNeutralRoutingKernel>['authority']['reconcileProviderCancellation']>[0]) => {
        const run = await store.getRun(input.rootRunId)
        return await (await kernelFor(run?.networkId)).authority.reconcileProviderCancellation(input)
      },
    },
  } satisfies ReturnType<typeof createNeutralRoutingKernel>
}

function normalizeRoutingEvidence(row: {
  snapshotDigest: string; networkId: string; bindingId: string; bindingRegistrationHash: string; environment: string
  sourceCommitment: string; observedAt: number; expiresAt: number
  health: { state?: unknown; evidenceStanding?: unknown }
  incident: { routingEffect?: unknown; activeIncidentIds: string[]; evidenceStanding?: unknown }
  standing: { evidenceStanding?: unknown; executionReliability: { status?: unknown; sampleSize: number; lowerConfidenceBoundPermille?: number } }
}): BindingRoutingEvidenceSnapshot {
  const healthStanding = normalizedEvidenceStanding(row.health.evidenceStanding)
  const incidentStanding = normalizedEvidenceStanding(row.incident.evidenceStanding)
  const reputationStanding = normalizedEvidenceStanding(row.standing.evidenceStanding)
  const healthState = row.health.state
  const routingEffect = row.incident.routingEffect
  const reliabilityStatus = row.standing.executionReliability.status
  if (healthStanding === undefined || incidentStanding === undefined || reputationStanding === undefined
    || (healthState !== 'healthy' && healthState !== 'degraded' && healthState !== 'unavailable' && healthState !== 'frozen' && healthState !== 'unknown')
    || (routingEffect !== 'none' && routingEffect !== 'deprioritize' && routingEffect !== 'exclude_new_routes' && routingEffect !== 'freeze')
    || (reliabilityStatus !== 'sufficient' && reliabilityStatus !== 'insufficient_evidence')) throw new Error('routing_evidence_snapshot_invalid')
  return {
    contractVersion: 'routing-evidence:v1', snapshotDigest: row.snapshotDigest, networkId: row.networkId, bindingId: row.bindingId,
    bindingRegistrationHash: row.bindingRegistrationHash, environment: row.environment,
    networkPolicyVersion: 'network-policy:binding-evidence:v2', estimatorVersion: 'execution-reliability-lcb:v1',
    sourceCommitment: row.sourceCommitment, observedAt: row.observedAt, expiresAt: row.expiresAt,
    health: { state: healthState, evidenceStanding: healthStanding },
    incident: { routingEffect, activeIncidentIds: row.incident.activeIncidentIds, evidenceStanding: incidentStanding },
    standing: { evidenceStanding: reputationStanding, executionReliability: {
      status: reliabilityStatus, sampleSize: row.standing.executionReliability.sampleSize,
      ...(row.standing.executionReliability.lowerConfidenceBoundPermille === undefined ? {} : { lowerConfidenceBoundPermille: row.standing.executionReliability.lowerConfidenceBoundPermille }),
    } },
  }
}

function normalizedEvidenceStanding(value: unknown): EvidenceStanding | undefined {
  return value === 'eligible_observed' || value === 'eligible_run_bound' || value === 'eligible_corroborated'
    || value === 'visible_unbound' || value === 'ineligible_domain' || value === 'ineligible_scope'
    || value === 'held' || value === 'retracted_or_removed' ? value : undefined
}
