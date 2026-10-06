import { planDraftResultSchema } from '@/modules/capability-execution/plan/draft.schemas'
import { planQuoteResultSchema } from '@/modules/capability-execution/plan/parse'
import { planGetResultSchema, planRunResultSchema, planReferenceInputSchema } from '@/modules/capability-execution/plan/runtime.schemas'
import { formatCurrencyAmount } from '@/modules/money/public'

export function storedPlanReference(toolId: string, planRef: unknown): string | undefined {
  if (!toolId.startsWith('tool.plan.')) return undefined
  const result = planReferenceInputSchema.safeParse({ planRef })
  return result.success ? result.data.planRef : undefined
}

export function projectChatPlan(toolId: 'tool.plan.suggest' | 'tool.plan.import' | 'tool.plan.quote' | 'tool.plan.run' | 'tool.plan.get', output: unknown) {
  const invalid = { kind: 'status' as const, state: 'error' as const, summary: 'Plan status unavailable.' }
  if (toolId === 'tool.plan.suggest' || toolId === 'tool.plan.import') {
    const result = planDraftResultSchema.safeParse(output)
    return !result.success ? invalid : { kind: 'status' as const, state: 'attention' as const,
      summary: result.data.kind === 'refused' ? result.data.code.replaceAll('_', ' ')
        : `${result.data.plans.length} editable Plan draft(s). Inputs and data flow still need review; no Quote, Hold or Call was created.` }
  }
  if (toolId === 'tool.plan.quote') {
    const parsed = planQuoteResultSchema.safeParse(output)
    if (!parsed.success) return invalid
    const result = parsed.data
    if (result.kind === 'refused') return { kind: 'status' as const, state: 'refused' as const, summary: result.code.replaceAll('_', ' ') }
    const maximum = formatCurrencyAmount({ currency: 'AUD', exponent: 6, units: result.approvedTotalAudUnits })
    return { kind: 'status' as const, state: 'attention' as const, planRef: result.planRef,
      summary: `${result.nodes.length} Tool nodes · maximum ${maximum}. No credit held. Review the Plan’s inputs and data destinations before approval.` }
  }
  const parsed = toolId === 'tool.plan.run' ? planRunResultSchema.safeParse(output) : planGetResultSchema.safeParse(output)
  if (!parsed.success) return invalid
  const result = parsed.data
  if (result.kind === 'refused') return { kind: 'status' as const, state: 'refused' as const, summary: result.code.replaceAll('_', ' ') }
  return { kind: 'status' as const, state: 'attention' as const, planRef: result.planRef,
    summary: result.state === 'awaiting_approval' ? 'Owner approval required. No credit is held until you approve this Plan.'
      : result.state === 'reconciliation_required' ? 'Plan payment or delivery is uncertain. Review the recorded status before retrying.'
        : `Plan ${result.state.replaceAll('_', ' ')}. Open the Plan for individual Call results and receipts.` }
}
