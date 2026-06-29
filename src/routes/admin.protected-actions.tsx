import { Outlet, createFileRoute, useLocation } from '@tanstack/react-router'
import { SearchIcon } from 'lucide-react'

import { AeAdminShell } from '@/components/ae/layout/AeAdminShell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  createEmptyContactFollowUpSourceState,
  readContactFollowUpReconstruction,
  type ContactFollowUpProposalId,
  type ContactFollowUpReconstruction,
  type ContactFollowUpSourceState,
} from '@/modules/protected-action/public'

type AdminProtectedActionSearch = {
  proposalId?: string
}

export type AdminProtectedActionsRouteInput = {
  state?: ContactFollowUpSourceState
  proposalId?: ContactFollowUpProposalId
}

export type AdminProtectedActionsRouteReadback = {
  rows: readonly ContactFollowUpReconstruction[]
}

export const Route = createFileRoute('/admin/protected-actions')({
  validateSearch: (search: Record<string, unknown>): AdminProtectedActionSearch => {
    const proposalId = typeof search.proposalId === 'string' && search.proposalId.trim().length > 0 ? search.proposalId.trim() : undefined
    return proposalId === undefined ? {} : { proposalId }
  },
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) =>
    readAdminProtectedActionsRouteReadback(
      deps.proposalId === undefined ? {} : { proposalId: deps.proposalId as ContactFollowUpProposalId }
    ),
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
  const readback = Route.useLoaderData()
  const search = Route.useSearch()

  if (location.pathname !== '/admin/protected-actions') {
    return <Outlet />
  }

  return (
    <AeAdminShell
      title="Contact follow-up reconstruction"
      description="Reconstruct selected protected-action proposals, owner decisions, gateways, attempts, receipts, proof gaps, and no-repair state."
      currentPath="/admin/protected-actions"
    >
      {search.proposalId === undefined ? <FilterPanel /> : <FilterPanel proposalId={search.proposalId} />}
      {readback.rows.length === 0 ? <EmptyState /> : <ReconstructionRows rows={readback.rows} />}
    </AeAdminShell>
  )
}

function FilterPanel({ proposalId }: { proposalId?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Find a contact follow-up path</CardTitle>
        <CardDescription>Filter by one source-owned proposal identifier.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action="/admin/protected-actions" method="get" className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="proposalId">Proposal ID</FieldLabel>
              <Input id="proposalId" name="proposalId" defaultValue={proposalId ?? ''} autoComplete="off" />
              <FieldDescription>Contact follow-up proposal source ref.</FieldDescription>
            </Field>
          </FieldGroup>
          <Button type="submit">
            <SearchIcon data-icon="inline-start" aria-hidden="true" />
            Filter
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function EmptyState() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>No protected action rows</CardTitle>
        <CardDescription>No source-owned contact follow-up proposal matches the current filters.</CardDescription>
      </CardHeader>
    </Card>
  )
}

function ReconstructionRows({ rows }: { rows: readonly ContactFollowUpReconstruction[] }) {
  return (
    <div className="grid gap-4">
      {rows.map((row) => (
        <Card key={row.proposal.id}>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{row.readbackStatus.replaceAll('_', ' ')}</Badge>
              <Badge variant="outline">{row.repairAction.replaceAll('_', ' ')}</Badge>
            </div>
            <CardTitle className="break-words text-lg">{row.proposal.id}</CardTitle>
            <CardDescription>{row.proposal.parameters.messageSummary}</CardDescription>
          </CardHeader>
          <CardContent>
            <FactGrid
              facts={[
                { label: 'Policy', value: row.policy?.kind ?? 'missing' },
                { label: 'Owner decision', value: row.ownerDecision?.decision ?? 'waiting' },
                { label: 'Gateway', value: row.gatewayAdmission?.status ?? 'missing' },
                { label: 'Attempt', value: row.attempt?.outcome ?? 'not attempted' },
                { label: 'Receipt', value: row.receipt?.kind ?? 'none' },
                { label: 'No repair', value: row.noRepair?.reason ?? 'none' },
              ]}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function FactGrid({ facts }: { facts: readonly { label: string; value: string }[] }) {
  return (
    <dl className="grid gap-3 md:grid-cols-3">
      {facts.map((fact) => (
        <div key={`${fact.label}:${fact.value}`} className="rounded-md border bg-muted/30 p-3">
          <dt className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{fact.label}</dt>
          <dd className="mt-1 break-words text-sm text-foreground">{fact.value}</dd>
        </div>
      ))}
    </dl>
  )
}
