import { ADMIN_ACCESS_REFUSED_COPY } from '@/lib/operator/admin-console/contracts'
import type { AeStatus, AeStatusPresentation } from '@/lib/ui/status-presentation'
import type { AdminCallView } from '@/lib/operator/admin-console/views'

export type AdminCallObjectView = AdminCallView
export type AdminCallWireView = Omit<
  AdminCallView,
  'ref' | 'quoteRef' | 'toolRef' | 'workspaceRef' | 'agentRef'
> & Readonly<{
  ref: string
  quoteRef: string | null
  toolRef: string | null
  workspaceRef: string | null
  agentRef: string | null
}>


export type AdminCallLoaderResult =
  | AdminCallObjectView
  | Readonly<{ kind: 'malformed' }>
  | Readonly<{ kind: 'object_not_found' }>
  | Readonly<{ kind: 'refused'; code: string }>

export type AdminCallObjectFoundProps = Readonly<{
  view: AdminCallObjectView
}>

export type AdminCallActivityRow = Readonly<{
  id: string
  at: string
  eventType: string
  actorRef: string
  outcome: string
}>

export type AdminCallFact = Readonly<{
  label: string
  value: string
  mono?: boolean
}>

export type AdminCallRelatedRef = Readonly<{
  label: string
  value: string
  href?: string
}>

export type AdminCallObjectViewModel = Readonly<{
  view: AdminCallObjectView
  status: AeStatusPresentation
  facts: readonly AdminCallFact[]
  moneyTruth: string | null
  activity: readonly AdminCallActivityRow[]
  relatedRefs: readonly AdminCallRelatedRef[]
}>

export const ADMIN_CALL_STATUS: Readonly<Record<AdminCallObjectView['state'], AeStatus>> = {
  pending: 'queued',
  completed: 'completed',
  refused: 'refused',
  reconciliation_required: 'needs_attention',
  cancelled: 'billing_cancelled',
}

export const ADMIN_CALL_OBJECT_COPY = {
  description: 'Inspect the recorded Call facts, related references, and activity.',
  adminBreadcrumb: 'Admin',
  title: 'Call',
  callsBreadcrumb: 'Calls',
  referenceLabel: 'Reference',
  backToSearch: 'Back to Search',
  refusedTitle: 'Admin access required',
  refusedDescription: ADMIN_ACCESS_REFUSED_COPY,
  factsTitle: 'Call facts',
  factsDescription: 'Recorded evidence only. Missing facts stay missing.',
  statusDetailLabel: 'Recorded status detail',
  resultKindLabel: 'Result kind',
  purchaseResolutionLabel: 'Purchase resolution',
  resolvedAtLabel: 'Resolved',
  moneyTruthTitle: 'Money truth',
  relatedTitle: 'Related references',
  relatedDescription: 'Open the linked admin object or copy its exact reference.',
  quoteLabel: 'Quote',
  toolLabel: 'Tool version',
  workspaceLabel: 'Workspace',
  agentLabel: 'Agent',
  correlationLabel: 'Correlation',
  activityTitle: 'Activity',
  activityDescription: 'Newest recorded activity appears first. Times are shown in Australia/Perth.',
  noActivity: 'No activity is recorded for this Call.',
  occurredAtColumn: 'Occurred',
  eventTypeColumn: 'Event type',
  actorColumn: 'Actor',
  outcomeColumn: 'Outcome',
  notRecorded: 'Not recorded',
  loadingTitle: 'Loading Call',
  loadingDescription: 'Reading the exact admin Call record.',
}
