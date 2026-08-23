import type {
  OperationInvokeReceipt,
  OperationInvokeResult,
  OperationInvokeUsageSummary,
} from './operation-invoke-contracts'
import type { OperationInvokeStatusResult } from './operation-recovery-contracts'
import type { JsonValue } from '@/modules/capability-contract/public'

export type PublicInvocationStatusRead = OperationInvokeStatusResult | Readonly<{
  kind: 'source_unavailable'
  invocationRef: string
}>

export type InvocationReceiptStageId =
  | 'authorized'
  | 'reserved'
  | 'submitted'
  | 'settled'
  | 'validated'
  | 'complete'

export type InvocationReceiptStageState = 'complete' | 'current' | 'pending' | 'attention'

export type InvocationReceiptStageView = Readonly<{
  id: InvocationReceiptStageId
  label: string
  state: InvocationReceiptStageState
  detail: string
}>

export type InvocationIssueView = Readonly<{
  title: string
  whatHappened: string
  moneyMovement: string
  automaticNext: string
  userNext: string
  retainedReference: string
}>

export type InvocationReceiptView = Readonly<{
  version: 'ae.public-invocation-receipt:v1'
  invocationRef: string
  operationRef?: string
  previousInput?: Readonly<Record<string, JsonValue>>
  statusLabel: string
  statusDetail: string
  stages: readonly InvocationReceiptStageView[]
  usage?: OperationInvokeUsageSummary
  receipt?: OperationInvokeReceipt
  resultKind?: OperationInvokeResult['kind']
  evidenceHash?: string
  issue?: InvocationIssueView
  complete: boolean
}>

const stageLabels: Readonly<Record<InvocationReceiptStageId, string>> = {
  authorized: 'Authorized',
  reserved: 'Reserved',
  submitted: 'Submitted',
  settled: 'Settled',
  validated: 'Validated',
  complete: 'Complete',
}

