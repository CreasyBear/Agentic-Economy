import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import type {
  CapabilityContract,
  CapabilityContractRegistry,
  CustomerRequest,
  PlanRevision,
  PreparationGrant,
  PreparedAction,
  ProposedAction,
} from './public'

type Money = Readonly<{ currency: string; amountMinor: number }>
type PreparedBusiness = Readonly<{ nodeId: string; bindingId: string; name: string }>
type Awaitable<Value> = Value | Promise<Value>

export type PreparedRouteCandidate = Readonly<{
  business: PreparedBusiness
  expectedCost: Money
  maximumCost: Money
  expectedLatencyMs: number
  executionDataFields: readonly string[]
  materialTerms?: readonly Readonly<{ key: string; label: string; value: string }>[]
  cancellation?: Readonly<{ kind: 'supported' | 'conditional' | 'unsupported'; summary: string }>
}>

export type PreparedRouteQuote = Readonly<{
  quoteId: string
  quoteDigest: string
  capabilityContractId: string
  selected: PreparedRouteCandidate
  fallbacks: readonly Readonly<{ candidate: PreparedRouteCandidate; trigger: 'effect_not_committed' }>[]
  alternatives: readonly PreparedRouteCandidate[]
  preparationDisclosures: readonly Readonly<{ field: string; recipient: PreparedBusiness }>[]
  optimizeFor: 'cost' | 'latency'
  commercialInfluence: 'none' | 'disclosed'
  expiresAt: number
}>

export type CustomerRequestActionRouter = Readonly<{
  route: (input: Readonly<{
    routingRequestId: string
    request: CustomerRequest
    planRevision: PlanRevision
    action: ProposedAction
    resolvedInput: Readonly<Record<string, string | number | boolean>>
    preparationGrant?: PreparationGrant
  }>) => Promise<
    | Readonly<{ kind: 'quoted'; quote: PreparedRouteQuote }>
    | Readonly<{ kind: 'no_route'; reason: string }>
  >
}>

type PreparationClaimInput = Readonly<{
  preparationKey: string
  preparationScope: string
  commandDigest: string
  requestId: string
  requestRevision: number
  planRevisionId: string
  actionId: string
  claimedAt: number
  leaseExpiresAt: number
}>

type PreparationClaim = Readonly<{
  kind: 'claimed'
  claimToken: string
  routingRequestId: string
  claimedAt: number
}>

export type CustomerRequestPreparationStore = {
  putRequest: (request: CustomerRequest) => Awaitable<void>
  putPlanRevision: (plan: PlanRevision) => Awaitable<void>
  getRequest: (requestId: string) => Awaitable<CustomerRequest | undefined>
  getPlanRevision: (planRevisionId: string) => Awaitable<PlanRevision | undefined>
  claimPreparation: (input: PreparationClaimInput) => Awaitable<
    | PreparationClaim
    | Readonly<{ kind: 'in_progress' }>
    | Readonly<{ kind: 'prepared'; preparedAction: PreparedAction }>
    | Readonly<{ kind: 'refused'; reason: PreparationRefusalReason }>
    | Readonly<{ kind: 'conflict' }>
    | Readonly<{ kind: 'stale' }>>
  completePreparation: (input: Readonly<{ preparationScope: string; claimToken: string; preparedAction: PreparedAction }>) => Awaitable<PreparedAction>
  refusePreparation: (input: Readonly<{ preparationScope: string; claimToken: string; reason: PreparationRefusalReason }>) => Awaitable<void>
}

export type PrepareCustomerRequestActionCommand = Readonly<{
  preparationKey: string
  requestId: string
  requestRevision: number
  planRevisionId: string
  actionId: string
  resolvedInput: Readonly<Record<string, string | number | boolean>>
  preparationGrant?: PreparationGrant
}>

