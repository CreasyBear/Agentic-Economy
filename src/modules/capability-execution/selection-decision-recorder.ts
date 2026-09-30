import {
  callPublicSourceMutation,
  createConvexServerFunctionAssertion,
  sourceMutation,
  type ConvexServerFunctionAssertion,
} from '@/lib/server/convex-source'

export type SelectionDecisionKind = 'procure' | 'registry_rerank' | 'directory_rerank'
export type SelectionDecisionRecord = Readonly<{
  kind: SelectionDecisionKind
  accountRef?: string
  correlationId: string
  offered: readonly { toolRef: string; rank: number; score: number }[]
  pickedToolRef: string | null
  tier: 'jev_system_one' | 'secondary_llm_adapter' | 'deterministic_rule_engine' | 'safe_refusal'
  modelConfidence: number | null
  fit: readonly { toolRef: string; noul: number | null; score: number | null }[]
  latencyMs: number
  costAud: number | null
}>

type SelectionDecisionMutationArgs = Readonly<{
  kind: SelectionDecisionKind
  accountRef?: string
  correlationId: string
  offered: readonly { toolRef: string; rank: number; score: number }[]
  pickedToolRef?: string
  tier: SelectionDecisionRecord['tier']
  modelConfidence?: number
  fit: readonly { toolRef: string; noul?: number; score?: number }[]
  latencyMs: number
  costAud?: number
  serviceAuth: ConvexServerFunctionAssertion
}>

const selectionDecisionMutation = sourceMutation<SelectionDecisionMutationArgs, null>(
  'capabilitySelectionDecisions:record',
)

// A failed record must never affect a buyer decision.
export async function recordSelectionDecision(record: SelectionDecisionRecord): Promise<void> {
  try {
    const command = { correlationId: record.correlationId, kind: record.kind }
    const serviceAuth = await createConvexServerFunctionAssertion({
      operation: 'capabilitySelectionDecisions.record',
      scope: 'market_selection:evidence',
      command,
    })
    await callPublicSourceMutation(selectionDecisionMutation, {
      kind: record.kind,
      ...(record.accountRef === undefined ? {} : { accountRef: record.accountRef }),
      correlationId: record.correlationId,
      offered: record.offered.map(({ toolRef, rank, score }) => ({ toolRef, rank, score })),
      ...(record.pickedToolRef === null ? {} : { pickedToolRef: record.pickedToolRef }),
      tier: record.tier,
      ...(record.modelConfidence === null ? {} : { modelConfidence: record.modelConfidence }),
      fit: record.fit.map(({ toolRef, noul, score }) => ({
        toolRef,
        ...(noul === null ? {} : { noul }),
        ...(score === null ? {} : { score }),
      })),
      latencyMs: record.latencyMs,
      ...(record.costAud === null ? {} : { costAud: record.costAud }),
      serviceAuth,
    })
  } catch {
    return
  }
}
