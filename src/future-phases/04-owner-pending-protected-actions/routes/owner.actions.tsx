import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createParkedFileRoute } from '@/future-phases/route-helpers'
import type { BusinessId, OwnerId } from '@/modules/common/ids'
import {
  createEmptyContactFollowUpSourceState,
  listOwnerContactFollowUpQueue,
  readContactFollowUpReconstruction,
  type ContactFollowUpProposalQueueItem,
  type ContactFollowUpReconstruction,
  type ContactFollowUpSourceState,
} from '@/modules/protected-action/public'

export type OwnerContactFollowUpRouteInput = {
  state?: ContactFollowUpSourceState
  ownerId?: OwnerId
  businessId?: BusinessId
}

export type OwnerContactFollowUpRouteReadback = {
  queue: readonly ContactFollowUpProposalQueueItem[]
  reconstructions: readonly ContactFollowUpReconstruction[]
}

export type OwnerContactFollowUpSummary = {
  title: string
  description: string
  badge: string
  facts: readonly OwnerContactFollowUpFact[]
}

type OwnerContactFollowUpFact = {
  label: string
  value: string
}

const defaultOwnerId = 'owner:contact-follow-up' as OwnerId

export const Route = createParkedFileRoute<OwnerContactFollowUpRouteReadback>('/owner/actions')({
  loader: () => readOwnerContactFollowUpRouteReadback(),
  head: () => ({
    meta: [
      { title: 'Owner follow-up requests | Agentic Economy' },
      { name: 'description', content: 'Owner-reviewed contact follow-up requests rendered from source-owned readbacks.' },
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

export function summarizeOwnerContactFollowUpItem(item: ContactFollowUpProposalQueueItem): OwnerContactFollowUpSummary {
  const policy = item.policy?.kind ?? 'not_checked'
  const decision = item.ownerDecision?.decision ?? 'waiting'
  const receiptKind = item.receipt?.kind ?? 'none'
  return {
    title: item.proposal.parameters.contactName,
    description: item.proposal.parameters.messageSummary,
    badge: item.proposal.status.replaceAll('_', ' '),
    facts: [
      { label: 'Request', value: item.proposal.selectedActionSlug },
      { label: 'Channel', value: item.proposal.parameters.contactChannel },
      { label: 'Policy', value: policy.replaceAll('_', ' ') },
      { label: 'Owner decision', value: decision.replaceAll('_', ' ') },
      { label: 'Receipt or gap', value: receiptKind.replaceAll('_', ' ') },
      { label: 'Correlation', value: item.proposal.correlationId },
    ],
  }
}

function OwnerActionsRoute() {
  const readback = Route.useLoaderData()

  return (
    <AePublicShell>
      <AePageHeader
        eyebrow="Owner review"
        title="Contact follow-up requests"
        description="Each request waits for an owner decision before any source-owned follow-up attempt is recorded. Receipts and proof gaps come only from saved readback state."
      />
      <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-16 md:px-6">
        <OwnerContactFollowUpQueue queue={readback.queue} />
        <OwnerContactFollowUpReadback reconstructions={readback.reconstructions} />
      </section>
    </AePublicShell>
  )
}

function OwnerContactFollowUpQueue({ queue }: { queue: readonly ContactFollowUpProposalQueueItem[] }) {
  if (queue.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No contact follow-up requests</CardTitle>
          <CardDescription>Requests appear here only after source state records the selected contact follow-up contract.</CardDescription>
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
  const summary = summarizeOwnerContactFollowUpItem(item)
  const canDecide = item.ownerDecision === undefined && (item.policy?.kind === 'review_required' || item.policy?.kind === 'time_bound')

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-border px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {summary.badge}
          </span>
        </div>
        <CardTitle>{summary.title}</CardTitle>
        <CardDescription>{summary.description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <Alert>
          <AlertTitle>Consequence</AlertTitle>
          <AlertDescription>
            Approving this request records one contact follow-up attempt against the saved source message. The owner can still close the request if a receipt is not available.
          </AlertDescription>
        </Alert>
        <FactList facts={summary.facts} />
        <div className="flex flex-wrap gap-3">
          <button
            className="rounded-md border border-border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!canDecide}
            type="button"
          >
            Approve request
          </button>
          <button className="rounded-md border border-border px-4 py-2 text-sm font-medium" type="button">
            Reject request
          </button>
        </div>
      </CardContent>
    </Card>
  )
}

function OwnerContactFollowUpReadback({ reconstructions }: { reconstructions: readonly ContactFollowUpReconstruction[] }) {
  if (reconstructions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No receipt or proof-gap readback</CardTitle>
          <CardDescription>Readback appears after the selected follow-up attempt writes source-owned receipt or gap state.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="grid gap-4">
      {reconstructions.map((readback) => (
        <Card key={readback.proposal.id}>
          <CardHeader>
            <CardTitle>{readback.readbackStatus.replaceAll('_', ' ')}</CardTitle>
            <CardDescription>{readback.proposal.parameters.messageSummary}</CardDescription>
          </CardHeader>
          <CardContent>
            <FactList
              facts={[
                { label: 'Request ID', value: readback.proposal.id },
                { label: 'Repair', value: readback.repairAction.replaceAll('_', ' ') },
                { label: 'Audit events', value: String(readback.auditEvents.length) },
                { label: 'Receipt kind', value: readback.receipt?.kind ?? 'none' },
              ]}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function FactList({ facts }: { facts: readonly OwnerContactFollowUpFact[] }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {facts.map((fact) => (
        <div key={`${fact.label}:${fact.value}`} className="rounded-lg border border-border p-3">
          <dt className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{fact.label}</dt>
          <dd className="mt-1 break-words text-sm text-foreground">{fact.value}</dd>
        </div>
      ))}
    </dl>
  )
}
