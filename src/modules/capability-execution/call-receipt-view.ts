import type {
  CallReceipt,
  CallResult,
  CallUsageSummary,
} from './call-contracts'
import type { CallStatusResult } from './call-recovery-contracts'
import type { PurchaseResolutionRecord } from './purchase-resolution'
import type { JsonValue } from '@/modules/capability-contract/public'

export type PublicCallStatusRead = CallStatusResult | Readonly<{
  kind: 'source_unavailable'
  callRef: string
}>

export type CallReceiptStageId =
  | 'authorized'
  | 'reserved'
  | 'submitted'
  | 'settled'
  | 'validated'
  | 'complete'

export type CallReceiptStageState = 'complete' | 'current' | 'pending' | 'attention'

export type CallReceiptStageView = Readonly<{
  id: CallReceiptStageId
  label: string
  state: CallReceiptStageState
  detail: string
}>

export type CallIssueView = Readonly<{
  title: string
  whatHappened: string
  moneyMovement: string
  automaticNext: string
  userNext: string
  retainedReference: string
}>

export type CallReceiptView = Readonly<{
  version: 'ae.public-invocation-receipt:v1'
  callRef: string
  toolRef?: string
  previousInput?: Readonly<Record<string, JsonValue>>
  statusLabel: string
  statusDetail: string
  stages: readonly CallReceiptStageView[]
  usage?: CallUsageSummary
  receipt?: CallReceipt
  resultKind?: CallResult['kind']
  evidenceHash?: string
  issue?: CallIssueView
  purchaseResolution?: PurchaseResolutionRecord
  complete: boolean
}>

export type BuyerCallPurchaseStatus = Readonly<{
  kind: 'pending' | 'uncertain' | 'delivered' | 'refunded' | 'failed'
  label: 'Open — pending' | 'Open — outcome uncertain' | 'Resolved — delivered' | 'Resolved — refunded' | 'Resolved — failed'
  attention: boolean
}>

export type BuyerCallSummaryFacts = Readonly<{
  state: 'completed' | 'refused' | 'outcome_unknown'
  deliveryState: 'delivered' | 'not_delivered' | 'unknown'
  paymentState: 'settled' | 'released' | 'unknown' | 'not_applicable'
}>

const stageLabels: Readonly<Record<CallReceiptStageId, string>> = {
  authorized: 'Authorized',
  reserved: 'Reserved',
  submitted: 'Submitted',
  settled: 'Settled',
  validated: 'Validated',
  complete: 'Complete',
}