export function projectInvocationReceipt(input: PublicInvocationStatusRead): InvocationReceiptView {
  if (input.kind === 'source_unavailable') {
    return {
      version: 'ae.public-invocation-receipt:v1',
      invocationRef: input.invocationRef,
      statusLabel: 'Receipt unavailable',
      statusDetail: 'The current owner-scoped invocation record could not be read.',
      stages: pendingStages('No stage is claimed while the receipt source is unavailable.'),
      issue: {
        title: 'The receipt could not be read',
        whatHappened: 'Agentic Economy could not read the current owner-scoped invocation record.',
        moneyMovement: 'No money movement can be determined from this unavailable record.',
        automaticNext: 'No automatic retry or replacement invocation has been started.',
        userNext: 'Reload this same receipt. Do not create a new invocation while the outcome is unknown.',
        retainedReference: input.invocationRef,
      },
      complete: false,
    }
  }

  if (input.kind === 'refused') {
    const receipt = input.receipt
    return {
      version: 'ae.public-invocation-receipt:v1',
      invocationRef: input.invocationRef,
      statusLabel: refusalLabel(input.code),
      statusDetail: 'The owner-scoped status read was refused; no current execution state is claimed.',
      stages: stagesFromReceipt(receipt, undefined, undefined, 'attention'),
      ...(receipt === undefined ? {} : { receipt }),
      issue: {
        title: 'The receipt request was refused',
        whatHappened: refusalExplanation(input.code),
        moneyMovement: moneyMovement(undefined, receipt),
        automaticNext: 'No automatic retry or replacement invocation has been started.',
        userNext: input.nextAction ?? (input.retryable ? 'Retry this same owner-scoped status read.' : 'Keep the reference and contact the owner or operator.'),
        retainedReference: input.invocationRef,
      },
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
    invocationRef: input.invocationRef,
    operationRef: input.operationRef,
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

function stagesFromFound(
  input: Extract<OperationInvokeStatusResult, { kind: 'found' }>,
  result: OperationInvokeResult | undefined,
  usage: OperationInvokeUsageSummary | undefined,
  receipt: OperationInvokeReceipt | undefined,
): readonly InvocationReceiptStageView[] {
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
    stage('authorized', authorized ? 'complete' : 'current', authorized ? 'Authority was recorded for this invocation.' : authorityPendingDetail(state)),
    stage('reserved', hasMoneyRecord ? 'complete' : authorized ? 'current' : 'pending', hasMoneyRecord ? reservationDetail(receipt) : 'No public reservation fact is recorded yet.'),
    stage('submitted', submitted ? 'complete' : state === 'in_progress' ? 'current' : 'pending', submitted ? 'A provider attempt is recorded.' : 'No provider attempt is recorded yet.'),
    stage('settled', settled ? 'complete' : attention && hasMoneyRecord ? 'attention' : 'pending', settlementDetail(usage, receipt)),
    stage('validated', attention ? 'attention' : 'pending', validationDetail(result)),
    stage('complete', attention ? 'attention' : 'pending', completionDetail(state, result)),
  ]
}

function stagesFromReceipt(
  receipt: OperationInvokeReceipt | undefined,
  usage: OperationInvokeUsageSummary | undefined,
  result: OperationInvokeResult | undefined,
  fallback: InvocationReceiptStageState,
): readonly InvocationReceiptStageView[] {
  if (receipt === undefined && usage === undefined && result === undefined) {
    return stageOrder().map((id) => stage(id, id === 'authorized' ? fallback : 'pending', 'No stage fact is available from this response.'))
  }
  return stageOrder().map((id) => stage(id, fallback, completedStageDetail(id, usage, receipt)))
}

function issueFromFound(
  input: Extract<OperationInvokeStatusResult, { kind: 'found' }>,
  result: OperationInvokeResult | undefined,
  usage: OperationInvokeUsageSummary | undefined,
  receipt: OperationInvokeReceipt | undefined,
): InvocationIssueView | undefined {
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
      ? 'Submit evidence for this same invocation before any retry.'
      : input.state === 'retryable'
        ? 'Refresh this receipt, then retry only if the current status permits it.'
        : 'Keep this receipt reference; start a new call only from the Operation page with fresh input and identity.'
  return {
    title: issueTitle(code),
    whatHappened: foundIssueExplanation(code),
    moneyMovement: moneyMovement(usage, receipt),
    automaticNext: input.state === 'retryable'
      ? 'The original invocation remains available for an explicit safe retry; no replacement call was created.'
      : 'No automatic retry or replacement invocation has been started.',
    userNext: next,
    retainedReference: input.invocationRef,
  }
}

function moneyMovement(usage: OperationInvokeUsageSummary | undefined, receipt: OperationInvokeReceipt | undefined): string {
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
  if (usage?.chargeState === 'free_tier') return 'The invocation is recorded as free tier; no paid amount was charged.'
  if (usage?.chargeState === 'insufficient_credit') return 'No settled charge is recorded; the invocation encountered insufficient credit.'
  return 'No money movement is recorded in the available receipt facts.'
}

function stage(id: InvocationReceiptStageId, state: InvocationReceiptStageState, detail: string): InvocationReceiptStageView {
  return { id, label: stageLabels[id], state, detail }
}

function stageOrder(): readonly InvocationReceiptStageId[] {
  return ['authorized', 'reserved', 'submitted', 'settled', 'validated', 'complete']
}

function pendingStages(detail: string): readonly InvocationReceiptStageView[] {
  return stageOrder().map((id) => stage(id, 'pending', detail))
}

function completedStageDetail(
  id: InvocationReceiptStageId,
  usage: OperationInvokeUsageSummary | undefined,
  receipt: OperationInvokeReceipt | undefined,
): string {
  if (id === 'authorized') return receipt === undefined ? 'Authority is recorded by the completed invocation.' : 'Buyer authorization is recorded in the receipt.'
  if (id === 'reserved') return reservationDetail(receipt)
  if (id === 'submitted') return 'The provider attempt was submitted.'
  if (id === 'settled') return settlementDetail(usage, receipt)
  if (id === 'validated') return 'The returned output passed the published result contract.'
  return 'A canonical completed result is recorded.'
}

function reservationDetail(receipt: OperationInvokeReceipt | undefined): string {
  return receipt === undefined
    ? 'The completed invocation does not expose a separate public reservation record.'
    : 'The receipt records the buyer authorization ceiling and quoted components.'
}

function settlementDetail(usage: OperationInvokeUsageSummary | undefined, receipt: OperationInvokeReceipt | undefined): string {
  if (receipt?.state === 'reconciliation_required' || usage?.chargeState === 'outcome_unknown') return 'Settlement remains uncertain and requires reconciliation.'
  if (receipt?.state === 'refunded' || usage?.chargeState === 'refunded') return 'The receipt records a refund or released authorization.'
  if (usage?.chargeState === 'free_tier') return 'The call completed on the free tier.'
  if (usage?.chargeState === 'paid' || receipt?.state === 'settled') return 'Settlement is recorded for this invocation.'
  return 'No public settlement fact is recorded yet.'
}

function validationDetail(result: OperationInvokeResult | undefined): string {
  if (result?.kind === 'refused' && result.code === 'provider_output_invalid') return 'The provider response did not pass the published output contract.'
  if (result?.kind === 'reconciliation_required') return 'Validation cannot complete until the external outcome is reconciled.'
  return 'No canonical validated result is recorded yet.'
}

function completionDetail(state: string, result: OperationInvokeResult | undefined): string {
  if (state === 'cancelled') return 'This invocation was cancelled.'
  if (state === 'invalidated') return 'This invocation is no longer valid.'
  if (result?.kind === 'refused') return 'The invocation ended without a completed result.'
  return 'Completion has not been recorded yet.'
}

function authorityPendingDetail(state: string): string {
  return state === 'awaiting_authority' ? 'Owner approval is still required.' : 'The request is still gathering the information required for authorization.'
}

function foundStatusLabel(state: string, result: OperationInvokeResult | undefined): string {
  if (result?.kind === 'completed') return 'Complete'
  const labels: Readonly<Record<string, string>> = {
    gathering_information: 'Preparing request',
    awaiting_authority: 'Waiting for approval',
    authorized: 'Authorized',
    leased: 'Preparing provider call',
    in_progress: 'Provider call in progress',
    retryable: 'Safe retry available',
    reconciliation_required: 'Reconciliation required',
    terminal: 'Invocation finished',
    cancelled: 'Cancelled',
    invalidated: 'No longer valid',
  }
  return labels[state] ?? 'Invocation update'
}

function foundStatusDetail(state: string, result: OperationInvokeResult | undefined): string {
  if (result?.kind === 'completed') return 'The output, usage, evidence, and any payment receipt below belong to this exact invocation.'
  if (result?.kind === 'pending') return 'The call was accepted and has not produced a canonical result yet.'
  if (result?.kind === 'needs_authority') return 'The call cannot proceed until the owner approves the requested authority.'
  if (state === 'reconciliation_required') return 'The external outcome may have started and must be reconciled before retrying.'
  if (state === 'retryable') return 'The same invocation can be retried only through the supported recovery action.'
  return `The recorded invocation state is ${humanize(state)}.`
}

function refusalLabel(code: string): string {
  if (code === 'invocation_not_found') return 'Receipt not found'
  if (code === 'environment_mismatch') return 'Wrong environment'
  if (code.startsWith('grant_')) return 'Access changed'
  return 'Receipt read refused'
}

function refusalExplanation(code: string): string {
  if (code === 'invocation_not_found') return 'No owner-visible invocation was found for this reference, or the current viewer is not its owner.'
  if (code === 'environment_mismatch') return 'The caller credential belongs to a different runtime environment from this invocation.'
  if (code === 'grant_revoked') return 'The access grant used for this invocation has been revoked.'
  if (code === 'grant_expired') return 'The access grant used for this invocation has expired.'
  if (code === 'grant_generation_stale') return 'The access grant changed after this invocation was created.'
  if (code === 'invocation_runtime_unavailable') return 'The invocation runtime could not answer the status read.'
  return `The receipt read was refused with ${humanize(code)}.`
}

function issueTitle(code: string): string {
  if (code === 'reconciliation_required') return 'The external outcome needs reconciliation'
  if (code === 'retryable') return 'The invocation can be retried safely'
  if (code === 'cancelled') return 'The invocation was cancelled'
  if (code === 'invalidated') return 'The invocation is no longer valid'
  if (code === 'provider_output_invalid') return 'The provider output was invalid'
  if (code === 'terminal') return 'The invocation ended without a completed result'
  return 'The invocation did not complete'
}

function foundIssueExplanation(code: string): string {
  if (code === 'reconciliation_required') return 'The provider boundary may have been crossed, but the final external outcome is not conclusive.'
  if (code === 'retryable') return 'The recorded attempt did not complete and the same invocation is eligible for an explicit safe retry.'
  if (code === 'cancelled') return 'Cancellation was recorded before a completed result.'
  if (code === 'invalidated') return 'The invocation can no longer continue under its recorded authority or generation.'
  if (code === 'provider_output_invalid') return 'The provider returned data that did not satisfy the Operation output contract.'
  if (code === 'terminal') return 'The invocation reached a terminal state, but no canonical completed result is recorded.'
  return `The invocation ended with ${humanize(code)} and no completed result is claimed.`
}

function humanize(value: string): string {
  return value.replaceAll('_', ' ')
}
