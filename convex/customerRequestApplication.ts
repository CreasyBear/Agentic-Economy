import { v, type Infer } from 'convex/values'

import {
  openCapabilityDecisionModel,
  sameCapabilityContractRef,
  isBoundedJsonValue,
  type CapabilityContractRef,
  type CapabilityDecisionModel,
  type JsonValue,
} from '@/modules/capability-contract/public'
import { encodeCapabilityContractDocumentJson } from '@/modules/capability-contract-registry/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  compileCustomerRequest,
  writableCustomerRequestV2Aggregate,
} from '@/modules/customer-request/compiler'
import { requestRegistrySnapshotDigest, type RequestFact } from '@/modules/customer-request/evaluation'
import { customerRequestV2AggregateValue, durableActionPreparationV2Value } from '@/modules/customer-request/runtime'
import {
  projectNeedsAttention,
  projectRequestEvaluation,
  type CustomerRequestView,
} from '@/modules/customer-request/customer-projection'
import {
  bindCustomerCapabilityDescriptor,
  createJsonCustomerRequestSemanticInterpreter,
  type CustomerRequestSemanticProposal,
} from '@/modules/customer-request/semantic-interpreter'
import { createOpenRouterCustomerRequestSemanticTransport } from '@/modules/customer-request/openrouter-transport'
import { verifyCustomerRequestServiceAssertion } from '@/modules/customer-request/service-auth-envelope'

import { internal } from './_generated/api'
import { action, type ActionCtx } from './_generated/server'

const serviceAssertion = v.object({
  principalId: v.string(), ownerId: v.string(), credentialId: v.string(), scopes: v.array(v.string()),
  issuedAt: v.number(), signature: v.string(),
})
const commercialInfluence = v.union(
  v.object({ status: v.literal('unknown') }),
  v.object({ status: v.literal('none'), summary: v.string() }),
  v.object({
    status: v.literal('disclosed'),
    relationship: v.union(
      v.literal('commission'), v.literal('sponsorship'), v.literal('rebate'),
      v.literal('ownership'), v.literal('other'),
    ),
    summary: v.string(), payerName: v.string(), beneficiaryName: v.string(), compensationBasis: v.string(),
    influencesEligibility: v.boolean(), influencesInclusion: v.boolean(), influencesOrder: v.boolean(),
  }),
)
const customerOption = v.object({
  optionRef: v.string(), business: v.object({ name: v.string() }),
  expectedCost: v.object({ currency: v.string(), amountMinor: v.number() }),
  maximumCost: v.object({ currency: v.string(), amountMinor: v.number() }),
  expectedLatencyMs: v.number(),
  priceComponents: v.array(v.object({ label: v.string(), amountMinor: v.number() })),
  comparableOutputs: v.array(v.object({
    label: v.string(), value: v.union(v.string(), v.number(), v.boolean()),
  })),
  materialTerms: v.array(v.string()),
  cancellation: v.object({
    kind: v.union(v.literal('supported'), v.literal('conditional'), v.literal('unsupported')),
    summary: v.string(),
  }),
  expiresAt: v.number(),
  provenance: v.object({ kind: v.literal('provider_assertion'), observedAt: v.optional(v.number()), validUntil: v.number() }),
  commercialInfluence,
})
const customerOptionSet = v.object({
  cardinality: v.union(v.literal('none'), v.literal('single'), v.literal('multiple')),
  optionCount: v.number(),
  ordering: v.union(
    v.object({
      kind: v.literal('not_applicable'),
      commercialInfluence: v.union(v.literal('none'), v.literal('disclosed'), v.literal('unknown')),
    }),
    v.object({
      kind: v.literal('unranked'),
      commercialInfluence: v.union(v.literal('none'), v.literal('disclosed'), v.literal('unknown')),
    }),
    v.object({
      kind: v.literal('recommended'), commercialInfluence: v.union(v.literal('none'), v.literal('disclosed')),
      objective: v.literal('lowest_maximum_price'), optionRef: v.string(), evidenceRef: v.string(),
      reasons: v.array(v.string()), tradeoffs: v.array(v.string()),
    }),
  ),
  coverage: v.object({
    evaluated: v.number(), optionsReceived: v.number(), unavailable: v.number(), pending: v.number(), uncertain: v.number(),
    businesses: v.array(v.object({
      name: v.string(),
      status: v.union(
        v.literal('not_contacted'), v.literal('contact_pending'), v.literal('contacted'),
        v.literal('option_received'), v.literal('unavailable'), v.literal('uncertain'),
      ),
      explanation: v.string(),
    })),
  }),
  options: v.array(customerOption),
})
const customerView = v.object({
  kind: v.literal('request'), requestRef: v.string(), revision: v.number(),
  state: v.union(
    v.literal('needs_information'), v.literal('ready_to_compare'), v.literal('preparing_options'),
    v.literal('options_ready'), v.literal('no_options'), v.literal('needs_authorization'),
    v.literal('unsupported'), v.literal('needs_attention'),
  ),
  summary: v.string(),
  nextAction: v.union(
    v.literal('provide_information'), v.literal('prepare_options'), v.literal('wait'),
    v.literal('inspect_options'), v.literal('revise_request'), v.literal('review_disclosure'), v.literal('retry'),
  ),
  missingFields: v.array(v.object({ field: v.string(), label: v.string(), explanation: v.string() })),
  criteria: v.array(v.object({
    label: v.string(), value: v.any(), // runtime-validated JsonValue boundary
    basis: v.union(v.literal('customer_provided'), v.literal('extracted_from_request')),
  })),
  disclosureReview: v.optional(v.object({
    purpose: v.string(), maximumRecipients: v.number(),
    categories: v.array(v.object({
      label: v.string(), classification: v.union(
        v.literal('public'), v.literal('personal'), v.literal('sensitive'), v.literal('credential'),
      ),
    })),
  })),
  preparationRef: v.optional(v.string()),
  clarification: v.optional(v.union(
    v.object({ kind: v.literal('intent_direction'), prompt: v.string(), answerKind: v.literal('natural_language') }),
    v.object({ kind: v.literal('contract_fact'), requirementKey: v.string(), prompt: v.string(), answerKind: v.literal('typed_value') }),
  )),
  options: v.array(customerOption),
  optionSet: v.optional(customerOptionSet),
})
const conflict = v.object({
  kind: v.literal('conflict'), requestRef: v.string(),
  reason: v.union(v.literal('revision_changed'), v.literal('identity_changed'), v.literal('idempotency_key_reused')),
})
const refusedReason = v.union(
  v.literal('authentication_required'), v.literal('request_not_found'),
  v.literal('interpreter_unavailable'), v.literal('capabilities_unavailable'),
)
const actionResult = v.union(customerView, conflict, v.object({ kind: v.literal('refused'), reason: refusedReason }))
type ActionResult = Infer<typeof actionResult>

