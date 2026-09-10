import type {
  CallReceipt,
  CallResult,
  CallUsageSummary,
} from './call-contracts'
import type { CallStatusResult } from './call-recovery-contracts'
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
  complete: boolean
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
        whatHappened: 'Agentic Economy could not read the current owner-scoped Call record.',
        moneyMovement: 'No money movement can be determined from this unavailable record.',
        automaticNext: 'No automatic retry or replacement Call has been started.',
        userNext: 'Reload this same receipt. Do not create a new Call while the outcome is unknown.',
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
        automaticNext: 'No automatic retry or replacement Call has been started.',
        userNext: input.nextAction ?? (input.retryable ? 'Retry this same owner-scoped status read.' : 'Keep the reference and contact the owner or operator.'),
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
    complete: completed,
  }
}

/**
 * Derives the buyer-facing purchase status from existing Call facts. This is
 * presentation only; it does not add a purchase record or state machine.
 */
export function purchaseStatusLabel(input: Extract<CallStatusResult, { kind: 'found' }>): string {
  const receipt = input.receipt ?? (input.result !== undefined && 'receipt' in input.result ? input.result.receipt : undefined)
  const usage = input.usage ?? (input.result?.kind === 'completed' ? input.result.usage : undefined)
  if (input.state === 'reconciliation_required'
    || input.result?.kind === 'reconciliation_required'
    || usage?.chargeState === 'outcome_unknown'
    || receipt?.state === 'reconciliation_required') return 'Open — outcome uncertain'
  if (receipt?.state === 'refunded' || receipt?.refundState === 'released' || usage?.chargeState === 'refunded') {
    return 'Resolved — refunded'
  }
  if (input.result?.kind === 'completed') return 'Resolved — delivered'
  if (input.state === 'terminal' || input.state === 'cancelled' || input.state === 'invalidated' || input.result?.kind === 'refused') {
    return 'Resolved — failed'
  }
  return 'Open — pending'
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
      ? 'Submit evidence for this same Call before any retry.'
      : input.state === 'retryable'
        ? 'Refresh this receipt, then retry only if the current status permits it.'
        : 'Keep this receipt reference; start a new call only from the Tool page with fresh input and identity.'
  return {
    title: issueTitle(code),
    whatHappened: foundIssueExplanation(code),
    moneyMovement: moneyMovement(usage, receipt),
    automaticNext: input.state === 'retryable'
      ? 'The original Call remains available for an explicit safe retry; no replacement Call was created.'
      : 'No automatic retry or replacement Call has been started.',
    userNext: next,
    retainedReference: input.callRef,
  }
}

function moneyMovement(usage: CallUsageSummary | undefined, receipt: CallReceipt | undefined): string {
  if (receipt?.state === 'reconciliation_required' || usage?.chargeState === 'outcome_unknown') {
    return 'Money movement is not yet conclusive; reconciliation is required.'
  }
  if (receipt?.state === 'refunded' || usage?.chargeState === 'refunded') {
    return receipt?.refundState === 'released'
      ? 'The receipt records that the reserved authorization was released.'
      : 'A refund is recorded; consult the exact post-call money facts below.'
  }
  if (usage?.chargeState === 'paid' || receipt?.state === 'settled') {
    return 'Settlement is recorded; consult the exact post-call amount below.'
  }
  if (usage?.chargeState === 'free_tier') return 'The Call is recorded as free tier; no paid amount was charged.'
  if (usage?.chargeState === 'insufficient_credit') return 'No settled charge is recorded; the Call encountered insufficient credit.'
  return 'No money movement is recorded in the available receipt facts.'
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
  if (code === 'invocation_not_found') return 'No owner-visible Call was found for this reference, or the current viewer is not its owner.'
  if (code === 'environment_mismatch') return 'The caller credential belongs to a different runtime environment from this Call.'
  if (code === 'grant_revoked') return 'The access grant used for this Call has been revoked.'
  if (code === 'grant_expired') return 'The access grant used for this Call has expired.'
  if (code === 'grant_generation_stale') return 'The access grant changed after this Call was created.'
  if (code === 'invocation_runtime_unavailable') return 'The Call runtime could not answer the status read.'
  return `The receipt read was refused with ${humanize(code)}.`
}

function issueTitle(code: string): string {
  if (code === 'reconciliation_required') return 'The external outcome needs reconciliation'
  if (code === 'retryable') return 'The Call can be retried safely'
  if (code === 'cancelled') return 'The Call was cancelled'
  if (code === 'invalidated') return 'The Call is no longer valid'
  if (code === 'provider_output_invalid') return 'The provider output was invalid'
  if (code === 'terminal') return 'The Call ended without a completed result'
  return 'The Call did not complete'
}

function foundIssueExplanation(code: string): string {
  if (code === 'reconciliation_required') return 'The provider boundary may have been crossed, but the final external outcome is not conclusive.'
  if (code === 'retryable') return 'The recorded attempt did not complete and the same Call is eligible for an explicit safe retry.'
  if (code === 'cancelled') return 'Cancellation was recorded before a completed result.'
  if (code === 'invalidated') return 'The Call can no longer continue under its recorded authority or generation.'
  if (code === 'provider_output_invalid') return 'The provider returned data that did not satisfy the Tool output contract.'
  if (code === 'terminal') return 'The Call reached a terminal state, but no canonical completed result is recorded.'
  return `The Call ended with ${humanize(code)} and no completed result is claimed.`
}

function humanize(value: string): string {
  return value.replaceAll('_', ' ')
}
