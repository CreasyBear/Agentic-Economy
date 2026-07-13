import { v, type Infer } from 'convex/values'

import { compileCustomerRequest } from '@/modules/customer-request/compiler'
import { createJsonCustomerRequestInterpreter } from '@/modules/customer-request/interpreter'
import {
  createOpenRouterCustomerRequestSemanticTransport,
  createOpenRouterCustomerRequestTransport,
} from '@/modules/customer-request/openrouter-transport'
import { createJsonCustomerRequestSemanticInterpreter } from '@/modules/customer-request/semantic-interpreter'
import {
  projectCustomerRequest,
  projectNeedsAttention,
  projectOptionsReady,
  projectPreparingOptions,
  projectRequestEvaluation,
  type CustomerRequestView,
  type CustomerRequestProjection,
} from '@/modules/customer-request/customer-projection'
import {
  discoverRequestEvaluationCandidates,
  evaluateCustomerRequestSnapshot,
  evaluateIntentDirectionRequestSnapshot,
  requestRegistrySnapshotDigest,
  type RequestEvaluation,
} from '@/modules/customer-request/evaluation'
import { prepareCustomerRequestAction, type PreparedRouteCandidateSet } from '@/modules/customer-request/preparation'
import {
  createKernelCustomerRequestActionRouter,
  prepareKernelCustomerRequestEvaluationOptions,
} from '@/modules/customer-request/kernel-router'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { preparedRouteCandidateSetValue, requestSnapshotValue } from '@/modules/customer-request/runtime'
import type { PlanRevision } from '@/modules/customer-request/public'
import { verifyCustomerRequestServiceAssertion } from '@/modules/customer-request/service-auth-envelope'

import { action, type ActionCtx } from './_generated/server'
import { internal } from './_generated/api'
import { loadConvexCapabilityContractRegistry } from './customerRequestCapabilityContractRegistryAdapter'
import { createConvexCustomerRequestCompilationStore } from './customerRequestCompilationStoreAdapter'
import { createConvexCustomerRequestPreparationStore } from './customerRequestStoreAdapter'
import { createConvexPreparationDisclosureStore } from './customerRequestPreparationAuthorityStoreAdapter'
import { createRegisteredRoutingKernel } from './routingKernel'

const literalValue = v.union(v.string(), v.number(), v.boolean())
const serviceAssertion = v.object({
  principalId: v.string(), ownerId: v.string(), credentialId: v.string(), scopes: v.array(v.string()),
  issuedAt: v.number(), signature: v.string(),
})
const customerOption = v.object({
  optionRef: v.string(), business: v.object({ name: v.string() }),
  expectedCost: v.object({ currency: v.string(), amountMinor: v.number() }),
  maximumCost: v.object({ currency: v.string(), amountMinor: v.number() }),
  expectedLatencyMs: v.number(),
  priceComponents: v.array(v.object({ label: v.string(), amountMinor: v.number() })),
  comparableOutputs: v.array(v.object({ label: v.string(), value: literalValue })),
  materialTerms: v.array(v.string()),
  cancellation: v.object({
    kind: v.union(v.literal('supported'), v.literal('conditional'), v.literal('unsupported')),
    summary: v.string(),
  }),
  expiresAt: v.number(),
})
const customerView = v.object({
  kind: v.literal('request'), requestRef: v.string(), revision: v.number(),
  state: v.union(
    v.literal('needs_information'), v.literal('ready_to_compare'), v.literal('preparing_options'),
    v.literal('options_ready'), v.literal('unsupported'), v.literal('needs_attention'),
  ),
  summary: v.string(),
  nextAction: v.union(
    v.literal('provide_information'), v.literal('prepare_options'), v.literal('wait'),
    v.literal('inspect_options'), v.literal('revise_request'), v.literal('retry'),
  ),
  missingFields: v.array(v.object({ field: v.string(), label: v.string(), explanation: v.string() })),
  clarification: v.optional(v.union(
    v.object({ kind: v.literal('intent_direction'), prompt: v.string(), answerKind: v.literal('natural_language') }),
    v.object({ kind: v.literal('contract_fact'), field: v.string(), prompt: v.string(), answerKind: v.literal('typed_value') }),
  )),
  options: v.array(customerOption),
})
const customerProjection = v.union(
  customerView,
  v.object({
    kind: v.literal('conflict'), requestRef: v.string(),
    reason: v.union(v.literal('revision_changed'), v.literal('identity_changed'), v.literal('idempotency_key_reused')),
  }),
)
const optionProjection = v.union(
  customerView,
  v.object({ kind: v.literal('conflict'), requestRef: v.string(), reason: v.union(v.literal('revision_changed'), v.literal('request_not_ready')) }),
  v.object({ kind: v.literal('refused'), reason: v.literal('authentication_required') }),
)
type OptionActionResult = Infer<typeof optionProjection>
const submitResultValue = v.union(
  customerProjection,
  v.object({ kind: v.literal('refused'), reason: v.union(
    v.literal('authentication_required'), v.literal('interpreter_unavailable'), v.literal('capabilities_unavailable'),
  ) }),
)
type SubmitActionResult = Infer<typeof submitResultValue>
type SnapshotValue = Infer<typeof requestSnapshotValue>
type SnapshotCommitResult =
  | Readonly<{ kind: 'stored' }>
  | Readonly<{ kind: 'replayed'; requestId: string; revision: number }>
  | Readonly<{ kind: 'revision_conflict' | 'identity_conflict' | 'command_conflict' }>