export const submit = action({
  args: {
    compilationKey: v.string(), requestId: v.string(), expectedRevision: v.optional(v.number()),
    delegatedAgentId: v.string(), customerJob: v.string(),
    routing: v.object({
      networkId: v.string(), currency: v.optional(v.string()), maximumSpendMinor: v.optional(v.number()),
      optimizeFor: v.optional(v.union(v.literal('cost'), v.literal('latency'))),
    }),
    serviceAuth: v.optional(serviceAssertion),
  },
  returns: actionResult,
  handler: async (ctx, args): Promise<ActionResult> => {
    const command = {
      compilationKey: args.compilationKey,
      requestId: args.requestId,
      ...(args.expectedRevision === undefined ? {} : { expectedRevision: args.expectedRevision }),
      delegatedAgentId: args.delegatedAgentId,
      customerJob: args.customerJob,
      routing: args.routing,
    }
    const caller = await resolveRequestCaller(ctx, 'submit', command, args.serviceAuth, args.delegatedAgentId)
    if (caller === undefined) return { kind: 'refused', reason: 'authentication_required' }
    return await interpretCompileCommit(ctx, {
      commandKey: namespacedKey(caller.principalId, 'submit', args.requestId, args.compilationKey),
      commandDigest: canonicalDigest(command),
      requestId: args.requestId,
      expectedRevision: args.expectedRevision ?? 0,
      principalId: caller.principalId,
      delegatedAgentId: caller.delegatedAgentId,
      intent: args.customerJob,
      networkId: args.routing.networkId,
      priorFacts: [],
    })
  },
})

export const refine = action({
  args: {
    requestRef: v.string(), expectedRevision: v.number(), idempotencyKey: v.string(), message: v.string(),
    serviceAuth: v.optional(serviceAssertion),
  },
  returns: actionResult,
  handler: async (ctx, args): Promise<ActionResult> => {
    const caller = await resolveRequestCaller(ctx, 'refine', {
      requestRef: args.requestRef, expectedRevision: args.expectedRevision,
      idempotencyKey: args.idempotencyKey, message: args.message,
    }, args.serviceAuth)
    if (caller === undefined) return { kind: 'refused', reason: 'authentication_required' }
    const current = await loadCurrent(ctx, args.requestRef)
    if (current.kind !== 'current' || current.aggregate.snapshot.principalId !== caller.principalId) {
      return { kind: 'refused', reason: 'request_not_found' }
    }
    if (current.aggregate.snapshot.revision !== args.expectedRevision) return {
      kind: 'conflict', requestRef: args.requestRef, reason: 'revision_changed',
    }
    const intent = `${current.aggregate.snapshot.intent.trim()}\n${args.message.trim()}`
    return await interpretCompileCommit(ctx, {
      commandKey: namespacedKey(caller.principalId, 'refine', args.requestRef, args.idempotencyKey),
      commandDigest: canonicalDigest({
        requestRef: args.requestRef, expectedRevision: args.expectedRevision,
        idempotencyKey: args.idempotencyKey, message: args.message,
      }),
      requestId: args.requestRef,
      expectedRevision: args.expectedRevision,
      principalId: caller.principalId,
      delegatedAgentId: current.aggregate.snapshot.delegatedAgentId,
      intent,
      networkId: current.aggregate.snapshot.networkId,
      priorFacts: current.aggregate.snapshot.facts,
    })
  },
})

