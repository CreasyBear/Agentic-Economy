import { parseCallRef, parseQuoteRef } from '@/modules/capability-execution/call-contracts'
import { callStatusResultSchema } from '@/modules/capability-execution/call-recovery.actions'
import { toolProcureResultSchema } from '@/modules/capability-execution/procure'
import { isRecord } from '@/modules/common/is-record'
import { projectCallStatusNext, projectProcureNext, validateJourneyNext, type JourneyNext } from './contract'

/** Project only validated action facts; never turn provider prose into a continuation. */
export function projectMcpActionNext(actionId: string, result: unknown, origin: string): readonly JourneyNext[] {
  if (!isRecord(result)) return []
  const published = validateJourneyNext(result.next, { origin })
  if (published.length > 0) return published
  if (actionId === 'tool.procure') {
    const procure = toolProcureResultSchema.safeParse(result)
    return procure.success ? projectProcureNext(procure.data) : []
  }
  if (actionId === 'agentAccess.balance' && result.kind === 'available') {
    return [{ action: 'fund', args: {}, authority: 'agent_key' }]
  }
  if (actionId === 'call.status' && typeof result.callRef === 'string') {
    const call = parseCallRef(result.callRef)
    const recovery = callStatusResultSchema.safeParse(result)
    return call.kind === 'valid' && recovery.success ? projectCallStatusNext(call.ref, recovery.data) : []
  }
  if (typeof result.callRef === 'string') {
    const call = parseCallRef(result.callRef)
    if (call.kind === 'valid') return [{ action: 'status', args: { ref: { kind: 'call', ref: call.ref } }, authority: 'same_principal' }]
  }
  if (typeof result.quoteRef === 'string') {
    const quote = parseQuoteRef(result.quoteRef)
    if (quote.kind === 'valid') return [{ action: 'status', args: { ref: { kind: 'quote', ref: quote.ref } }, authority: 'same_principal' }]
  }
  return []
}
