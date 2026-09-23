import { z } from 'zod'

import {
  ADMIN_ACCESS_REFUSED_COPY,
  type AdminException,
  type AdminExceptionKind,
} from '@/lib/operator/admin-console/contracts'
import { getStatusPresentation } from '@/lib/ui/status-presentation'

export const adminExceptionsSearchSchema = z.object({
  kind: z.enum([
    'uncertain_call',
    'removal_dispute',
    'source_authority_review',
    'admission_case',
  ]).optional(),
})

export type AdminExceptionsSearch = z.infer<typeof adminExceptionsSearchSchema>


export type AdminExceptionRowModel = Readonly<{
  id: string
  kind: AdminExceptionKind
  kindLabel: string
  ref: string
  href: string
  businessSlug: string | null
  businessHref: string | null
  sinceLabel: string
  sinceRelativeLabel: string
  sinceIso: string
  exception: AdminException
}>

export type AdminResolutionRowModel = Readonly<{
  callRef: string
  href: string
  terminalStateLabel: string
  resolvedAtLabel: string
  resolvedAtIso: string
}>

export type AdminExceptionsReadyState = Readonly<{
  kind: 'ready'
  total: number
  truncated: boolean
  counts: Readonly<Record<AdminExceptionKind, number>>
  rows: readonly AdminExceptionRowModel[]
  resolutions: readonly AdminResolutionRowModel[]
  selectedSourceUnavailable: boolean
  unavailableLabels: readonly string[]
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
  selected: AdminExceptionKind | null
  onSelect: (kind: AdminExceptionKind | null) => void
  counts: Readonly<Record<AdminExceptionKind, number>>
  onClear: () => void
}>

export type ExceptionFeedTableProps = Readonly<{
  rows: readonly AdminExceptionRowModel[]
  total: number
  truncated: boolean
  unavailable: boolean
  filtered: boolean
  onOpen: (row: AdminExceptionRowModel) => void
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
  kind: AdminExceptionKind | null
  label: string
}>[] = [
  { kind: null, label: 'All' },
  { kind: 'uncertain_call', label: ADMIN_EXCEPTION_KIND_LABELS.uncertain_call },
  { kind: 'removal_dispute', label: ADMIN_EXCEPTION_KIND_LABELS.removal_dispute },
  { kind: 'source_authority_review', label: ADMIN_EXCEPTION_KIND_LABELS.source_authority_review },
  { kind: 'admission_case', label: ADMIN_EXCEPTION_KIND_LABELS.admission_case },
]

export const ADMIN_EXCEPTIONS_COPY = {
  title: 'Exceptions',
  description: 'Review the oldest operational exceptions and recent Purchase resolutions.',
  breadcrumbs: { admin: 'Admin', exceptions: 'Exceptions' },
  accessDeniedTitle: 'Admin access required',
  accessDeniedDescription: ADMIN_ACCESS_REFUSED_COPY,
  filtersTitle: 'Exception type',
  filtersDescription: 'Narrow the queue to one exception type.',
  clearAll: 'Clear all',
  exceptionsTitle: 'Oldest exceptions',
  exceptionsDescription: 'Oldest exceptions appear first. Times use Australia/Perth.',
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
  showingOldest: (total: number) => `Showing oldest 100 of ${total}`,
  unavailable: getStatusPresentation('unavailable').label,
  columnLabels: {
    kind: 'Kind',
    reference: 'Reference',
    business: 'Business',
    since: 'Since',
    call: 'Call',
    terminalState: 'Terminal state',
    resolvedAt: 'Resolved at',
  },
  factLabels: {
    kind: 'Kind',
    reference: 'Reference',
    business: 'Business',
    since: 'Since',
  },
}
