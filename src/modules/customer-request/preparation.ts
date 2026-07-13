import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import type {
  CapabilityContract,
  CapabilityContractRegistry,
  CustomerRequest,
  PlanRevision,
  PreparedAction,
  ProposedAction,
} from './legacy-v1'
import {
  releasePreparationDisclosure,
  type PreparationAuthorityRefusalReason,
  type PreparationAuthorityVerifier,
  type PreparationDisclosureResult,
  type PreparationDisclosureStore,
  type PreparationRecipient,
} from './preparation-authority'

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

export type PreparedRouteCandidateSet = Readonly<{
  inspectionRef: string
  decisionPreference?: Readonly<{
    objective: 'lowest_maximum_price'
    basis: 'extracted_from_request'
    evidenceRef: string
  }>
  candidates: readonly Readonly<{
    optionRef: string
    business: Readonly<{ name: string }>
    expectedCost: Money
    maximumCost: Money
    expectedLatencyMs: number
    priceComponents: readonly Readonly<{ label: string; amountMinor: number }>[]
    comparableOutputs: readonly Readonly<{ label: string; value: string | number | boolean }>[]
    materialTerms: readonly string[]
    cancellation: Readonly<{ kind: 'supported' | 'conditional' | 'unsupported'; summary: string }>
    commercialInfluence?: Readonly<
      | { status: 'unknown' }
      | { status: 'none'; summary: string }
      | {
          status: 'disclosed'; relationship: 'commission' | 'sponsorship' | 'rebate' | 'ownership' | 'other'
          summary: string; payerName: string; beneficiaryName: string; compensationBasis: string
          influencesEligibility: boolean; influencesInclusion: boolean; influencesOrder: boolean
        }
    >
    issuedAt?: number
    expiresAt: number
    inspectionRef: string
  }>[]
  attempts: readonly Readonly<{
    business: Readonly<{ name: string }>
    status: 'not_contacted' | 'contact_pending' | 'contacted' | 'option_received' | 'unavailable' | 'uncertain'
    explanation: string
  }>[]
}>

export type CustomerRequestActionRouter = Readonly<{
  route: (input: Readonly<{
    routingRequestId: string
    request: Readonly<{
      requestId: string
      revision: number
      principalId: string
      delegatedAgentId: string
      routing: CustomerRequest['routing']
    }>
    action: Readonly<{ actionId: string; capabilityContractId: string }>
    planRevisionId: string
    preparationGeneration: number
    contract: CapabilityContract
    publicInput: Readonly<Record<string, string | number | boolean>>
    releasePreparationData?: (input: Readonly<{
      releaseKey: string
      recipient: PreparationRecipient
      purpose: string
      purposeLabel: string
      fields: readonly string[]
      release: (input: Readonly<{
        allocationId: string
        protectedValues: Readonly<Record<string, string | number | boolean>>
      }>) => Promise<Readonly<{
        kind: 'released'
        providerEvidenceRef: string
      }>>
    }>) => Promise<PreparationDisclosureResult | Readonly<{
      kind: 'refused'
      reason: 'preparation_release_contract_mismatch'
      nextAction: string
    }>>
    reconcilePreparationData?: (input: Readonly<{ allocationId: string; providerEvidenceRef: string }>) => Promise<void>
  }>) => Promise<
    | Readonly<{ kind: 'quoted'; quote: PreparedRouteQuote }>
    | Readonly<{ kind: 'candidate_set'; candidateSet: PreparedRouteCandidateSet }>
    | Readonly<{ kind: 'preparation_pending'; inspectionRef: string }>
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
    | Readonly<{ kind: 'options_prepared'; candidateSet: PreparedRouteCandidateSet }>
    | Readonly<{ kind: 'refused'; reason: PreparationRefusalReason; inspectionRef?: string }>
    | Readonly<{ kind: 'conflict' }>
    | Readonly<{ kind: 'stale' }>>
  completePreparation: (input: Readonly<{ preparationScope: string; claimToken: string; preparedAction: PreparedAction }>) => Awaitable<PreparedAction>
  completeOptions: (input: Readonly<{ preparationScope: string; claimToken: string; candidateSet: PreparedRouteCandidateSet }>) => Awaitable<PreparedRouteCandidateSet>
  refusePreparation: (input: Readonly<{
    preparationScope: string; claimToken: string; reason: PreparationRefusalReason; inspectionRef?: string
  }>) => Awaitable<void>
}

