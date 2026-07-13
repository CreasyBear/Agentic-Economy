import type { OrganicRouteDecision, RoutingSnapshot } from './routing-compiler'

export type Money = Readonly<{
  currency: string
  amountMinor: number
}>

export type KernelCaller = Readonly<{
  agentId: string
  principalId: string
}>

export type CapabilityBinding = Readonly<{
  bindingId: string
  nodeId: string
  networkId: string
  capabilityContractId: string
  operation: string
  admission: 'admitted' | 'not_admitted'
  conformance: 'conformant' | 'not_conformant'
  queryTerms: readonly string[]
  registrationHash?: string
  environment?: string
  adapterFeatures?: Readonly<{
    requestCancellation: 'supported' | 'unsupported'
    quotePreparation?: 'public_query' | 'structured_authorized'
  }>
  commercialRelationship?: Readonly<{
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
}>

export type BindingCancellationResult =
  | Readonly<{ kind: 'cancellation_accepted'; providerReference?: string }>
  | Readonly<{ kind: 'cancellation_rejected'; reason: string; providerReference?: string }>
  | Readonly<{ kind: 'cancellation_unknown'; providerReference?: string }>

export type BindingQuote = Readonly<{
  kind: 'quoted'
  expectedCost: Money
  maximumCost: Money
  expectedLatencyMs: number
  providerQuoteRef?: string
  providerQuoteExpiresAt?: number
  dataFields: readonly string[]
  disclosures: readonly string[]
}>

export type BindingQuoteRefusal = Readonly<{
  kind: 'refused'
  reason: string
}>

export type StructuredBindingQuoteInput = Readonly<{
  quoteAttemptId: string
  allocationId: string
  recipient: Readonly<{ bindingId: string; nodeId: string }>
  capabilityContractId: string
  capabilityContractVersion: string
  registrationHash: string
  environment: string
  data: Readonly<Record<string, string | number | boolean>>
}>

export type StructuredBindingQuoteReconcileInput = Readonly<Omit<StructuredBindingQuoteInput, 'data'>>

export type StructuredBindingQuote = Readonly<BindingQuote & {
  issuerBindingId: string
  issuerNodeId: string
  capabilityContractId: string
  capabilityContractVersion: string
  registrationHash: string
  environment: string
  offerOutputs: readonly Readonly<{ field: string; valueType: 'string' | 'integer' | 'boolean' | 'url' | 'money_minor'; value: string | number | boolean }>[]
  priceComponents: readonly Readonly<{ label: string; amountMinor: number }>[]
  materialTerms: readonly Readonly<{ key: string; label: string; value: string }>[]
  cancellation: Readonly<{ kind: 'supported' | 'conditional' | 'unsupported'; summary: string }>
}>

export type StructuredBindingQuoteUncertain = Readonly<{
  kind: 'uncertain'
  reason: 'provider_quote_timeout' | 'provider_quote_unknown'
}>

export type BindingExecution = Readonly<{
  kind: 'effect_committed'
  dataReleaseDisposition?: 'released'
  providerReference: string
  outcome: Readonly<Record<string, string>>
  reportedCost?: Money
}>

export type BindingExecutionUnknown = Readonly<{
  kind: 'outcome_unknown'
  dataReleaseDisposition?: 'released'
  providerReference?: string
}>

export type BindingExecutionFailed = Readonly<{
  kind: 'effect_not_committed'
  dataReleaseDisposition?: 'released'
  reason: string
  providerReference?: string
}>

export type BindingReconciliationPending = Readonly<{
  kind: 'reconciliation_pending'
}>

export type CapabilityBindingAdapter = Readonly<{
  binding: CapabilityBinding
  quote: (input: Readonly<{ query: string }>) => Promise<BindingQuote | BindingQuoteRefusal>
  quoteStructured?: (input: StructuredBindingQuoteInput) => Promise<StructuredBindingQuote | BindingQuoteRefusal | StructuredBindingQuoteUncertain>
  reconcileStructuredQuote?: (input: StructuredBindingQuoteReconcileInput) => Promise<StructuredBindingQuote | BindingQuoteRefusal | StructuredBindingQuoteUncertain>
  execute: (input: Readonly<{
    rootRunId: string
    leafRunId: string
    stepGrantId: string
    idempotencyKey: string
    providerQuoteRef?: string
    data: Readonly<Record<string, string>>
  }>) => Promise<BindingExecution | BindingExecutionUnknown | BindingExecutionFailed>
  reconcile: (input: Readonly<{
    rootRunId: string
    leafRunId: string
    stepGrantId: string
    idempotencyKey: string
    providerQuoteRef?: string
  }>) => Promise<BindingExecution | BindingExecutionUnknown | BindingExecutionFailed | BindingReconciliationPending>
  requestCancellation?: (input: Readonly<{
    rootRunId: string
    leafRunId: string
    stepGrantId: string
    idempotencyKey: string
  }>) => Promise<BindingCancellationResult>
}>

export type CandidateGraphQuote = Readonly<{
  bindingId: string
  nodeId: string
  capabilityContractId: string
  expectedCost: Money
  maximumCost: Money
  expectedLatencyMs: number
  dataFields: readonly string[]
  disclosures: readonly string[]
  steps: readonly CandidateGraphStepQuote[]
}>

export type CandidateGraphStepQuote = Readonly<{
  role: 'primary' | 'fallback'
  trigger?: 'on_effect_not_committed'
  bindingId: string
  nodeId: string
  capabilityContractId: string
  expectedCost: Money
  maximumCost: Money
  expectedLatencyMs: number
  providerQuoteRef?: string
  providerQuoteExpiresAt?: number
  incidentEpochDigest?: string
  dataFields: readonly string[]
  disclosures: readonly string[]
}>

export type RouteQuote = Readonly<{
  quoteId: string
  quoteDigest: string
  routingRequestId: string
  networkId: string
  executionMode: 'simulation' | 'live'
  caller: KernelCaller
  query: string
  routingSnapshot: RoutingSnapshot
  organicDecision: OrganicRouteDecision
  createdAt: number
  expiresAt: number
  selectedGraph: CandidateGraphQuote
  alternatives: readonly CandidateGraphQuote[]
  effects: readonly string[]
  disclosures: readonly string[]
  enforcement: 'required'
  incidentEpochDigest: string
}>

export type ProtocolRecord = Readonly<{
  recordId: string
  type:
    | 'root_run_admitted'
    | 'step_grant_consumed'
    | 'disclosure_grant_consumed'
    | 'provider_attempt_released'
    | 'provider_outcome_reported'
    | 'provider_outcome_unknown'
    | 'provider_effect_not_committed'
    | 'fallback_released'
    | 'fallback_release_refused'
    | 'root_run_completed'
    | 'root_run_outcome_unknown'
    | 'root_run_failed'
    | 'provider_reconciliation_observed'
    | 'root_run_reconciled'
    | 'cancellation_requested'
    | 'root_run_cancelled'
    | 'provider_cancellation_requested'
    | 'provider_cancellation_accepted'
    | 'provider_cancellation_rejected'
    | 'provider_cancellation_unknown'
    | 'incident_freeze_observed'
    | 'incident_epoch_stale_observed'
    | 'incident_canary_recovery_consumed'
  rootRunId: string
  leafRunId?: string
  bindingId?: string
  providerReference?: string
  evidenceSource?: string
  disclosedDataFields?: readonly string[]
  reportedCost?: Money
  financialObservation?: 'provider_reported'
  budgetAuthorityRef?: string
  budgetMaximumGrossMinor?: number
  spendReservationMinor?: number
  budgetCurrency?: string
  dataAuthorizationBudgetRef?: string
  disclosureGrantId?: string
  disclosureGrantDigest?: string
  disclosureRecipientBindingId?: string
  disclosurePurpose?: string
  disclosureDisposition?: 'indeterminate'
  cancellationRequestId?: string
  cancellationDisposition?: 'accepted' | 'rejected' | 'indeterminate'
  cancellationReason?: string
  incidentId?: string
  freezeOrderId?: string
  recoveryGrantId?: string
  incidentEpochDigest: string
  stepGrantDigest?: string
  maximumCost?: Money
  attempt?: number
  expiresAt?: number
  enforcementPoint?: 'provider_release' | 'data_release'
  occurredAt: number
}>

export type StepGrant = Readonly<{
  stepGrantId: string
  rootRunId: string
  leafRunId: string
  quoteId: string
  quoteDigest: string
  requestDigest: string
  bindingId: string
  nodeId: string
  capabilityContractId: string
  maximumCost: Money
  disclosedDataFields: readonly string[]
  attempt: number
  issuedAt: number
  expiresAt: number
  enforcementPoint: 'provider_release'
  incidentEpochDigest: string
  grantDigest: string
}>

export type DisclosureGrant = Readonly<{
  disclosureGrantId: string
  disclosureGrantDigest: string
  dataAuthorizationBudgetRef: string
  rootRunId: string
  leafRunId: string
  stepGrantId: string
  quoteId: string
  quoteDigest: string
  requestDigest: string
  recipientBindingId: string
  purpose: string
  fields: readonly string[]
  projectionDigest: string
  attempt: number
  issuedAt: number
  expiresAt: number
  enforcementPoint: 'data_release'
  incidentEpochDigest: string
}>

export type LeafRunSnapshot = Readonly<{
  leafRunId: string
  stepGrantId: string
  bindingId: string
  nodeId: string
  capabilityContractId: string
  state: 'pending' | 'released' | 'completed' | 'outcome_unknown' | 'failed' | 'cancelled' | 'incident_frozen'
  attemptDisposition: 'not_released' | 'released' | 'dispatched' | 'indeterminate'
  effectState: 'not_started' | 'released' | 'committed' | 'unknown' | 'not_committed'
  enforcement: 'enforced'
  providerReference?: string
  outcome?: Readonly<Record<string, string>>
  failureReason?: string
}>

export type RootRunSnapshot = Readonly<{
  rootRunId: string
  quoteId: string
  quoteDigest: string
  incidentEpochDigest: string
  networkId: string
  executionMode: 'simulation' | 'live'
  caller: KernelCaller
  state: 'running' | 'completed' | 'outcome_unknown' | 'failed' | 'cancelled' | 'incident_frozen'
  enforcement: 'enforced'
  effectState: 'not_started' | 'released' | 'committed' | 'unknown' | 'not_committed'
  cost: Readonly<{
    authorized: Money
    quotedMaximum: Money
    reserved: Money | null
    providerReported: Money | null
    settled: Money | null
  }>
  leaves: readonly LeafRunSnapshot[]
  records: readonly ProtocolRecord[]
}>

export type RouteAuthorization = Readonly<{
  authorizationRef: string
  budgetAuthorityRef: string
  budgetMaximumGrossMinor: number
  dataAuthorizationBudgetRef: string
  protectedFieldSetId: string
  dataBudgetMaximumAttempts: number
  dataBudgetMaximumExposures: number
  allowedRecipientBindingIds: readonly string[]
  allowedDisclosurePurposes: readonly string[]
  maximumDisclosureAttempts: number
  maximumDisclosureExposures: number
  quoteId: string
  quoteDigest: string
  principalId: string
  agentId: string
  maximumSpendMinor: number
  currency: string
  expiresAt: number
  consumedAt?: number
  allowedDataFields: readonly string[]
  incidentEpochDigest: string
}>

export type KernelIdFactory = Readonly<{
  next: (prefix: string) => string
}>
