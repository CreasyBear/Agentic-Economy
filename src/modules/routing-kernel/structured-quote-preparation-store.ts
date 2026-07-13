import { canonicalAuthorityDigest } from './internal/authority-digest'

type Awaitable<T> = T | Promise<T>

export type FrozenCommercialRelationship = Readonly<{
  kind: 'none' | 'commission' | 'sponsorship' | 'rebate' | 'ownership' | 'other'
  summary: string
  payerName?: string
  beneficiaryName?: string
  compensationBasis?: string
  influencesEligibility: boolean
  influencesInclusion: boolean
  influencesOrder: boolean
  evidenceRefs: readonly string[]
}>

export type PreparationCandidate = Readonly<{
  bindingId: string
  nodeId: string
  businessId: string
  recipientName: string
  presentationEvidenceDigest: string
  commercialRelationship?: FrozenCommercialRelationship
  capabilityContractId: string
  capabilityContractVersion: string
  registrationEnvironment: string
  registrationHash: string
  registrationEvidenceDigest: string
  incidentEpochDigest: string
  incidentEvidenceDigest: string
}>

export type PlanActionPreparationSource = Readonly<{
  kind: 'plan_action'; planRevisionId: string; actionId: string
}>
export type RequestEvaluationPreparationSource = Readonly<{
  kind: 'request_evaluation'; evaluationId: string; evaluationDigest: string
}>
export type PreparationSource = PlanActionPreparationSource | RequestEvaluationPreparationSource

type PreparationCandidateSetBase = Readonly<{
  preparationRequestId: string
  customerRequestId: string
  generation: number
  capabilityContractId: string
  capabilityContractVersion: string
  createdAt: number
  candidates: readonly PreparationCandidate[]
  candidateSetDigest: string
}>

export type PlanActionPreparationCandidateSet = PreparationCandidateSetBase & Readonly<{
      source: PlanActionPreparationSource
      planRevisionId: string
      actionId: string
    }>
export type RequestEvaluationPreparationCandidateSet = PreparationCandidateSetBase & Readonly<{
  source: RequestEvaluationPreparationSource
}>
export type PreparationCandidateSet = PlanActionPreparationCandidateSet | RequestEvaluationPreparationCandidateSet

export type PreparationCandidateCoverage = Readonly<{
  candidateSetDigest: string
  bindingId: string
  nodeId: string
  disposition: 'eligible_not_contacted' | 'registration_stale' | 'incident_frozen' | 'release_refused' | 'allocated' | 'dispatch_attempted' | 'option_received' | 'provider_refused' | 'uncertain'
  protectedData: 'not_released' | 'released' | 'uncertain'
  providerContact: 'none' | 'attempted'
  reasonCode: string
  recordedAt: number
}>

export type QuotePreparationRecipient = Readonly<{ bindingId: string; nodeId: string; businessId: string }>

export type QuotePreparationCommand = Readonly<{
  quoteAttemptId: string
  preparationRequestId: string
  candidateSetDigest: string
  recipient: QuotePreparationRecipient
  purpose: string
  fieldNames: readonly string[]
  capabilityContractId: string
  capabilityContractVersion: string
  registrationHash: string
  registrationEnvironment: string
  registrationEvidenceDigest: string
  allocationId: string
  claimedAt: number
  commandDigest: string
}>

export type ProviderOffer = Readonly<{
  providerOfferId: string
  offerDigest: string
  quoteAttemptId: string
  commandDigest: string
  candidateSetDigest: string
  issuerBindingId: string
  issuerNodeId: string
  issuerBusinessId: string
  capabilityContractId: string
  capabilityContractVersion: string
  providerOfferRef: string
  expectedCost: Readonly<{ currency: string; amountMinor: number }>
  maximumCost: Readonly<{ currency: string; amountMinor: number }>
  expectedLatencyMs: number
  executionDataFields: readonly string[]
  materialTerms: readonly string[]
  offerOutputs: readonly Readonly<{ field: string; valueType: 'string' | 'integer' | 'boolean' | 'url' | 'money_minor'; value: string | number | boolean }>[]
  priceComponents: readonly Readonly<{ label: string; amountMinor: number }>[]
  cancellation: Readonly<{ kind: 'supported' | 'conditional' | 'unsupported'; summary: string }>
  offerOutputsDigest: string
  termsDigest: string
  cancellationTermsDigest: string
  providerEvidenceDigest: string
  issuedAt: number
  expiresAt: number
}>

