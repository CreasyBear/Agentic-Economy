import { Outlet, createFileRoute, useLocation } from '@tanstack/react-router'

import { AeOperatorFactGrid } from '@/components/ae/operator/AeOperatorFactGrid'
import { AeOperatorQueueList } from '@/components/ae/operator/AeOperatorQueueList'
import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
    <AeOperatorShell
      role="owner"
      eyebrow="Owner review"
      title="Contact follow-up requests need approval."
      description="Every contact follow-up proposal waits for owner approval, one-use gateway admission, and source-owned receipt or proof-gap readback."
      currentPath="/owner/actions"
      navBadges={{ '/owner/actions': readback.queue.length }}
    >
      <div className="grid gap-6">
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
      </div>
    </AeOperatorShell>
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
  return (
    <AeOperatorQueueList
      scroll
      rows={queue.map((item) => ({
        id: item.proposal.id,
        href: `/owner/actions/${encodeURIComponent(item.proposal.id)}`,
        badges: [
          { label: item.proposal.status.replaceAll('_', ' ') },
          { label: (item.policy?.kind ?? 'not_checked').replaceAll('_', ' '), variant: 'outline' as const },
        ],
        title: item.proposal.parameters.contactName,
        description: item.proposal.parameters.messageSummary,
        facts: [
          { label: 'Selected action', value: 'Contact follow-up' },
          { label: 'Target message', value: item.proposal.parameters.sourceMessageRef },
          { label: 'Channel', value: item.proposal.parameters.contactChannel },
          { label: 'Owner decision', value: (item.ownerDecision?.decision ?? 'waiting').replaceAll('_', ' ') },
          { label: 'Deadline', value: new Date(item.proposal.deadlineAt).toISOString() },
        ],
      }))}
      emptyTitle="No contact follow-up requests"
      emptyDescription="New proposals appear here only after the contact follow-up contract is source-owned and policy-checked."
    />
  )
}