export type PreparationRefusalReason =
  | 'request_not_found'
  | 'request_revision_changed'
  | 'plan_revision_not_found'
  | 'plan_revision_changed'
  | 'action_not_found'
  | 'capability_contract_not_found'
  | 'action_input_unresolved'
  | 'action_input_mismatch'
  | 'preparation_authority_required'
  | 'preparation_authority_invalid'
  | 'no_connected_option'
  | 'route_contract_mismatch'
  | 'route_currency_mismatch'
  | 'route_spend_exceeded'
  | 'route_data_contract_mismatch'
  | 'route_recipient_limit_exceeded'
  | 'route_quote_expired'

export type PrepareCustomerRequestActionResult =
  | Readonly<{ kind: 'prepared'; preparedAction: PreparedAction }>
  | Readonly<{ kind: 'preparation_in_progress'; preparationScope: string }>
  | Readonly<{ kind: 'preparation_refused'; preparationScope: string; reason: PreparationRefusalReason }>
  | Readonly<{ kind: 'preparation_conflict'; preparationScope: string }>

export type PreparedActionReview = Readonly<{
  kind: 'review_required'
  preparedActionId: string
  business: Readonly<{ name: string }>
  price: Readonly<{ currency: string; expectedAmountMinor: number; maximumAmountMinor: number; components: readonly Readonly<{ label: string; amountMinor: number }>[] }>
  whyThisOption: readonly string[]
  alternatives: readonly Readonly<{ businessName: string; expectedAmountMinor: number; maximumAmountMinor: number; expectedLatencyMs: number }>[]
  fallbacks: readonly Readonly<{ businessName: string; trigger: 'effect_not_committed'; maximumAmountMinor: number }>[]
  dataUse: readonly Readonly<{ field: string; timing: 'already_shared_to_prepare' | 'on_execution'; recipientName: string; purposes: readonly string[] }>[]
  terms: readonly Readonly<{ label: string; value: string }>[]
  cancellation: Readonly<{ kind: 'supported' | 'conditional' | 'unsupported'; summary: string }>
  expiresAt: number
  actions: readonly Readonly<{ kind: 'approve' | 'change' | 'decline'; label: string }>[]
  inspectionRef: string
}>

export async function prepareCustomerRequestAction(
  command: PrepareCustomerRequestActionCommand,
  dependencies: Readonly<{
    store: CustomerRequestPreparationStore
    router: CustomerRequestActionRouter
    registry: CapabilityContractRegistry
    now: () => number
    leaseMs: number
  }>,
): Promise<PrepareCustomerRequestActionResult> {
  if (!Number.isSafeInteger(dependencies.leaseMs) || dependencies.leaseMs <= 0) throw new Error('preparation_lease_invalid')
  const preparationScope = scopeFor(command)
  const context = await resolveContext(command, dependencies.store, dependencies.registry)
  if ('reason' in context) return refusal(preparationScope, context.reason)

  const authority = validatePreparationAuthority(command.preparationGrant, context.request, context.contract, command.resolvedInput, dependencies.now())
  if (authority !== undefined) return refusal(preparationScope, authority)
  const commandDigest = canonicalDigest(commandMaterial(command, context.request, context.plan, context.action))
  const claimedAt = dependencies.now()
  const claim = await dependencies.store.claimPreparation({
    preparationKey: command.preparationKey,
    preparationScope,
    commandDigest,
    requestId: command.requestId,
    requestRevision: command.requestRevision,
    planRevisionId: command.planRevisionId,
    actionId: command.actionId,
    claimedAt,
    leaseExpiresAt: claimedAt + dependencies.leaseMs,
  })
  if (claim.kind === 'prepared') return Object.freeze({ kind: 'prepared', preparedAction: claim.preparedAction })
  if (claim.kind === 'refused') return refusal(preparationScope, claim.reason)
  if (claim.kind === 'in_progress') return Object.freeze({ kind: 'preparation_in_progress', preparationScope })
  if (claim.kind === 'conflict' || claim.kind === 'stale') return Object.freeze({ kind: 'preparation_conflict', preparationScope })

  const routed = await dependencies.router.route({
    routingRequestId: claim.routingRequestId,
    request: context.request,
    planRevision: context.plan,
    action: context.action,
    resolvedInput: command.resolvedInput,
    ...(command.preparationGrant === undefined ? {} : { preparationGrant: command.preparationGrant }),
  })
  if (routed.kind === 'no_route') {
    await dependencies.store.refusePreparation({ preparationScope, claimToken: claim.claimToken, reason: 'no_connected_option' })
    return refusal(preparationScope, 'no_connected_option')
  }
  const quoteRefusal = validateRouteQuote(routed.quote, context.request, context.contract, command.preparationGrant, dependencies.now())
  if (quoteRefusal !== undefined) {
    await dependencies.store.refusePreparation({ preparationScope, claimToken: claim.claimToken, reason: quoteRefusal })
    return refusal(preparationScope, quoteRefusal)
  }
  const preparedAction = buildPreparedAction({
    preparationScope,
    request: context.request,
    plan: context.plan,
    action: context.action,
    contract: context.contract,
    resolvedInput: command.resolvedInput,
    quote: routed.quote,
    preparedAt: claim.claimedAt,
  })
  const persisted = await dependencies.store.completePreparation({ preparationScope, claimToken: claim.claimToken, preparedAction })
  return Object.freeze({ kind: 'prepared', preparedAction: persisted })
}

