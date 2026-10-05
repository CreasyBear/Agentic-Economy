import { z } from 'zod'
import type { CallFunding } from '@/modules/observability/public'
import type { ExactAmount } from '@/modules/money/public'

export const adminActivitySearchSchema = z.strictObject({
  range: z.enum(['today', 'last_7', 'last_30', 'last_90']).optional(),
  status: z.enum(['all', 'completed', 'pending', 'refused', 'reconciliation_required', 'refunded']).optional(),
  funding: z.enum(['all', 'customer', 'promotional', 'unclassified']).optional(),
  account: z.string().trim().min(1).max(200).optional(),
})
export type AdminActivitySearch = z.infer<typeof adminActivitySearchSchema>
export type AdminPurchaseRow = Readonly<{
  callRef: string
  accountRef: string
  accountName: string | null
  toolRef: string
  toolName: string | null
  providerRef: string | null
  environment: 'sandbox' | 'production'
  state: 'pending' | 'completed' | 'refused' | 'reconciliation_required' | 'cancelled'
  paymentState: string | null
  amount: ExactAmount | null
  funding: CallFunding
  createdAt: number
  updatedAt: number
  recovery: Readonly<{ disposition: string; nextAttemptAt: number; reason: string }> | null
  refusalCode: string | null
}>

const DAY_MS = 86_400_000
/** Closed Perth days match the metric cohort; today is an explicitly separate live view. */
export function adminActivityWindow(range: NonNullable<AdminActivitySearch['range']>, now: number) {
  const start = Math.floor((now + 8 * 3_600_000) / DAY_MS) * DAY_MS - 8 * 3_600_000
  const days = range === 'last_90' ? 90 : range === 'last_30' ? 30 : 7
  return range === 'today' ? { from: start, toExclusive: start + DAY_MS }
    : { from: start - days * DAY_MS, toExclusive: start }
}

export function adminActivityHref(search: AdminActivitySearch): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(search)) if (value !== undefined && value !== 'all') params.set(key, value)
  const query = params.toString()
  return `/admin/activity${query.length > 0 ? `?${query}` : ''}`
}