export type PrepareCustomerRequestActionCommand = Readonly<{
  preparationKey: string
  requestId: string
  requestRevision: number
  planRevisionId: string
  actionId: string
  resolvedInput: Readonly<Record<string, string | number | boolean>>
  preparationAuthorityEvidenceRef?: string
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
  | PreparationAuthorityRefusalReason
  | 'preparation_release_contract_mismatch'
  | 'preparation_data_release_uncertain'
  | 'preparation_purpose_not_composable'
  | 'no_connected_option'
  | 'route_contract_mismatch'
  | 'route_currency_mismatch'
  | 'route_spend_exceeded'
  | 'route_data_contract_mismatch'
  | 'route_recipient_limit_exceeded'
  | 'route_quote_expired'
  | 'route_ranking_required'

export type PrepareCustomerRequestActionResult =
  | Readonly<{ kind: 'prepared'; preparedAction: PreparedAction }>
  | Readonly<{ kind: 'options_prepared'; preparationScope: string; candidateSet: PreparedRouteCandidateSet }>
  | Readonly<{ kind: 'preparation_in_progress'; preparationScope: string; inspectionRef?: string }>
  | Readonly<{
    kind: 'preparation_refused'; preparationScope: string; reason: PreparationRefusalReason; inspectionRef?: string
  }>
  | Readonly<{ kind: 'preparation_conflict'; preparationScope: string }>

export type PreparedActionReview = Readonly<{
  kind: 'review_required'
  preparedActionId: string
  business: Readonly<{ name: string }>
  price: Readonly<{ currency: string; expectedAmountMinor: number; maximumAmountMinor: number; components: readonly Readonly<{ label: string; amountMinor: number }>[] }>
  whyThisOption: readonly string[]
  alternatives: readonly Readonly<{ businessName: string; expectedAmountMinor: number; maximumAmountMinor: number; expectedLatencyMs: number }>[]
  fallbacks: readonly Readonly<{ businessName: string; trigger: 'effect_not_committed'; maximumAmountMinor: number }>[]
  dataUse: readonly Readonly<{
    dataCategory: string
    timing: 'already_shared_to_prepare' | 'on_execution'
    recipientName: string
    purposeLabels: readonly string[]
    status: 'released' | 'not_released' | 'uncertain'
    recordedAt: number
    inspectionRef: string
  }>[]
  terms: readonly Readonly<{ label: string; value: string }>[]
  cancellation: Readonly<{ kind: 'supported' | 'conditional' | 'unsupported'; summary: string }>
  expiresAt: number
  actions: readonly Readonly<{ kind: 'approve' | 'change' | 'decline'; label: string }>[]
  inspectionRef: string
}>

export type PreparationRefusalCustomerProjection = Readonly<{
  title: string
  explanation: string
  nextAction: string
}>

export function projectPreparationRefusalForCustomer(
  reason: PreparationRefusalReason,
): PreparationRefusalCustomerProjection {
  if (reason === 'preparation_authority_required') return {
    title: 'Permission needed',
    explanation: 'AE needs permission to share the required information before businesses can prepare options.',
    nextAction: 'Review the data categories, purpose, business limit, and expiry, then authorize or decline.',
  }
  if (reason === 'authority_recipient_capacity_exceeded') return {
    title: 'Sharing limit reached',
    explanation: 'This comparison would contact more businesses than the customer allowed.',
    nextAction: 'Reduce the businesses compared or ask the customer to raise the limit.',
  }
  if (reason === 'authority_exposure_capacity_exceeded' || reason === 'authority_operation_capacity_exceeded') return {
    title: 'Permission used',
    explanation: 'The customer-approved sharing allowance has already been used.',
    nextAction: 'Ask the customer before starting another comparison or sharing more information.',
  }
  if (reason === 'authority_expired' || reason === 'authority_revoked' || reason === 'authority_not_yet_valid') return {
    title: reason === 'authority_revoked' ? 'Permission withdrawn' : 'Permission unavailable',
    explanation: reason === 'authority_revoked'
      ? 'The customer withdrew permission before this information was sent.'
      : 'The customer permission is not currently active.',
    nextAction: 'Ask the customer for current permission before contacting another business.',
  }
  if (reason === 'preparation_data_release_uncertain') return {
    title: 'Sharing status needs checking',
    explanation: 'AE cannot yet confirm whether a business received the information.',
    nextAction: 'Wait for AE to reconcile the sharing record; do not send it again.',
  }
  if (reason === 'no_connected_option') return {
    title: 'No connected option found',
    explanation: 'AE could not find a registered business able to prepare this option.',
    nextAction: 'Change the request or use a direct path outside AE.',
  }
  if (reason === 'route_ranking_required') return {
    title: 'Options found, comparison not ready',
    explanation: 'AE found connected options but does not yet have enough registered evidence to recommend one safely.',
    nextAction: 'Review the available option evidence or wait until AE can compare the material terms.',
  }
  if (reason === 'preparation_purpose_not_composable') return {
    title: 'These options cannot be prepared safely',
    explanation: 'The registered information would need to be shared for incompatible purposes in one provider request.',
    nextAction: 'Split the request into separate supported steps or use a capability with one shared preparation purpose.',
  }
  if (reason.startsWith('authority_') || reason === 'preparation_release_contract_mismatch') return {
    title: 'Permission does not cover this comparison',
    explanation: 'The requested information, business, or purpose is outside what the customer allowed.',
    nextAction: 'Narrow the comparison or ask the customer for new permission.',
  }
  return {
    title: 'Option could not be prepared',
    explanation: 'AE could not prepare a reliable business option from the current request.',
    nextAction: 'Review the request details and try a supported change.',
  }
}

export async function prepareCustomerRequestAction(
  command: PrepareCustomerRequestActionCommand,
  dependencies: Readonly<{
    store: CustomerRequestPreparationStore
    router: CustomerRequestActionRouter
    registry: CapabilityContractRegistry
    preparationAuthorityVerifier: PreparationAuthorityVerifier
    preparationDisclosureStore: PreparationDisclosureStore
    commitProtectedProjection: (input: Readonly<Record<string, string | number | boolean>>) => string
    now: () => number
    leaseMs: number
  }>,
): Promise<PrepareCustomerRequestActionResult> {
  if (!Number.isSafeInteger(dependencies.leaseMs) || dependencies.leaseMs <= 0) throw new Error('preparation_lease_invalid')
  const preparationScope = scopeFor(command)
  const context = await resolveContext(command, dependencies.store, dependencies.registry)
  if ('reason' in context) return refusal(preparationScope, context.reason)

  const protectedFields = preparationProtectedFields(context.contract, command.resolvedInput)
  const preparationAuthorityEvidenceRef = command.preparationAuthorityEvidenceRef
  if (protectedFields.length > 0 && preparationAuthorityEvidenceRef === undefined) {
    return refusal(preparationScope, 'preparation_authority_required')
  }
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
  if (claim.kind === 'options_prepared') return Object.freeze({ kind: 'options_prepared', preparationScope, candidateSet: claim.candidateSet })
  if (claim.kind === 'refused') return refusal(preparationScope, claim.reason, claim.inspectionRef)
  if (claim.kind === 'in_progress') return Object.freeze({ kind: 'preparation_in_progress', preparationScope })
  if (claim.kind === 'conflict' || claim.kind === 'stale') return Object.freeze({ kind: 'preparation_conflict', preparationScope })

  let releaseRefusal: PreparationRefusalReason | undefined
  let releaseInspectionRef: string | undefined
  const releasedDisclosures = new Map<string, Readonly<{ allocationId: string; releasedAt: number }>>()
  const routed = await dependencies.router.route({
    routingRequestId: claim.routingRequestId,
    request: {
      requestId: context.request.requestId, revision: context.request.revision,
      principalId: context.request.principalId, delegatedAgentId: context.request.delegatedAgentId,
      routing: context.request.routing,
    },
    action: { actionId: context.action.actionId, capabilityContractId: context.action.capabilityContractId },
    planRevisionId: context.plan.planRevisionId,
    preparationGeneration: context.request.revision,
    contract: context.contract,
    publicInput: publicPreparationInput(context.contract, command.resolvedInput),
    ...(protectedFields.length === 0 ? {} : {
      releasePreparationData: async (input) => {
        const contractRefusal = validateReleaseRequest(input, context.contract, protectedFields)
        if (contractRefusal !== undefined) {
          releaseRefusal = contractRefusal
          return {
            kind: 'refused' as const, reason: contractRefusal,
            nextAction: 'Use only the registered data categories, recipients, and purposes for this comparison.',
          }
        }
        const protectedValues = selectProtectedValues(input.fields, command.resolvedInput)
        if (protectedValues === undefined || preparationAuthorityEvidenceRef === undefined) {
          releaseRefusal = 'preparation_release_contract_mismatch'
          return {
            kind: 'refused' as const, reason: 'preparation_release_contract_mismatch' as const,
            nextAction: 'Use only the registered data categories for this comparison.',
          }
        }
        const result = await releasePreparationDisclosure({
          operationKey: `${preparationScope}:${input.releaseKey}`,
          authorityUseKey: preparationScope,
          authorityEvidenceRef: preparationAuthorityEvidenceRef,
          principalId: context.request.principalId,
          delegatedAgentId: context.request.delegatedAgentId,
          requestId: context.request.requestId,
          requestRevision: context.request.revision,
          planRevisionId: context.plan.planRevisionId,
          actionId: context.action.actionId,
          capabilityContractId: context.contract.capabilityContractId,
          resolvedInputDigest: canonicalDigest(stableRecord(command.resolvedInput)),
          protectedProjectionCommitment: dependencies.commitProtectedProjection(protectedValues),
          recipient: input.recipient,
          purpose: input.purpose,
          purposeLabel: input.purposeLabel,
          fields: input.fields,
          fieldCategories: input.fields.map((field) => ({
            field, label: context.contract.input[field]?.customerLabel ?? field,
          })),
          protectedValues,
        }, {
          verifier: dependencies.preparationAuthorityVerifier,
          store: dependencies.preparationDisclosureStore,
          now: dependencies.now,
          release: async ({ allocationId, protectedValues: values }) => await input.release({ allocationId, protectedValues: values }),
        })
        if (result.kind === 'released') input.fields.forEach((field) => {
          releasedDisclosures.set(disclosureKey(input.recipient.bindingId, input.purpose, [field]), {
            allocationId: result.allocationId, releasedAt: result.releasedAt,
          })
        })
        else {
          releaseRefusal = result.kind === 'uncertain' ? 'preparation_data_release_uncertain' : result.reason
          if (result.kind === 'uncertain') releaseInspectionRef = result.allocationId
        }
        return result
      },
      reconcilePreparationData: async ({ allocationId, providerEvidenceRef }) => {
        await dependencies.preparationDisclosureStore.reconcileReleased({
          allocationId, providerEvidenceRef, reconciledAt: dependencies.now(),
        })
      },
    }),
  })
  if (releaseRefusal !== undefined) {
    if (releaseRefusal === 'preparation_data_release_uncertain') {
      return Object.freeze({
        kind: 'preparation_in_progress', preparationScope,
        ...(releaseInspectionRef === undefined ? {} : { inspectionRef: releaseInspectionRef }),
      })
    }
    await dependencies.store.refusePreparation({
      preparationScope, claimToken: claim.claimToken, reason: releaseRefusal,
      ...(releaseInspectionRef === undefined ? {} : { inspectionRef: releaseInspectionRef }),
    })
    return refusal(preparationScope, releaseRefusal, releaseInspectionRef)
  }
  if (routed.kind === 'no_route') {
    const reason: PreparationRefusalReason = routed.reason === 'preparation_purpose_not_composable'
      ? 'preparation_purpose_not_composable' : 'no_connected_option'
    await dependencies.store.refusePreparation({ preparationScope, claimToken: claim.claimToken, reason })
    return refusal(preparationScope, reason)
  }
  if (routed.kind === 'preparation_pending') {
    return Object.freeze({ kind: 'preparation_in_progress', preparationScope, inspectionRef: routed.inspectionRef })
  }
  if (routed.kind === 'candidate_set') {
    const candidateSet = await dependencies.store.completeOptions({
      preparationScope, claimToken: claim.claimToken, candidateSet: routed.candidateSet,
    })
    return Object.freeze({ kind: 'options_prepared', preparationScope, candidateSet })
  }
  const quoteRefusal = validateRouteQuote(
    routed.quote, context.request, context.contract, new Set(releasedDisclosures.keys()), dependencies.now(),
  )
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
    releaseEvidence: releasedDisclosures,
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
    status: 'claimed' | 'options_prepared' | 'prepared' | 'refused'
    claimToken: string
    routingRequestId: string
    claimedAt: number
    leaseExpiresAt: number
    preparedAction?: PreparedAction
    candidateSet?: PreparedRouteCandidateSet
    refusalReason?: PreparationRefusalReason
    refusalInspectionRef?: string
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
        if (existing.status === 'options_prepared' && existing.candidateSet !== undefined) return { kind: 'options_prepared', candidateSet: existing.candidateSet }
        if (existing.status === 'refused' && existing.refusalReason !== undefined) return {
          kind: 'refused', reason: existing.refusalReason,
          ...(existing.refusalInspectionRef === undefined ? {} : { inspectionRef: existing.refusalInspectionRef }),
        }
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
    completeOptions: (input) => {
      const existing = preparations.get(input.preparationScope)
      if (existing?.status === 'options_prepared' && existing.candidateSet !== undefined) return existing.candidateSet
      if (existing?.status !== 'claimed' || existing.claimToken !== input.claimToken) throw new Error('preparation_claim_lost')
      preparations.set(input.preparationScope, Object.freeze({ ...existing, status: 'options_prepared', candidateSet: input.candidateSet }))
      return input.candidateSet
    },
    refusePreparation: (input) => {
      const existing = preparations.get(input.preparationScope)
      if (existing?.status === 'refused' && existing.refusalReason === input.reason) return
      if (existing?.status !== 'claimed' || existing.claimToken !== input.claimToken) throw new Error('preparation_claim_lost')
      preparations.set(input.preparationScope, Object.freeze({
        ...existing, status: 'refused', refusalReason: input.reason,
        ...(input.inspectionRef === undefined ? {} : { refusalInspectionRef: input.inspectionRef }),
      }))
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
      dataCategory: disclosure.dataCategory, timing: disclosure.timing,
      recipientName: disclosure.recipientName, purposeLabels: [...disclosure.purposeLabels],
      status: disclosure.status, recordedAt: disclosure.recordedAt, inspectionRef: disclosure.inspectionRef,
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
  const expected = Object.fromEntries(Object.entries(action.input).map(([field, input]) => [
    field,
    input.kind === 'literal' ? input.value : input.kind === 'customer_fact' ? request.knownFacts[input.fact] : undefined,
  ]))
  if (Object.values(expected).some((value) => value === undefined)) return { reason: 'action_input_unresolved' }
  if (canonicalDigest(stableRecord(expected)) !== canonicalDigest(stableRecord(command.resolvedInput))) return { reason: 'action_input_mismatch' }
  return { request, plan, action, contract }
}

function validateRouteQuote(
  quote: PreparedRouteQuote,
  request: CustomerRequest,
  contract: CapabilityContract,
  releasedDisclosures: ReadonlySet<string>,
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
  const quoteDisclosures = new Set(quote.preparationDisclosures.flatMap((item) => {
    const disclosure = contract.input[item.field]?.disclosure
    return disclosure === undefined ? [] : disclosure.purposes.map((purpose) => disclosureKey(item.recipient.bindingId, purpose, [item.field]))
  }))
  if (quoteDisclosures.size !== releasedDisclosures.size
    || [...quoteDisclosures].some((item) => !releasedDisclosures.has(item))) return 'route_data_contract_mismatch'
  return undefined
}

function preparationProtectedFields(
  contract: CapabilityContract,
  resolvedInput: Readonly<Record<string, string | number | boolean>>,
): readonly string[] {
  return Object.entries(contract.input).flatMap(([field, definition]) => resolvedInput[field] !== undefined
    && definition.disclosure?.phase === 'preparation' && definition.disclosure.classification !== 'public' ? [field] : [])
}

function publicPreparationInput(
  contract: CapabilityContract,
  resolvedInput: Readonly<Record<string, string | number | boolean>>,
) {
  return Object.fromEntries(Object.entries(resolvedInput).filter(([field]) => {
    const disclosure = contract.input[field]?.disclosure
    return disclosure === undefined || disclosure.classification === 'public'
  }))
}

function validateReleaseRequest(
  input: Readonly<{ recipient: PreparationRecipient; purpose: string; purposeLabel: string; fields: readonly string[] }>,
  contract: CapabilityContract,
  protectedFields: readonly string[],
): 'preparation_release_contract_mismatch' | undefined {
  if (input.fields.length === 0 || input.fields.some((field) => !protectedFields.includes(field))) return 'preparation_release_contract_mismatch'
  if (contract.preparation?.purpose !== input.purpose || contract.preparation.customerLabel !== input.purposeLabel) {
    return 'preparation_release_contract_mismatch'
  }
  if (input.fields.some((field) => {
    const disclosure = contract.input[field]?.disclosure
    return disclosure === undefined || disclosure.recipient !== input.recipient.kind || !disclosure.purposes.includes(input.purpose)
  })) return 'preparation_release_contract_mismatch'
  return undefined
}

function disclosureKey(recipientBindingId: string, purpose: string, fields: readonly string[]) {
  return canonicalDigest({ recipientBindingId, purpose, fields: [...new Set(fields)].sort() })
}

function customerPurposeLabel(value: string) {
  const words = value.replace(/[_-]+/g, ' ').trim()
  if (words.length === 0) return 'Prepare this option'
  const first = words.at(0)
  return first === undefined ? 'Prepare this option' : `${first.toUpperCase()}${words.slice(1)}`
}

function selectProtectedValues(
  fields: readonly string[],
  resolvedInput: Readonly<Record<string, string | number | boolean>>,
): Readonly<Record<string, string | number | boolean>> | undefined {
  const entries: [string, string | number | boolean][] = []
  for (const field of fields) {
    const value = resolvedInput[field]
    if (value === undefined) return undefined
    entries.push([field, value])
  }
  return Object.fromEntries(entries)
}

function buildPreparedAction(input: Readonly<{
  preparationScope: string
  request: CustomerRequest
  plan: PlanRevision
  action: ProposedAction
  contract: CapabilityContract
  resolvedInput: Readonly<Record<string, string | number | boolean>>
  quote: PreparedRouteQuote
  releaseEvidence: ReadonlyMap<string, Readonly<{ allocationId: string; releasedAt: number }>>
  preparedAt: number
}>): PreparedAction {
  const executionCandidates = [input.quote.selected, ...input.quote.fallbacks.map((fallback) => fallback.candidate)]
  const preparationDisclosures = input.quote.preparationDisclosures.flatMap((item) => {
    const disclosure = input.contract.input[item.field]?.disclosure
    return disclosure === undefined ? [] : disclosure.purposes.flatMap((purpose) => {
      const evidence = input.releaseEvidence.get(disclosureKey(item.recipient.bindingId, purpose, [item.field]))
      return evidence === undefined ? [] : [{
        field: item.field, dataCategory: input.contract.input[item.field]?.customerLabel ?? item.field,
        timing: 'already_shared_to_prepare' as const,
        recipientBindingId: item.recipient.bindingId, recipientName: item.recipient.name,
        purposes: Object.freeze([purpose]), purposeLabels: Object.freeze([customerPurposeLabel(purpose)]),
        status: 'released' as const, recordedAt: evidence.releasedAt, inspectionRef: evidence.allocationId,
      }]
    })
  })
  const executionDisclosures = executionCandidates.flatMap((candidate) => candidate.executionDataFields.flatMap((field) => {
    const disclosure = input.contract.input[field]?.disclosure
    return disclosure === undefined ? [] : [{
      field, dataCategory: input.contract.input[field]?.customerLabel ?? field, timing: 'on_execution' as const,
      recipientBindingId: candidate.business.bindingId, recipientName: candidate.business.name,
      purposes: Object.freeze([...disclosure.purposes].sort()),
      purposeLabels: Object.freeze(disclosure.purposes.map(customerPurposeLabel).sort()),
      status: 'not_released' as const, recordedAt: input.preparedAt,
      inspectionRef: `pending:${input.preparationScope}:${candidate.business.bindingId}:${field}`,
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
  } as StableHashValue)
}

export function planRevisionDigest(plan: PlanRevision): string {
  return canonicalDigest({
    planRevisionId: plan.planRevisionId, requestId: plan.requestId, requestRevision: plan.requestRevision,
    proposedByAgentId: plan.proposedByAgentId, proposalProvenance: { ...plan.proposalProvenance }, createdAt: plan.createdAt,
    completionEvidence: plan.completionEvidence.map((evidence) => ({ ...evidence })),
    actions: plan.actions.map((action): StableHashValue => ({
      actionId: action.actionId, capabilityContractId: action.capabilityContractId,
      dependsOn: [...action.dependsOn].sort(),
      input: planInputDigestRecord(action.input),
      ...(action.providerAffinity === undefined ? {} : { providerAffinity: { ...action.providerAffinity } }),
    })),
  })
}

function planInputDigestRecord(input: PlanRevision['actions'][number]['input']): StableHashValue {
  const material: Record<string, StableHashValue> = {}
  for (const [field, value] of Object.entries(input).sort(([left], [right]) => left.localeCompare(right))) {
    material[field] = planInputDigestMaterial(value)
  }
  return material
}

function planInputDigestMaterial(value: PlanRevision['actions'][number]['input'][string]): StableHashValue {
  if (value?.kind === 'literal') return { kind: value.kind, value: value.value }
  if (value?.kind === 'action_output') return { kind: value.kind, actionId: value.actionId, field: value.field }
  if (value?.kind === 'customer_fact') return { kind: value.kind, fact: value.fact }
  throw new Error('plan_input_missing')
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
      field: disclosure.field, dataCategory: disclosure.dataCategory, timing: disclosure.timing,
      recipientBindingId: disclosure.recipientBindingId,
      recipientName: disclosure.recipientName, purposes: [...disclosure.purposes].sort(),
      purposeLabels: [...disclosure.purposeLabels].sort(), status: disclosure.status,
      recordedAt: disclosure.recordedAt, inspectionRef: disclosure.inspectionRef,
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
    ...(command.preparationAuthorityEvidenceRef === undefined ? {} : {
      preparationAuthorityEvidenceRef: command.preparationAuthorityEvidenceRef,
    }),
  } as StableHashValue
}

function stableRecord(value: Readonly<Record<string, string | number | boolean | undefined>>): StableHashValue {
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined))
}

function scopeFor(command: PrepareCustomerRequestActionCommand): string {
  return `${command.requestId}:${command.requestRevision}:${command.planRevisionId}:${command.actionId}`
}

function refusal(
  preparationScope: string,
  reason: PreparationRefusalReason,
  inspectionRef?: string,
): PrepareCustomerRequestActionResult {
  return Object.freeze({
    kind: 'preparation_refused', preparationScope, reason,
    ...(inspectionRef === undefined ? {} : { inspectionRef }),
  })
}

function deepFreeze(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const nested of Object.values(value)) deepFreeze(nested)
  return Object.freeze(value)
}