export function createInMemoryCustomerRequestPreparationStore(): CustomerRequestPreparationStore {
  const requests = new Map<string, CustomerRequest>()
  const plans = new Map<string, PlanRevision>()
  type State = Readonly<{
    commandDigest: string
    requestRevision: number
    status: 'claimed' | 'prepared' | 'refused'
    claimToken: string
    routingRequestId: string
    claimedAt: number
    leaseExpiresAt: number
    preparedAction?: PreparedAction
    refusalReason?: PreparationRefusalReason
  }>
  const preparations = new Map<string, State>()
  const preparationKeys = new Map<string, string>()
  return {
    putRequest: (request) => {
      const existing = requests.get(request.requestId)
      if (existing !== undefined && customerRequestDigest(request) !== customerRequestDigest(existing)) throw new Error('customer_request_identity_conflict')
      requests.set(request.requestId, request)
    },
    putPlanRevision: (plan) => {
      const existing = plans.get(plan.planRevisionId)
      if (existing !== undefined && planRevisionDigest(plan) !== planRevisionDigest(existing)) throw new Error('plan_revision_identity_conflict')
      plans.set(plan.planRevisionId, plan)
    },
    getRequest: (requestId) => requests.get(requestId),
    getPlanRevision: (planRevisionId) => plans.get(planRevisionId),
    claimPreparation: (input) => {
      const request = requests.get(input.requestId)
      const plan = plans.get(input.planRevisionId)
      if (request?.revision !== input.requestRevision || plan?.requestRevision !== input.requestRevision) return { kind: 'stale' }
      const keyedScope = preparationKeys.get(input.preparationKey)
      if (keyedScope !== undefined && keyedScope !== input.preparationScope) return { kind: 'conflict' }
      const existing = preparations.get(input.preparationScope)
      if (existing !== undefined) {
        if (existing.commandDigest !== input.commandDigest) return { kind: 'conflict' }
        if (existing.status === 'prepared' && existing.preparedAction !== undefined) return { kind: 'prepared', preparedAction: existing.preparedAction }
        if (existing.status === 'refused' && existing.refusalReason !== undefined) return { kind: 'refused', reason: existing.refusalReason }
        if (existing.leaseExpiresAt > input.claimedAt) return { kind: 'in_progress' }
        const renewed = Object.freeze({ ...existing, claimToken: `${existing.claimToken}:retry`, leaseExpiresAt: input.leaseExpiresAt })
        preparations.set(input.preparationScope, renewed)
        return { kind: 'claimed', claimToken: renewed.claimToken, routingRequestId: renewed.routingRequestId, claimedAt: renewed.claimedAt }
      }
      const claimToken = `claim:${canonicalDigest({ preparationScope: input.preparationScope, commandDigest: input.commandDigest })}`
      const routingRequestId = `route:${canonicalDigest({ preparationScope: input.preparationScope, commandDigest: input.commandDigest })}`
      preparations.set(input.preparationScope, Object.freeze({
        commandDigest: input.commandDigest, requestRevision: input.requestRevision, status: 'claimed',
        claimToken, routingRequestId, claimedAt: input.claimedAt, leaseExpiresAt: input.leaseExpiresAt,
      }))
      preparationKeys.set(input.preparationKey, input.preparationScope)
      return { kind: 'claimed', claimToken, routingRequestId, claimedAt: input.claimedAt }
    },
    completePreparation: (input) => {
      const existing = preparations.get(input.preparationScope)
      if (existing?.status === 'prepared' && existing.preparedAction !== undefined) return existing.preparedAction
      if (existing?.status !== 'claimed' || existing.claimToken !== input.claimToken) throw new Error('preparation_claim_lost')
      preparations.set(input.preparationScope, Object.freeze({ ...existing, status: 'prepared', preparedAction: input.preparedAction }))
      return input.preparedAction
    },
    refusePreparation: (input) => {
      const existing = preparations.get(input.preparationScope)
      if (existing?.status === 'refused' && existing.refusalReason === input.reason) return
      if (existing?.status !== 'claimed' || existing.claimToken !== input.claimToken) throw new Error('preparation_claim_lost')
      preparations.set(input.preparationScope, Object.freeze({ ...existing, status: 'refused', refusalReason: input.reason }))
    },
  }
}

