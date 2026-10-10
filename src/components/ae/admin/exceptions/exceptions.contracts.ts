import { z } from 'zod'

import {
  ADMIN_ACCESS_REFUSED_COPY,
  type AdminExceptionKind,
  type AdminExceptionPartition,
} from '@/lib/operator/admin-console/contracts'
import { getStatusPresentation } from '@/lib/ui/status-presentation'
import { ADMIN_LIST_WINDOW, ADMIN_LIST_WINDOW_MAX } from '../admin-list-window'

export const adminExceptionsSearchSchema = z.object({
  kind: z.enum([
    'uncertain_call',
    'removal_dispute',
    'source_authority_review',
    'admission_case',
  ]).optional(),
  partition: z.enum([
    'reconciliation_required', 'opened', 'updated', 'contested',
    'review_required', 'unset', 'submitted', 'under_review',
  ]).optional(),
  ref: z.string().trim().min(1).max(300).optional(),
  focus: z.string().min(1).max(350).optional(),
  loaded: z.coerce.number().int().min(ADMIN_LIST_WINDOW).max(ADMIN_LIST_WINDOW_MAX).optional(),
})

export type AdminExceptionsSearch = z.infer<typeof adminExceptionsSearchSchema> & {
  rejected?: string
}


export type AdminExceptionRecord =
  | { kind: 'uncertain_call'; callRef: string; since: number }
  | { kind: 'removal_dispute'; disputeRef: string; businessSlug: string; since: number; state: 'opened' | 'updated' | 'contested' | 'closed' }
  | { kind: 'source_authority_review'; publicationRef: string; businessSlug: string; since: number }
  | { kind: 'admission_case'; caseRef: string; businessSlug: string; since: number; state: 'submitted' | 'under_review' | 'completed' }

export type AdminExceptionRowModel = Readonly<{
  id: string
  kind: AdminExceptionKind
  kindLabel: string
  ref: string
  href: string
  businessSlug: string | null
  businessHref: string | null
  state: string | null
  sinceLabel: string
  sinceRelativeLabel: string
  sinceIso: string
}>

export type AdminResolutionRowModel = Readonly<{
  callRef: string
  href: string
  terminalStateLabel: string
  terminalStateTone: 'success' | 'warning' | 'neutral'
  resolvedAtIso: string
}>

export type AdminExceptionsReadyState = Readonly<{
  kind: 'ready'
  selectedKind: AdminExceptionKind
  selectedPartition: AdminExceptionPartition
  observed: number
  scanRequests: number
  complete: boolean
  overview: readonly Readonly<{
    kind: AdminExceptionKind
    partition: AdminExceptionPartition
    observed: number
    complete: boolean
    unavailable: boolean
  }>[]
  rows: readonly AdminExceptionRowModel[]
  resolutions: readonly AdminResolutionRowModel[]
  selectedSourceUnavailable: boolean
  paginationStatus: 'CanLoadMore' | 'LoadingMore' | 'Exhausted'
  loadMore: () => void
}>

export type AdminExceptionsDataState =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'refused' }>
  | AdminExceptionsReadyState

export type AdminExceptionsPageProps = Readonly<{
  search: AdminExceptionsSearch
  onSearchChange: (search: AdminExceptionsSearch) => void
}>

export type ExceptionFilterChipsProps = Readonly<{
  selected: AdminExceptionKind
  selectedPartition: AdminExceptionPartition
  onSelect: (kind: AdminExceptionKind) => void
  overview: AdminExceptionsReadyState['overview']
}>

export type ExceptionFeedTableProps = Readonly<{
  rows: readonly AdminExceptionRowModel[]
  scanRequests: number
  observed: number
  complete: boolean
  unavailable: boolean
  orderLabel: string
  onLoadMore: () => void
  paginationStatus: AdminExceptionsReadyState['paginationStatus']
  onOpen: (row: AdminExceptionRowModel) => void
  focusId?: string
  restoreFocus?: boolean
}>