type EligibleBinding = Readonly<{
  businessId: string; bindingId: string; capabilityContractId: string; queryTerms: string[]; registrationHash: string
}>
type StoredEvaluation = Readonly<{
  snapshot: SnapshotValue
  evaluation: Readonly<{
    evaluationId: string
    requestId: string; requestRevision: number; registrySnapshotDigest: string; factsDigest: string
    facts?: SnapshotValue['facts']
    posture: 'progress_available' | 'needs_information' | 'unsupported'
    nextRequirement?:
      | Readonly<{
          kind?: 'contract_fact'; field: string; customerLabel: string; affectedCandidates: readonly string[]
          probesEnabled: readonly string[]; requirementDigest: string
        }>
      | Readonly<{ kind: 'intent_direction'; prompt: string; requirementDigest: string }>
    evaluationDigest: string
  }>
  candidates: RequestEvaluation['candidates']
}>
type StoredEvaluationPreparation = Readonly<{
  preparationKey: string; requestId: string; requestRevision: number; evaluationId: string; evaluationDigest: string
  status: 'preparing' | 'options_prepared' | 'needs_attention'
  candidateSet?: PreparedRouteCandidateSet; inspectionRef?: string; updatedAt: number
}>

export const submit = action({
  args: {
    compilationKey: v.string(), requestId: v.string(), expectedRevision: v.optional(v.number()), delegatedAgentId: v.string(),
    customerJob: v.string(), knownFacts: v.record(v.string(), literalValue),
    routing: v.object({
      networkId: v.string(), currency: v.optional(v.string()), maximumSpendMinor: v.optional(v.number()),
      optimizeFor: v.optional(v.union(v.literal('cost'), v.literal('latency'))),
    }), serviceAuth: v.optional(serviceAssertion),
  },
  returns: submitResultValue,
  handler: async (ctx, args): Promise<SubmitActionResult> => {
    const command = submitCommand(args)
    const caller = await resolveRequestCaller(ctx, 'submit', command, args.serviceAuth, args.delegatedAgentId)
    if (caller === undefined) return { kind: 'refused' as const, reason: 'authentication_required' as const }
    const expectedRevision = args.expectedRevision ?? 0
    const recordedAt = Date.now()
    const facts = Object.fromEntries(Object.entries(args.knownFacts).map(([field, value]) => [field, {
      value,
      source: { kind: 'customer' as const, assertionRef: `assertion:${canonicalDigest({ field, value })}` },
    }]))
    const snapshotMaterial = {
      requestId: args.requestId, revision: expectedRevision + 1,
      principalId: caller.principalId, delegatedAgentId: caller.delegatedAgentId,
      intent: args.customerJob, networkId: args.routing.networkId, facts,
    }
    const snapshot = { ...snapshotMaterial, snapshotDigest: canonicalDigest(snapshotMaterial), recordedAt }
    const committed: SnapshotCommitResult = await ctx.runMutation(internal.customerRequests.commitRequestSnapshot, {
      commandKey: namespacedKey(caller.principalId, 'submit', args.requestId, args.compilationKey),
      commandDigest: canonicalDigest(command), expectedRevision, snapshot,
    })
    if (committed.kind === 'revision_conflict') return {
      kind: 'conflict' as const, requestRef: args.requestId, reason: 'revision_changed' as const,
    }
    if (committed.kind === 'identity_conflict') return {
      kind: 'conflict' as const, requestRef: args.requestId, reason: 'identity_changed' as const,
    }
    if (committed.kind === 'command_conflict') return {
      kind: 'conflict' as const, requestRef: args.requestId, reason: 'idempotency_key_reused' as const,
    }
    const requestRevision: number = committed.kind === 'replayed' ? committed.revision : snapshot.revision
    const existing: StoredEvaluation | null = await ctx.runQuery(internal.customerRequests.getRequestEvaluation, {
      requestId: args.requestId, requestRevision,
    })
    if (existing !== null) return writableView(projectStoredEvaluation(existing))
    const durableSnapshot: SnapshotValue | null = committed.kind === 'replayed'
      ? await ctx.runQuery(internal.customerRequests.getRequestSnapshot, { requestId: args.requestId, revision: requestRevision })
      : snapshot
    if (durableSnapshot === null || durableSnapshot.principalId !== caller.principalId) return {
      kind: 'conflict' as const, requestRef: args.requestId, reason: 'identity_changed' as const,
    }
    const evaluated = await evaluateAndPersistSnapshot(ctx, durableSnapshot)
    if (evaluated.kind === 'interpreter_unavailable') return {
      kind: 'refused' as const, reason: 'interpreter_unavailable' as const,
    }
    if (evaluated.kind !== 'stored') return {
      kind: 'conflict' as const, requestRef: args.requestId, reason: 'revision_changed' as const,
    }
    return writableView(projectRequestEvaluation({ snapshot: durableSnapshot, evaluation: evaluated.evaluation }))
  },
})

