import { type Infer, v } from 'convex/values'

import type { ExecuteResult } from '@/modules/routing-kernel/application'
import { createRuntimeId } from '@/modules/common/runtime-id'

import { internalAction, internalQuery } from './_generated/server'
import { createRegisteredRoutingKernel } from './routingKernel'
import { internal } from './_generated/api'

const executionSummary = v.union(
  v.object({ kind: v.literal('run_admitted'), rootRunId: v.string(), state: v.union(v.literal('running'), v.literal('completed'), v.literal('outcome_unknown'), v.literal('failed'), v.literal('cancelled'), v.literal('incident_frozen')) }),
  v.object({ kind: v.literal('execution_pending'), rootRunId: v.string() }),
  v.object({ kind: v.literal('execution_refused'), reason: v.string() }),
)
const traceResult = v.union(
  v.object({ kind: v.literal('route_refused'), reason: v.string() }),
  v.object({ kind: v.literal('trace_execution_incomplete'), quoteId: v.string(), execution: executionSummary }),
  v.object({ kind: v.literal('trace_completed'), quoteId: v.string(), authorizationRef: v.string(), rootRunId: v.string(), state: v.union(v.literal('running'), v.literal('completed'), v.literal('outcome_unknown'), v.literal('failed'), v.literal('cancelled'), v.literal('incident_frozen')) }),
)

export const run = internalAction({
  args: { scenario: v.union(v.literal('success'), v.literal('fallback_success'), v.literal('failure'), v.literal('unknown')) },
  returns: traceResult,
  handler: async (ctx, args): Promise<Infer<typeof traceResult>> => {
    const proofId = createRuntimeId('hosted-trace')
    const caller = { agentId: `agent:conformance-tracer:${proofId}`, principalId: 'principal:conformance-tracer' }
    const kernel = createRegisteredRoutingKernel(ctx)
    const routed = await kernel.operations.route({
      caller,
      networkId: 'registered-businesses',
      query: 'book a shipping label',
      constraints: { currency: 'AUD', maximumSpendMinor: 250 },
    })
    if (routed.kind !== 'quoted') return { kind: 'route_refused' as const, reason: routed.reason }
    const now = Date.now()
    const grantId = `grant:${proofId}`
    const registered: Readonly<
      | { kind: 'registered'; grantId: string; grantHash: string }
      | { kind: 'revoked'; grantId: string; grantHash: string }
      | { kind: 'refused'; reason: 'authorization_denied' | 'grant_invalid' | 'grant_identity_conflict' | 'grant_not_found' | 'grant_changed' }
    > = await ctx.runMutation(internal.routingKernelAgentGrants.registerInternal, {
      issuedAt: now,
      grant: {
        grantId, agentId: caller.agentId, principalId: caller.principalId, networkIds: [routed.quote.networkId],
        maximumSpendMinor: 250, currency: 'AUD', allowedDataFields: ['scenario', 'primary_context', 'fallback_context'],
        protectedFieldSetId: 'field-set:hosted-routing-tracer:v1', maximumDisclosureAttempts: routed.quote.selectedGraph.steps.length,
        maximumDisclosureExposures: routed.quote.selectedGraph.steps.length,
        allowedRecipientBindingIds: routed.quote.selectedGraph.steps.map((step) => step.bindingId),
        allowedDisclosurePurposes: [...new Set(routed.quote.selectedGraph.steps.map((step) => step.capabilityContractId))],
        expiresAt: now + 120_000, evidenceRefs: ['evidence:hosted-routing-tracer'],
      },
    })
    if (registered.kind !== 'registered') return { kind: 'route_refused' as const, reason: registered.reason }
    const budget = await ctx.runQuery(internal.routingKernelAgentGrants.resolveBudgetAuthority, { sourceGrantId: grantId, networkId: routed.quote.networkId, now })
    const dataBudget = await ctx.runQuery(internal.routingKernelAgentGrants.resolveDataAuthorizationBudget, { sourceGrantId: grantId, networkId: routed.quote.networkId, now })
    if (budget === null || dataBudget === null) return { kind: 'route_refused' as const, reason: 'tracer_authority_provisioning_failed' }
    const authorization = await kernel.authority.authorize({
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
      quoteId: routed.quote.quoteId,
      quoteDigest: routed.quote.quoteDigest,
      principalId: caller.principalId,
      agentId: caller.agentId,
      maximumSpendMinor: 250,
      currency: 'AUD',
      expiresAt: Date.now() + 60_000,
      allowedDataFields: ['scenario', 'primary_context', 'fallback_context'],
    })
    const executed = await kernel.operations.execute({
      caller,
      quoteId: routed.quote.quoteId,
      quoteDigest: routed.quote.quoteDigest,
      authorizationRef: authorization.authorizationRef,
      idempotencyKey: `hosted:${args.scenario}:${Date.now()}`,
      data: { scenario: args.scenario, primary_context: 'primary-only', fallback_context: 'fallback-only' },
    })
    await ctx.runMutation(internal.routingKernelAgentGrants.revokeInternal, {
      grantId, expectedGrantHash: registered.grantHash, evidenceRefs: ['evidence:hosted-routing-tracer-complete'], revokedAt: Date.now(),
    })
    if (executed.kind !== 'run_admitted') return {
      kind: 'trace_execution_incomplete' as const,
      quoteId: routed.quote.quoteId,
      execution: summarizeExecution(executed),
    }
    const inspected = await kernel.operations.inspect({ caller, rootRunId: executed.run.rootRunId })
    return {
      kind: 'trace_completed' as const,
      quoteId: routed.quote.quoteId,
      authorizationRef: authorization.authorizationRef,
      rootRunId: executed.run.rootRunId,
      state: inspected.kind === 'run_found' ? inspected.run.state : executed.run.state,
    }
  },
})