export function projectCallReceipt(input: PublicCallStatusRead): CallReceiptView {
  if (input.kind === 'source_unavailable') {
    return {
      version: 'ae.public-invocation-receipt:v1',
      callRef: input.callRef,
      statusLabel: 'Receipt unavailable',
      statusDetail: 'The current owner-scoped Call record could not be read.',
      stages: pendingStages('No stage is claimed while the receipt source is unavailable.'),
      issue: {
        title: 'The receipt could not be read',
        whatHappened: 'Agentic Economy could not read the current owner-scoped Call record for this reference.',
        moneyMovement: 'Money movement cannot be confirmed while this receipt is unavailable. Do not assume A$0.00 or a charge.',
        automaticNext: 'No duplicate charge and no automatic retry.',
        userNext: 'Wait, then Try again on this same receipt. Do not start a new Call while the outcome is unknown.',
        retainedReference: input.callRef,
      },
      complete: false,
    }
  }

  if (input.kind === 'refused') {
    const receipt = input.receipt
    return {
      version: 'ae.public-invocation-receipt:v1',
      callRef: input.callRef,
      statusLabel: refusalLabel(input.code),
      statusDetail: 'The owner-scoped status read was refused; no current execution state is claimed.',
      stages: stagesFromReceipt(receipt, undefined, undefined, 'attention'),
      ...(receipt === undefined ? {} : { receipt }),
      issue: {
        title: 'The receipt request was refused',
        whatHappened: refusalExplanation(input.code),
        moneyMovement: moneyMovement(undefined, receipt),
        automaticNext: 'No duplicate charge and no automatic retry.',
        userNext: input.nextAction ?? (input.retryable ? 'Wait, then Try again on this same receipt.' : 'Keep this reference and contact the owner or operator.'),
        retainedReference: input.callRef,
      },
      complete: false,
    }
  }

  if (input.kind === 'unchanged') {
    return {
      version: 'ae.public-invocation-receipt:v1',
      callRef: input.callRef,
      statusLabel: 'No status change',
      statusDetail: 'The authoritative Call record has not changed since the supplied version.',
      stages: pendingStages('No new stage is claimed by this unchanged response.'),
      complete: false,
    }
  }

  const result = input.result
  const resultReceipt = result !== undefined && 'receipt' in result ? result.receipt : undefined
  const receipt = input.receipt ?? resultReceipt
  const usage = input.usage ?? (result?.kind === 'completed' ? result.usage : undefined)
  const completed = result?.kind === 'completed'
  const issue = issueFromFound(input, result, usage, receipt)
  const purchaseResolution = input.purchaseResolution
  return {
    version: 'ae.public-invocation-receipt:v1',
    callRef: input.callRef,
    toolRef: input.toolRef,
    ...(input.previousInput === undefined ? {} : { previousInput: input.previousInput }),
    statusLabel: foundStatusLabel(input.state, result),
    statusDetail: foundStatusDetail(input.state, result),
    stages: stagesFromFound(input, result, usage, receipt),
    ...(usage === undefined ? {} : { usage }),
    ...(receipt === undefined ? {} : { receipt }),
    ...(result === undefined ? {} : { resultKind: result.kind }),
    ...(input.evidenceHash === undefined ? {} : { evidenceHash: input.evidenceHash }),
    ...(issue === undefined ? {} : { issue }),
    ...(purchaseResolution === undefined ? {} : { purchaseResolution }),
    complete: completed,
  }
}

/**
 * Derives the buyer-facing purchase status from existing Call facts. This is
 * presentation only; it does not add a purchase record or state machine.
 */
export function purchaseStatusLabel(input: Extract<CallStatusResult, { kind: 'found' }>): string {
  return projectFoundCallPurchaseStatus(input).label
}

export function projectFoundCallPurchaseStatus(
  input: Extract<CallStatusResult, { kind: 'found' }>,
): BuyerCallPurchaseStatus {
  const receipt = input.receipt ?? (input.result !== undefined && 'receipt' in input.result ? input.result.receipt : undefined)
  const usage = input.usage ?? (input.result?.kind === 'completed' ? input.result.usage : undefined)
  if (input.state === 'reconciliation_required'
    || input.result?.kind === 'reconciliation_required'
    || usage?.chargeState === 'outcome_unknown'
    || receipt?.state === 'reconciliation_required') return buyerPurchaseStatus('uncertain')
  if (receipt?.state === 'refunded' || receipt?.refundState === 'released' || usage?.chargeState === 'refunded') {
    return buyerPurchaseStatus('refunded')
  }
  if (input.result?.kind === 'completed') return buyerPurchaseStatus('delivered')
  if (input.state === 'terminal' || input.state === 'cancelled' || input.state === 'invalidated' || input.result?.kind === 'refused') {
    return buyerPurchaseStatus('failed')
  }
  return buyerPurchaseStatus('pending')
}

/**
 * Uses only the coarser Account Calls projection. Contradictory or unknown
 * delivery/payment facts stay open instead of being smoothed into resolution.
 */
export function projectCallSummaryPurchaseStatus(input: BuyerCallSummaryFacts): BuyerCallPurchaseStatus {
  if (input.state === 'outcome_unknown'
    || input.deliveryState === 'unknown'
    || input.paymentState === 'unknown') return buyerPurchaseStatus('uncertain')
  if (input.paymentState === 'released') return buyerPurchaseStatus('refunded')
  if (input.state === 'completed'
    && input.deliveryState === 'delivered'
    && (input.paymentState === 'settled' || input.paymentState === 'not_applicable')) {
    return buyerPurchaseStatus('delivered')
  }
  if (input.state === 'refused'
    && input.deliveryState === 'not_delivered'
    && input.paymentState === 'not_applicable') return buyerPurchaseStatus('failed')
  return buyerPurchaseStatus('uncertain')
}