export const compare = action({
  args: { requestRef: v.string(), revision: v.number(), serviceAuth: v.optional(serviceAssertion) },
  returns: optionProjection,
  handler: async (ctx, args): Promise<OptionActionResult> => {
    const command = { requestRef: args.requestRef, revision: args.revision }
    const caller = await resolveRequestCaller(ctx, 'compare', command, args.serviceAuth)
    if (caller === undefined) return { kind: 'refused' as const, reason: 'authentication_required' as const }
    const evaluated: StoredEvaluation | null = await ctx.runQuery(
      internal.customerRequests.getCurrentRequestEvaluation, { requestId: args.requestRef },
    )
    if (evaluated !== null) {
      if (evaluated.snapshot.principalId !== caller.principalId) {
        return { kind: 'conflict' as const, requestRef: args.requestRef, reason: 'request_not_ready' as const }
      }
      if (evaluated.snapshot.revision !== args.revision || evaluated.evaluation.requestRevision !== args.revision) {
        return { kind: 'conflict' as const, requestRef: args.requestRef, reason: 'revision_changed' as const }
      }
      const prior: StoredEvaluationPreparation | null = await ctx.runQuery(
        internal.customerRequests.getRequestEvaluationPreparation,
        { requestId: args.requestRef, requestRevision: args.revision },
      )
      if (prior?.status === 'options_prepared' && prior.candidateSet !== undefined) return writableView(projectOptionsReady({
        requestRef: args.requestRef, revision: args.revision, summary: evaluated.snapshot.intent,
        candidateSet: prior.candidateSet,
      }))
      if (prior?.status === 'needs_attention') return writableView(projectNeedsAttention({
        requestRef: args.requestRef, revision: args.revision,
        summary: 'Connected businesses could not prepare comparable options for this request.',
      }))
      if (evaluated.evaluation.nextRequirement !== undefined) {
        return { kind: 'conflict' as const, requestRef: args.requestRef, reason: 'request_not_ready' as const }
      }
      const viable = evaluated.candidates.filter((candidate) => candidate.viability.kind === 'viable')
      const capabilityContractIds = [...new Set(viable.map((candidate) => candidate.capabilityContractId))]
      if (viable.length === 0 || capabilityContractIds.length !== 1) return writableView(projectNeedsAttention({
        requestRef: args.requestRef, revision: args.revision,
        summary: 'The registered options are not yet comparable as one customer decision.',
      }))
      const registry = await loadConvexCapabilityContractRegistry(ctx)
      const [capabilityContractId] = capabilityContractIds
      if (capabilityContractId === undefined) return writableView(projectNeedsAttention({
        requestRef: args.requestRef, revision: args.revision,
        summary: 'No registered capability remains available for this request.',
      }))
      const contract = registry.get(capabilityContractId)
      if (contract === undefined) return writableView(projectNeedsAttention({
        requestRef: args.requestRef, revision: args.revision,
        summary: 'The registered capability changed before options could be prepared.',
      }))
      const preparationKey = namespacedKey(
        caller.principalId, 'evaluation-options', args.requestRef,
        `${args.revision}:${evaluated.evaluation.evaluationId}`,
      )
      const started = await ctx.runMutation(internal.customerRequests.putRequestEvaluationPreparation, {
        preparation: {
          preparationKey, requestId: args.requestRef, requestRevision: args.revision,
          evaluationId: evaluated.evaluation.evaluationId,
          evaluationDigest: evaluated.evaluation.evaluationDigest,
          status: 'preparing', updatedAt: Date.now(),
        },
      })
      if (started.kind === 'stale' || started.kind === 'conflict') return {
        kind: 'conflict' as const, requestRef: args.requestRef, reason: 'revision_changed' as const,
      }
      const result = await prepareKernelCustomerRequestEvaluationOptions(
        createRegisteredRoutingKernel(ctx),
        {
          resolve: async (bindingIds) => await ctx.runQuery(
            internal.routingKernelBindings.resolvePresentations, { bindingIds: [...bindingIds] },
          ),
        },
        {
          preparationRequestId: preparationKey,
          request: {
            requestId: args.requestRef, revision: args.revision,
            principalId: evaluated.snapshot.principalId, delegatedAgentId: evaluated.snapshot.delegatedAgentId,
            networkId: evaluated.snapshot.networkId,
          },
          evaluation: {
            evaluationId: evaluated.evaluation.evaluationId,
            evaluationDigest: evaluated.evaluation.evaluationDigest,
          },
          allowedBindingIds: viable.map((candidate) => candidate.bindingId),
          preparationGeneration: args.revision,
          contract,
          publicInput: Object.fromEntries(Object.entries(evaluated.evaluation.facts ?? evaluated.snapshot.facts)
            .map(([field, fact]) => [field, fact.value])),
        },
      )
      if (result.kind === 'candidate_set') {
        await ctx.runMutation(internal.customerRequests.putRequestEvaluationPreparation, {
          preparation: {
            preparationKey, requestId: args.requestRef, requestRevision: args.revision,
            evaluationId: evaluated.evaluation.evaluationId,
            evaluationDigest: evaluated.evaluation.evaluationDigest,
            status: 'options_prepared', candidateSet: writableCandidateSet(result.candidateSet), updatedAt: Date.now(),
          },
        })
        return writableView(projectOptionsReady({
          requestRef: args.requestRef, revision: args.revision,
          summary: evaluated.snapshot.intent, candidateSet: result.candidateSet,
        }))
      }
      if (result.kind === 'preparation_pending') {
        await ctx.runMutation(internal.customerRequests.putRequestEvaluationPreparation, {
          preparation: {
            preparationKey, requestId: args.requestRef, requestRevision: args.revision,
            evaluationId: evaluated.evaluation.evaluationId,
            evaluationDigest: evaluated.evaluation.evaluationDigest,
            status: 'preparing', inspectionRef: result.inspectionRef, updatedAt: Date.now(),
          },
        })
        return writableView(projectPreparingOptions({
          requestRef: args.requestRef, revision: args.revision, summary: evaluated.snapshot.intent,
        }))
      }
      await ctx.runMutation(internal.customerRequests.putRequestEvaluationPreparation, {
        preparation: {
          preparationKey, requestId: args.requestRef, requestRevision: args.revision,
          evaluationId: evaluated.evaluation.evaluationId,
          evaluationDigest: evaluated.evaluation.evaluationDigest,
          status: 'needs_attention', updatedAt: Date.now(),
        },
      })
      return writableView(projectNeedsAttention({
        requestRef: args.requestRef, revision: args.revision,
        summary: 'Connected businesses could not prepare comparable options for this request.',
      }))
    }
    const store = createConvexCustomerRequestPreparationStore(ctx)
    const request = await store.getRequest(args.requestRef)
    if (request === undefined || request.principalId !== caller.principalId) {
      return { kind: 'conflict' as const, requestRef: args.requestRef, reason: 'request_not_ready' as const }
    }
    if (request.revision !== args.revision) return { kind: 'conflict' as const, requestRef: args.requestRef, reason: 'revision_changed' as const }
    const plan = await ctx.runQuery(internal.customerRequests.getPlanForRequestRevision, {
      requestId: args.requestRef, requestRevision: args.revision,
    })
    const rootActions = plan?.actions.filter((candidate: PlanRevision['actions'][number]) => candidate.dependsOn.length === 0) ?? []
    const actionStep = rootActions.length === 1 ? rootActions[0] : undefined
    if (plan === null || actionStep === undefined) return { kind: 'conflict' as const, requestRef: args.requestRef, reason: 'request_not_ready' as const }
    const resolvedInput = resolvePlanInput(actionStep.input, request.knownFacts)
    if (resolvedInput === undefined) return { kind: 'conflict' as const, requestRef: args.requestRef, reason: 'request_not_ready' as const }
    const registry = await loadConvexCapabilityContractRegistry(ctx)
    const result = await prepareCustomerRequestAction({
      preparationKey: namespacedKey(caller.principalId, 'prepare', request.requestId, String(request.revision)),
      requestId: request.requestId, requestRevision: request.revision,
      planRevisionId: plan.planRevisionId, actionId: actionStep.actionId, resolvedInput,
    }, {
      store,
      router: createKernelCustomerRequestActionRouter(createRegisteredRoutingKernel(ctx), {
        resolve: async (bindingIds) => await ctx.runQuery(internal.routingKernelBindings.resolvePresentations, { bindingIds: [...bindingIds] }),
      }),
      registry,
      preparationAuthorityVerifier: { verify: async () => ({ kind: 'refused', reason: 'authority_evidence_invalid' }) },
      preparationDisclosureStore: createConvexPreparationDisclosureStore(ctx),
      commitProtectedProjection: (projection) => canonicalDigest(projection),
      now: Date.now,
      leaseMs: 30_000,
    })
    const summary = request.understanding.outcome
    if (result.kind === 'options_prepared') return writableView(projectOptionsReady({
      requestRef: request.requestId, revision: request.revision, summary, candidateSet: result.candidateSet,
    }))
    if (result.kind === 'preparation_in_progress') return writableView(projectPreparingOptions({
      requestRef: request.requestId, revision: request.revision, summary,
    }))
    return writableView(projectNeedsAttention({
      requestRef: request.requestId, revision: request.revision, summary: result.kind === 'prepared'
        ? 'One business option was prepared, but a comparable option set is not available.'
        : 'Connected businesses could not prepare comparable options for this request.',
    }))
  },
})

