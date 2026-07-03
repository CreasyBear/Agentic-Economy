import { Outlet, createFileRoute, useLocation } from '@tanstack/react-router'

import { AeOperatorFactGrid } from '@/components/ae/operator/AeOperatorFactGrid'
import { AeOperatorFilterCard } from '@/components/ae/operator/AeOperatorFilterCard'
import { AeOperatorQueueList } from '@/components/ae/operator/AeOperatorQueueList'
import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { Card } from '@astryxdesign/core/Card'
import { Text } from '@astryxdesign/core/Text'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import {
  createEmptyContactFollowUpSourceState,
  readContactFollowUpReconstruction,
  type ContactFollowUpProposalId,
  type ContactFollowUpReconstruction,
  type ContactFollowUpSourceState,
} from '@/modules/protected-action/public'
import {
  readAdminContactFollowUpReconstructionServer,
  type AdminContactFollowUpReconstructionServerResult,
} from '@/modules/protected-action/contact-follow-up.functions'

type AdminProtectedActionSearch = {
  proposalId?: string
}

export type AdminProtectedActionsRouteInput = {
  state?: ContactFollowUpSourceState
  proposalId?: ContactFollowUpProposalId
}

export type AdminProtectedActionsRouteReadback = {
  deniedReason?: string
  rows: readonly ContactFollowUpReconstruction[]
}

export const Route = createFileRoute('/admin/protected-actions')({
  ...operatorRouteOptions,
  validateSearch: (search: Record<string, unknown>): AdminProtectedActionSearch => {
    const proposalId = typeof search.proposalId === 'string' && search.proposalId.trim().length > 0 ? search.proposalId.trim() : undefined
    return proposalId === undefined ? {} : { proposalId }
  },
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) =>
    readAdminContactFollowUpReconstructionServer({
      data: deps.proposalId === undefined ? {} : { proposalId: deps.proposalId },
    }),
  head: () => ({
    meta: [
      { title: 'Protected action reconstruction | Agentic Economy' },
      { name: 'description', content: 'Operator reconstruction for owner-approved contact follow-up attempts.' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: AdminProtectedActionsRoute,
})

export function readAdminProtectedActionsRouteReadback(
  input: AdminProtectedActionsRouteInput = {}
): AdminProtectedActionsRouteReadback {
  const state = input.state ?? createEmptyContactFollowUpSourceState()
  if (input.proposalId !== undefined) {
    return { rows: [readContactFollowUpReconstruction(state, input.proposalId)] }
  }

  return {
    rows: state.proposals.map((proposal) => readContactFollowUpReconstruction(state, proposal.id)),
  }
}

function AdminProtectedActionsRoute() {
  const location = useLocation()
  const readback = adminProtectedActionsServerToRouteReadback(Route.useLoaderData())
  const search = Route.useSearch()

  if (location.pathname !== '/admin/protected-actions') {
    return <Outlet />
  }

  return (
    <AeOperatorShell
      operatorRole="admin"
      title="Contact follow-up reconstruction"
      description="Reconstruct selected protected-action proposals, owner decisions, gateways, attempts, receipts, proof gaps, and no-repair state."
      currentPath="/admin/protected-actions"
      navBadges={{ '/admin/protected-actions': readback.rows.length }}
    >
      {search.proposalId === undefined ? (
        <FilterPanel />
      ) : (
        <FilterPanel proposalId={search.proposalId} />
      )}
      {readback.deniedReason === undefined ? null : (
        <Card padding={5}>
          <div className="grid gap-1.5">
            <Text as="div" type="large" weight="semibold" color="primary" display="block">Admin reconstruction unavailable</Text>
            <Text as="div" type="supporting" color="secondary" display="block">{readback.deniedReason}</Text>
          </div>
        </Card>
      )}
      {readback.rows.length === 0 ? <EmptyState /> : <ReconstructionRows rows={readback.rows} />}
    </AeOperatorShell>
  )
}

export function adminProtectedActionsServerToRouteReadback(
  result: AdminContactFollowUpReconstructionServerResult
): AdminProtectedActionsRouteReadback {
  if (result.kind === 'allowed') {
    return { rows: result.rows }
  }

  return {
    deniedReason: result.publicMessage,
    rows: [],
  }
}

function FilterPanel({ proposalId }: { proposalId?: string }) {
  return (
    <AeOperatorFilterCard
      action="/admin/protected-actions"
      title="Find a contact follow-up path"
      description="Filter by one source-owned proposal identifier."
      fields={[
        {
          id: 'proposalId',
          name: 'proposalId',
          label: 'Proposal ID',
          description: 'Contact follow-up proposal source ref.',
          defaultValue: proposalId ?? '',
        },
      ]}
    />
  )
}

function EmptyState() {
  return (
    <AeOperatorQueueList
      rows={[]}
      emptyTitle="No protected action rows"
      emptyDescription="No source-owned contact follow-up proposal matches the current filters."
    />
  )
}

function ReconstructionRows({ rows }: { rows: readonly ContactFollowUpReconstruction[] }) {
  return (
    <AeOperatorQueueList
      scroll
      rows={rows.map((row) => ({
        id: row.proposal.id,
        badges: [
          { label: row.readbackStatus.replaceAll('_', ' ') },
          { label: row.repairAction.replaceAll('_', ' '), variant: 'outline' as const },
        ],
        title: row.proposal.id,
        description: row.proposal.parameters.messageSummary,
        facts: [
          { label: 'Policy', value: row.policy?.kind ?? 'missing' },
          { label: 'Owner decision', value: row.ownerDecision?.decision ?? 'waiting' },
          { label: 'Gateway', value: row.gatewayAdmission?.status ?? 'missing' },
          { label: 'Attempt', value: row.attempt?.outcome ?? 'not attempted' },
          { label: 'Receipt', value: row.receipt?.kind ?? 'none' },
          { label: 'No repair', value: row.noRepair?.reason ?? 'none' },
        ],
      }))}
      emptyTitle="No protected action rows"
      emptyDescription="No source-owned contact follow-up proposal matches the current filters."
    />
  )
}