function buyerPurchaseStatus(kind: BuyerCallPurchaseStatus['kind']): BuyerCallPurchaseStatus {
  if (kind === 'pending') return { kind, label: 'Open — pending', attention: false }
  if (kind === 'uncertain') return { kind, label: 'Open — outcome uncertain', attention: true }
  if (kind === 'delivered') return { kind, label: 'Resolved — delivered', attention: false }
  if (kind === 'refunded') return { kind, label: 'Resolved — refunded', attention: false }
  return { kind, label: 'Resolved — failed', attention: false }
}

/** Derives the existing outcome evidence posture without reclassifying money or delivery facts. */
export function outcomeRecordLabel(input: Extract<CallStatusResult, { kind: 'found' }>): string {
  if (input.result?.kind === 'completed') return 'Provider output and Call evidence are recorded.'
  if (input.state === 'reconciliation_required' || input.result?.kind === 'reconciliation_required') {
    return 'The external outcome remains uncertain; the existing Call evidence is open for reconciliation.'
  }
  if (input.result?.kind === 'refused' || input.state === 'terminal' || input.state === 'cancelled' || input.state === 'invalidated') {
    return 'The Call ended without a completed outcome record.'
  }
  return 'No completed outcome record is available yet.'
}

function stagesFromFound(
  input: Extract<CallStatusResult, { kind: 'found' }>,
  result: CallResult | undefined,
  usage: CallUsageSummary | undefined,
  receipt: CallReceipt | undefined,
): readonly CallReceiptStageView[] {
  if (result?.kind === 'completed') {
    return stageOrder().map((id) => stage(id, 'complete', completedStageDetail(id, usage, receipt)))
  }

  const state = input.state
  const authorized = !['gathering_information', 'awaiting_authority'].includes(state)
  const submitted = input.attemptRef !== undefined || ['in_progress', 'retryable', 'reconciliation_required', 'terminal'].includes(state)
  const hasMoneyRecord = usage !== undefined || receipt !== undefined
  const settled = receipt?.state === 'settled' || receipt?.state === 'refunded'
    || usage?.chargeState === 'paid' || usage?.chargeState === 'free_tier' || usage?.chargeState === 'refunded'
  const attention = state === 'retryable' || state === 'reconciliation_required' || state === 'terminal' || state === 'cancelled' || state === 'invalidated'
    || result?.kind === 'refused' || result?.kind === 'reconciliation_required'

  return [
    stage('authorized', authorized ? 'complete' : 'current', authorized ? 'Authority was recorded for this Call.' : authorityPendingDetail(state)),
    stage('reserved', hasMoneyRecord ? 'complete' : authorized ? 'current' : 'pending', hasMoneyRecord ? reservationDetail(receipt) : 'No public reservation fact is recorded yet.'),
    stage('submitted', submitted ? 'complete' : state === 'in_progress' ? 'current' : 'pending', submitted ? 'A provider attempt is recorded.' : 'No provider attempt is recorded yet.'),
    stage('settled', settled ? 'complete' : attention && hasMoneyRecord ? 'attention' : 'pending', settlementDetail(usage, receipt)),
    stage('validated', attention ? 'attention' : 'pending', validationDetail(result)),
    stage('complete', attention ? 'attention' : 'pending', completionDetail(state, result)),
  ]
}

function stagesFromReceipt(
  receipt: CallReceipt | undefined,
  usage: CallUsageSummary | undefined,
  result: CallResult | undefined,
  fallback: CallReceiptStageState,
): readonly CallReceiptStageView[] {
  if (receipt === undefined && usage === undefined && result === undefined) {
    return stageOrder().map((id) => stage(id, id === 'authorized' ? fallback : 'pending', 'No stage fact is available from this response.'))
  }
  return stageOrder().map((id) => stage(id, fallback, completedStageDetail(id, usage, receipt)))
}

