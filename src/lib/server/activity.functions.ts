import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getRequest } from '@tanstack/react-start/server'
import { SOURCE_READ_TIMEOUT_MS, awaitBoundedRead } from '@/lib/bounded-read'
import { createAuthenticatedSourceTransport } from './convex-source'
import { readOwnerCallsThroughSource, readOwnerUsageThroughSource, readOwnerSpendThroughSource } from './call-history.functions'
import { readOwnerUsageReconciliationThroughSource } from './usage-reconciliation.functions'
import { listOwnerPlansWithTransport } from '@/modules/capability-execution/plan/owner.functions'
import { captureRouteException } from '@/lib/observability/capture-route-exception'

const activityReadInput = z.strictObject({
  periodStartAt: z.number().int().nonnegative().safe(),
  periodEndAt: z.number().int().positive().safe(),
  principalRef: z.string().min(1).max(200).optional(),
}).refine(data => data.periodEndAt > data.periodStartAt, { message: 'usage_period_invalid' })

function captureRejected(results: readonly PromiseSettledResult<unknown>[]) {
  for (const result of results) {
    if (result.status === 'rejected') captureRouteException(result.reason, { 'ae.surface': 'operator_activity_loader' })
  }
}

/** One credentialed transport per invocation, never shared across requests or Accounts. */
export const readOwnerActivityPrimaryServer = createServerFn({ method: 'GET' })
  .validator(data => activityReadInput.parse(data))
  .handler(async ({ data }) => {
    const signal = AbortSignal.any([getRequest().signal, AbortSignal.timeout(SOURCE_READ_TIMEOUT_MS)])
    // Clerk token acquisition is not cancellable; stop waiting and prevent later reads after abort.
    const transport = await awaitBoundedRead(signal => createAuthenticatedSourceTransport({ signal }), signal)
    const [calls, plans] = await Promise.allSettled([
      awaitBoundedRead(() => readOwnerCallsThroughSource(data, transport), signal),
      data.principalRef === undefined ? awaitBoundedRead(() => listOwnerPlansWithTransport(transport), signal) : Promise.resolve([]),
    ])
    captureRejected([calls, plans])
    if (calls.status === 'rejected') return { kind: 'unavailable' as const }
    return { kind: 'available' as const, calls: calls.value,
      ...(plans.status === 'fulfilled' ? { plans: plans.value } : {}) }
  })

/** Financial actions retain their existing backend authorization and post-external checks. */
export const readOwnerActivityReportsServer = createServerFn({ method: 'GET' })
  .validator(data => activityReadInput.parse(data))
  .handler(async ({ data }) => {
    const signal = AbortSignal.any([getRequest().signal, AbortSignal.timeout(SOURCE_READ_TIMEOUT_MS)])
    const { periodStartAt, periodEndAt, principalRef } = data
    const range = { periodStartAt, periodEndAt }
    const tooLarge = periodEndAt - periodStartAt > 366 * 24 * 60 * 60 * 1_000
    const period = principalRef === undefined
      ? { dimensionKind: 'account' as const, ...range }
      : { dimensionKind: 'agent' as const, dimensionRef: principalRef, ...range }
    // Oversized ranges have no source reads, so they need no additional authority setup.
    const transport = tooLarge ? undefined
      : await awaitBoundedRead(signal => createAuthenticatedSourceTransport({ signal }), signal)
    const [usage, spend, reconciliation] = await Promise.allSettled([
      tooLarge ? Promise.resolve({ kind: 'unavailable' as const, code: 'usage_window_too_large' as const })
        : awaitBoundedRead(() => readOwnerUsageThroughSource(period, transport), signal),
      principalRef !== undefined ? Promise.resolve({ kind: 'not_requested' as const })
        : tooLarge ? Promise.resolve({ kind: 'unavailable' as const, code: 'formance_spend_window_too_large' })
          : awaitBoundedRead(() => readOwnerSpendThroughSource(period, transport), signal),
      principalRef !== undefined ? Promise.resolve(undefined)
        : tooLarge ? Promise.resolve({ kind: 'unavailable' as const, code: 'reconciliation_window_too_large' })
          : awaitBoundedRead(() => readOwnerUsageReconciliationThroughSource(range, transport), signal),
    ])
    captureRejected([usage, spend, reconciliation])
    return {
      usage: usage.status === 'fulfilled' ? usage.value : { kind: 'unavailable' as const, code: 'source_unavailable' as const },
      spend: spend.status === 'fulfilled' ? spend.value : { kind: 'unavailable' as const, code: 'source_unavailable' as const },
      ...(reconciliation.status === 'fulfilled' && reconciliation.value !== undefined ? { reconciliation: reconciliation.value }
        : principalRef === undefined ? { reconciliation: { kind: 'unavailable' as const, code: 'source_unavailable' } } : {}),
    }
  })