export const resume = action({
  args: { requestRef: v.string(), serviceAuth: v.optional(serviceAssertion) },
  returns: v.union(customerView, v.object({ kind: v.literal('refused'), reason: v.union(v.literal('authentication_required'), v.literal('request_not_found')) })),
  handler: resumeHandler,
})

type ResumeResult = ReturnType<typeof writableView> | Readonly<{
  kind: 'refused'
  reason: 'authentication_required' | 'request_not_found'
}>

async function resumeHandler(ctx: ActionCtx, args: Readonly<{ requestRef: string; serviceAuth?: Infer<typeof serviceAssertion> }>): Promise<ResumeResult> {
  const caller = await resolveRequestCaller(ctx, 'resume', { requestRef: args.requestRef }, args.serviceAuth)
  if (caller === undefined) return { kind: 'refused' as const, reason: 'authentication_required' as const }
  const evaluated: StoredEvaluation | null = await ctx.runQuery(
    internal.customerRequests.getCurrentRequestEvaluation, { requestId: args.requestRef },
  )
  if (evaluated !== null) {
    if (evaluated.snapshot.principalId !== caller.principalId) return { kind: 'refused' as const, reason: 'request_not_found' as const }
    const preparation: StoredEvaluationPreparation | null = await ctx.runQuery(
      internal.customerRequests.getRequestEvaluationPreparation,
      { requestId: evaluated.snapshot.requestId, requestRevision: evaluated.snapshot.revision },
    )
    if (preparation?.status === 'options_prepared' && preparation.candidateSet !== undefined) {
      const liveCandidates = preparation.candidateSet.candidates.filter((candidate) => candidate.expiresAt > Date.now())
      return liveCandidates.length === 0
        ? writableView(projectNeedsAttention({
            requestRef: evaluated.snapshot.requestId, revision: evaluated.snapshot.revision,
            summary: 'The prepared options expired. Prepare this request again to get current options.',
          }))
        : writableView(projectOptionsReady({
            requestRef: evaluated.snapshot.requestId, revision: evaluated.snapshot.revision,
            summary: evaluated.snapshot.intent,
            candidateSet: { ...preparation.candidateSet, candidates: liveCandidates },
          }))
    }
    if (preparation?.status === 'preparing') return writableView(projectPreparingOptions({
      requestRef: evaluated.snapshot.requestId, revision: evaluated.snapshot.revision, summary: evaluated.snapshot.intent,
    }))
    if (preparation?.status === 'needs_attention') return writableView(projectNeedsAttention({
      requestRef: evaluated.snapshot.requestId, revision: evaluated.snapshot.revision,
      summary: 'Connected businesses could not prepare comparable options for this request.',
    }))
    return writableView(projectStoredEvaluation(evaluated))
  }
  const unevaluatedSnapshot: SnapshotValue | null = await ctx.runQuery(
    internal.customerRequests.getCurrentRequestSnapshot, { requestId: args.requestRef },
  )
  if (unevaluatedSnapshot !== null) {
    if (unevaluatedSnapshot.principalId !== caller.principalId) {
      return { kind: 'refused' as const, reason: 'request_not_found' as const }
    }
    const recovered = await evaluateAndPersistSnapshot(ctx, unevaluatedSnapshot)
    return recovered.kind === 'stored'
      ? writableView(projectRequestEvaluation({ snapshot: unevaluatedSnapshot, evaluation: recovered.evaluation }))
      : writableView(projectNeedsAttention({
          requestRef: unevaluatedSnapshot.requestId,
          revision: unevaluatedSnapshot.revision,
          summary: 'Request understanding is temporarily unavailable. Retry to continue.',
        }))
  }
  const request = await ctx.runQuery(internal.customerRequests.getRequest, { requestId: args.requestRef })
    if (request === null || request.principalId !== caller.principalId) {
      return { kind: 'refused' as const, reason: 'request_not_found' as const }
    }
    const preparation = await ctx.runQuery(internal.customerRequests.getPreparationForRequestRevision, {
      requestId: request.requestId, requestRevision: request.revision,
    })
    if (preparation?.status === 'options_prepared' && preparation.candidateSet !== undefined) {
      const liveCandidates = preparation.candidateSet.candidates.filter((candidate) => candidate.expiresAt > Date.now())
      if (liveCandidates.length === 0) return writableView(projectNeedsAttention({
        requestRef: request.requestId, revision: request.revision,
        summary: 'The prepared options have expired. Prepare this request again to get current options.',
      }))
      return writableView(projectOptionsReady({
        requestRef: request.requestId, revision: request.revision,
        summary: request.understanding.outcome,
        candidateSet: { ...preparation.candidateSet, candidates: liveCandidates },
      }))
    }
    if (preparation?.status === 'claimed') return writableView(projectPreparingOptions({
      requestRef: request.requestId, revision: request.revision, summary: request.understanding.outcome,
    }))
    if (preparation?.status === 'refused' || preparation?.status === 'prepared') return writableView(projectNeedsAttention({
      requestRef: request.requestId, revision: request.revision,
      summary: 'This request needs attention before options can be prepared.',
    }))
    const compilation = await ctx.runQuery(internal.customerRequests.getCompilationForRequestRevision, {
      requestId: request.requestId, requestRevision: request.revision,
    })
    if (compilation === null) return writableView(projectNeedsAttention({
      requestRef: request.requestId, revision: request.revision, summary: 'This request needs attention before it can continue.',
    }))
    if (compilation.outcome.kind === 'plan_ready') {
      const planRevision = await ctx.runQuery(internal.customerRequests.getPlanForRequestRevision, {
        requestId: request.requestId, requestRevision: request.revision,
      })
      if (planRevision === null) return writableView(projectNeedsAttention({
        requestRef: request.requestId, revision: request.revision, summary: 'This request needs attention before it can continue.',
      }))
      const projection = projectCustomerRequest({ kind: 'plan_ready', request, understanding: request.understanding, planRevision })
      return projection.kind === 'request' ? writableView(projection) : writableView(projectNeedsAttention({
        requestRef: request.requestId, revision: request.revision, summary: 'This request needs attention before it can continue.',
      }))
    }
    const projection = projectCustomerRequest(compilation.outcome.kind === 'needs_information'
        ? { kind: 'needs_information', request, understanding: request.understanding, missingInformation: compilation.outcome.missingInformation }
        : { kind: 'unsupported', request, reason: compilation.outcome.reason })
    return projection.kind === 'request' ? writableView(projection) : writableView(projectNeedsAttention({
      requestRef: request.requestId, revision: request.revision, summary: 'This request needs attention before it can continue.',
    }))
}