export function projectPreparedActionForReview(action: PreparedAction): PreparedActionReview {
  return deepFreeze({
    kind: 'review_required',
    preparedActionId: action.preparedActionId,
    business: { name: action.selectedBusiness.name },
    price: {
      currency: action.maximumGrossCost.currency,
      expectedAmountMinor: action.expectedCost.amountMinor,
      maximumAmountMinor: action.maximumGrossCost.amountMinor,
      components: action.priceComponents.map((component) => ({ label: component.label, amountMinor: component.amountMinor })),
    },
    whyThisOption: [...action.comparisonBasis.selectedBecause],
    alternatives: action.alternatives.map((alternative) => ({
      businessName: alternative.business.name,
      expectedAmountMinor: alternative.expectedCost.amountMinor,
      maximumAmountMinor: alternative.maximumCost.amountMinor,
      expectedLatencyMs: alternative.expectedLatencyMs,
    })),
    fallbacks: action.allowedFallbacks.map((fallback) => ({
      businessName: fallback.business.name, trigger: fallback.trigger, maximumAmountMinor: fallback.maximumCost.amountMinor,
    })),
    dataUse: action.disclosures.map((disclosure) => ({
      field: disclosure.field, timing: disclosure.timing,
      recipientName: disclosure.recipientName, purposes: [...disclosure.purposes],
    })),
    terms: action.materialTerms.map((term) => ({ label: term.label, value: term.value })),
    cancellation: { ...action.cancellation },
    expiresAt: action.expiresAt,
    actions: [
      { kind: 'approve', label: 'Approve this option' },
      { kind: 'change', label: 'Change request' },
      { kind: 'decline', label: 'Decline' },
    ],
    inspectionRef: action.preparedActionId,
  }) as PreparedActionReview
}