type AttemptBase = Readonly<{ command: QuotePreparationCommand; quoteAttemptId: string; commandDigest: string }>
export type QuotePreparationAttempt =
  | (AttemptBase & Readonly<{ disposition: 'allocated' }>)
  | (AttemptBase & Readonly<{ disposition: 'dispatched'; dispatchedAt: number }>)
  | (AttemptBase & Readonly<{ disposition: 'quoted'; dispatchedAt: number; resolvedAt: number; offer: ProviderOffer; resolutionDigest: string; uncertainAt?: number; uncertaintyDigest?: string }>)
  | (AttemptBase & Readonly<{ disposition: 'refused'; dispatchedAt?: number; resolvedAt: number; reasonCode: string; resolutionDigest: string; uncertainAt?: number; uncertaintyDigest?: string }>)
  | (AttemptBase & Readonly<{ disposition: 'uncertain'; dispatchedAt: number; resolvedAt: number; reasonCode: string; resolutionDigest: string }>)

export type StoreWriteResult<T> =
  | Readonly<{ kind: 'stored'; candidateSet: T }>
  | Readonly<{ kind: 'existing'; candidateSet: T }>
  | Readonly<{ kind: 'conflict'; existing: T }>

export type ClaimQuoteAttemptResult =
  | Readonly<{ kind: 'claimed'; attempt: QuotePreparationAttempt }>
  | Readonly<{ kind: 'existing'; attempt: QuotePreparationAttempt }>
  | Readonly<{ kind: 'conflict'; existing: QuotePreparationAttempt }>
  | Readonly<{ kind: 'candidate_set_not_found' | 'candidate_not_bound' | 'candidate_evidence_stale' }>

export type AttemptTransitionResult =
  | Readonly<{ kind: 'updated' | 'existing'; attempt: QuotePreparationAttempt }>
  | Readonly<{ kind: 'not_found' | 'conflict' | 'invalid_transition' }>

type CandidateSetCommonInput = Omit<PreparationCandidateSetBase, 'candidateSetDigest'> & Readonly<{ candidateSetDigest?: string }>
type PlanCandidateSetInput = CandidateSetCommonInput & Readonly<{
  source?: PlanActionPreparationSource
  planRevisionId: string
  actionId: string
}>
type EvaluationCandidateSetInput = CandidateSetCommonInput & Readonly<{
  source: RequestEvaluationPreparationSource
  planRevisionId?: never
  actionId?: never
}>
type CandidateSetInput = PlanCandidateSetInput | EvaluationCandidateSetInput
type CommandInput = Omit<QuotePreparationCommand, 'commandDigest'> & Readonly<{ commandDigest?: string }>
type OfferInput = Omit<ProviderOffer, 'offerDigest'> & Readonly<{ offerDigest?: string }>

export type QuoteAttemptResolution =
  | Readonly<{ quoteAttemptId: string; commandDigest: string; disposition: 'quoted'; resolvedAt: number; offer: ProviderOffer }>
  | Readonly<{ quoteAttemptId: string; commandDigest: string; disposition: 'refused' | 'uncertain'; resolvedAt: number; reasonCode: string }>

export type StructuredQuotePreparationStore = Readonly<{
  putCandidateSet: (candidateSet: PreparationCandidateSet) => Awaitable<StoreWriteResult<PreparationCandidateSet>>
  getCandidateSet: (preparationRequestId: string) => Awaitable<PreparationCandidateSet | undefined>
  getCandidateSetByDigest: (candidateSetDigest: string) => Awaitable<PreparationCandidateSet | undefined>
  claimQuoteAttempt: (command: QuotePreparationCommand) => Awaitable<ClaimQuoteAttemptResult>
  getQuoteAttempt: (quoteAttemptId: string) => Awaitable<QuotePreparationAttempt | undefined>
  markDispatched: (input: Readonly<{ quoteAttemptId: string; commandDigest: string; dispatchedAt: number }>) => Awaitable<AttemptTransitionResult>
  resolveQuoteAttempt: (input: QuoteAttemptResolution) => Awaitable<AttemptTransitionResult>
  recordCandidateCoverage: (input: PreparationCandidateCoverage) => Awaitable<PreparationCandidateCoverage>
  listCandidateCoverage: (candidateSetDigest: string) => Awaitable<readonly PreparationCandidateCoverage[]>
  getProviderOffer: (providerOfferId: string) => Awaitable<ProviderOffer | undefined>
  getProviderOfferByDigest: (offerDigest: string) => Awaitable<ProviderOffer | undefined>
  resolveProviderOfferAffinity: (input: ProviderOfferAffinityInput) => Awaitable<ProviderOfferAffinityResult>
}>