export const provideFacts = action({
  args: {
    requestRef: v.string(), expectedRevision: v.number(), idempotencyKey: v.string(),
    requirementKey: v.string(), value: v.any(), // runtime-validated JsonValue boundary
    serviceAuth: v.optional(serviceAssertion),
  },
  returns: actionResult,
  handler: async (ctx, args): Promise<ActionResult> => {
    const caller = await resolveRequestCaller(ctx, 'facts', {
      requestRef: args.requestRef, expectedRevision: args.expectedRevision,
      idempotencyKey: args.idempotencyKey, requirementKey: args.requirementKey, value: args.value,
    }, args.serviceAuth)
    if (caller === undefined) return { kind: 'refused', reason: 'authentication_required' }
    const current = await loadCurrent(ctx, args.requestRef)
    if (current.kind !== 'current' || current.aggregate.snapshot.principalId !== caller.principalId) {
      return { kind: 'refused', reason: 'request_not_found' }
    }
    if (current.aggregate.snapshot.revision !== args.expectedRevision) return {
      kind: 'conflict', requestRef: args.requestRef, reason: 'revision_changed',
    }
    const requirement = current.aggregate.evaluation.nextRequirement
    if (requirement?.kind !== 'contract_fact' || requirement.requirementKey !== args.requirementKey) {
      return writableView(projectNeedsAttention({
        requestRef: args.requestRef, revision: args.expectedRevision,
        summary: 'Answer the current question before continuing.',
      }))
    }
    const graph = await loadRequestGraph(ctx, current.aggregate.snapshot.networkId)
    if (graph.kind !== 'available') return { kind: 'refused', reason: 'capabilities_unavailable' }
    if (graph.registrySnapshotDigest !== current.aggregate.evaluation.registrySnapshotDigest) {
      return writableView(projectNeedsAttention({
        requestRef: args.requestRef, revision: args.expectedRevision,
        summary: 'The available options changed. Review the request again before answering.',
      }))
    }
    const answerFacts = bindRequirementAnswer(requirement, args.value, graph.models, args.expectedRevision + 1)
    if (answerFacts === undefined) return writableView(projectNeedsAttention({
      requestRef: args.requestRef, revision: args.expectedRevision,
      summary: 'That answer does not match the requested information.',
    }))
    const selections = current.aggregate.plan.actions.flatMap((action) => {
      const model = graph.models.find((candidate) => sameCapabilityContractRef(candidate.contractRef, action.contractRef))
      if (model === undefined || model.selectionKey !== action.selectionKey || model.semanticDigest !== action.semanticDigest) return []
      return [{
        selectionKey: model.selectionKey,
        contractRef: model.contractRef,
        facts: answerFacts.filter((fact) => fact.selectionKey === model.selectionKey
          && sameCapabilityContractRef(fact.contractRef, model.contractRef)),
      }]
    })
    const proposal: CustomerRequestSemanticProposal = { kind: 'capability_candidates', selections }
    return await compileCommit(ctx, {
      commandKey: namespacedKey(caller.principalId, 'facts', args.requestRef, args.idempotencyKey),
      commandDigest: canonicalDigest({
        requestRef: args.requestRef, expectedRevision: args.expectedRevision,
        idempotencyKey: args.idempotencyKey, requirementKey: args.requirementKey, value: args.value,
      }),
      requestId: args.requestRef,
      expectedRevision: args.expectedRevision,
      principalId: caller.principalId,
      delegatedAgentId: current.aggregate.snapshot.delegatedAgentId,
      intent: current.aggregate.snapshot.intent,
      networkId: current.aggregate.snapshot.networkId,
      priorFacts: rebindStoredFacts(current.aggregate.snapshot.facts, graph.models),
      proposal,
      interpreterId: 'customer:requirement-answer',
      graph,
    })
  },
})

export const resume = action({
  args: { requestRef: v.string(), serviceAuth: v.optional(serviceAssertion) },
  returns: actionResult,
  handler: async (ctx, args): Promise<ActionResult> => {
    const caller = await resolveRequestCaller(ctx, 'resume', { requestRef: args.requestRef }, args.serviceAuth)
    if (caller === undefined) return { kind: 'refused', reason: 'authentication_required' }
    const current = await loadCurrent(ctx, args.requestRef)
    if (current.kind === 'needs_attention') return writableView(projectNeedsAttention({
      requestRef: args.requestRef, revision: 0,
      summary: 'This earlier request used a retired contract format. Start a new request to continue.',
    }))
    if (current.kind !== 'current' || current.aggregate.snapshot.principalId !== caller.principalId) {
      return { kind: 'refused', reason: 'request_not_found' }
    }
    if (current.aggregate.plan.actions.length === 1) {
      const action = current.aggregate.plan.actions[0]
      if (action !== undefined) {
        const preparation: PreparationResumeResult = await ctx.runQuery(
          internal.customerRequestV2Preparation.resume,
          {
            requestId: args.requestRef,
            requestRevision: current.aggregate.snapshot.revision,
            actionId: action.actionId,
            principalId: caller.principalId,
          },
        )
        if (preparation.kind === 'current') return projectStoredPreparation(current.aggregate, preparation.preparation)
        if (preparation.kind === 'stale') return writableView(projectNeedsAttention({
          requestRef: args.requestRef,
          revision: current.aggregate.snapshot.revision,
          summary: 'The registered options changed. Review this request again.',
        }))
      }
    }
    return projectStoredAggregate(current.aggregate)
  },
})

export const compare = action({
  args: {
    requestRef: v.string(), revision: v.number(), idempotencyKey: v.string(),
    serviceAuth: v.optional(serviceAssertion),
  },
  returns: actionResult,
  handler: async (ctx, args): Promise<ActionResult> => await prepareCurrentAction(ctx, args),
})