function issueFromFound(
  input: Extract<CallStatusResult, { kind: 'found' }>,
  result: CallResult | undefined,
  usage: CallUsageSummary | undefined,
  receipt: CallReceipt | undefined,
): CallIssueView | undefined {
  if (result?.kind === 'completed') return undefined
  const problematic = input.state === 'retryable'
    || input.state === 'reconciliation_required'
    || input.state === 'terminal'
    || input.state === 'cancelled'
    || input.state === 'invalidated'
    || result?.kind === 'refused'
    || result?.kind === 'reconciliation_required'
  if (!problematic) return undefined

  const code = result?.kind === 'refused' ? result.code : input.state
  const next = result?.kind === 'refused' && result.nextAction !== undefined
    ? result.nextAction
    : input.state === 'reconciliation_required' || result?.kind === 'reconciliation_required'
      ? 'Submit reconciliation evidence for this Call before any retry.'
      : input.state === 'retryable'
        ? 'Wait, then Try again on this same receipt.'
        : 'Keep this receipt reference; start a new Call only from the Tool page with fresh input and identity.'

  return {
    title: issueTitle(normalizeDiagnosticCode(code)),
    whatHappened: foundIssueExplanation(code),
    moneyMovement: moneyMovement(usage, receipt),
    automaticNext: input.state === 'retryable'
      ? 'The original Call remains available for an explicit safe retry; no replacement Call was created.'
      : 'No duplicate charge and no automatic retry.',
    userNext: next,
    retainedReference: input.callRef,
  }
}

function moneyMovement(usage: CallUsageSummary | undefined, receipt: CallReceipt | undefined): string {
  if (receipt?.state === 'reconciliation_required' || usage?.chargeState === 'outcome_unknown') {
    return 'Money movement is not yet conclusive — do not assume a charge or refund.'
  }
  if (receipt?.state === 'refunded' || usage?.chargeState === 'refunded') {
    return receipt?.refundState === 'released'
      ? 'Reserved credit was released back to your balance.'
      : 'A refund is recorded — reserved credit was returned to your prepaid balance.'
  }
  if (usage?.chargeState === 'paid' || receipt?.state === 'settled') {
    return 'Settlement is recorded; consult the exact post-call amount below.'
  }
  if (usage?.chargeState === 'free_tier') {
    return 'A$0.00 charged — this Call used the free tier. Your prepaid balance is unaffected.'
  }
  if (usage?.chargeState === 'insufficient_credit') {
    return 'A$0.00 charged — your prepaid balance is unaffected.'
  }
  return 'A$0.00 charged — your prepaid balance is unaffected.'
}

function normalizeDiagnosticCode(code: string): string {
  if (code === 'insufficient_funds' || code === 'insufficient_credit') return 'insufficient_balance'
  if (code === 'rate_limit_exceeded') return 'rate_limited'
  if (code === 'operation_not_found') return 'tool_not_found'
  if (code === 'parameter_invalid') return 'input_invalid'
  return code
}

function stage(id: CallReceiptStageId, state: CallReceiptStageState, detail: string): CallReceiptStageView {
  return { id, label: stageLabels[id], state, detail }
}

function stageOrder(): readonly CallReceiptStageId[] {
  return ['authorized', 'reserved', 'submitted', 'settled', 'validated', 'complete']
}

function pendingStages(detail: string): readonly CallReceiptStageView[] {
  return stageOrder().map((id) => stage(id, 'pending', detail))
}

function completedStageDetail(
  id: CallReceiptStageId,
  usage: CallUsageSummary | undefined,
  receipt: CallReceipt | undefined,
): string {
  if (id === 'authorized') return receipt === undefined ? 'Authority is recorded by the completed Call.' : 'Buyer authorization is recorded in the receipt.'
  if (id === 'reserved') return reservationDetail(receipt)
  if (id === 'submitted') return 'The provider attempt was submitted.'
  if (id === 'settled') return settlementDetail(usage, receipt)
  if (id === 'validated') return 'The returned output passed the published result contract.'
  return 'A canonical completed result is recorded.'
}