export const provideFacts = action({
  args: {
    requestRef: v.string(), expectedRevision: v.number(), idempotencyKey: v.string(),
    facts: v.record(v.string(), literalValue), serviceAuth: v.optional(serviceAssertion),
  },
  returns: v.union(
    customerProjection,
    v.object({ kind: v.literal('refused'), reason: v.union(v.literal('authentication_required'), v.literal('request_not_found'), v.literal('interpreter_unavailable'), v.literal('capabilities_unavailable')) }),
  ),
  handler: provideFactsHandler,
})

type ProvideFactsResult = ReturnType<typeof writableProjection> | Readonly<{
  kind: 'refused'
  reason: 'authentication_required' | 'request_not_found' | 'interpreter_unavailable' | 'capabilities_unavailable'
}>

async function provideFactsHandler(
  ctx: ActionCtx,
  args: Readonly<{
    requestRef: string
    expectedRevision: number
    idempotencyKey: string
    facts: Readonly<Record<string, string | number | boolean>>
    serviceAuth?: Infer<typeof serviceAssertion>
  }>,
): Promise<ProvideFactsResult> {
  const command = factsCommand(args)
  const caller = await resolveRequestCaller(ctx, 'facts', command, args.serviceAuth)
  if (caller === undefined) return { kind: 'refused' as const, reason: 'authentication_required' as const }
  const evaluated: StoredEvaluation | null = await ctx.runQuery(
    internal.customerRequests.getCurrentRequestEvaluation, { requestId: args.requestRef },
  )
  if (evaluated !== null) {
    if (evaluated.snapshot.principalId !== caller.principalId) return { kind: 'refused' as const, reason: 'request_not_found' as const }
    const requirement = evaluated.evaluation.nextRequirement
    const selectedField = requirement?.kind === 'intent_direction' ? undefined : requirement?.field
    const suppliedFields = Object.keys(args.facts)
    if (selectedField === undefined || suppliedFields.length !== 1 || suppliedFields[0] !== selectedField) {
      return writableView(projectNeedsAttention({
        requestRef: evaluated.snapshot.requestId, revision: evaluated.snapshot.revision,
        summary: 'Add only the information currently requested so the available options can be reevaluated.',
      }))
    }
    const suppliedValue = args.facts[selectedField]
    if (suppliedValue === undefined) return writableView(projectNeedsAttention({
      requestRef: evaluated.snapshot.requestId, revision: evaluated.snapshot.revision,
      summary: 'The requested information was not supplied.',
    }))
    const recordedAt = Date.now()
    const nextFacts = {
      ...evaluated.snapshot.facts,
      [selectedField]: {
        value: suppliedValue,
        source: { kind: 'customer' as const, assertionRef: `assertion:${canonicalDigest({
          field: selectedField, value: suppliedValue, requestRevision: args.expectedRevision + 1,
        })}` },
      },
    }
    const snapshotMaterial = {
      requestId: evaluated.snapshot.requestId, revision: args.expectedRevision + 1,
      principalId: evaluated.snapshot.principalId, delegatedAgentId: evaluated.snapshot.delegatedAgentId,
      intent: evaluated.snapshot.intent, networkId: evaluated.snapshot.networkId, facts: nextFacts,
    }
    const snapshot: SnapshotValue = {
      ...snapshotMaterial, snapshotDigest: canonicalDigest(snapshotMaterial), recordedAt,
    }
    const committed: SnapshotCommitResult = await ctx.runMutation(internal.customerRequests.commitRequestSnapshot, {
      commandKey: namespacedKey(caller.principalId, 'facts', args.requestRef, args.idempotencyKey),
      commandDigest: canonicalDigest(command), expectedRevision: args.expectedRevision, snapshot,
    })
    if (committed.kind === 'revision_conflict') return {
      kind: 'conflict' as const, requestRef: args.requestRef, reason: 'revision_changed' as const,
    }
    if (committed.kind === 'identity_conflict') return {
      kind: 'conflict' as const, requestRef: args.requestRef, reason: 'identity_changed' as const,
    }
    if (committed.kind === 'command_conflict') return {
      kind: 'conflict' as const, requestRef: args.requestRef, reason: 'idempotency_key_reused' as const,
    }
    const requestRevision = committed.kind === 'replayed' ? committed.revision : snapshot.revision
    const existing: StoredEvaluation | null = await ctx.runQuery(internal.customerRequests.getRequestEvaluation, {
      requestId: args.requestRef, requestRevision,
    })
    if (existing !== null) return writableView(projectStoredEvaluation(existing))
    const durableSnapshot: SnapshotValue | null = committed.kind === 'replayed'
      ? await ctx.runQuery(internal.customerRequests.getRequestSnapshot, { requestId: args.requestRef, revision: requestRevision })
      : snapshot
    if (durableSnapshot === null) return writableView(projectNeedsAttention({
      requestRef: args.requestRef, revision: requestRevision, summary: 'This request needs attention before it can continue.',
    }))
    const nextEvaluation = await evaluateAndPersistSnapshot(ctx, durableSnapshot)
    return nextEvaluation.kind === 'stored'
      ? writableView(projectRequestEvaluation({ snapshot: durableSnapshot, evaluation: nextEvaluation.evaluation }))
      : writableView(projectNeedsAttention({
          requestRef: args.requestRef, revision: requestRevision, summary: 'This request changed before reevaluation completed.',
        }))
  }
  const request = await ctx.runQuery(internal.customerRequests.getRequest, { requestId: args.requestRef })
    if (request === null || request.principalId !== caller.principalId) return { kind: 'refused' as const, reason: 'request_not_found' as const }
    const compilation = await ctx.runQuery(internal.customerRequests.getCompilationForRequestRevision, {
      requestId: request.requestId, requestRevision: request.revision,
    })
    const allowedFields = new Set(compilation?.outcome.kind === 'needs_information'
      ? compilation.outcome.missingInformation.map((item: { field: string }) => item.field)
      : [])
    if (Object.keys(args.facts).length === 0 || Object.keys(args.facts).some((field) => !allowedFields.has(field))) {
      return writableView(projectNeedsAttention({
        requestRef: request.requestId, revision: request.revision,
        summary: 'Only the requested information can be added at this point.',
      }))
    }
    const apiKey = process.env.OPENROUTER_API_KEY?.trim()
    if (apiKey === undefined || apiKey.length === 0) return { kind: 'refused' as const, reason: 'interpreter_unavailable' as const }
    const registry = await loadConvexCapabilityContractRegistry(ctx)
    if (registry.list().length === 0) return { kind: 'refused' as const, reason: 'capabilities_unavailable' as const }
    const result = await compileCustomerRequest({
      compilationKey: namespacedKey(caller.principalId, 'facts', request.requestId, args.idempotencyKey),
      requestId: request.requestId, expectedRevision: args.expectedRevision,
      principalId: caller.principalId, delegatedAgentId: request.delegatedAgentId,
      customerJob: request.intent, knownFacts: { ...request.knownFacts, ...args.facts }, routing: request.routing,
    }, {
      interpreter: customerRequestInterpreter(apiKey), registry,
      store: createConvexCustomerRequestCompilationStore(ctx), now: Date.now,
    })
    return writableProjection(projectCustomerRequest(result))
}

