import { z } from 'zod'

import type { AdminProposableAction } from '@/lib/operator/admin-console/contracts'
import type { AdminAuditFilter, AdminAuditRow } from '@/lib/operator/admin-console/audit.contracts'
import { AuditEventTypeValues } from '@/modules/observability/public'
import { getStatusPresentation } from '@/lib/ui/status-presentation'

const optionalSearchText = z.string().trim().min(1).max(300).optional()

export const adminAuditSearchSchema = z.object({
  eventType: optionalSearchText,
  actorRef: optionalSearchText,
  targetType: optionalSearchText,
  targetRef: optionalSearchText,
  correlationId: optionalSearchText,
  from: z.coerce.number().finite().optional(),
  to: z.coerce.number().finite().optional(),
})

export type AdminAuditSearch = z.infer<typeof adminAuditSearchSchema>

export type AdminAuditFilterDraft = Readonly<{
  eventType: string
  actorRef: string
  targetType: string
  targetRef: string
  correlationId: string
  from: string
  to: string
}>

export type AdminAuditFilterKey = keyof AdminAuditSearch

export type AdminAuditFilterChip = Readonly<{
  key: AdminAuditFilterKey
  label: string
  value: string
}>

export type AdminApprovalProposal = Readonly<{
  proposalRef: string
  action: AdminProposableAction
  proposerRef: string
  createdAt: number
  expiresAt: number
}>

export type AdminApprovalRowModel = Readonly<{
  proposalRef: string
  actionLabel: string
  proposerRef: string
  createdAtLabel: string
  createdAtIso: string
  expiresAtLabel: string
  expiresAtIso: string
}>

export type AdminAuditRowModel = Readonly<{
  id: string
  createdAtLabel: string
  createdAtIso: string
  eventType: string
  actorRef: string
  targetLabel: string
  targetType: string | null
  targetRef: string | null
  targetHref: string | null
  outcomeRaw: string | null
  correlationId: string
  admin: AdminAuditRow['admin']
}>

export type AdminAuditReadyState = Readonly<{
  kind: 'ready'
  events: readonly AdminAuditRowModel[]
  proposals: readonly AdminApprovalRowModel[]
  paginationStatus: 'CanLoadMore' | 'LoadingMore' | 'Exhausted'
  loadMore: () => void
}>

export type AdminAuditDataState =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'refused' }>
  | AdminAuditReadyState

export type AdminAuditPageProps = Readonly<{
  search: AdminAuditSearch
  onSearchChange: (search: AdminAuditSearch) => void
}>

export type AuditFilterChipsProps = Readonly<{
  chips: readonly AdminAuditFilterChip[]
  draft: AdminAuditFilterDraft
  onDraftChange: (field: keyof AdminAuditFilterDraft, value: string) => void
  onApply: () => void
  onRemove: (key: AdminAuditFilterKey) => void
  onClear: () => void
}>

export type AuditEventsTableProps = Readonly<{
  rows: readonly AdminAuditRowModel[]
  filtered: boolean
  paginationStatus: AdminAuditReadyState['paginationStatus']
  onLoadMore: () => void
}>

export type PendingApprovalsPanelProps = Readonly<{
  rows: readonly AdminApprovalRowModel[]
}>

export const AUDIT_EVENT_TYPES = AuditEventTypeValues

export const ADMIN_APPROVAL_ACTION_LABELS = {
  set_business_suppression: 'Set Business suppression',
  change_commercial_policy: 'Change commercial policy',
  grant_admin_membership: 'Grant Admin membership',
  revoke_admin_membership: 'Revoke Admin membership',
} satisfies Record<AdminProposableAction, string>

export const AUDIT_COPY = {
  title: 'Audit',
  description: 'Review Admin activity, approvals, and redacted evidence.',
  breadcrumbs: {
    admin: 'Admin',
    audit: 'Audit',
  },
  accessDeniedTitle: 'Admin access required',
  accessDeniedDescription: 'Your account does not have the Admin role for this action.',
  filtersTitle: 'Filters',
  filtersDescription: 'Combine indexed filters to narrow the activity timeline.',
  addFilter: 'Add filter',
  noEventTypes: 'No event types found.',
  applyFilters: 'Apply filters',
  clearAll: 'Clear all',
  removeFilter: 'Remove filter',
  fieldLabels: {
    eventType: 'Event type',
    actorRef: 'Actor',
    targetType: 'Target type',
    targetRef: 'Target reference',
    correlationId: 'Correlation',
    from: 'From',
    to: 'To',
  },
  filterLabels: {
    eventType: 'Event type',
    actorRef: 'Actor',
    targetType: 'Target',
    targetRef: 'Target',
    correlationId: 'Correlation',
    from: 'From',
    to: 'To',
  },
  anyEventType: 'Any event type',
  pendingApprovalsTitle: 'Pending approvals',
  pendingApprovalsDescription: 'Admin actions awaiting a second approval.',
  noPendingApprovals: 'No proposals awaiting approval.',
  eventsTitle: 'Activity',
  eventsDescription: 'Newest activity appears first. Times use Australia/Perth.',
  nothingNeedsAttention: 'Nothing needs attention.',
  noFilterMatches: 'No matches for these filters.',
  loadMore: 'Load more',
  columnLabels: {
    proposal: 'Proposal',
    action: 'Action',
    proposer: 'Proposer',
    created: 'Created',
    expires: 'Expires',
    time: 'Time',
    event: 'Event type',
    actor: 'Actor',
    target: 'Target',
    outcome: 'Outcome',
    correlation: 'Correlation',
    permission: 'Permission',
    reason: 'Reason code',
    evidence: 'Evidence',
  },
  unavailable: getStatusPresentation('unavailable').label,
}

export function auditSearchToFilter(search: AdminAuditSearch): AdminAuditFilter {
  return {
    ...(search.eventType === undefined ? {} : { eventType: search.eventType }),
    ...(search.actorRef === undefined ? {} : { actorRef: search.actorRef }),
    ...(search.targetType === undefined || search.targetRef === undefined
      ? {}
      : { target: { type: search.targetType, ref: search.targetRef } }),
    ...(search.correlationId === undefined ? {} : { correlationId: search.correlationId }),
    ...(search.from === undefined ? {} : { from: search.from }),
    ...(search.to === undefined ? {} : { to: search.to }),
  }
}
