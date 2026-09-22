import type { AdminException, AdminExceptionFeed } from '@/lib/operator/admin-console/contracts'
import type { AdminRecentRef } from '../object-search/object-search.contracts'

export type AdminConfiguredState = 'configured' | 'not_configured'
export type AdminOverviewConfiguration = Readonly<{
  formance: AdminConfiguredState
  x402Custody: AdminConfiguredState
  clerkFva: 'present' | 'absent'
  convex: 'ok'
}>
export type AdminOverviewExceptionRow = Readonly<{
  id: string
  label: string
  ref: string
  href: string
  since: string
}>
export type AdminOverviewRecentRow = AdminRecentRef & Readonly<{ label: string; href: string }>
export type AdminOverviewHeadline = Readonly<{
  settledCallValue: string
  settledCalls: string
  successRate: string
  transactingWorkspaces: string
}>
export type AdminOverviewDataState =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'refused' }>
  | Readonly<{
      kind: 'ready'
      configuration: AdminOverviewConfiguration
      exceptions: readonly AdminOverviewExceptionRow[]
      exceptionsUnavailable: boolean
      headline: AdminOverviewHeadline
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
  present: 'Present',
  absent: 'Absent',
  ok: 'OK',
  searchTitle: 'Exact-reference search',
  searchDescription: 'Find a Call, Quote, Tool version, Workspace, Agent, or Provider.',
  exceptionsTitle: 'Oldest exceptions',
  exceptionsDescription: 'The oldest unresolved items across every exception queue.',
  nothingNeedsAttention: 'Nothing needs attention.',
  exceptionsUnavailable: 'Some exception sources are unavailable.',
  viewAll: 'View all',
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
  accessDeniedDescription: 'Your account does not have the Admin role for this action.',
} as const

const EXCEPTION_KIND_LABELS: Readonly<Record<AdminException['kind'], string>> = {
  uncertain_call: 'Uncertain Call',
  removal_dispute: 'Removal dispute',
  source_authority_review: 'Source authority review',
  admission_case: 'Admission case',
}

export function isAdminExceptionFeed(value: unknown): value is AdminExceptionFeed {
  return typeof value === 'object' && value !== null && 'items' in value && 'unavailable' in value
}

export function exceptionKindLabel(kind: AdminException['kind']): string {
  return EXCEPTION_KIND_LABELS[kind]
}