export type ExceptionEvidenceSheetProps = Readonly<{
  row: AdminExceptionRowModel | null
  onOpenChange: (open: boolean) => void
}>

export type PurchaseResolutionTableProps = Readonly<{
  rows: readonly AdminResolutionRowModel[]
}>

export const ADMIN_EXCEPTION_KIND_LABELS = {
  uncertain_call: 'Uncertain Calls',
  removal_dispute: 'Removal disputes',
  source_authority_review: 'Source authority reviews',
  admission_case: 'Admission cases',
} satisfies Record<AdminExceptionKind, string>

export const ADMIN_EXCEPTION_FILTERS: readonly Readonly<{
  kind: AdminExceptionKind
  label: string
}>[] = [
  { kind: 'uncertain_call', label: ADMIN_EXCEPTION_KIND_LABELS.uncertain_call },
  { kind: 'removal_dispute', label: ADMIN_EXCEPTION_KIND_LABELS.removal_dispute },
  { kind: 'source_authority_review', label: ADMIN_EXCEPTION_KIND_LABELS.source_authority_review },
  { kind: 'admission_case', label: ADMIN_EXCEPTION_KIND_LABELS.admission_case },
]

export const ADMIN_EXCEPTION_PARTITIONS: Record<AdminExceptionKind, readonly [AdminExceptionPartition, ...AdminExceptionPartition[]]> = {
  uncertain_call: ['reconciliation_required'],
  removal_dispute: ['opened', 'updated', 'contested'],
  source_authority_review: ['review_required', 'unset'],
  admission_case: ['submitted', 'under_review'],
}

export const ADMIN_EXCEPTION_PARTITION_LABELS = {
  reconciliation_required: 'Reconciliation required',
  opened: 'Opened',
  updated: 'Updated',
  contested: 'Contested',
  review_required: 'Review required',
  unset: 'Legacy unset',
  submitted: 'Submitted',
  under_review: 'Under review',
} satisfies Record<AdminExceptionPartition, string>

export const ADMIN_EXCEPTIONS_COPY = {
  title: 'Exceptions',
  description: 'Review operational exception queues and recent Purchase resolutions.',
  breadcrumbs: { admin: 'Admin', exceptions: 'Exceptions' },
  accessDeniedTitle: 'Admin access required',
  accessDeniedDescription: ADMIN_ACCESS_REFUSED_COPY,
  filtersTitle: 'Exception queue',
  filtersDescription: 'Choose a type and its indexed state.',
  allStates: 'All states',
  clearAll: 'Clear all',
  exceptionsTitle: 'Cases',
  exceptionsDescription: 'Times use Australia/Perth.',
  resolutionsTitle: 'Recent Purchase resolutions',
  resolutionsDescription: 'Most recently resolved Calls appear first.',
  nothingNeedsAttention: 'Nothing needs attention.',
  noFilterMatches: 'No matches for these filters.',
  noRecentResolutions: 'No recent Purchase resolutions.',
  someUnavailable: 'Some sources are unavailable:',
  viewDetails: 'View details',
  detailsTitle: 'Exception details',
  detailsDescription: 'Recorded fields for this exception.',
  openObject: 'Open object record',
  verifySourceAuthority: 'Next step: Verify source authority on the Tool version record.',
  exceptionsUnavailable: 'Exception source unavailable.',
  scanProgress: (count: number) => `${count} further indexed window${count === 1 ? '' : 's'} requested; no displayable cases yet.`,
  loadMore: 'Load more',
  unavailable: getStatusPresentation('unavailable').label,
  columnLabels: {
    kind: 'Kind',
    reference: 'Reference',
    business: 'Business',
    since: 'Since',
    call: 'Call',
    terminalState: 'Outcome',
    resolvedAt: 'Resolved',
  },
  factLabels: {
    kind: 'Kind',
    reference: 'Reference',
    business: 'Business',
    since: 'Since',
  },
}
