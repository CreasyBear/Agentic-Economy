import { Outlet, createFileRoute, useLocation } from '@tanstack/react-router'

import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  createEmptyContactFollowUpSourceState,
  readContactFollowUpReconstruction,
  type ContactFollowUpProposalId,
  type ContactFollowUpReconstruction,
  type ContactFollowUpSourceState,
} from '@/modules/protected-action/public'

export type OwnerContactFollowUpDetailRouteInput = {
  state?: ContactFollowUpSourceState
  proposalId: ContactFollowUpProposalId
}

export const Route = createFileRoute('/owner/actions/$proposalId')({
  loader: ({ params }) =>
    readOwnerContactFollowUpDetailRouteReadback({
      proposalId: params.proposalId as ContactFollowUpProposalId,
    }),
  head: () => ({
    meta: [
      { title: 'Review contact follow-up | Agentic Economy' },
      { name: 'description', content: 'Owner decision surface for one contact follow-up proposal.' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OwnerContactFollowUpDetailRoute,
})

export function readOwnerContactFollowUpDetailRouteReadback(
  input: OwnerContactFollowUpDetailRouteInput
): ContactFollowUpReconstruction {
  return readContactFollowUpReconstruction(input.state ?? createEmptyContactFollowUpSourceState(), input.proposalId)
}

function OwnerContactFollowUpDetailRoute() {
  const readback = Route.useLoaderData()
  const location = useLocation()

  if (location.pathname.endsWith('/receipt')) {
    return <Outlet />
  }

  return (
    <AePublicShell>
      <AePageHeader
        eyebrow="Owner decision"
        title="Review contact follow-up"
        description="Approve or reject one contact follow-up request after reviewing target, deadline, consequence, reversibility, and proof requirement."
      />
      <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-16 md:px-6">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{readback.readbackStatus.replaceAll('_', ' ')}</Badge>
              <Badge variant="outline">{readback.proposal.selectedActionSlug}</Badge>
            </div>
            <CardTitle>{readback.proposal.parameters.contactName}</CardTitle>
            <CardDescription>{readback.proposal.parameters.messageSummary}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <FactGrid
              facts={[
                { label: 'Target source message', value: readback.proposal.parameters.sourceMessageRef },
                { label: 'Allowed channel', value: readback.proposal.parameters.contactChannel },
                { label: 'Deadline', value: new Date(readback.proposal.deadlineAt).toISOString() },
                { label: 'Proof expectation', value: readback.proposal.proofExpectation.replaceAll('_', ' ') },
                { label: 'Reversibility', value: readback.proposal.reversibility.replaceAll('_', ' ') },
                { label: 'Correlation', value: readback.proposal.correlationId },
              ]}
            />
            <Alert>
              <AlertTitle>Consequence before approval</AlertTitle>
              <AlertDescription>
                Approval records one contact follow-up attempt through the source-owned follow-up outbox. It does not book work, charge money, guarantee response, or authorize future actions.
              </AlertDescription>
            </Alert>
            <div className="flex flex-wrap gap-3">
              <Button disabled={readback.readbackStatus !== 'ready_for_attempt' && readback.readbackStatus !== 'gateway_admitted'} type="button">
                Approve contact follow-up
              </Button>
              <Button variant="outline" type="button">
                Reject contact follow-up
              </Button>
              <Button asChild variant="outline">
                <a href={`/owner/actions/${encodeURIComponent(readback.proposal.id)}/receipt`}>Open receipt readback</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </AePublicShell>
  )
}

function FactGrid({ facts }: { facts: readonly { label: string; value: string }[] }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {facts.map((fact) => (
        <div key={`${fact.label}:${fact.value}`} className="rounded-lg border bg-muted/30 p-3">
          <dt className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{fact.label}</dt>
          <dd className="mt-1 break-words text-sm text-foreground">{fact.value}</dd>
        </div>
      ))}
    </dl>
  )
}