export const authorizePreparation = action({
  args: {
    requestRef: v.string(), revision: v.number(), preparationRef: v.string(), idempotencyKey: v.string(),
  },
  returns: actionResult,
  handler: async (ctx, args): Promise<ActionResult> => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) return { kind: 'refused', reason: 'authentication_required' }
    const current = await loadCurrent(ctx, args.requestRef)
    if (current.kind === 'needs_attention') return writableView(projectNeedsAttention({
      requestRef: args.requestRef, revision: 0,
      summary: 'This earlier request used a retired contract format. Start a new request to continue.',
    }))
    if (current.kind !== 'current') return { kind: 'refused', reason: 'request_not_found' }
    const requestPrincipalId = current.aggregate.snapshot.principalId
    const ownsDirectRequest = requestPrincipalId === identity.tokenIdentifier
    const agentPrincipal = ownsDirectRequest ? null : await ctx.runQuery(internal.customerRequestPrincipals.getAgentPrincipal, {
      principalId: requestPrincipalId,
    })
    if (!ownsDirectRequest && agentPrincipal?.ownerId !== identity.subject) {
      return { kind: 'refused', reason: 'request_not_found' }
    }
    if (current.aggregate.snapshot.revision !== args.revision) return {
      kind: 'conflict', requestRef: args.requestRef, reason: 'revision_changed',
    }
    if (current.aggregate.plan.actions.length !== 1 || current.aggregate.plan.actions[0] === undefined) {
      return writableView(projectNeedsAttention({
        requestRef: args.requestRef, revision: args.revision,
        summary: 'This request needs an action choice before AE can prepare it.',
      }))
    }
    const command = {
      requestRef: args.requestRef, revision: args.revision,
      preparationRef: args.preparationRef, idempotencyKey: args.idempotencyKey,
    }
    const now = Date.now()
    const result: PreparationMutationResult = await ctx.runMutation(internal.customerRequestV2Preparation.prepare, {
      commandKey: namespacedKey(requestPrincipalId, 'authorize', args.requestRef, args.idempotencyKey),
      commandDigest: canonicalDigest(command),
      principalId: requestPrincipalId,
      requestId: args.requestRef,
      expectedRevision: args.revision,
      actionId: current.aggregate.plan.actions[0].actionId,
      preparationRef: args.preparationRef,
      approvalActor: {
        kind: 'clerk_owner', requestPrincipalId, ownerId: identity.subject,
        credentialId: identity.tokenIdentifier,
        authenticationEvidenceRef: `clerk-identity:${canonicalDigest({
          issuer: identity.issuer, subject: identity.subject, tokenIdentifier: identity.tokenIdentifier,
        })}`,
        approvedAt: now,
      },
      now,
    })
    return preparationResultView(current.aggregate, result, args.requestRef, args.revision)
  },
})

async function interpretCompileCommit(ctx: ActionCtx, input: Readonly<{
  commandKey: string
  commandDigest: string
  requestId: string
  expectedRevision: number
  principalId: string
  delegatedAgentId: string
  intent: string
  networkId: string
  priorFacts: StoredAggregate['snapshot']['facts']
}>): Promise<ActionResult> {
  const replay = await replayCommittedCommand(ctx, input)
  if (replay !== undefined) return replay
  const graph = await loadRequestGraph(ctx, input.networkId)
  if (graph.kind !== 'available') return { kind: 'refused', reason: 'capabilities_unavailable' }
  const apiKey = process.env.OPENROUTER_API_KEY?.trim()
  if (apiKey === undefined || apiKey.length === 0) return { kind: 'refused', reason: 'interpreter_unavailable' }
  const modelName = process.env.AE_CUSTOMER_REQUEST_MODEL?.trim() || 'openai/gpt-4.1-mini'
  const interpreter = createJsonCustomerRequestSemanticInterpreter({
    interpreterId: `openrouter:${modelName}`,
    transport: createOpenRouterCustomerRequestSemanticTransport({
      apiKey, model: modelName,
      ...(process.env.AE_SITE_URL?.trim() ? { siteUrl: process.env.AE_SITE_URL.trim() } : {}),
    }),
    timeoutMs: 20_000,
    maximumResponseBytes: 64_000,
  })
  let proposal: CustomerRequestSemanticProposal
  try {
    proposal = await interpreter.propose({ customerJob: input.intent, capabilities: graph.descriptors })
  } catch {
    return { kind: 'refused', reason: 'interpreter_unavailable' }
  }
  return await compileCommit(ctx, {
    ...input,
    priorFacts: rebindStoredFacts(input.priorFacts, graph.models),
    proposal,
    interpreterId: interpreter.interpreterId,
    graph,
  })
}

