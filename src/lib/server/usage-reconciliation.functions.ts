import { createServerFn } from '@tanstack/react-start'
import { reconciliationPeriodSchema, usageReconciliationSchema, type UsageReconciliation } from '@/modules/money/public'
import { callSourceAction, sourceAction } from './convex-source'

const readReconciliation = sourceAction<{ periodStartAt: number; periodEndAt: number }, UsageReconciliation>('moneyUsageReconciliation:readOwnerReconciliation')
export const readOwnerUsageReconciliationServer = createServerFn({ method: 'GET' })
  .validator(data => reconciliationPeriodSchema.parse(data))
  .handler(async ({ data }) => usageReconciliationSchema.parse(await callSourceAction(readReconciliation, data)))