function reservationDetail(receipt: CallReceipt | undefined): string {
  return receipt === undefined
    ? 'The completed Call does not expose a separate public reservation record.'
    : 'The receipt records the buyer authorization ceiling and quoted components.'
}

function settlementDetail(usage: CallUsageSummary | undefined, receipt: CallReceipt | undefined): string {
  if (receipt?.state === 'reconciliation_required' || usage?.chargeState === 'outcome_unknown') return 'Settlement remains uncertain and requires reconciliation.'
  if (receipt?.state === 'refunded' || usage?.chargeState === 'refunded') return 'The receipt records a refund or released authorization.'
  if (usage?.chargeState === 'free_tier') return 'The call completed on the free tier.'
  if (usage?.chargeState === 'paid' || receipt?.state === 'settled') return 'Settlement is recorded for this Call.'
  return 'No public settlement fact is recorded yet.'
}

function validationDetail(result: CallResult | undefined): string {
  if (result?.kind === 'refused' && result.code === 'provider_output_invalid') return 'The provider response did not pass the published output contract.'
  if (result?.kind === 'reconciliation_required') return 'Validation cannot complete until the external outcome is reconciled.'
  return 'No canonical validated result is recorded yet.'
}

function completionDetail(state: string, result: CallResult | undefined): string {
  if (state === 'cancelled') return 'This Call was cancelled.'
  if (state === 'invalidated') return 'This Call is no longer valid.'
  if (result?.kind === 'refused') return 'The Call ended without a completed result.'
  return 'Completion has not been recorded yet.'
}

function authorityPendingDetail(state: string): string {
  return state === 'awaiting_authority' ? 'Owner approval is still required.' : 'The request is still gathering the information required for authorization.'
}

function foundStatusLabel(state: string, result: CallResult | undefined): string {
  if (result?.kind === 'completed') return 'Complete'
  const labels: Readonly<Record<string, string>> = {
    gathering_information: 'Preparing request',
    awaiting_authority: 'Waiting for approval',
    authorized: 'Authorized',
    leased: 'Preparing provider call',
    in_progress: 'Provider call in progress',
    retryable: 'Safe retry available',
    reconciliation_required: 'Reconciliation required',
    terminal: 'Call finished',
    cancelled: 'Cancelled',
    invalidated: 'No longer valid',
  }
  return labels[state] ?? 'Call update'
}

function foundStatusDetail(state: string, result: CallResult | undefined): string {
  if (result?.kind === 'completed') return 'The output, usage, evidence, and any payment receipt below belong to this exact Call.'
  if (result?.kind === 'pending') return 'The call was accepted and has not produced a canonical result yet.'
  if (result?.kind === 'needs_authority') return 'The call cannot proceed until the owner approves the requested authority.'
  if (state === 'reconciliation_required') return 'The external outcome may have started and must be reconciled before retrying.'
  if (state === 'retryable') return 'The same Call can be retried only through the supported recovery action.'
  return `The recorded Call state is ${humanize(state)}.`
}

function refusalLabel(code: string): string {
  if (code === 'invocation_not_found') return 'Receipt not found'
  if (code === 'environment_mismatch') return 'Wrong environment'
  if (code.startsWith('grant_')) return 'Access changed'
  return 'Receipt read refused'
}