export type ProviderOfferAffinityInput = Readonly<{
  providerOfferId: string
  candidateSetDigest: string
  customerRequestId: string
  planRevisionId: string
  sourceActionId: string
  expectedBindingId: string
  capabilityContractId: string
  capabilityContractVersion: string
  now: number
}>

export type ProviderOfferAffinityResult =
  | Readonly<{ kind: 'matched'; offer: ProviderOffer }>
  | Readonly<{ kind: 'refused'; reason: 'foreign' | 'stale' | 'expired' | 'issuer_mismatch' | 'lineage_mismatch' | 'contract_mismatch' | 'not_found' }>

export function createPreparationCandidateSet(
  input: PlanCandidateSetInput,
): PlanActionPreparationCandidateSet
export function createPreparationCandidateSet(
  input: EvaluationCandidateSetInput,
): RequestEvaluationPreparationCandidateSet
export function createPreparationCandidateSet(input: CandidateSetInput): PreparationCandidateSet
export function createPreparationCandidateSet(input: CandidateSetInput): PreparationCandidateSet {
  assertExactKeys('preparation_candidate_set', input, [...candidateSetKeys, 'source', 'candidateSetDigest'])
  assertStringFields('preparation_candidate_set', input, ['preparationRequestId', 'customerRequestId', 'capabilityContractId', 'capabilityContractVersion'])
  assertNonEmpty(input.preparationRequestId, 'preparationRequestId')
  if (!Number.isSafeInteger(input.generation) || input.generation < 0) throw new Error('preparation_candidate_set_generation_invalid')
  if (input.candidates.length === 0 || input.candidates.length > 64) throw new Error('preparation_candidate_set_candidates_invalid')
  const candidates = input.candidates.map((candidate) => {
    assertExactKeys('preparation_candidate', candidate, candidateKeys)
    assertStringFields('preparation_candidate', candidate, candidateStringKeys)
    if (candidate.commercialRelationship !== undefined) assertCommercialRelationship(candidate.commercialRelationship)
    return Object.freeze({
      ...candidate,
      ...(candidate.commercialRelationship === undefined ? {} : { commercialRelationship: Object.freeze({
        ...candidate.commercialRelationship,
        evidenceRefs: Object.freeze([...candidate.commercialRelationship.evidenceRefs]),
      }) }),
    })
  })
  const source = normalizePreparationSource(input)
  const common = {
    preparationRequestId: input.preparationRequestId, customerRequestId: input.customerRequestId,
    generation: input.generation,
    capabilityContractId: input.capabilityContractId, capabilityContractVersion: input.capabilityContractVersion,
    createdAt: input.createdAt, candidates: Object.freeze(candidates),
  }
  const digest = source.kind === 'plan_action'
    ? canonicalAuthorityDigest({ preparationRequestId: input.preparationRequestId, customerRequestId: input.customerRequestId,
        planRevisionId: source.planRevisionId, actionId: source.actionId, generation: input.generation,
        capabilityContractId: input.capabilityContractId, capabilityContractVersion: input.capabilityContractVersion,
        createdAt: input.createdAt, candidates: Object.freeze(candidates) })
    : canonicalAuthorityDigest({
        ...common,
        source: {
          kind: source.kind,
          evaluationId: source.evaluationId,
          evaluationDigest: source.evaluationDigest,
        },
      })
  if (input.candidateSetDigest !== undefined && input.candidateSetDigest !== digest) throw new Error('preparation_candidate_set_digest_mismatch')
  return source.kind === 'plan_action'
    ? Object.freeze({ ...common, source, planRevisionId: source.planRevisionId, actionId: source.actionId, candidateSetDigest: digest })
    : Object.freeze({ ...common, source, candidateSetDigest: digest })
}

function normalizePreparationSource(input: CandidateSetInput): PreparationSource {
  if (input.source?.kind === 'request_evaluation') {
    assertExactKeys('preparation_source', input.source, ['kind', 'evaluationId', 'evaluationDigest'])
    assertStringFields('preparation_source', input.source, ['evaluationId', 'evaluationDigest'])
    if ('planRevisionId' in input || 'actionId' in input) throw new Error('preparation_source_lineage_conflict')
    return Object.freeze({ ...input.source })
  }
  const planRevisionId = input.source?.kind === 'plan_action' ? input.source.planRevisionId : input.planRevisionId
  const actionId = input.source?.kind === 'plan_action' ? input.source.actionId : input.actionId
  if (typeof planRevisionId !== 'string' || planRevisionId.length === 0
    || typeof actionId !== 'string' || actionId.length === 0) throw new Error('preparation_source_plan_action_invalid')
  if (input.source !== undefined) {
    assertExactKeys('preparation_source', input.source, ['kind', 'planRevisionId', 'actionId'])
    if (input.planRevisionId !== planRevisionId || input.actionId !== actionId) throw new Error('preparation_source_lineage_conflict')
  }
  return Object.freeze({ kind: 'plan_action', planRevisionId, actionId })
}

