import { Outlet, createFileRoute, useLocation } from '@tanstack/react-router'

import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { BusinessId, OwnerId } from '@/modules/common/ids'
import {
  createEmptyContactFollowUpSourceState,
  listOwnerContactFollowUpQueue,
  readContactFollowUpReconstruction,
  type ContactFollowUpProposalQueueItem,
  type ContactFollowUpReconstruction,
  type ContactFollowUpSourceState,
} from '@/modules/protected-action/public'
import {
  readCurrentOwnerContactFollowUpQueueServer,
  type OwnerContactFollowUpQueueServerResult,
} from '@/modules/protected-action/contact-follow-up.functions'

export type OwnerContactFollowUpRouteInput = {
  state?: ContactFollowUpSourceState
  ownerId?: OwnerId
  businessId?: BusinessId
}

export type OwnerContactFollowUpRouteReadback = {
  unavailableReason?: string
  queue: readonly ContactFollowUpProposalQueueItem[]
  reconstructions: readonly ContactFollowUpReconstruction[]
}

const defaultOwnerId = 'owner:contact-follow-up' as OwnerId

export const Route = createFileRoute('/owner/actions')({
  loader: () => readCurrentOwnerContactFollowUpQueueServer(),
  head: () => ({
    meta: [
      { title: 'Contact follow-up requests | Agentic Economy' },
      {
        name: 'description',
        content: 'Owner-reviewed contact follow-up requests rendered from source-owned protected-action readbacks.',
      },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OwnerActionsRoute,
})

export function readOwnerContactFollowUpRouteReadback(
  input: OwnerContactFollowUpRouteInput = {}
): OwnerContactFollowUpRouteReadback {
  const state = input.state ?? createEmptyContactFollowUpSourceState()
  const ownerId = input.ownerId ?? defaultOwnerId
  const queue = listOwnerContactFollowUpQueue(state, ownerId, input.businessId)

  return {
    queue,
    reconstructions: queue.map((item) => readContactFollowUpReconstruction(state, item.proposal.id)),
  }
}

function OwnerActionsRoute() {
  const location = useLocation()
  const readback = ownerContactFollowUpQueueServerToRouteReadback(Route.useLoaderData())

  if (location.pathname !== '/owner/actions') {
    return <Outlet />
  }

  return (
    <AePublicShell>
      <AePageHeader
        eyebrow="Owner review"
        title="Contact follow-up requests need approval."
        description="Every contact follow-up proposal waits for owner approval, one-use gateway admission, and source-owned receipt or proof-gap readback."
      />
      <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-16 md:px-6">
        <Alert>
          <AlertTitle>Approval required</AlertTitle>
          <AlertDescription>
            Contact follow-up is owner-pending. AE does not book work, charge money, or record a follow-up attempt until the owner approves this exact proposal.
          </AlertDescription>
        </Alert>
        {readback.unavailableReason === undefined ? null : (
          <Alert>
            <AlertTitle>Source readback unavailable</AlertTitle>
            <AlertDescription>{readback.unavailableReason}</AlertDescription>
          </Alert>
        )}
        <OwnerContactFollowUpQueue queue={readback.queue} />
      </section>
    </AePublicShell>
  )
}

export function ownerContactFollowUpQueueServerToRouteReadback(
  result: OwnerContactFollowUpQueueServerResult
): OwnerContactFollowUpRouteReadback {
  if (result.kind === 'ok') {
    return {
      queue: result.queue,
      reconstructions: result.reconstructions,
    }
  }

  return {
    unavailableReason: result.reason,
    queue: [],
    reconstructions: [],
  }
}

function OwnerContactFollowUpQueue({ queue }: { queue: readonly ContactFollowUpProposalQueueItem[] }) {
  if (queue.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No contact follow-up requests</CardTitle>
          <CardDescription>
            New proposals appear here only after the contact follow-up contract is source-owned and policy-checked.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="grid gap-4">
      {queue.map((item) => (
        <OwnerContactFollowUpCard key={item.proposal.id} item={item} />
      ))}
    </div>
  )
}

function OwnerContactFollowUpCard({ item }: { item: ContactFollowUpProposalQueueItem }) {
  const policy = item.policy?.kind ?? 'not_checked'
  const decision = item.ownerDecision?.decision ?? 'waiting'
  const canDecide = item.ownerDecision === undefined && (item.policy?.kind === 'review_required' || item.policy?.kind === 'time_bound')

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{item.proposal.status.replaceAll('_', ' ')}</Badge>
          <Badge variant="outline">{policy.replaceAll('_', ' ')}</Badge>
        </div>
        <CardTitle>{item.proposal.parameters.contactName}</CardTitle>
        <CardDescription>{item.proposal.parameters.messageSummary}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <FactGrid
          facts={[
            { label: 'Selected action', value: 'Contact follow-up' },
            { label: 'Target message', value: item.proposal.parameters.sourceMessageRef },
            { label: 'Channel', value: item.proposal.parameters.contactChannel },
            { label: 'Owner decision', value: decision.replaceAll('_', ' ') },
            { label: 'Deadline', value: new Date(item.proposal.deadlineAt).toISOString() },
            { label: 'Correlation', value: item.proposal.correlationId },
          ]}
        />
        <Alert>
          <AlertTitle>Consequence</AlertTitle>
          <AlertDescription>
            Approving records one contact follow-up attempt through the source-owned follow-up outbox. It does not approve future actions, bookings, payments, or autonomous execution.
          </AlertDescription>
        </Alert>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline" size="sm">
            <a href={`/owner/actions/${encodeURIComponent(item.proposal.id)}`}>Review detail</a>
          </Button>
          <Button disabled={!canDecide} size="sm" type="button">
            Approve contact follow-up
          </Button>
          <Button variant="outline" size="sm" type="button">
            Reject contact follow-up
          </Button>
        </div>
      </CardContent>
    </Card>
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