function resolvePlanInput(
  input: Readonly<Record<string, Readonly<{ kind: 'literal'; value: string | number | boolean } | { kind: 'customer_fact'; fact: string } | { kind: 'action_output'; actionId: string; field: string }>>>,
  knownFacts: Readonly<Record<string, string | number | boolean>>,
): Record<string, string | number | boolean> | undefined {
  const resolved: Record<string, string | number | boolean> = {}
  for (const [field, source] of Object.entries(input)) {
    if (source.kind === 'action_output') return undefined
    const value = source.kind === 'literal' ? source.value : knownFacts[source.fact]
    if (value === undefined) return undefined
    resolved[field] = value
  }
  return resolved
}

function writableCandidateSet(candidateSet: PreparedRouteCandidateSet) {
  return {
    ...candidateSet,
    candidates: candidateSet.candidates.map((candidate) => ({
      ...candidate, business: { ...candidate.business }, expectedCost: { ...candidate.expectedCost }, maximumCost: { ...candidate.maximumCost },
      priceComponents: candidate.priceComponents.map((component) => ({ ...component })),
      comparableOutputs: candidate.comparableOutputs.map((output) => ({ ...output })), materialTerms: [...candidate.materialTerms], cancellation: { ...candidate.cancellation },
    })),
    attempts: candidateSet.attempts.map((attempt) => ({ ...attempt, business: { ...attempt.business } })),
  }
}