const crashPreparation = v.union(
  v.object({ kind: v.literal('route_refused'), reason: v.string() }),
  v.object({
    kind: v.literal('crash_recovery_prepared'), agentId: v.string(), principalId: v.string(),
    quoteId: v.string(), quoteDigest: v.string(), authorizationRef: v.string(), idempotencyKey: v.string(),
  }),
)

export const prepareCrashRecovery = internalAction({
  args: { agentId: v.string(), idempotencyKey: v.string() },
  returns: crashPreparation,
  handler: async (ctx, args) => {
    const caller = { agentId: args.agentId, principalId: 'principal:conformance-tracer' }
    const kernel = createRegisteredRoutingKernel(ctx)
    const routed = await kernel.operations.route({
      caller,
      networkId: 'registered-businesses',
      query: 'book a shipping label',
      constraints: { currency: 'AUD', maximumSpendMinor: 250 },
    })
    if (routed.kind !== 'quoted') return { kind: 'route_refused' as const, reason: routed.reason }
    const authorization = await kernel.authority.authorize({
      quoteId: routed.quote.quoteId,
      quoteDigest: routed.quote.quoteDigest,
      principalId: caller.principalId,
      agentId: caller.agentId,
      maximumSpendMinor: 250,
      currency: 'AUD',
      expiresAt: Date.now() + 120_000,
      allowedDataFields: ['scenario'],
    })
    return {
      kind: 'crash_recovery_prepared' as const,
      agentId: caller.agentId,
      principalId: caller.principalId,
      quoteId: routed.quote.quoteId,
      quoteDigest: routed.quote.quoteDigest,
      authorizationRef: authorization.authorizationRef,
      idempotencyKey: args.idempotencyKey,
    }
  },
})

export const crashAfterProviderOutcome = internalAction({
  args: {
    agentId: v.string(),
    quoteId: v.string(),
    quoteDigest: v.string(),
    authorizationRef: v.string(),
    idempotencyKey: v.string(),
  },
  returns: executionSummary,
  handler: async (ctx, args) => {
    const { agentId, ...execution } = args
    const caller = { agentId, principalId: 'principal:conformance-tracer' }
    const kernel = createRegisteredRoutingKernel(ctx, {
      afterProviderOutcome: async () => { throw new Error('conformance_forced_termination_after_provider_outcome') },
    })
    const executed = await kernel.operations.execute({
      caller,
      ...execution,
      data: { scenario: 'success' },
    })
    return summarizeExecution(executed)
  },
})