async function resolveContext(
  command: PrepareCustomerRequestActionCommand,
  store: CustomerRequestPreparationStore,
  registry: CapabilityContractRegistry,
): Promise<Readonly<{ request: CustomerRequest; plan: PlanRevision; action: ProposedAction; contract: CapabilityContract }> | Readonly<{ reason: PreparationRefusalReason }>> {
  const request = await store.getRequest(command.requestId)
  if (request === undefined) return { reason: 'request_not_found' }
  if (request.revision !== command.requestRevision) return { reason: 'request_revision_changed' }
  const plan = await store.getPlanRevision(command.planRevisionId)
  if (plan === undefined) return { reason: 'plan_revision_not_found' }
  if (plan.requestId !== request.requestId || plan.requestRevision !== request.revision) return { reason: 'plan_revision_changed' }
  const action = plan.actions.find((candidate) => candidate.actionId === command.actionId)
  if (action === undefined) return { reason: 'action_not_found' }
  const contract = registry.get(action.capabilityContractId)
  if (contract === undefined) return { reason: 'capability_contract_not_found' }
  if (Object.values(action.input).some((input) => input.kind === 'action_output')) return { reason: 'action_input_unresolved' }
  const expected = Object.fromEntries(Object.entries(action.input).map(([field, input]) => [field, input.kind === 'literal' ? input.value : undefined]))
  if (canonicalDigest(stableRecord(expected)) !== canonicalDigest(stableRecord(command.resolvedInput))) return { reason: 'action_input_mismatch' }
  return { request, plan, action, contract }
}

function validatePreparationAuthority(
  grant: PreparationGrant | undefined,
  request: CustomerRequest,
  contract: CapabilityContract,
  resolvedInput: Readonly<Record<string, string | number | boolean>>,
  now: number,
): PreparationRefusalReason | undefined {
  const disclosures = Object.entries(contract.input).filter(([field, definition]) => resolvedInput[field] !== undefined
    && definition.disclosure?.phase === 'preparation' && definition.disclosure.classification !== 'public')
  if (disclosures.length === 0) return undefined
  if (grant === undefined) return 'preparation_authority_required'
  if (grant.requestId !== request.requestId || grant.requestRevision !== request.revision || grant.principalId !== request.principalId
    || grant.expiresAt <= now || grant.grantedAt > now || grant.maximumRecipients < 1) return 'preparation_authority_invalid'
  const allowedFields = new Set(grant.allowedDataFields)
  const allowedRecipients = new Set(grant.allowedRecipientKinds)
  const allowedPurposes = new Set(grant.allowedPurposes)
  if (disclosures.some(([field, definition]) => !allowedFields.has(field)
    || definition.disclosure === undefined || !allowedRecipients.has(definition.disclosure.recipient)
    || definition.disclosure.purposes.some((purpose) => !allowedPurposes.has(purpose)))) return 'preparation_authority_invalid'
  return undefined
}

function validateRouteQuote(
  quote: PreparedRouteQuote,
  request: CustomerRequest,
  contract: CapabilityContract,
  grant: PreparationGrant | undefined,
  now: number,
): PreparationRefusalReason | undefined {
  if (quote.capabilityContractId !== contract.capabilityContractId) return 'route_contract_mismatch'
  const candidates = [quote.selected, ...quote.fallbacks.map((fallback) => fallback.candidate), ...quote.alternatives]
  if (candidates.some((candidate) => candidate.expectedCost.currency !== request.routing.currency || candidate.maximumCost.currency !== request.routing.currency)) return 'route_currency_mismatch'
  if (candidates.some((candidate) => candidate.maximumCost.amountMinor > request.routing.maximumSpendMinor)) return 'route_spend_exceeded'
  if (quote.expiresAt <= now) return 'route_quote_expired'
  const contractFields = new Set(Object.keys(contract.input))
  if (candidates.some((candidate) => candidate.executionDataFields.some((field) => !contractFields.has(field)
    || contract.input[field]?.disclosure?.phase !== 'execution'))) return 'route_data_contract_mismatch'
  if (quote.preparationDisclosures.some((disclosure) => !contractFields.has(disclosure.field)
    || contract.input[disclosure.field]?.disclosure?.phase !== 'preparation')) return 'route_data_contract_mismatch'
  const disclosedRecipients = new Set(quote.preparationDisclosures.map((disclosure) => disclosure.recipient.bindingId))
  if (disclosedRecipients.size > 0 && (grant === undefined || disclosedRecipients.size > grant.maximumRecipients)) return 'route_recipient_limit_exceeded'
  return undefined
}

