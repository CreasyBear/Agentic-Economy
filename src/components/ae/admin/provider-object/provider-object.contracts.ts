import { ADMIN_ACCESS_REFUSED_COPY } from '@/lib/operator/admin-console/contracts'
import type { Slug } from '@/modules/common/ids'
import type { AdminProviderView } from '@/lib/operator/admin-console/views'

export type AdminProviderObjectPageProps = Readonly<{ slug: Slug }>
export type AdminProviderObjectRead =
  | AdminProviderView
  | Readonly<{ kind: 'object_not_found' }>
  | Readonly<{ kind: 'refused'; code: string }>
  | undefined

export type ProviderPublicationRow = AdminProviderView['publications'][number]
export type ProviderConnectionRow = AdminProviderView['connections'][number]
export type ProviderAdmissionCaseRow = AdminProviderView['admissionCases'][number]
export type ProviderRemovalDisputeRow = AdminProviderView['removalDisputes'][number]

export type ProviderToolVersionsTableProps = Readonly<{
  rows: AdminProviderView['publications']
}>
export type ProviderConnectionsTableProps = Readonly<{
  rows: AdminProviderView['connections']
}>
export type ProviderAdmissionCasesTableProps = Readonly<{
  rows: AdminProviderView['admissionCases']
}>
export type ProviderRemovalDisputesTableProps = Readonly<{
  rows: AdminProviderView['removalDisputes']
  onCloseDispute?: (dispute: ProviderRemovalDisputeRow) => void
}>

export type ProviderDisputeActionProps = Readonly<{
  dispute: ProviderRemovalDisputeRow
  onClose: ((dispute: ProviderRemovalDisputeRow) => void) | undefined
}>

export const PROVIDER_OBJECT_COPY = {
  title: 'Provider',
  description: 'Inspect Provider publication, connection, admission, and removal facts.',
  breadcrumbs: { admin: 'Admin', providers: 'Providers' },
  referenceLabel: 'Reference',
  backToSearch: 'Back to Search',
  refusedTitle: 'Admin access required',
  refusedDescription: ADMIN_ACCESS_REFUSED_COPY,
  detailsTitle: 'Provider facts',
  trustTier: 'Trust tier',
  payout: 'Payout',
  suppressedSince: 'Suppressed since',
  businessId: 'Business ID',
  suppress: 'Suppress',
  liftSuppression: 'Lift suppression',
  toolVersionsTitle: 'Tool versions',
  noToolVersions: 'No Tool versions for this Provider.',
  connectionsTitle: 'Connections',
  noConnections: 'No Provider connections.',
  admissionCasesTitle: 'Admission cases',
  noAdmissionCases: 'No admission cases.',
  removalDisputesTitle: 'Removal disputes',
  noRemovalDisputes: 'No removal disputes.',
  closeDispute: 'Close dispute',
  sourceAuthorityReviewTitle: 'Source authority review',
  columns: {
    toolVersion: 'Tool version',
    revision: 'Revision',
    currentRevision: 'Current revision',
    disposition: 'Disposition',
    sourceAuthority: 'Source authority',
    connection: 'Connection',
    lifecycle: 'Lifecycle',
    environment: 'Environment',
    admissionCase: 'Admission case',
    removalDispute: 'Removal dispute',
    state: 'State',
    updated: 'Updated',
  },
}