export const recoverAfterProviderCrash = internalAction({
  args: {
    agentId: v.string(),
    quoteId: v.string(),
    quoteDigest: v.string(),
    authorizationRef: v.string(),
    idempotencyKey: v.string(),
  },
  returns: executionSummary,
  handler: async (ctx, args) => {
    const { agentId, ...execution } = args
    const caller = { agentId, principalId: 'principal:conformance-tracer' }
    const kernel = createRegisteredRoutingKernel(ctx)
    const executed = await kernel.operations.execute({ caller, ...execution, data: { scenario: 'success' } })
    if (executed.kind !== 'run_admitted') return summarizeExecution(executed)
    const inspected = await kernel.operations.inspect({ caller, rootRunId: executed.run.rootRunId })
    return {
      kind: 'run_admitted' as const,
      rootRunId: executed.run.rootRunId,
      state: inspected.kind === 'run_found' ? inspected.run.state : executed.run.state,
    }
  },
})

export const inspectCrashCheckpoint = internalQuery({
  args: { agentId: v.string(), idempotencyKey: v.string() },
  handler: async (ctx, args) => {
    const executionScope = `${args.agentId}:principal:conformance-tracer:${args.idempotencyKey}`
    const claim = await ctx.db.query('routingKernelExecutionClaims').withIndex('by_executionScope', (query) => query.eq('executionScope', executionScope)).unique()
    if (claim === null) return null
    const records = await ctx.db.query('routingKernelProtocolRecords').withIndex('by_rootRunId_sequence', (query) => query.eq('rootRunId', claim.rootRunId)).collect()
    return {
      rootRunId: claim.rootRunId,
      claimState: claim.state,
      records: records.map((record) => ({ documentId: String(record._id), sequence: record.sequence, recordId: record.recordId, type: record.type })),
    }
  },
})

export const inspectStepGrants = internalQuery({
  args: { rootRunId: v.string() },
  returns: v.array(v.union(
    v.object({
      grantContract: v.union(v.literal('exact_v1'), v.literal('exact_v2_sha256')), stepGrantId: v.string(), grantDigest: v.string(),
      quoteDigest: v.string(), requestDigest: v.string(), bindingId: v.string(),
      maximumCost: v.object({ currency: v.string(), amountMinor: v.number() }), disclosedDataFields: v.array(v.string()),
      attempt: v.number(), expiresAt: v.number(), enforcementPoint: v.literal('provider_release'),
    }),
    v.object({ grantContract: v.literal('legacy_opaque'), stepGrantId: v.string(), bindingId: v.string() }),
  )),
  handler: async (ctx, args) => {
    const rows = await ctx.db.query('routingKernelStepReleases')
      .withIndex('by_rootRunId_leafRunId', (query) => query.eq('rootRunId', args.rootRunId))
      .take(17)
    if (rows.length > 16) throw new Error('root_leaf_limit_exceeded')
    return rows.map((row) => 'grantDigest' in row
      ? {
          grantContract: row.grantContract, stepGrantId: row.stepGrantId, grantDigest: row.grantDigest,
          quoteDigest: row.quoteDigest, requestDigest: row.requestDigest, bindingId: row.bindingId,
          maximumCost: { currency: row.maximumCostCurrency, amountMinor: row.maximumCostAmountMinor },
          disclosedDataFields: row.disclosedDataFields, attempt: row.attempt, expiresAt: row.expiresAt,
          enforcementPoint: row.enforcementPoint,
        }
      : { grantContract: row.grantContract, stepGrantId: row.stepGrantId, bindingId: row.bindingId })
  },
})

type ExecutionSummary =
  | Readonly<{ kind: 'run_admitted'; rootRunId: string; state: 'running' | 'completed' | 'outcome_unknown' | 'failed' | 'cancelled' | 'incident_frozen' }>
  | Readonly<{ kind: 'execution_pending'; rootRunId: string }>
  | Readonly<{ kind: 'execution_refused'; reason: string }>

function summarizeExecution(executed: ExecuteResult): ExecutionSummary {
  if (executed.kind === 'run_admitted') return { kind: 'run_admitted' as const, rootRunId: executed.run.rootRunId, state: executed.run.state }
  return executed
}
