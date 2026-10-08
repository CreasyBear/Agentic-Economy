import { createServerFn } from '@tanstack/react-start'
import { reconciliationPeriodSchema, usageReconciliationSchema, type UsageReconciliation } from '@/modules/money/public'
import { callSourceAction, sourceAction, type ConvexSourceTransport } from './convex-source'

const readReconciliation = sourceAction<{ periodStartAt: number; periodEndAt: number }, UsageReconciliation>('moneyUsageReconciliation:readOwnerReconciliation')
export async function readOwnerUsageReconciliationThroughSource(input: { periodStartAt: number; periodEndAt: number }, transport?: ConvexSourceTransport) {
  const data = reconciliationPeriodSchema.parse(input)
  return usageReconciliationSchema.parse(await (transport === undefined
    ? callSourceAction(readReconciliation, data) : transport.action(readReconciliation, data)))
}
export const readOwnerUsageReconciliationServer = createServerFn({ method: 'GET' })
  .validator(data => reconciliationPeriodSchema.parse(data))
  .handler(({ data }) => readOwnerUsageReconciliationThroughSource(data))