function buildPreparedAction(input: Readonly<{
  preparationScope: string
  request: CustomerRequest
  plan: PlanRevision
  action: ProposedAction
  contract: CapabilityContract
  resolvedInput: Readonly<Record<string, string | number | boolean>>
  quote: PreparedRouteQuote
  preparedAt: number
}>): PreparedAction {
  const executionCandidates = [input.quote.selected, ...input.quote.fallbacks.map((fallback) => fallback.candidate)]
  const preparationDisclosures = input.quote.preparationDisclosures.flatMap((item) => {
    const disclosure = input.contract.input[item.field]?.disclosure
    return disclosure === undefined ? [] : [{
      field: item.field, timing: 'already_shared_to_prepare' as const,
      recipientBindingId: item.recipient.bindingId, recipientName: item.recipient.name,
      purposes: Object.freeze([...disclosure.purposes].sort()),
    }]
  })
  const executionDisclosures = executionCandidates.flatMap((candidate) => candidate.executionDataFields.flatMap((field) => {
    const disclosure = input.contract.input[field]?.disclosure
    return disclosure === undefined ? [] : [{
      field, timing: 'on_execution' as const,
      recipientBindingId: candidate.business.bindingId, recipientName: candidate.business.name,
      purposes: Object.freeze([...disclosure.purposes].sort()),
    }]
  }))
  const materialTerms = input.quote.selected.materialTerms?.length
    ? input.quote.selected.materialTerms
    : [{ key: 'provider_terms', label: 'Provider terms', value: 'No additional provider terms were supplied with this quote.' }]
  const cancellation = input.quote.selected.cancellation
    ?? { kind: 'unsupported' as const, summary: 'This capability does not publish a cancellation path.' }
  const material = preparedActionMaterial({
    preparedActionId: `prepared:${canonicalDigest({ preparationScope: input.preparationScope })}`,
    requestId: input.request.requestId,
    requestRevision: input.request.revision,
    planRevisionId: input.plan.planRevisionId,
    actionId: input.action.actionId,
    capabilityContractId: input.contract.capabilityContractId,
    resolvedInputDigest: canonicalDigest(stableRecord(input.resolvedInput)),
    quoteId: input.quote.quoteId,
    quoteDigest: input.quote.quoteDigest,
    selectedBusiness: input.quote.selected.business,
    alternatives: input.quote.alternatives.map((candidate) => ({
      business: candidate.business, expectedCost: candidate.expectedCost,
      maximumCost: candidate.maximumCost, expectedLatencyMs: candidate.expectedLatencyMs,
    })),
    comparisonBasis: {
      objective: input.quote.optimizeFor,
      selectedBecause: [input.quote.optimizeFor === 'cost' ? 'Lowest expected cost among the connected eligible options.' : 'Lowest expected routing latency among the connected eligible options.'],
      commercialInfluence: input.quote.commercialInfluence,
    },
    allowedFallbacks: input.quote.fallbacks.map((fallback) => ({
      business: fallback.candidate.business, trigger: fallback.trigger, maximumCost: fallback.candidate.maximumCost,
    })),
    expectedCost: input.quote.selected.expectedCost,
    maximumGrossCost: input.quote.selected.maximumCost,
    priceComponents: [{ kind: 'provider' as const, label: 'Provider price', amountMinor: input.quote.selected.maximumCost.amountMinor }],
    disclosures: [...preparationDisclosures, ...executionDisclosures],
    materialTerms,
    cancellation,
    expiresAt: input.quote.expiresAt,
    preparedAt: input.preparedAt,
  })
  return deepFreeze({ ...material, preparedActionDigest: preparedActionDigest(material) }) as PreparedAction
}

export function preparedActionMaterial(action: Omit<PreparedAction, 'preparedActionDigest'>): Omit<PreparedAction, 'preparedActionDigest'> {
  return action
}

