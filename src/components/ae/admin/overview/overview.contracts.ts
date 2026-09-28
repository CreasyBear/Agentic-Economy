import { ADMIN_ACCESS_REFUSED_COPY, type AdminException } from '@/lib/operator/admin-console/contracts'
import { getStatusPresentation } from '@/lib/ui/status-presentation'
import type { AdminRecentRef } from '../object-search/object-search.contracts'

export type AdminConfiguredState = 'configured' | 'not_configured' | 'unavailable'
export type AdminOverviewConfiguration = Readonly<{
  formance: AdminConfiguredState
  x402Custody: AdminConfiguredState
  clerkFva: 'present' | 'absent'
  convex: 'ok'
}>
export type AdminOverviewExceptionRow = Readonly<{
  id: string
  label: string
  href: string
  count: string
}>
export type AdminOverviewRecentRow = AdminRecentRef & Readonly<{ label: string; href: string }>
export type AdminOverviewHeadline = Readonly<{
  settledCallValue: string
  settledCalls: string
  successRate: string
  transactingWorkspaces: string
}>
export type AdminOverviewExceptionsState =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'refused' }>
  | Readonly<{ kind: 'ready'; rows: readonly AdminOverviewExceptionRow[]; unavailable: boolean }>
export type AdminOverviewMetricsState =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'refused' }>
  | Readonly<{ kind: 'empty' }>
  | Readonly<{ kind: 'ready'; headline: AdminOverviewHeadline }>

export type AdminOverviewDataState =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'refused' }>
  | Readonly<{
      kind: 'ready'
      configuration: AdminOverviewConfiguration
      recent: readonly AdminOverviewRecentRow[]
    }>

export type AdminOverviewPageProps = Readonly<{ formance: AdminConfiguredState }>

export const ADMIN_OVERVIEW_COPY = {
  title: 'Overview',
  description: 'Configuration truth, exceptions, and marketplace activity.',
  adminBreadcrumb: 'Admin',
  configurationTitle: 'Configuration',
  configurationDescription: 'Live service presence for this deployment.',
  formance: 'Formance',
  x402Custody: 'x402 custody',
  clerkFva: 'Clerk MFA claim',
  convex: 'Convex',
  configured: 'Configured',
  notConfigured: 'Not configured',
  unavailable: getStatusPresentation('unavailable').label,
  metricsUnavailable: 'Metrics unavailable. Open Metrics to try again.',
  noCompletedMetrics: 'A complete 7-day snapshot is not available. Daily records remain in Metrics.',
  present: 'Present',
  absent: 'Absent',
  ok: 'OK',
  searchTitle: 'Exact-reference search',
  searchDescription: 'Find a Call, Quote, Tool version, Workspace, Agent, or Provider.',
  exceptionsTitle: 'Exception queues',
  exceptionsDescription: 'Observed cases by indexed source; open a queue to page through every case.',
  nothingNeedsAttention: 'Nothing needs attention.',
  exceptionsUnavailable: 'Some exception sources are unavailable.',
  viewAll: 'Open queues',
  metricsTitle: 'Last 7 days',
  settledCallValue: 'Settled Call value',
  settledCalls: 'Settled Calls',
  successRate: 'Success rate',
  transactingWorkspaces: 'Transacting Workspaces',
  notAvailable: 'Not available',
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
