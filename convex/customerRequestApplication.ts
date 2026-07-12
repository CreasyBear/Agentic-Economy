import { v } from 'convex/values'

import { compileCustomerRequest } from '@/modules/customer-request/compiler'
import { createJsonCustomerRequestInterpreter } from '@/modules/customer-request/interpreter'
import { createOpenRouterCustomerRequestTransport } from '@/modules/customer-request/openrouter-transport'
import { projectCustomerRequest } from '@/modules/customer-request/customer-projection'
import { prepareCustomerRequestAction, type PreparedRouteCandidateSet } from '@/modules/customer-request/preparation'
import { createKernelCustomerRequestActionRouter } from '@/modules/customer-request/kernel-router'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { preparedRouteCandidateSetValue } from '@/modules/customer-request/runtime'

import { action } from './_generated/server'
import { internal } from './_generated/api'
import { loadConvexCapabilityContractRegistry } from './customerRequestCapabilityContractRegistryAdapter'
import { createConvexCustomerRequestCompilationStore } from './customerRequestCompilationStoreAdapter'
import { createConvexCustomerRequestPreparationStore } from './customerRequestStoreAdapter'
import { createConvexPreparationDisclosureStore } from './customerRequestPreparationAuthorityStoreAdapter'
import { createRegisteredRoutingKernel } from './routingKernel'

const literalValue = v.union(v.string(), v.number(), v.boolean())
const customerProjection = v.union(
  v.object({
    kind: v.literal('request'), requestRef: v.string(), revision: v.number(),
    status: v.union(v.literal('ready_to_compare'), v.literal('needs_information'), v.literal('unsupported')),
    summary: v.string(), nextAction: v.union(v.literal('compare_options'), v.literal('provide_information'), v.literal('revise_request')),
    missingFields: v.array(v.object({ field: v.string(), label: v.string(), explanation: v.string() })), stepCount: v.number(),
  }),
  v.object({
    kind: v.literal('conflict'), requestRef: v.string(),
    reason: v.union(v.literal('revision_changed'), v.literal('identity_changed'), v.literal('idempotency_key_reused')),
  }),
)
const optionProjection = v.union(
  v.object({ kind: v.literal('options'), requestRef: v.string(), revision: v.number(), options: preparedRouteCandidateSetValue }),
  v.object({ kind: v.literal('checking'), requestRef: v.string(), revision: v.number(), nextAction: v.literal('check_again'), inspectionRef: v.optional(v.string()) }),
  v.object({ kind: v.literal('unavailable'), requestRef: v.string(), revision: v.number(), nextAction: v.literal('revise_request'), explanation: v.string() }),
  v.object({ kind: v.literal('conflict'), requestRef: v.string(), reason: v.union(v.literal('revision_changed'), v.literal('request_not_ready')) }),
  v.object({ kind: v.literal('refused'), reason: v.literal('authentication_required') }),
)

export const submit = action({
  args: {
    compilationKey: v.string(), requestId: v.string(), expectedRevision: v.optional(v.number()), delegatedAgentId: v.string(),
    customerJob: v.string(), knownFacts: v.record(v.string(), literalValue),
    routing: v.object({
      networkId: v.string(), currency: v.string(), maximumSpendMinor: v.number(),
      optimizeFor: v.union(v.literal('cost'), v.literal('latency')),
    }),
  },
  returns: v.union(
    customerProjection,
    v.object({ kind: v.literal('refused'), reason: v.union(v.literal('authentication_required'), v.literal('interpreter_unavailable'), v.literal('capabilities_unavailable')) }),
  ),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) return { kind: 'refused' as const, reason: 'authentication_required' as const }
    const apiKey = process.env.OPENROUTER_API_KEY?.trim()
    if (apiKey === undefined || apiKey.length === 0) return { kind: 'refused' as const, reason: 'interpreter_unavailable' as const }
    const registry = await loadConvexCapabilityContractRegistry(ctx)
    if (registry.list().length === 0) return { kind: 'refused' as const, reason: 'capabilities_unavailable' as const }
    const result = await compileCustomerRequest({
      ...args,
      principalId: identity.tokenIdentifier,
    }, {
      interpreter: createJsonCustomerRequestInterpreter({
        interpreterId: `openrouter:${process.env.AE_CUSTOMER_REQUEST_MODEL?.trim() || 'openai/gpt-4.1-mini'}`,
        transport: createOpenRouterCustomerRequestTransport({
          apiKey,
          model: process.env.AE_CUSTOMER_REQUEST_MODEL?.trim() || 'openai/gpt-4.1-mini',
          ...(process.env.AE_SITE_URL?.trim() ? { siteUrl: process.env.AE_SITE_URL.trim() } : {}),
        }),
        timeoutMs: 20_000,
        maximumResponseBytes: 64_000,
      }),
      registry,
      store: createConvexCustomerRequestCompilationStore(ctx),
      now: Date.now,
    })
    return writableProjection(projectCustomerRequest(result))
  },
})

export const compare = action({
  args: { requestRef: v.string(), revision: v.number(), idempotencyKey: v.string() },
  returns: optionProjection,
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) return { kind: 'refused' as const, reason: 'authentication_required' as const }
    const store = createConvexCustomerRequestPreparationStore(ctx)
    const request = await store.getRequest(args.requestRef)
    if (request === undefined || request.principalId !== identity.tokenIdentifier) {
      return { kind: 'conflict' as const, requestRef: args.requestRef, reason: 'request_not_ready' as const }
    }
    if (request.revision !== args.revision) return { kind: 'conflict' as const, requestRef: args.requestRef, reason: 'revision_changed' as const }
    const plan = await ctx.runQuery(internal.customerRequests.getPlanForRequestRevision, {
      requestId: args.requestRef, requestRevision: args.revision,
    })
    const actionStep = plan?.actions.find((candidate) => candidate.dependsOn.length === 0)
    if (plan === null || actionStep === undefined) return { kind: 'conflict' as const, requestRef: args.requestRef, reason: 'request_not_ready' as const }
    const resolvedInput = resolvePlanInput(actionStep.input, request.knownFacts)
    if (resolvedInput === undefined) return { kind: 'conflict' as const, requestRef: args.requestRef, reason: 'request_not_ready' as const }
    const registry = await loadConvexCapabilityContractRegistry(ctx)
    const result = await prepareCustomerRequestAction({
      preparationKey: args.idempotencyKey, requestId: request.requestId, requestRevision: request.revision,
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
    if (result.kind === 'options_prepared') return {
      kind: 'options' as const, requestRef: request.requestId, revision: request.revision,
      options: writableCandidateSet(result.candidateSet),
    }
    if (result.kind === 'preparation_in_progress') return {
      kind: 'checking' as const, requestRef: request.requestId, revision: request.revision, nextAction: 'check_again' as const,
      ...(result.inspectionRef === undefined ? {} : { inspectionRef: result.inspectionRef }),
    }
    if (result.kind === 'prepared') return {
      kind: 'unavailable' as const, requestRef: request.requestId, revision: request.revision, nextAction: 'revise_request' as const,
      explanation: 'This request produced one prepared option; customer comparison projection is not available for this capability yet.',
    }
    return {
      kind: 'unavailable' as const, requestRef: request.requestId, revision: request.revision, nextAction: 'revise_request' as const,
      explanation: 'AE could not prepare comparable business options from the currently connected capabilities.',
    }
  },
})

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
  }
}
