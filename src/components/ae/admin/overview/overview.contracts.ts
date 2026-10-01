import { ADMIN_ACCESS_REFUSED_COPY, type AdminException } from '@/lib/operator/admin-console/contracts'
import type { AdminRecentRef } from '../object-search/object-search.contracts'
import type { PaymentReadinessView } from '@/modules/money/payment-readiness'
import type { AdminPurchaseRow } from '@/lib/operator/admin-console/activity'

export type AdminOverviewExceptionRow = Readonly<{
  id: string
  label: string
  href: string
  count: string
}>
export type AdminOverviewRecentRow = AdminRecentRef & Readonly<{ label: string; href: string }>
export type AdminOverviewExceptionsState =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'refused' }>
  | Readonly<{ kind: 'ready'; rows: readonly AdminOverviewExceptionRow[]; unavailable: boolean }>
export type AdminOverviewDataState =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'refused' }>
  | Readonly<{
      kind: 'ready'
      paymentReadiness: PaymentReadinessView | null
      attention?: Readonly<{ purchases: readonly AdminPurchaseRow[]; complete: boolean }>
      recent: readonly AdminOverviewRecentRow[]
    }>

export const ADMIN_OVERVIEW_COPY = {
  title: 'Founder console',
  description: 'Understand activity, investigate customer issues and keep money operations healthy.',
  adminBreadcrumb: 'Admin',
  configurationTitle: 'Payment readiness',
  configurationDescription: 'Current evidence for opening payments in this deployment.',
  metricsUnavailable: 'Metrics unavailable. Open Metrics to try again.',
  searchTitle: 'Exact-reference search',
  searchDescription: 'Find a Call, Quote, Tool version, Workspace, Agent, or Provider.',
  exceptionsTitle: 'Other reviews',
  exceptionsDescription: 'Supply and policy cases requiring an operator decision.',
  nothingNeedsAttention: 'No cases in the checked review queues.',
  exceptionsUnavailable: 'Some exception sources are unavailable.',
  viewAll: 'Open queues',
  metricsTitle: 'Last 7 days',
  recentlyViewedTitle: 'Recently viewed',
  recentlyViewedDescription: 'Exact references opened on this device.',
  noRecentlyViewed: 'No recently viewed references.',
  accessDeniedTitle: 'Admin access required',
  accessDeniedDescription: ADMIN_ACCESS_REFUSED_COPY,
} as const

const EXCEPTION_KIND_LABELS: Readonly<Record<AdminException['kind'], string>> = {
  uncertain_call: 'Uncertain Call',
  removal_dispute: 'Removal dispute',
  source_authority_review: 'Source authority review',
  admission_case: 'Admission case',
}


export function exceptionKindLabel(kind: AdminException['kind']): string {
  return EXCEPTION_KIND_LABELS[kind]
}