function writableProjection(projection: ReturnType<typeof projectCustomerRequest>) {
  return projection.kind === 'conflict' ? { ...projection } : {
    ...projection, missingFields: projection.missingFields.map((field) => ({ ...field })),
    options: projection.options.map((option) => ({
      ...option, business: { ...option.business }, expectedCost: { ...option.expectedCost }, maximumCost: { ...option.maximumCost },
      priceComponents: option.priceComponents.map((component) => ({ ...component })),
      comparableOutputs: option.comparableOutputs.map((output) => ({ ...output })),
      materialTerms: [...option.materialTerms], cancellation: { ...option.cancellation },
    })),
  }
}

function writableView(view: CustomerRequestView) {
  return {
    ...view,
    missingFields: view.missingFields.map((field) => ({ ...field })),
    options: view.options.map((option) => ({
      ...option, business: { ...option.business }, expectedCost: { ...option.expectedCost }, maximumCost: { ...option.maximumCost },
      priceComponents: option.priceComponents.map((component) => ({ ...component })),
      comparableOutputs: option.comparableOutputs.map((output) => ({ ...output })),
      materialTerms: [...option.materialTerms], cancellation: { ...option.cancellation },
    })),
  }
}

function projectStoredEvaluation(input: StoredEvaluation): CustomerRequestView {
  const evaluation: RequestEvaluation = {
    requestId: input.evaluation.requestId,
    requestRevision: input.evaluation.requestRevision,
    registrySnapshotDigest: input.evaluation.registrySnapshotDigest,
    factsDigest: input.evaluation.factsDigest,
    facts: input.evaluation.facts ?? input.snapshot.facts,
    candidates: input.candidates,
    ...(input.evaluation.nextRequirement === undefined ? {} : {
      nextRequirement: input.evaluation.nextRequirement.kind === 'intent_direction'
        ? {
            kind: 'intent_direction' as const, prompt: input.evaluation.nextRequirement.prompt,
            requirementDigest: input.evaluation.nextRequirement.requirementDigest,
          }
        : {
            kind: 'contract_fact' as const,
            field: input.evaluation.nextRequirement.field,
            customerLabel: input.evaluation.nextRequirement.customerLabel,
            impact: {
              affectedCandidates: input.evaluation.nextRequirement.affectedCandidates,
              probesEnabled: input.evaluation.nextRequirement.probesEnabled,
            },
            requirementDigest: input.evaluation.nextRequirement.requirementDigest,
          },
    }),
    posture: input.evaluation.posture,
    evaluationDigest: input.evaluation.evaluationDigest,
  }
  return projectRequestEvaluation({ snapshot: input.snapshot, evaluation })
}

async function evaluateAndPersistSnapshot(
  ctx: ActionCtx,
  snapshot: SnapshotValue,
): Promise<Readonly<{ kind: 'stored'; evaluation: RequestEvaluation }> | Readonly<{
  kind: 'stale' | 'conflict' | 'interpreter_unavailable'
}>> {
  const registry = await loadConvexCapabilityContractRegistry(ctx)
  const bindings: EligibleBinding[] = await ctx.runQuery(
    internal.routingKernelBindings.listEligible, { networkId: snapshot.networkId },
  )
  const registrySnapshotDigest = requestRegistrySnapshotDigest(bindings)
  const apiKey = process.env.OPENROUTER_API_KEY?.trim()
  if (apiKey === undefined || apiKey.length === 0) return { kind: 'interpreter_unavailable' as const }
  const model = process.env.AE_CUSTOMER_REQUEST_MODEL?.trim() || 'openai/gpt-4.1-mini'
  const semanticInterpreter = createJsonCustomerRequestSemanticInterpreter({
    interpreterId: `openrouter:${model}`,
    transport: createOpenRouterCustomerRequestSemanticTransport({
      apiKey, model, ...(process.env.AE_SITE_URL?.trim() ? { siteUrl: process.env.AE_SITE_URL.trim() } : {}),
    }),
    timeoutMs: 20_000,
    maximumResponseBytes: 64_000,
  })
  let proposal
  try { proposal = await semanticInterpreter.propose({
    customerJob: snapshot.intent,
    explicitFacts: Object.fromEntries(Object.entries(snapshot.facts).map(([field, fact]) => [field, fact.value])),
    capabilities: registry.list().map((contract) => ({
      capabilityContractId: contract.capabilityContractId,
      name: contract.name,
      operation: contract.operation,
      description: contract.preparation?.customerLabel ?? contract.name,
      input: Object.entries(contract.input).map(([field, definition]) => ({
        field, customerLabel: definition.customerLabel, valueType: definition.valueType, required: definition.required,
      })),
      output: Object.entries(contract.output).map(([field, definition]) => ({
        field, customerLabel: definition.customerLabel, valueType: definition.valueType, required: definition.required,
      })),
    })),
  }) } catch { return { kind: 'interpreter_unavailable' as const } }
  const evaluation = proposal.kind === 'needs_intent_direction'
    ? evaluateIntentDirectionRequestSnapshot({
        requestId: snapshot.requestId, requestRevision: snapshot.revision,
        intent: snapshot.intent, facts: snapshot.facts, registrySnapshotDigest, prompt: proposal.prompt,
      })
    : evaluateCustomerRequestSnapshot({
        requestId: snapshot.requestId, requestRevision: snapshot.revision,
        intent: snapshot.intent, facts: Object.freeze({ ...proposal.facts, ...snapshot.facts }),
        registrySnapshotDigest,
        candidates: discoverRequestEvaluationCandidates({
          candidateCapabilityContractIds: proposal.candidateCapabilityContractIds, bindings,
          resolveContract: (capabilityContractId) => registry.get(capabilityContractId),
        }),
      })
  const persisted: Readonly<{ kind: 'stored' | 'stale' | 'conflict' }> = await ctx.runMutation(
    internal.customerRequests.putRequestEvaluation,
    {
      evaluation: {
        evaluationId: `evaluation:${evaluation.evaluationDigest}`,
        requestId: evaluation.requestId, requestRevision: evaluation.requestRevision,
        registrySnapshotDigest: evaluation.registrySnapshotDigest, factsDigest: evaluation.factsDigest,
        facts: evaluation.facts,
        posture: evaluation.posture,
        ...(evaluation.nextRequirement === undefined ? {} : {
          nextRequirement: evaluation.nextRequirement.kind === 'intent_direction'
            ? {
                kind: 'intent_direction' as const, prompt: evaluation.nextRequirement.prompt,
                requirementDigest: evaluation.nextRequirement.requirementDigest,
              }
            : {
                kind: 'contract_fact' as const,
                field: evaluation.nextRequirement.field, customerLabel: evaluation.nextRequirement.customerLabel,
                affectedCandidates: [...evaluation.nextRequirement.impact.affectedCandidates],
                probesEnabled: [...evaluation.nextRequirement.impact.probesEnabled],
                requirementDigest: evaluation.nextRequirement.requirementDigest,
              },
        }),
        evaluationDigest: evaluation.evaluationDigest, evaluatedAt: Date.now(),
      },
      candidates: evaluation.candidates.map((candidate) => ({
        ...candidate,
        viability: candidate.viability.kind === 'viable' ? { kind: 'viable' as const } : {
          kind: 'blocked_on_information' as const, fields: [...candidate.viability.fields],
        },
      })),
    },
  )
  return persisted.kind === 'stored' ? { kind: 'stored', evaluation } : { kind: persisted.kind }
}