async function compileCommit(ctx: ActionCtx, input: Readonly<{
  commandKey: string
  commandDigest: string
  requestId: string
  expectedRevision: number
  principalId: string
  delegatedAgentId: string
  intent: string
  networkId: string
  priorFacts: readonly RequestFact[]
  proposal: CustomerRequestSemanticProposal
  interpreterId: string
  graph: RequestGraph
}>): Promise<ActionResult> {
  const replay = await replayCommittedCommand(ctx, input)
  if (replay !== undefined) return replay
  const compiled = compileCustomerRequest({
    requestId: input.requestId,
    expectedRevision: input.expectedRevision,
    principalId: input.principalId,
    delegatedAgentId: input.delegatedAgentId,
    intent: input.intent,
    networkId: input.networkId,
    priorFacts: input.priorFacts,
    proposal: input.proposal,
    interpreterId: input.interpreterId,
    bindings: input.graph.bindings,
    models: input.graph.models,
    now: Date.now(),
  })
  if (compiled.kind === 'refused') return writableView(projectNeedsAttention({
    requestRef: input.requestId,
    revision: input.expectedRevision,
    summary: compiled.reason === 'capability_graph_invalid'
      ? 'The registered options changed. Try this request again.'
      : 'The request could not be interpreted safely.',
  }))
  const result: CommitResult = await ctx.runMutation(internal.customerRequestV2.commitAggregate, {
    commandKey: input.commandKey,
    commandDigest: input.commandDigest,
    expectedRevision: input.expectedRevision,
    aggregate: writableCustomerRequestV2Aggregate(compiled.aggregate),
  })
  if (result.kind === 'revision_conflict') return {
    kind: 'conflict', requestRef: input.requestId, reason: 'revision_changed',
  }
  if (result.kind === 'identity_conflict') return {
    kind: 'conflict', requestRef: input.requestId, reason: 'identity_changed',
  }
  if (result.kind === 'command_conflict') return {
    kind: 'conflict', requestRef: input.requestId, reason: 'idempotency_key_reused',
  }
  if (result.kind === 'aggregate_invalid') return writableView(projectNeedsAttention({
    requestRef: input.requestId, revision: input.expectedRevision,
    summary: 'The request changed before it could be recorded. Try again.',
  }))
  if (result.kind === 'context_stale') return writableView(projectNeedsAttention({
    requestRef: input.requestId, revision: input.expectedRevision,
    summary: 'The registered options changed. Try this request again.',
  }))
  return writableView(projectRequestEvaluation({
    snapshot: compiled.aggregate.snapshot,
    evaluation: compiled.aggregate.evaluation,
  }))
}

async function replayCommittedCommand(ctx: ActionCtx, input: Readonly<{
  commandKey: string
  commandDigest: string
  requestId: string
  principalId: string
}>): Promise<ActionResult | undefined> {
  const replay: CommandReplayResult = await ctx.runQuery(internal.customerRequestV2.getCommandReplay, {
    commandKey: input.commandKey,
    commandDigest: input.commandDigest,
    principalId: input.principalId,
    requestId: input.requestId,
  })
  if (replay.kind === 'not_found') return undefined
  if (replay.kind === 'conflict') return {
    kind: 'conflict', requestRef: input.requestId, reason: 'idempotency_key_reused',
  }
  return projectStoredAggregate(replay.aggregate)
}

type EligibleSupply = Readonly<{
  offering: Readonly<{
    offeringId: string; businessId: string; networkId: string; capabilityId: string; version: number; contractDigest: string
    presentation: Readonly<{ label: string; summary: string }>; registrationHash: string
  }>
  binding: Readonly<{
    bindingId: string; offeringId: string; networkId: string; capabilityId: string; version: number; contractDigest: string
    registrationHash: string
  }>
}>
type EligibleSupplyResult = Readonly<
  | { kind: 'available'; supplies: readonly EligibleSupply[] }
  | { kind: 'unavailable'; reason: string }
>
type RequestGraph = Readonly<{
  kind: 'available'
  models: readonly CapabilityDecisionModel[]
  descriptors: ReturnType<typeof bindCustomerCapabilityDescriptor>[]
  bindings: readonly Readonly<{
    businessId: string; offeringId: string; bindingId: string; contractRef: CapabilityContractRef
    offeringRegistrationHash: string; bindingRegistrationHash: string
  }>[]
  registrySnapshotDigest: string
}>

async function loadRequestGraph(ctx: ActionCtx, networkId: string): Promise<RequestGraph | Readonly<{ kind: 'unavailable' }>> {
  const supply: EligibleSupplyResult = await ctx.runQuery(internal.capabilitySupply.listEligible, { networkId, limit: 64 })
  if (supply.kind !== 'available' || supply.supplies.length === 0) return { kind: 'unavailable' }
  const modelsByRef = new Map<string, CapabilityDecisionModel>()
  const descriptors: ReturnType<typeof bindCustomerCapabilityDescriptor>[] = []
  const bindings = []
  for (const item of supply.supplies) {
    const contractRef = {
      capabilityId: item.binding.capabilityId,
      version: item.binding.version,
      contractDigest: item.binding.contractDigest,
    }
    const key = exactRefKey(contractRef)
    let model = modelsByRef.get(key)
    if (model === undefined) {
      const stored: ExactContractResult = await ctx.runQuery(
        internal.capabilityContractDocuments.getActiveExactInternal, contractRef,
      )
      if (stored.kind !== 'found') return { kind: 'unavailable' }
      const decoded = encodeCapabilityContractDocumentJson(stored.documentJson)
      if (!sameCapabilityContractRef(decoded.contract.ref, contractRef)) return { kind: 'unavailable' }
      model = openCapabilityDecisionModel(decoded.contract)
      modelsByRef.set(key, model)
      descriptors.push(bindCustomerCapabilityDescriptor({
        contractRef: model.contractRef,
        selectionKey: model.selectionKey,
        name: decoded.contract.name,
        description: decoded.contract.description,
        inputs: model.inputs,
        evidence: model.evidence.map(({ label, purpose, schemaIdentity }) => ({ label, purpose, schemaIdentity })),
      }))
    }
    bindings.push({
      businessId: String(item.offering.businessId),
      offeringId: item.offering.offeringId,
      bindingId: item.binding.bindingId,
      contractRef: model.contractRef,
      offeringRegistrationHash: item.offering.registrationHash,
      bindingRegistrationHash: item.binding.registrationHash,
    })
  }
  const registrySnapshotDigest = requestRegistrySnapshotDigest(bindings)
  return {
    kind: 'available',
    models: [...modelsByRef.values()],
    descriptors,
    bindings,
    registrySnapshotDigest,
  }
}

