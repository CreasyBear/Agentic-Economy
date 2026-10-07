import { z } from 'zod'
import { registryNextActionSchema } from '@/modules/registry/tool-choice-contracts'
import { callNextSchema } from '@/modules/capability-execution/call-contracts'
import { planReferenceNextSchema } from '@/modules/capability-execution/plan/runtime.schemas'
import { createFundingHandoffResultSchema, fundingHandoffStatusResultSchema, fundingCreateNextSchema, fundingStatusNextSchema, fundingCreateReplayNextSchema } from '@/modules/money/funding-handoff.actions'
import { agentAccountFundingContinuationSchema } from '@/modules/agent-access/contract'
import { agentAccountBalanceResultSchema, AGENT_ACCOUNT_BALANCE_ACTION_ID } from '@/modules/agent-access/account.actions'
import { providerToolContinuationSchema } from '@/modules/capability-supply/provider-tool-status'
import { supplyStatusResultSchema, supplyOffboardingStatusResultSchema } from '@/modules/capability-supply/supply-actions'
import { procureExactNextSchema } from '@/modules/capability-execution/procure'
import { toolQuoteResultSchema } from '@/modules/capability-execution/quote'
import { callMachineResultSchema } from '@/modules/capability-execution/call-contracts'
import { callStatusResultSchema, projectCallRecoveryNext } from '@/modules/capability-execution/call-recovery.actions'
import { callRecoveryResultSchema } from '@/modules/capability-execution/call-recovery.actions'
import { planGetResultSchema, planRunResultSchema, projectPlanNext } from '@/modules/capability-execution/plan/runtime.schemas'
import { toolProcureResultSchema } from '@/modules/capability-execution/procure'
import { isRecord } from '@/modules/common/is-record'
import { journeyStatusNextSchema, journeyStatusReadNextSchema, projectProcureNext, validateJourneyNext, type JourneyNext } from './contract'

/** Owner contracts supply the primary operation. Opaque refs alone never imply pending work. */
export function projectMcpActionNext(actionId: string, result: unknown, origin: string): readonly JourneyNext[] {
  if (!isRecord(result)) return []
  if (actionId === 'tool.plan.get') {
    const plan = planGetResultSchema.safeParse(result)
    return plan.success ? projectPlanNext(plan.data) : []
  }
  if (actionId === 'tool.plan.run' || actionId === 'tool.plan.cancel') {
    const plan = planRunResultSchema.safeParse(result)
    return plan.success ? projectPlanNext(plan.data) : []
  }
  if (actionId === 'tool.quote') {
    const quote = toolQuoteResultSchema.safeParse(result)
    return quote.success && quote.data.continuation !== undefined
      ? validateJourneyNext([quote.data.continuation], { origin }) : []
  }
  if (actionId === 'tool.call') {
    const call = callMachineResultSchema.safeParse(result)
    return call.success && 'next' in call.data ? validateJourneyNext(call.data.next, { origin }) : []
  }
  if (actionId === 'call.status' || actionId === 'call.cancel' || actionId === 'call.reconcile') {
    const recovery = (actionId === 'call.status' ? callStatusResultSchema : callRecoveryResultSchema).safeParse(result)
    return recovery.success ? projectCallRecoveryNext(recovery.data) : []
  }
  if (actionId === 'tool.procure') {
    const procure = toolProcureResultSchema.safeParse(result)
    return procure.success ? projectProcureNext(procure.data) : []
  }
  if (actionId === AGENT_ACCOUNT_BALANCE_ACTION_ID) {
    const account = agentAccountBalanceResultSchema.safeParse(result)
    return account.success && account.data.kind === 'available' ? validateJourneyNext([account.data.funding.next], { origin }) : []
  }
  if (actionId === 'funding.handoff.create' || actionId === 'funding.handoff.status') {
    const funding = (actionId === 'funding.handoff.create' ? createFundingHandoffResultSchema : fundingHandoffStatusResultSchema).safeParse(result)
    return funding.success && 'next' in funding.data ? validateJourneyNext([funding.data.next], { origin }) : []
  }
  if (actionId === 'supply.status' || actionId === 'supply.offboarding.status') {
    const supply = (actionId === 'supply.status' ? supplyStatusResultSchema : supplyOffboardingStatusResultSchema).safeParse(result)
    return supply.success && supply.data.kind === 'available' && supply.data.status.continuation !== undefined ? validateJourneyNext([supply.data.status.continuation], { origin }) : []
  }
  return validateJourneyNext(result.next, { origin })
}

/** The MCP descriptor composes only the continuation owner this action can return. */
export function mcpActionNextSchema(actionId: string): z.ZodType<readonly JourneyNext[]> {
  let item: z.ZodType | undefined
  switch (actionId) {
    case 'registry.tools.search': item = registryNextActionSchema.options[1]; break
    case 'tool.quote': item = z.union([toolQuoteResultSchema.options[0].shape.continuation, toolQuoteResultSchema.options[1].shape.continuation.unwrap()]); break
    case 'tool.call':
    case 'call.status':
    case 'call.cancel':
    case 'call.reconcile': item = callNextSchema; break
    case 'tool.plan.get':
    case 'tool.plan.run':
    case 'tool.plan.cancel': item = z.union([planReferenceNextSchema, callNextSchema]); break
    case 'tool.procure': item = z.union([procureExactNextSchema, callNextSchema, journeyStatusReadNextSchema]); break
    case 'journey.status': item = journeyStatusNextSchema; break
    case AGENT_ACCOUNT_BALANCE_ACTION_ID: item = agentAccountFundingContinuationSchema.shape.next; break
    case 'funding.handoff.config':
    case 'funding.handoff.create':
    case 'funding.handoff.status': item = z.union([fundingStatusNextSchema, fundingCreateNextSchema, fundingCreateReplayNextSchema, agentAccountFundingContinuationSchema.shape.next]); break
    case 'supply.status':
    case 'supply.offboarding.status': item = providerToolContinuationSchema; break
    default: return z.array(z.never()).max(0)
  }
  return z.array(item).max(1) as z.ZodType<readonly JourneyNext[]>
}