export function createQuotePreparationCommand(input: CommandInput): QuotePreparationCommand {
  assertExactKeys('quote_preparation_command', input, [...commandKeys, 'commandDigest'])
  assertExactKeys('quote_preparation_recipient', input.recipient, recipientKeys)
  assertStringFields('quote_preparation_command', input, ['quoteAttemptId', 'preparationRequestId', 'candidateSetDigest', 'purpose', 'capabilityContractId', 'capabilityContractVersion', 'allocationId'])
  assertStringFields('quote_preparation_recipient', input.recipient, recipientKeys)
  if (input.fieldNames.length > 64 || input.fieldNames.some((field) => typeof field !== 'string' || field.length === 0)) throw new Error('quote_preparation_command_field_name_invalid')
  if (new Set(input.fieldNames).size !== input.fieldNames.length) throw new Error('quote_preparation_command_field_names_invalid')
  const body = Object.freeze({
    quoteAttemptId: input.quoteAttemptId, preparationRequestId: input.preparationRequestId,
    candidateSetDigest: input.candidateSetDigest, recipient: Object.freeze({ ...input.recipient }), purpose: input.purpose,
    fieldNames: Object.freeze([...input.fieldNames].sort()), capabilityContractId: input.capabilityContractId,
    capabilityContractVersion: input.capabilityContractVersion, allocationId: input.allocationId, claimedAt: input.claimedAt,
    registrationHash: input.registrationHash, registrationEnvironment: input.registrationEnvironment,
    registrationEvidenceDigest: input.registrationEvidenceDigest,
  })
  const digest = canonicalAuthorityDigest(body)
  if (input.commandDigest !== undefined && input.commandDigest !== digest) throw new Error('quote_preparation_command_digest_mismatch')
  return Object.freeze({ ...body, commandDigest: digest })
}

export function createProviderOffer(input: OfferInput): ProviderOffer {
  assertExactKeys('provider_offer', input, [...offerKeys, 'offerDigest'])
  assertExactKeys('provider_offer_expected_cost', input.expectedCost, priceKeys)
  assertExactKeys('provider_offer_maximum_cost', input.maximumCost, priceKeys)
  input.offerOutputs.forEach((output) => assertExactKeys('provider_offer_output', output, offerOutputKeys))
  input.priceComponents.forEach((component) => assertExactKeys('provider_offer_price_component', component, priceComponentKeys))
  assertExactKeys('provider_offer_cancellation', input.cancellation, cancellationKeys)
  assertStringFields('provider_offer', input, ['providerOfferId', 'quoteAttemptId', 'commandDigest', 'candidateSetDigest', 'issuerBindingId', 'issuerNodeId', 'issuerBusinessId', 'capabilityContractId', 'capabilityContractVersion', 'providerOfferRef', 'termsDigest', 'cancellationTermsDigest', 'providerEvidenceDigest'])
  assertStringFields('provider_offer_expected_cost', input.expectedCost, ['currency'])
  assertStringFields('provider_offer_maximum_cost', input.maximumCost, ['currency'])
  if (!Number.isSafeInteger(input.expectedCost.amountMinor) || input.expectedCost.amountMinor < 0
    || !Number.isSafeInteger(input.maximumCost.amountMinor) || input.maximumCost.amountMinor < input.expectedCost.amountMinor
    || input.expectedCost.currency !== input.maximumCost.currency
    || !Number.isSafeInteger(input.expectedLatencyMs) || input.expectedLatencyMs < 0
    || input.executionDataFields.length > 64 || input.materialTerms.length > 64
    || input.executionDataFields.some((field) => typeof field !== 'string' || field.length === 0)
    || input.materialTerms.some((term) => typeof term !== 'string' || term.length === 0)
    || input.offerOutputs.some((output) => !validOfferOutput(output))
    || new Set(input.offerOutputs.map((output) => output.field)).size !== input.offerOutputs.length
    || input.priceComponents.some((component) => component.label.trim().length === 0 || !Number.isSafeInteger(component.amountMinor) || component.amountMinor < 0)
    || input.cancellation.summary.trim().length === 0
    || input.expiresAt <= input.issuedAt) throw new Error('provider_offer_terms_invalid')
  const body = Object.freeze({
    providerOfferId: input.providerOfferId, quoteAttemptId: input.quoteAttemptId,
    commandDigest: input.commandDigest, candidateSetDigest: input.candidateSetDigest,
    issuerBindingId: input.issuerBindingId, issuerNodeId: input.issuerNodeId, issuerBusinessId: input.issuerBusinessId,
    capabilityContractId: input.capabilityContractId, capabilityContractVersion: input.capabilityContractVersion,
    providerOfferRef: input.providerOfferRef,
    expectedCost: Object.freeze({ ...input.expectedCost }), maximumCost: Object.freeze({ ...input.maximumCost }),
    expectedLatencyMs: input.expectedLatencyMs,
    executionDataFields: Object.freeze([...input.executionDataFields]), materialTerms: Object.freeze([...input.materialTerms]),
    offerOutputs: Object.freeze(input.offerOutputs.map((output) => Object.freeze({ ...output }))),
    priceComponents: Object.freeze(input.priceComponents.map((component) => Object.freeze({ ...component }))),
    cancellation: Object.freeze({ ...input.cancellation }), offerOutputsDigest: input.offerOutputsDigest,
    termsDigest: input.termsDigest,
    cancellationTermsDigest: input.cancellationTermsDigest, providerEvidenceDigest: input.providerEvidenceDigest,
    issuedAt: input.issuedAt, expiresAt: input.expiresAt,
  })
  const digest = canonicalAuthorityDigest(body)
  if (input.offerDigest !== undefined && input.offerDigest !== digest) throw new Error('provider_offer_digest_mismatch')
  return Object.freeze({ ...body, offerDigest: digest }) as ProviderOffer
}

