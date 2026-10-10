import { formatTimestamp } from '@/lib/ui/format-time'
import { ADMIN_ACCESS_REFUSED_COPY, type AdminObjectRef } from '@/lib/operator/admin-console/contracts'
import type {
  AdminAgentView,
  AdminQuoteView,
  AdminToolVersionView,
  AdminWorkspaceView,
} from '@/lib/operator/admin-console/views'

export type AdminObjectPageRef = Extract<
  AdminObjectRef,
  { kind: 'quote' | 'tool_version' | 'workspace' | 'agent' }
>

export type AdminObjectPageView =
  | AdminQuoteView
  | AdminToolVersionView
  | AdminWorkspaceView
  | AdminAgentView

export const ADMIN_OBJECT_PAGE_COPY = {
  adminBreadcrumb: 'Admin',
  referenceLabel: 'Reference',
  detailsTitle: 'Details',
  relatedTitle: 'Related references',
  noRelatedReferences: 'No related references.',
  notRecorded: 'Not recorded',
  yes: 'Yes',
  no: 'No',
  backToSearch: 'Back to Search',
  refusedTitle: 'Admin access required',
  refusedDescription: ADMIN_ACCESS_REFUSED_COPY,
  loadingTitle: 'Loading admin object',
  loadingDescription: 'Loading the current object details.',
  quote: {
    section: 'Quotes',
    title: 'Quote',
    description: 'Inspect the Quote lifecycle and related records.',
    metaTitle: 'Quote | Admin | Agentic Economy',
    state: 'Quote state',
    created: 'Created',
    expires: 'Expires',
    consumedCall: 'Consumed Call',
    tool: 'Tool version',
    workspace: 'Workspace',
    agent: 'Agent',
  },
  toolVersion: {
    section: 'Tools',
    title: 'Tool version',
    description: 'Inspect publication, source authority, and readiness details.',
    metaTitle: 'Tool version | Admin | Agentic Economy',
    publication: 'Publication reference',
    revision: 'Revision',
    currentRevision: 'Current revision',
    disposition: 'Disposition',
    sourceAuthority: 'Source authority',
    sourceAuthorityVerified: 'Verified',
    sourceAuthorityReviewRequired: 'Review required',
    sourceAuthorityUnset: 'Unset (legacy record)',
    admissionCase: 'Admission case',
    readiness: 'Readiness valid until',
    provider: 'Provider',
  },
  workspace: {
    section: 'Accounts',
    title: 'Account',
    description: 'Inspect Account access, funding and purchase history.',
    metaTitle: 'Account | Admin | Agentic Economy',
    lifecycle: 'Account lifecycle',
    owners: 'Owners',
    members: 'Members',
    created: 'Created',
    externalOrganization: 'External organization bound',
    spendingPolicy: 'Active Spending policy',
  },
  agent: {
    section: 'Agents',
    title: 'Agent',
    description: 'Inspect Agent credentials, policy, and recent Calls.',
    metaTitle: 'Agent | Admin | Agentic Economy',
    credentialLifecycle: 'Credential lifecycle',
    workspace: 'Workspace',
    spendingPolicy: 'Spending policy reference',
    recentCalls: 'Recent Calls',
    call: 'Call',
    noRecentCalls: 'No recent Calls.',
  },
}

export function formatPerthTimestamp(value: number): string {
  return `${formatTimestamp(value, 'Australia/Perth')} AWST`
}