export function customerRequestDigest(request: CustomerRequest): string {
  return canonicalDigest({
    requestId: request.requestId, principalId: request.principalId, delegatedAgentId: request.delegatedAgentId,
    intent: request.intent, revision: request.revision, routing: request.routing, createdAt: request.createdAt,
  })
}

export function planRevisionDigest(plan: PlanRevision): string {
  return canonicalDigest({
    planRevisionId: plan.planRevisionId, requestId: plan.requestId, requestRevision: plan.requestRevision,
    proposedByAgentId: plan.proposedByAgentId, createdAt: plan.createdAt,
    actions: plan.actions.map((action) => ({
      actionId: action.actionId, capabilityContractId: action.capabilityContractId,
      dependsOn: [...action.dependsOn].sort(),
      input: Object.fromEntries(Object.entries(action.input).sort(([left], [right]) => left.localeCompare(right)).map(([field, value]) => [
        field,
        value.kind === 'literal' ? { kind: value.kind, value: value.value } : { kind: value.kind, actionId: value.actionId, field: value.field },
      ])),
      ...(action.providerAffinity === undefined ? {} : { providerAffinity: action.providerAffinity }),
    })),
  })
}

export function preparedActionDigest(action: Omit<PreparedAction, 'preparedActionDigest'>): string {
  return canonicalDigest({
    preparedActionId: action.preparedActionId, requestId: action.requestId, requestRevision: action.requestRevision,
    planRevisionId: action.planRevisionId, actionId: action.actionId, capabilityContractId: action.capabilityContractId,
    resolvedInputDigest: action.resolvedInputDigest, quoteId: action.quoteId, quoteDigest: action.quoteDigest,
    selectedBusiness: action.selectedBusiness,
    alternatives: action.alternatives.map((alternative) => ({
      business: alternative.business, expectedCost: alternative.expectedCost,
      maximumCost: alternative.maximumCost, expectedLatencyMs: alternative.expectedLatencyMs,
    })),
    comparisonBasis: action.comparisonBasis,
    allowedFallbacks: action.allowedFallbacks.map((fallback) => ({
      business: fallback.business, trigger: fallback.trigger, maximumCost: fallback.maximumCost,
    })),
    expectedCost: action.expectedCost, maximumGrossCost: action.maximumGrossCost,
    priceComponents: action.priceComponents.map((component) => ({ ...component })),
    disclosures: action.disclosures.map((disclosure) => ({
      field: disclosure.field, timing: disclosure.timing, recipientBindingId: disclosure.recipientBindingId,
      recipientName: disclosure.recipientName, purposes: [...disclosure.purposes].sort(),
    })),
    materialTerms: action.materialTerms.map((term) => ({ ...term })), cancellation: action.cancellation,
    ...(action.expectedBy === undefined ? {} : { expectedBy: action.expectedBy }),
    expiresAt: action.expiresAt, preparedAt: action.preparedAt,
  })
}

function commandMaterial(
  command: PrepareCustomerRequestActionCommand,
  request: CustomerRequest,
  plan: PlanRevision,
  action: ProposedAction,
): StableHashValue {
  return {
    requestId: request.requestId, requestRevision: request.revision, planRevisionId: plan.planRevisionId,
    actionId: action.actionId, capabilityContractId: action.capabilityContractId,
    routing: request.routing, resolvedInput: command.resolvedInput,
  } as StableHashValue
}

function stableRecord(value: Readonly<Record<string, string | number | boolean | undefined>>): StableHashValue {
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined))
}

function scopeFor(command: PrepareCustomerRequestActionCommand): string {
  return `${command.requestId}:${command.requestRevision}:${command.planRevisionId}:${command.actionId}`
}

function refusal(preparationScope: string, reason: PreparationRefusalReason): PrepareCustomerRequestActionResult {
  return Object.freeze({ kind: 'preparation_refused', preparationScope, reason })
}

function deepFreeze(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const nested of Object.values(value)) deepFreeze(nested)
  return Object.freeze(value)
}