type ExactContractResult = Readonly<
  | { kind: 'found'; ref: CapabilityContractRef; documentJson: string; registeredAt: number }
  | { kind: 'unavailable'; reason: string }
>
type CommitResult = Readonly<
  | { kind: 'stored' | 'replayed'; requestId: string; revision: number }
  | { kind: 'revision_conflict' | 'identity_conflict' | 'command_conflict' | 'aggregate_invalid' | 'context_stale' }
>
type CommandReplayResult = Readonly<
  | { kind: 'not_found' }
  | { kind: 'conflict' }
  | { kind: 'replayed'; aggregate: StoredAggregate }
>
type StoredAggregateResult = Readonly<
  | { kind: 'current'; aggregate: StoredAggregate }
  | { kind: 'needs_attention'; requestId: string; reason: 'historical_request_resubmit_required'; resumable: false }
  | { kind: 'not_found' }
>
type StoredAggregate = Infer<typeof customerRequestV2AggregateValue>
type StoredPreparation = Infer<typeof durableActionPreparationV2Value>
type PreparationMutationResult = Readonly<
  | { kind: 'stored' | 'replayed'; preparation: StoredPreparation }
  | { kind: 'conflict'; reason: 'revision_changed' | 'idempotency_key_reused' }
  | { kind: 'needs_attention'; reason: 'capability_graph_changed' | 'historical_request_resubmit_required' }
  | { kind: 'refused'; reason: 'request_not_found' | 'action_not_found' | 'request_not_ready' | 'authority_reference_invalid' | 'authority_invalid' }
>
type PreparationResumeResult = Readonly<
  | { kind: 'current'; preparation: StoredPreparation }
  | { kind: 'not_found' | 'stale' }
>

async function loadCurrent(ctx: ActionCtx, requestId: string): Promise<StoredAggregateResult> {
  return await ctx.runQuery(internal.customerRequestV2.getCurrentAggregate, { requestId })
}

async function prepareCurrentAction(
  ctx: ActionCtx,
  args: Readonly<{
    requestRef: string
    revision: number
    idempotencyKey: string
    serviceAuth?: Infer<typeof serviceAssertion>
  }>,
): Promise<ActionResult> {
  const command = {
    requestRef: args.requestRef,
    revision: args.revision,
    idempotencyKey: args.idempotencyKey,
  }
  const caller = await resolveRequestCaller(ctx, 'compare', command, args.serviceAuth)
  if (caller === undefined) return { kind: 'refused', reason: 'authentication_required' }
  const current = await loadCurrent(ctx, args.requestRef)
  if (current.kind === 'needs_attention') return writableView(projectNeedsAttention({
    requestRef: args.requestRef, revision: 0,
    summary: 'This earlier request used a retired contract format. Start a new request to continue.',
  }))
  if (current.kind !== 'current' || current.aggregate.snapshot.principalId !== caller.principalId) {
    return { kind: 'refused', reason: 'request_not_found' }
  }
  if (current.aggregate.snapshot.revision !== args.revision) return {
    kind: 'conflict', requestRef: args.requestRef, reason: 'revision_changed',
  }
  if (current.aggregate.plan.actions.length !== 1 || current.aggregate.plan.actions[0] === undefined) {
    return writableView(projectNeedsAttention({
      requestRef: args.requestRef, revision: args.revision,
      summary: 'This request needs an action choice before AE can prepare it.',
    }))
  }
  const action = current.aggregate.plan.actions[0]
  const result: PreparationMutationResult = await ctx.runMutation(internal.customerRequestV2Preparation.prepare, {
    commandKey: namespacedKey(caller.principalId, 'compare', args.requestRef, args.idempotencyKey),
    commandDigest: canonicalDigest(command),
    principalId: caller.principalId,
    requestId: args.requestRef,
    expectedRevision: args.revision,
    actionId: action.actionId,
    now: Date.now(),
  })
  return preparationResultView(current.aggregate, result, args.requestRef, args.revision)
}