export function createInMemoryStructuredQuotePreparationStore(): StructuredQuotePreparationStore {
  const candidateSets = new Map<string, PreparationCandidateSet>()
  const candidateSetsByDigest = new Map<string, PreparationCandidateSet>()
  const attempts = new Map<string, QuotePreparationAttempt>()
  const offers = new Map<string, ProviderOffer>()
  const coverage = new Map<string, PreparationCandidateCoverage>()

  return Object.freeze({
    putCandidateSet: (raw) => {
      const candidateSet = createPreparationCandidateSet(raw)
      const existing = candidateSets.get(candidateSet.preparationRequestId)
      if (existing !== undefined) return existing.candidateSetDigest === candidateSet.candidateSetDigest
        ? { kind: 'existing', candidateSet: existing } : { kind: 'conflict', existing }
      candidateSets.set(candidateSet.preparationRequestId, candidateSet)
      candidateSetsByDigest.set(candidateSet.candidateSetDigest, candidateSet)
      return { kind: 'stored', candidateSet }
    },
    getCandidateSet: (id) => candidateSets.get(id),
    getCandidateSetByDigest: (digest) => candidateSetsByDigest.get(digest),
    claimQuoteAttempt: (raw) => {
      const command = createQuotePreparationCommand(raw)
      const existing = attempts.get(command.quoteAttemptId)
      if (existing !== undefined) return existing.commandDigest === command.commandDigest
        ? { kind: 'existing', attempt: existing } : { kind: 'conflict', existing }
      const set = candidateSets.get(command.preparationRequestId)
      if (set === undefined || set.candidateSetDigest !== command.candidateSetDigest) return { kind: 'candidate_set_not_found' }
      const recipient = set.candidates.find((entry) => entry.bindingId === command.recipient.bindingId
        && entry.nodeId === command.recipient.nodeId && entry.businessId === command.recipient.businessId)
      if (recipient === undefined) return { kind: 'candidate_not_bound' }
      if (recipient.capabilityContractId !== command.capabilityContractId
        || recipient.capabilityContractVersion !== command.capabilityContractVersion
        || recipient.registrationHash !== command.registrationHash
        || recipient.registrationEnvironment !== command.registrationEnvironment
        || recipient.registrationEvidenceDigest !== command.registrationEvidenceDigest) return { kind: 'candidate_evidence_stale' }
      const attempt = Object.freeze({ quoteAttemptId: command.quoteAttemptId, commandDigest: command.commandDigest, command, disposition: 'allocated' as const })
      attempts.set(command.quoteAttemptId, attempt)
      return { kind: 'claimed', attempt }
    },
    getQuoteAttempt: (id) => attempts.get(id),
    markDispatched: ({ quoteAttemptId, commandDigest, dispatchedAt }) => {
      const current = attempts.get(quoteAttemptId)
      if (current === undefined) return { kind: 'not_found' }
      if (current.commandDigest !== commandDigest) return { kind: 'conflict' }
      if (current.disposition === 'dispatched' && current.dispatchedAt === dispatchedAt) return { kind: 'existing', attempt: current }
      if (current.disposition !== 'allocated') return { kind: 'invalid_transition' }
      const attempt = Object.freeze({ ...current, disposition: 'dispatched' as const, dispatchedAt })
      attempts.set(quoteAttemptId, attempt)
      return { kind: 'updated', attempt }
    },
    resolveQuoteAttempt: (input) => {
      const current = attempts.get(input.quoteAttemptId)
      if (current === undefined) return { kind: 'not_found' }
      if (current.commandDigest !== input.commandDigest) return { kind: 'conflict' }
      const resolutionDigest = canonicalAuthorityDigest(input.disposition === 'quoted'
        ? { disposition: input.disposition, resolvedAt: input.resolvedAt, offerDigest: input.offer.offerDigest }
        : { disposition: input.disposition, resolvedAt: input.resolvedAt, reasonCode: input.reasonCode })
      if (current.disposition === 'uncertain' && input.disposition === 'quoted') {
        const offer = createProviderOffer(input.offer)
        if (!offerMatchesAttempt(offer, current)) return { kind: 'conflict' }
        const existingOffer = offers.get(offer.providerOfferId)
        if (existingOffer !== undefined && existingOffer.offerDigest !== offer.offerDigest) return { kind: 'conflict' }
        const attempt: QuotePreparationAttempt = Object.freeze({
          ...current, disposition: 'quoted' as const, resolvedAt: input.resolvedAt, offer, resolutionDigest,
          uncertainAt: current.resolvedAt, uncertaintyDigest: current.resolutionDigest,
        })
        attempts.set(input.quoteAttemptId, attempt)
        offers.set(offer.providerOfferId, offer)
        return { kind: 'updated', attempt }
      }
      if (current.disposition === 'uncertain' && input.disposition === 'refused') {
        const attempt: QuotePreparationAttempt = Object.freeze({
          ...current, disposition: 'refused' as const, resolvedAt: input.resolvedAt, reasonCode: input.reasonCode,
          resolutionDigest, uncertainAt: current.resolvedAt, uncertaintyDigest: current.resolutionDigest,
        })
        attempts.set(input.quoteAttemptId, attempt)
        return { kind: 'updated', attempt }
      }
      if ('resolutionDigest' in current) return current.resolutionDigest === resolutionDigest
        ? { kind: 'existing', attempt: current } : { kind: 'invalid_transition' }
      if (input.disposition !== 'refused' && current.disposition !== 'dispatched') return { kind: 'invalid_transition' }
      if (input.disposition === 'quoted') {
        if (current.disposition !== 'dispatched') return { kind: 'invalid_transition' }
        const offer = createProviderOffer(input.offer)
        if (!offerMatchesAttempt(offer, current)) return { kind: 'conflict' }
        const existingOffer = offers.get(offer.providerOfferId)
        if (existingOffer !== undefined && existingOffer.offerDigest !== offer.offerDigest) return { kind: 'conflict' }
        const attempt: QuotePreparationAttempt = Object.freeze({ ...current, disposition: 'quoted' as const, dispatchedAt: current.dispatchedAt, resolvedAt: input.resolvedAt, offer, resolutionDigest })
        attempts.set(input.quoteAttemptId, attempt)
        offers.set(offer.providerOfferId, offer)
        return { kind: 'updated', attempt }
      }
      const attempt = Object.freeze({ ...current, disposition: input.disposition, resolvedAt: input.resolvedAt, reasonCode: input.reasonCode, resolutionDigest }) as QuotePreparationAttempt
      attempts.set(input.quoteAttemptId, attempt)
      return { kind: 'updated', attempt }
    },
    recordCandidateCoverage: (input) => {
      if (!validCoverageState(input)) throw new Error('preparation_candidate_coverage_invalid')
      const candidateSet = candidateSetsByDigest.get(input.candidateSetDigest)
      if (candidateSet === undefined || !candidateSet.candidates.some((candidate) => candidate.bindingId === input.bindingId && candidate.nodeId === input.nodeId)) {
        throw new Error('preparation_candidate_coverage_not_bound')
      }
      const key = `${input.candidateSetDigest}\u001f${input.bindingId}`
      const existing = coverage.get(key)
      if (existing !== undefined && !coverageMayAdvance(existing, input)) return existing
      const exact = Object.freeze({ ...input })
      coverage.set(key, exact)
      return exact
    },
    listCandidateCoverage: (candidateSetDigest) => [...coverage.values()]
      .filter((item) => item.candidateSetDigest === candidateSetDigest)
      .sort((left, right) => left.bindingId.localeCompare(right.bindingId)),
    getProviderOffer: (id) => offers.get(id),
    getProviderOfferByDigest: (offerDigest) => [...offers.values()].find((offer) => offer.offerDigest === offerDigest),
    resolveProviderOfferAffinity: (input) => resolveAffinity(input, offers, candidateSetsByDigest, candidateSets),
  })
}