function refusalExplanation(code: string): string {
  const normalized = normalizeDiagnosticCode(code)
  if (normalized === 'invocation_not_found') {
    return 'No owner-visible Call was found for this reference, or the current viewer is not its owner.'
  }
  if (normalized === 'environment_mismatch') {
    return 'The caller credential belongs to a different runtime environment from this Call.'
  }
  if (normalized === 'grant_revoked') return 'The access grant used for this Call has been revoked.'
  if (normalized === 'grant_expired') return 'The access grant used for this Call has expired.'
  if (normalized === 'grant_generation_stale') return 'The access grant changed after this Call was created.'
  if (normalized === 'invocation_runtime_unavailable') return 'The Call runtime could not answer the status read.'
  if (normalized === 'insufficient_balance') {
    return 'This Call could not proceed because prepaid credit was insufficient for the quoted amount.'
  }
  if (normalized === 'tool_not_found') return 'The Tool referenced by this Call is not available to the current owner.'
  if (normalized === 'rate_limited') {
    return 'The provider endpoint rejected this request because call volume or concurrency limits were exceeded.'
  }
  if (normalized === 'input_invalid') {
    return 'The arguments sent to the Tool did not match the published input schema.'
  }
  if (normalized === 'provider_timeout' || normalized === 'upstream_timeout' || normalized === 'gateway_timeout') {
    return 'The provider endpoint did not respond within the maximum execution window.'
  }
  return 'The receipt read was refused before any execution state could be claimed.'
}

function issueTitle(code: string): string {
  const normalized = normalizeDiagnosticCode(code)
  if (normalized === 'reconciliation_required') return 'The external outcome needs reconciliation'
  if (normalized === 'retryable') return 'The Call can be retried safely'
  if (normalized === 'cancelled') return 'The Call was cancelled'
  if (normalized === 'invalidated') return 'The Call is no longer valid'
  if (normalized === 'provider_output_invalid') return 'The provider output was invalid'
  if (normalized === 'provider_timeout' || normalized === 'upstream_timeout' || normalized === 'gateway_timeout') {
    return 'Provider timed out'
  }
  if (normalized === 'rate_limited' || normalized === 'provider_rate_limited') return 'Provider rate limit exceeded'
  if (normalized === 'input_invalid' || normalized === 'schema_mismatch' || normalized === 'input_schema_invalid') {
    return 'Tool argument schema mismatch'
  }
  if (normalized === 'insufficient_balance') return 'Insufficient prepaid credit'
  if (normalized === 'tool_not_found') return 'Tool not found'
  if (normalized === 'terminal') return 'The Call ended without a completed result'
  return 'The Call did not complete'
}

function foundIssueExplanation(code: string): string {
  const normalized = normalizeDiagnosticCode(code)
  if (normalized === 'reconciliation_required') {
    return 'The provider boundary may have been crossed, but the final external outcome is not conclusive.'
  }
  if (normalized === 'retryable') {
    return 'The recorded attempt did not complete and the same Call is eligible for an explicit safe retry.'
  }
  if (normalized === 'cancelled') return 'Cancellation was recorded before a completed result.'
  if (normalized === 'invalidated') return 'The Call can no longer continue under its recorded authority or generation.'
  if (normalized === 'provider_output_invalid') {
    return 'The provider returned data that did not satisfy the Tool output contract.'
  }
  if (normalized === 'provider_timeout' || normalized === 'upstream_timeout' || normalized === 'gateway_timeout') {
    return 'The provider endpoint did not respond within the maximum execution window. Check endpoint availability, then retry with backoff.'
  }
  if (normalized === 'rate_limited' || normalized === 'provider_rate_limited') {
    return 'The provider endpoint rejected this request because call volume or concurrency limits were exceeded. Reduce call frequency, then retry.'
  }
  if (normalized === 'input_invalid' || normalized === 'schema_mismatch' || normalized === 'input_schema_invalid') {
    return 'The arguments sent to the Tool did not match the published input schema. Check the Tool documentation and update the payload.'
  }
  if (normalized === 'insufficient_balance') {
    return 'This Call stopped because prepaid credit was insufficient for the quoted amount. Add credit before retrying.'
  }
  if (normalized === 'tool_not_found') {
    return 'The Tool referenced by this Call is not available to the current owner.'
  }
  if (normalized === 'terminal') return 'The Call reached a terminal state, but no canonical completed result is recorded.'
  return 'The Call ended before a completed result was recorded.'
}

function humanize(value: string): string {
  return value.replaceAll('_', ' ')
}