function namespacedKey(principalId: string, operation: string, requestRef: string, callerKey: string): string {
  return `${operation}:${canonicalDigest({ principalId, requestRef, callerKey })}`
}

function customerRequestInterpreter(apiKey: string) {
  return createJsonCustomerRequestInterpreter({
    interpreterId: `openrouter:${process.env.AE_CUSTOMER_REQUEST_MODEL?.trim() || 'openai/gpt-4.1-mini'}`,
    transport: createOpenRouterCustomerRequestTransport({
      apiKey,
      model: process.env.AE_CUSTOMER_REQUEST_MODEL?.trim() || 'openai/gpt-4.1-mini',
      ...(process.env.AE_SITE_URL?.trim() ? { siteUrl: process.env.AE_SITE_URL.trim() } : {}),
    }),
    timeoutMs: 20_000,
    maximumResponseBytes: 64_000,
  })
}

type ServiceAssertion = Infer<typeof serviceAssertion>
type RequestCaller = Readonly<{ principalId: string; delegatedAgentId: string }>

async function resolveRequestCaller(
  ctx: ActionCtx,
  operation: 'submit' | 'compare' | 'resume' | 'facts',
  command: Record<string, string | number | boolean | Record<string, unknown> | undefined>,
  assertion: ServiceAssertion | undefined,
  delegatedAgentId?: string,
): Promise<RequestCaller | undefined> {
  const identity = await ctx.auth.getUserIdentity()
  if (identity !== null) return { principalId: identity.tokenIdentifier, delegatedAgentId: delegatedAgentId ?? identity.tokenIdentifier }
  const key = process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN?.trim()
  if (assertion === undefined || key === undefined || key.length < 32 || !assertion.scopes.includes('customer_requests:create')) return undefined
  const verified = await verifyCustomerRequestServiceAssertion({ key, operation, command: command as never, assertion })
  if (!verified) return undefined
  const recorded = await ctx.runMutation(internal.customerRequests.recordAgentPrincipal, {
    principalId: assertion.principalId, ownerId: assertion.ownerId, credentialId: assertion.credentialId,
    scopes: [...assertion.scopes], seenAt: Date.now(),
  })
  if (recorded.kind !== 'recorded') return undefined
  return { principalId: assertion.principalId, delegatedAgentId: assertion.principalId }
}

function submitCommand(args: Readonly<{
  compilationKey: string
  requestId: string
  expectedRevision?: number
  delegatedAgentId: string
  customerJob: string
  knownFacts: Record<string, string | number | boolean>
  routing: {
    networkId: string; currency?: string; maximumSpendMinor?: number; optimizeFor?: 'cost' | 'latency'
  }
}>) {
  return {
    compilationKey: args.compilationKey, requestId: args.requestId,
    ...(args.expectedRevision === undefined ? {} : { expectedRevision: args.expectedRevision }),
    delegatedAgentId: args.delegatedAgentId, customerJob: args.customerJob,
    knownFacts: args.knownFacts, routing: args.routing,
  }
}

function factsCommand(args: Readonly<{
  requestRef: string
  expectedRevision: number
  idempotencyKey: string
  facts: Readonly<Record<string, string | number | boolean>>
}>) {
  return {
    requestRef: args.requestRef, expectedRevision: args.expectedRevision,
    idempotencyKey: args.idempotencyKey, facts: args.facts,
  }
}