function coverageMayAdvance(current: PreparationCandidateCoverage, next: PreparationCandidateCoverage): boolean {
  if (canonicalAuthorityDigest(current) === canonicalAuthorityDigest(next)) return false
  if (!validCoverageState(next)) return false
  const allowed: Record<PreparationCandidateCoverage['disposition'], readonly PreparationCandidateCoverage['disposition'][]> = {
    eligible_not_contacted: ['registration_stale', 'incident_frozen', 'release_refused', 'allocated'],
    allocated: ['registration_stale', 'incident_frozen', 'release_refused', 'dispatch_attempted'],
    dispatch_attempted: ['uncertain', 'provider_refused', 'option_received'],
    uncertain: ['provider_refused', 'option_received'],
    registration_stale: [], incident_frozen: [], release_refused: [], provider_refused: [], option_received: [],
  }
  return allowed[current.disposition].includes(next.disposition)
}

function validCoverageState(input: PreparationCandidateCoverage): boolean {
  if (input.disposition === 'eligible_not_contacted' || input.disposition === 'registration_stale'
    || input.disposition === 'incident_frozen' || input.disposition === 'release_refused'
    || input.disposition === 'allocated') {
    return input.protectedData === 'not_released' && input.providerContact === 'none'
  }
  if (input.disposition === 'uncertain') return input.protectedData === 'uncertain' && input.providerContact === 'attempted'
  return input.protectedData === 'released' && input.providerContact === 'attempted'
}

