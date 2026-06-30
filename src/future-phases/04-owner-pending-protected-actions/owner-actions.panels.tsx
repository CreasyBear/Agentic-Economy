import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  summarizeOwnerContactFollowUpItem,
  type OwnerContactFollowUpFact,
  type OwnerContactFollowUpSummary,
} from '@/future-phases/04-owner-pending-protected-actions/owner-actions.readback'
import type {
  ContactFollowUpProposalQueueItem,
  ContactFollowUpReconstruction,
} from '@/modules/protected-action/public'

export function OwnerContactFollowUpQueue({ queue }: { queue: readonly ContactFollowUpProposalQueueItem[] }) {
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
  const summary: OwnerContactFollowUpSummary = summarizeOwnerContactFollowUpItem(item)
  const canDecide = item.ownerDecision === undefined && (item.policy?.kind === 'review_required' || item.policy?.kind === 'time_bound')

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-border px-3 py-1 text-xs font-medium uppercase tracking-[var(--ae-public-tracking-mono-label)] text-muted-foreground">
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
          <Button type="button" variant="outline" disabled={!canDecide}>
            Approve request
          </Button>
          <Button type="button" variant="outline">
            Reject request
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function OwnerContactFollowUpReadback({ reconstructions }: { reconstructions: readonly ContactFollowUpReconstruction[] }) {
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
        <div key={`${fact.label}:${fact.value}`} className="rounded-md border border-border p-3">
          <dt className="text-xs font-medium uppercase tracking-[var(--ae-public-tracking-mono-label)] text-muted-foreground">
            {fact.label}
          </dt>
          <dd className="mt-1 break-words text-sm text-foreground">{fact.value}</dd>
        </div>
      ))}
    </dl>
  )
}
