import { getStatusPresentation } from '@/lib/ui/status-presentation'
import { isRecord } from '@/modules/common/is-record'
import type { CallResult } from '@/modules/capability-execution/call-contracts'
import { suggestNextAction, type SuggestedNextAction } from '@/modules/market/suggested-next-action'
import { exactAmountSchema, formatCurrencyAmount, formatDisplayAmount } from '@/modules/money/public'
import { paidLabel } from './tool-card-price'
import { CHAT_TOOL_TITLES, type ChatToolId } from './tool-ids'
import type { CallResultState, ToolCardProjection, ToolFact } from './tool-card'

export type CardChrome = Readonly<{
  toolId: ChatToolId
  title: string
}>

export const REFUSAL_SUMMARIES: Readonly<Record<string, string>> = {
  source_unavailable: 'Source unavailable',
  source_capacity_exceeded: 'Source capacity exceeded',
  setup_required: getStatusPresentation('setup_required').label,
  temporarily_unavailable: 'Temporarily unavailable',
  readiness_expired: 'Readiness expired',
  publisher_withdrew: 'Provider withdrew the Tool',
  under_review: 'Under review',
  updated_terms_require_review: 'Updated terms require review',
  not_supported_by_ae: 'Not supported',
  tool_not_found: 'Not found',
  tool_unavailable: getStatusPresentation('unavailable').label,
  mapping_unavailable: 'Mapping unavailable',
  mapping_incompatible: 'Mapping incompatible',
  mapping_cycle: 'Mapping cycle detected',
  operation_not_keyless: 'Requires credentials',
  operation_not_executable: 'Cannot run here',
  input_invalid: 'Input was refused',
  endpoint_invalid: 'Endpoint was refused',
  source_output_invalid: 'Source response was refused',
  result_too_large: 'Result was too large',
  tool_limit: 'Tool limit reached',
  execute_limit: 'Execution limit reached',
  turn_stopped: 'Turn stopped',
}

export const MAX_EXECUTE_OUTPUT_PREVIEW_CHARS = 8_000

export function fundingShortfall(value: unknown): { units: string; exponent: number } | undefined {
  if (!isRecord(value)) return undefined
  const principalAmount = exactAmountSchema.safeParse(value.principalAmount)
  return principalAmount.success && principalAmount.data.currency === 'AUD'
    ? { units: principalAmount.data.units, exponent: principalAmount.data.exponent }
    : undefined
}

const CHARGE_STATE_LABELS = {
  free_tier: 'Free tier',
  paid: 'Paid',
  insufficient_credit: 'Insufficient credit',
  outcome_unknown: 'Outcome unknown',
  refunded: 'Refunded',
} as const

export function callNextAction(
  state: Exclude<CallResultState, 'refused'>,
  callRef: string,
): SuggestedNextAction {
  return suggestNextAction({
    subject: 'call',
    state: state === 'completed'
      ? 'completed'
      : state === 'reconciliation_required'
        ? 'reconciliation_required'
        : 'pending',
    callRef,
  })
}

function outputPreview(value: CallResult & { kind: 'completed' }): Readonly<{
  text: string
  truncated: boolean
}> {
  const serialized = JSON.stringify(value.output, null, 2)
  const characters = Array.from(serialized)
  return {
    text: characters.slice(0, MAX_EXECUTE_OUTPUT_PREVIEW_CHARS).join(''),
    truncated: characters.length > MAX_EXECUTE_OUTPUT_PREVIEW_CHARS,
  }
}

function receiptFacts(result: Extract<CallResult, { receipt?: unknown }>): ToolFact[] {
  return result.receipt === undefined
    ? []
    : [{ label: 'Receipt', value: result.receipt.state.replaceAll('_', ' ') }]
}