function preparationResultView(
  aggregate: StoredAggregate,
  result: PreparationMutationResult,
  requestRef: string,
  revision: number,
): ActionResult {
  if (result.kind === 'conflict') return {
    kind: 'conflict', requestRef,
    reason: result.reason === 'revision_changed' ? 'revision_changed' : 'idempotency_key_reused',
  }
  if (result.kind === 'needs_attention') return writableView(projectNeedsAttention({
    requestRef,
    revision,
    summary: result.reason === 'historical_request_resubmit_required'
      ? 'This earlier request used a retired contract format. Start a new request to continue.'
      : 'The registered options changed. Review this request again.',
  }))
  if (result.kind === 'refused') {
    if (result.reason === 'request_not_found') return { kind: 'refused', reason: 'request_not_found' }
    return writableView(projectNeedsAttention({
      requestRef,
      revision,
      summary: result.reason === 'authority_reference_invalid' || result.reason === 'authority_invalid'
        ? 'That permission no longer matches this request. Review the disclosure again.'
        : 'This request cannot be prepared from its current action.',
    }))
  }
  return projectStoredPreparation(aggregate, result.preparation)
}

function projectStoredPreparation(aggregate: StoredAggregate, preparation: StoredPreparation): ActionResult {
  const criteria = aggregate.evaluation.criteria.map(({ label, value, basis }) => ({ label, value, basis }))
  const base = {
    kind: 'request' as const,
    requestRef: aggregate.snapshot.requestId,
    revision: aggregate.snapshot.revision,
    summary: aggregate.snapshot.intent,
    criteria,
    preparationRef: preparation.preparationRef,
    options: [],
  }
  if (preparation.kind === 'needs_information') return writableView({
    ...base,
    state: 'needs_information',
    nextAction: 'provide_information',
    missingFields: preparation.missing.map((item) => ({
      field: item.inputKey,
      label: item.label,
      explanation: 'This answer is required before AE can prepare registered business options.',
    })),
  })
  const disclosureReview = {
    purpose: customerPurposeLabel(preparation.disclosureReview.purposes[0] ?? 'prepare_options'),
    maximumRecipients: maximumPreparationRecipients(aggregate, preparation),
    categories: preparation.disclosureReview.categories.map(({ label, classification }) => ({ label, classification })),
  }
  if (preparation.kind === 'needs_authority') return writableView({
    ...base,
    state: 'needs_authorization',
    nextAction: 'review_disclosure',
    missingFields: [],
    disclosureReview,
  })
  return writableView({
    ...base,
    state: 'ready_to_compare',
    nextAction: 'prepare_options',
    missingFields: [],
    disclosureReview,
  })
}

function maximumPreparationRecipients(aggregate: StoredAggregate, preparation: StoredPreparation): number {
  return new Set(aggregate.evaluation.candidates.filter((candidate) => (
    candidate.viability.kind === 'viable'
    && candidate.selectionKey === preparation.lineage.selectionKey
    && sameCapabilityContractRef(candidate.contractRef, preparation.lineage.contractRef)
  )).map((candidate) => candidate.businessId)).size
}

function customerPurposeLabel(value: string): string {
  const words = value.replace(/[_-]+/g, ' ').trim()
  return `${words.at(0)?.toUpperCase() ?? ''}${words.slice(1)}`
}

function bindRequirementAnswer(
  requirement: Extract<StoredAggregate['evaluation']['nextRequirement'], { kind: 'contract_fact' }>,
  value: unknown,
  models: readonly CapabilityDecisionModel[],
  requestRevision: number,
): readonly RequestFact[] | undefined {
  if (!isBoundedJsonValue(value)) return undefined
  const facts: RequestFact[] = []
  for (const target of requirement.targets) {
    const model = models.find((candidate) => sameCapabilityContractRef(candidate.contractRef, target.contractRef))
    const semantic = model?.inputs.find((candidate) => candidate.key === target.inputKey
      && candidate.inputPointer === target.inputPointer && candidate.schemaIdentity === target.schemaIdentity)
    if (model === undefined || semantic === undefined || model.selectionKey !== target.selectionKey) return undefined
    const assessment = model.assessInput({
      contractRef: model.contractRef, selectionKey: model.selectionKey, stage: 'option_selection',
      facts: [{ input: semantic.key, inputPointer: semantic.inputPointer, value }],
    })
    if (assessment.kind === 'incompatible') return undefined
    facts.push({
      contractRef: model.contractRef,
      selectionKey: model.selectionKey,
      inputKey: semantic.key,
      inputPointer: semantic.inputPointer,
      schemaIdentity: semantic.schemaIdentity,
      value,
      source: {
        kind: 'customer',
        assertionRef: `assertion:${canonicalDigest({
          requirementKey: requirement.requirementKey, requestRevision, contractRef: model.contractRef,
          inputKey: semantic.key, value,
        })}`,
      },
    })
  }
  return facts
}

function rebindStoredFacts(
  stored: StoredAggregate['snapshot']['facts'], models: readonly CapabilityDecisionModel[],
): readonly RequestFact[] {
  return stored.flatMap((fact) => {
    const model = models.find((candidate) => sameCapabilityContractRef(candidate.contractRef, fact.contractRef))
    const semantic = model?.inputs.find((input) => input.key === fact.inputKey
      && input.inputPointer === fact.inputPointer && input.schemaIdentity === fact.schemaIdentity)
    if (model === undefined || semantic === undefined || model.selectionKey !== fact.selectionKey || !isBoundedJsonValue(fact.value)) return []
    return [{
      contractRef: model.contractRef,
      selectionKey: model.selectionKey,
      inputKey: semantic.key,
      inputPointer: semantic.inputPointer,
      schemaIdentity: semantic.schemaIdentity,
      value: fact.value,
      source: fact.source,
    }]
  })
}

