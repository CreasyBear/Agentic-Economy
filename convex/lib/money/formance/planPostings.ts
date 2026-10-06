"use node"

import { v, type Infer } from 'convex/values'
import { planHoldBookingValue, promotionalCreditAllocationValue } from '@/modules/money/public'
import { financialEnvironmentValue, moneyResult } from './contracts'
import { configuredContext, readPlanHoldRemainder, releasePlanRemainder, reservePlanHold } from './gateway'

export const planHoldArgs = planHoldBookingValue.extend({ expectedEnvironment: financialEnvironmentValue })
export const planRemainderResult = v.union(
  v.object({ kind: v.literal('available'), holdBalanceUnits: v.string(), remainingCreditAllocation: v.optional(promotionalCreditAllocationValue) }),
  v.object({ kind: v.union(v.literal('unavailable'), v.literal('refused')), code: v.string() }),
)
export const planReleaseArgs = planHoldArgs.extend({
  holdBalanceUnits: v.string(), remainingCreditAllocation: v.optional(promotionalCreditAllocationValue),
  allNodeCallsFinanciallyConclusive: v.literal(true), terminalEvidenceDigest: v.string(),
})

export async function reservePlanHoldHandler(_ctx: unknown, { expectedEnvironment, ...booking }: Infer<typeof planHoldArgs>): Promise<Infer<typeof moneyResult>> {
  const configured = configuredContext(expectedEnvironment)
  if (configured.kind === 'setup_required') return { kind: 'refused', code: configured.code, retryable: false }
  const result = await reservePlanHold(configured.context, booking)
  return result.kind === 'completed' ? { ...result, transactionRefs: [...result.transactionRefs] } : result
}

export async function readPlanRemainderHandler(_ctx: unknown, { expectedEnvironment, ...booking }: Infer<typeof planHoldArgs>): Promise<Infer<typeof planRemainderResult>> {
  const configured = configuredContext(expectedEnvironment)
  if (configured.kind === 'setup_required') return { kind: 'refused', code: configured.code }
  const result = await readPlanHoldRemainder(configured.context, booking)
  if (result.kind !== 'available' || result.remainingCreditAllocation === undefined) return result
  return { ...result, remainingCreditAllocation: { ...result.remainingCreditAllocation, grants: [...result.remainingCreditAllocation.grants] } }
}

export async function releasePlanRemainderHandler(_ctx: unknown, { expectedEnvironment, ...booking }: Infer<typeof planReleaseArgs>): Promise<Infer<typeof moneyResult>> {
  const configured = configuredContext(expectedEnvironment)
  if (configured.kind === 'setup_required') return { kind: 'refused', code: configured.code, retryable: false }
  const result = await releasePlanRemainder(configured.context, booking)
  return result.kind === 'completed' ? { ...result, transactionRefs: [...result.transactionRefs] } : result
}
