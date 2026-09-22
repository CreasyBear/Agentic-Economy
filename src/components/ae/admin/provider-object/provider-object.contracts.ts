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
}>

export const PROVIDER_OBJECT_COPY = {
  title: 'Provider',
  description: 'Inspect Provider publication, connection, admission, and removal facts.',
  breadcrumbs: { admin: 'Admin', providers: 'Providers' },
  backToSearch: 'Back to Search',
  refusedTitle: 'Admin access required',
  refusedDescription: 'Your account does not have the Admin role for this action.',
  detailsTitle: 'Provider facts',
  trustTier: 'Trust tier',
  payout: 'Payout',
  suppressedSince: 'Suppressed since',
  toolVersionsTitle: 'Tool versions',
  noToolVersions: 'No Tool versions for this Provider.',
  connectionsTitle: 'Connections',
  noConnections: 'No Provider connections.',
  admissionCasesTitle: 'Admission cases',
  noAdmissionCases: 'No admission cases.',
  removalDisputesTitle: 'Removal disputes',
  noRemovalDisputes: 'No removal disputes.',
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