export function projectCallResult(result: CallResult): ToolCardProjection {
  const toolRefs = result.toolRef === undefined ? [] : [result.toolRef]
  if (result.kind === 'completed') {
    const preview = outputPreview(result)
    const charge = result.receipt?.totalBuyerCharge
      ?? (result.usage.chargeState === 'paid' ? result.usage.amount : undefined)
    const paid = paidLabel(charge)
    const facts: ToolFact[] = [
      {
        label: 'Charge',
        value: `${formatDisplayAmount(result.usage.amount)} · ${CHARGE_STATE_LABELS[result.usage.chargeState]}`,
      },
      { label: 'Exact charge', value: formatCurrencyAmount(result.usage.amount) },
      ...(result.usage.durationMs === undefined
        ? []
        : [{ label: 'Duration', value: `${result.usage.durationMs} ms` }]),
      ...receiptFacts(result),
    ]
    return {
      ...chrome('tool.call'),
      kind: 'execute',
      state: result.kind,
      toolRefs,
      callRef: result.callRef,
      outputPreview: preview.text,
      ...(preview.truncated ? { outputTruncated: true } : {}),
      facts,
      ...(paid === undefined ? {} : { paid }),
      ...(result.receipt === undefined ? {} : { receiptRef: result.receipt.receiptRef }),
      evidenceHash: result.evidenceHash,
      summary: 'The Tool returned a result the calling agent can use now.',
      suggestedNextAction: callNextAction(result.kind, result.callRef),
    }
  }
  if (result.kind === 'pending') {
    return {
      ...chrome('tool.call'),
      kind: 'execute',
      state: result.kind,
      toolRefs,
      callRef: result.callRef,
      facts: [{ label: 'Check after', value: `${result.retryAfterMs} ms` }],
      summary: 'The call was accepted, but no terminal result is recorded yet.',
      suggestedNextAction: callNextAction(result.kind, result.callRef),
    }
  }
  if (result.kind === 'needs_authority') {
    const maximumSpend = result.authorityRequest.maximumSpend
    return {
      ...chrome('tool.call'),
      kind: 'execute',
      state: result.kind,
      toolRefs,
      callRef: result.callRef,
      facts: [
        { label: 'Consequence', value: result.authorityRequest.consequence.replaceAll('_', ' ') },
        ...(maximumSpend === undefined
          ? []
          : [{ label: 'Maximum spend', value: formatDisplayAmount(maximumSpend) }]),
      ],
      summary: 'The call is paused until the required authority is granted.',
      nextAction: 'Review the pending approval in the agent console.',
      suggestedNextAction: callNextAction(result.kind, result.callRef),
    }
  }
  if (result.kind === 'reconciliation_required') {
    return {
      ...chrome('tool.call'),
      kind: 'execute',
      state: result.kind,
      toolRefs,
      callRef: result.callRef,
      facts: [
        { label: 'Attempt', value: result.evidence.attemptRef },
        { label: 'Effect generation', value: String(result.evidence.effectGeneration) },
        ...receiptFacts(result),
      ],
      ...(result.receipt === undefined ? {} : { receiptRef: result.receipt.receiptRef }),
      summary: 'The external effect is uncertain. Do not retry this call until it is reconciled.',
      recoveryReason: 'outcome_unknown',
      suggestedNextAction: callNextAction(result.kind, result.callRef),
    }
  }
  return {
    ...chrome('tool.call'),
    kind: 'execute',
    state: result.kind,
    toolRefs,
    facts: receiptFacts(result),
    ...(result.receipt === undefined ? {} : { receiptRef: result.receipt.receiptRef }),
    summary: REFUSAL_SUMMARIES[result.code] ?? result.code.replaceAll('_', ' '),
    recoveryReason: result.code,
    ...(result.nextAction === undefined ? {} : { nextAction: result.nextAction }),
    retryable: result.retryable,
  }
}

export function chrome(toolId: ChatToolId): CardChrome {
  return { toolId, title: CHAT_TOOL_TITLES[toolId] }
}