function projectStoredAggregate(aggregate: StoredAggregate): ActionResult {
  const criteria = aggregate.evaluation.criteria.map(({ label, value, basis }) => ({ label, value, basis }))
  const requirement = aggregate.evaluation.nextRequirement
  if (aggregate.evaluation.posture === 'unsupported') return writableView({
    kind: 'request', requestRef: aggregate.snapshot.requestId, revision: aggregate.snapshot.revision,
    state: 'unsupported', summary: 'No registered business capability currently matches this request.',
    nextAction: 'revise_request', missingFields: [], criteria, options: [],
  })
  if (requirement !== undefined) return writableView({
    kind: 'request', requestRef: aggregate.snapshot.requestId, revision: aggregate.snapshot.revision,
    state: 'needs_information', summary: aggregate.snapshot.intent, nextAction: 'provide_information',
    missingFields: requirement.kind === 'contract_fact' ? [{
      field: requirement.requirementKey, label: requirement.customerLabel,
      explanation: 'This answer changes which registered options can be prepared now.',
    }] : [],
    criteria,
    clarification: requirement.kind === 'intent_direction'
      ? { kind: 'intent_direction', prompt: requirement.prompt, answerKind: 'natural_language' }
      : { kind: 'contract_fact', requirementKey: requirement.requirementKey, prompt: requirement.customerLabel, answerKind: 'typed_value' },
    options: [],
  })
  return writableView({
    kind: 'request', requestRef: aggregate.snapshot.requestId, revision: aggregate.snapshot.revision,
    state: 'ready_to_compare', summary: aggregate.snapshot.intent, nextAction: 'prepare_options',
    missingFields: [], criteria, options: [],
  })
}

function writableView(view: CustomerRequestView): Infer<typeof customerView> {
  const { disclosureReview, optionSet, clarification, ...required } = view
  return {
    ...required,
    missingFields: view.missingFields.map((field) => ({ ...field })),
    criteria: (view.criteria ?? []).map((criterion) => ({ ...criterion })),
    ...(disclosureReview === undefined ? {} : {
      disclosureReview: {
        ...disclosureReview,
        categories: disclosureReview.categories.map((category) => ({ ...category })),
      },
    }),
    ...(clarification === undefined ? {} : { clarification: { ...clarification } }),
    options: view.options.map(writableOption),
    ...(optionSet === undefined ? {} : { optionSet: {
      ...optionSet,
      ordering: optionSet.ordering.kind === 'recommended'
        ? { ...optionSet.ordering, reasons: [...optionSet.ordering.reasons], tradeoffs: [...optionSet.ordering.tradeoffs] }
        : { ...optionSet.ordering },
      coverage: {
        ...optionSet.coverage,
        businesses: optionSet.coverage.businesses.map((business) => ({ ...business })),
      },
      options: optionSet.options.map(writableOption),
    } }),
  }
}

function writableOption(option: CustomerRequestView['options'][number]) {
  return {
    ...option, business: { ...option.business }, expectedCost: { ...option.expectedCost }, maximumCost: { ...option.maximumCost },
    priceComponents: option.priceComponents.map((component) => ({ ...component })),
    comparableOutputs: option.comparableOutputs.map((output) => ({ ...output })), materialTerms: [...option.materialTerms],
    cancellation: { ...option.cancellation }, provenance: { ...option.provenance }, commercialInfluence: { ...option.commercialInfluence },
  }
}

type ServiceAssertion = Infer<typeof serviceAssertion>
type RequestCaller = Readonly<{
  principalId: string
  delegatedAgentId: string
}>

async function resolveRequestCaller(
  ctx: ActionCtx,
  operation: 'submit' | 'compare' | 'authorize' | 'resume' | 'facts' | 'refine',
  command: Record<string, unknown>,
  assertion: ServiceAssertion | undefined,
  delegatedAgentId?: string,
): Promise<RequestCaller | undefined> {
  const identity = await ctx.auth.getUserIdentity()
  if (identity !== null) {
    return {
      principalId: identity.tokenIdentifier,
      delegatedAgentId: delegatedAgentId ?? identity.tokenIdentifier,
    }
  }
  const key = process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN?.trim()
  if (assertion === undefined || key === undefined || key.length < 32
    || !assertion.scopes.includes('customer_requests:create')) return undefined
  const verified = await verifyCustomerRequestServiceAssertion({ key, operation, command: command as never, assertion })
  if (!verified) return undefined
  const recorded = await ctx.runMutation(internal.customerRequestPrincipals.recordAgentPrincipal, {
    principalId: assertion.principalId, ownerId: assertion.ownerId, credentialId: assertion.credentialId,
    scopes: [...assertion.scopes], seenAt: Date.now(),
  })
  if (recorded.kind !== 'recorded') return undefined
  return {
    principalId: assertion.principalId,
    delegatedAgentId: assertion.principalId,
  }
}

function namespacedKey(principalId: string, operation: string, requestRef: string, callerKey: string): string {
  return `${operation}:${canonicalDigest({ principalId, requestRef, callerKey })}`
}

function exactRefKey(ref: CapabilityContractRef): string {
  return `${ref.capabilityId}\u0000${ref.version}\u0000${ref.contractDigest}`
}