function resolveAffinity(
  input: ProviderOfferAffinityInput,
  offers: ReadonlyMap<string, ProviderOffer>,
  candidateSetsByDigest: ReadonlyMap<string, PreparationCandidateSet>,
  candidateSets: ReadonlyMap<string, PreparationCandidateSet>,
): ProviderOfferAffinityResult {
  const offer = offers.get(input.providerOfferId)
  if (offer === undefined) return { kind: 'refused', reason: 'not_found' }
  if (offer.candidateSetDigest !== input.candidateSetDigest) return { kind: 'refused', reason: 'foreign' }
  const set = candidateSetsByDigest.get(offer.candidateSetDigest)
  if (set === undefined || set.source.kind !== 'plan_action' || set.customerRequestId !== input.customerRequestId
    || set.source.planRevisionId !== input.planRevisionId
    || set.source.actionId !== input.sourceActionId) return { kind: 'refused', reason: 'lineage_mismatch' }
  const latestGeneration = Math.max(...[...candidateSets.values()]
    .filter((candidate) => candidate.customerRequestId === input.customerRequestId
      && candidate.source.kind === 'plan_action'
      && candidate.source.planRevisionId === input.planRevisionId && candidate.source.actionId === input.sourceActionId)
    .map((candidate) => candidate.generation))
  if (latestGeneration > set.generation) return { kind: 'refused', reason: 'stale' }
  if (input.now >= offer.expiresAt) return { kind: 'refused', reason: 'expired' }
  if (offer.issuerBindingId !== input.expectedBindingId) return { kind: 'refused', reason: 'issuer_mismatch' }
  if (offer.capabilityContractId !== input.capabilityContractId
    || offer.capabilityContractVersion !== input.capabilityContractVersion) return { kind: 'refused', reason: 'contract_mismatch' }
  return { kind: 'matched', offer }
}

function offerMatchesAttempt(offer: ProviderOffer, attempt: QuotePreparationAttempt): boolean {
  return offer.quoteAttemptId === attempt.quoteAttemptId && offer.commandDigest === attempt.commandDigest
    && offer.candidateSetDigest === attempt.command.candidateSetDigest
    && offer.issuerBindingId === attempt.command.recipient.bindingId && offer.issuerNodeId === attempt.command.recipient.nodeId
    && offer.issuerBusinessId === attempt.command.recipient.businessId
    && offer.capabilityContractId === attempt.command.capabilityContractId
    && offer.capabilityContractVersion === attempt.command.capabilityContractVersion
}

function assertExactKeys(label: string, input: object, allowed: readonly string[]): void {
  const allowedSet = new Set(allowed)
  for (const key of Object.keys(input)) if (!allowedSet.has(key)) throw new Error(`${label}_unexpected_field:${key}`)
}

function assertStringFields(label: string, input: object, fields: readonly string[]): void {
  const values = input as Readonly<Record<string, unknown>>
  for (const field of fields) if (typeof values[field] !== 'string' || values[field].length === 0) throw new Error(`${label}_${field}_invalid`)
}

function assertNonEmpty(value: string, field: string): void {
  if (value.length === 0) throw new Error(`preparation_candidate_set_${field}_empty`)
}

const candidateSetKeys = ['preparationRequestId', 'customerRequestId', 'planRevisionId', 'actionId', 'generation', 'capabilityContractId', 'capabilityContractVersion', 'createdAt', 'candidates'] as const
const candidateStringKeys = ['bindingId', 'nodeId', 'businessId', 'recipientName', 'presentationEvidenceDigest', 'capabilityContractId', 'capabilityContractVersion', 'registrationEnvironment', 'registrationHash', 'registrationEvidenceDigest', 'incidentEpochDigest', 'incidentEvidenceDigest'] as const
const candidateKeys = [...candidateStringKeys, 'commercialRelationship'] as const
const commandKeys = ['quoteAttemptId', 'preparationRequestId', 'candidateSetDigest', 'recipient', 'purpose', 'fieldNames', 'capabilityContractId', 'capabilityContractVersion', 'registrationHash', 'registrationEnvironment', 'registrationEvidenceDigest', 'allocationId', 'claimedAt'] as const
const recipientKeys = ['bindingId', 'nodeId', 'businessId'] as const
const offerKeys = ['providerOfferId', 'quoteAttemptId', 'commandDigest', 'candidateSetDigest', 'issuerBindingId', 'issuerNodeId', 'issuerBusinessId', 'capabilityContractId', 'capabilityContractVersion', 'providerOfferRef', 'expectedCost', 'maximumCost', 'expectedLatencyMs', 'executionDataFields', 'materialTerms', 'offerOutputs', 'priceComponents', 'cancellation', 'offerOutputsDigest', 'termsDigest', 'cancellationTermsDigest', 'providerEvidenceDigest', 'issuedAt', 'expiresAt'] as const
const priceKeys = ['currency', 'amountMinor'] as const
const offerOutputKeys = ['field', 'valueType', 'value'] as const
const priceComponentKeys = ['label', 'amountMinor'] as const
const cancellationKeys = ['kind', 'summary'] as const

function assertCommercialRelationship(input: FrozenCommercialRelationship): void {
  assertExactKeys('preparation_candidate_commercial_relationship', input, [
    'kind', 'summary', 'payerName', 'beneficiaryName', 'compensationBasis',
    'influencesEligibility', 'influencesInclusion', 'influencesOrder', 'evidenceRefs',
  ])
  if (!['none', 'commission', 'sponsorship', 'rebate', 'ownership', 'other'].includes(input.kind)
    || input.summary.trim().length === 0 || input.summary.length > 1_000
    || typeof input.influencesEligibility !== 'boolean' || typeof input.influencesInclusion !== 'boolean'
    || typeof input.influencesOrder !== 'boolean' || input.evidenceRefs.length === 0
    || input.evidenceRefs.some((reference) => reference.trim().length === 0)) {
    throw new Error('preparation_candidate_commercial_relationship_invalid')
  }
  if (input.kind === 'none') {
    if (input.payerName !== undefined || input.beneficiaryName !== undefined || input.compensationBasis !== undefined
      || input.influencesEligibility || input.influencesInclusion || input.influencesOrder) {
      throw new Error('preparation_candidate_commercial_relationship_invalid')
    }
    return
  }
  if (input.payerName === undefined || input.payerName.trim().length === 0
    || input.beneficiaryName === undefined || input.beneficiaryName.trim().length === 0
    || input.compensationBasis === undefined || input.compensationBasis.trim().length === 0) {
    throw new Error('preparation_candidate_commercial_relationship_invalid')
  }
}

function validOfferOutput(output: ProviderOffer['offerOutputs'][number]): boolean {
  if (output.field.trim().length === 0) return false
  if (output.valueType === 'integer' || output.valueType === 'money_minor') return Number.isSafeInteger(output.value) && typeof output.value === 'number'
  if (output.valueType === 'boolean') return typeof output.value === 'boolean'
  if (output.valueType === 'url') {
    if (typeof output.value !== 'string') return false
    try { return new URL(output.value).protocol === 'https:' } catch { return false }
  }
  return output.valueType === 'string' && typeof output.value === 'string' && output.value.trim().length > 0
}
