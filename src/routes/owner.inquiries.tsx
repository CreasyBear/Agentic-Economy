import { Outlet, createFileRoute, useLocation } from '@tanstack/react-router'

import { AeInquiryInboxPanel } from '@/components/ae/inquiries/AeInquiryInboxPanel'
import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  readCurrentOwnerInboxServer,
  type OwnerInboxServerResult,
} from '@/modules/inquiries/inquiry.functions'
import {
  createEmptyInquirySourceState,
  listOwnerInbox,
  type InquirySourceState,
  type OwnerInboxReadback,
} from '@/modules/inquiries/public'

export type OwnerInquiriesRouteInput = {
  state?: InquirySourceState
  ownerId?: OwnerInboxReadback['ownerId']
}

export type OwnerInquiriesRouteReadback = {
  inbox: OwnerInboxReadback
  error?: {
    code: string
    reason: string
  }
}

const defaultOwnerId = 'owner:inquiries-route' as OwnerInboxReadback['ownerId']
const emptyInquiryState = createEmptyInquirySourceState()
const readOwnerInboxServer = readCurrentOwnerInboxServer

export const Route = createFileRoute('/owner/inquiries')({
  loader: async () => ownerInboxServerToRouteReadback(await readOwnerInboxServer()),
  head: () => ({
    meta: [
      { title: 'Owner messages | Agentic Economy' },
      { name: 'description', content: 'Owner readback for human first-contact messages and dispatch state.' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OwnerInquiriesRoute,
})

export function readOwnerInquiriesRouteReadback(input: OwnerInquiriesRouteInput = {}): OwnerInquiriesRouteReadback {
  const ownerId = input.ownerId ?? defaultOwnerId

  return {
    inbox: listOwnerInbox(input.state ?? emptyInquiryState, { authority: { ownerId } }),
  }
}

export function ownerInboxServerToRouteReadback(result: OwnerInboxServerResult): OwnerInquiriesRouteReadback {
  if (result.kind === 'ok') {
    return { inbox: result.inbox }
  }

  return {
    inbox: readOwnerInquiriesRouteReadback().inbox,
    error: {
      code: result.code,
      reason: result.reason,
    },
  }
}

function OwnerInquiriesRoute() {
  const location = useLocation()
  const readback = Route.useLoaderData()

  if (location.pathname !== '/owner/inquiries') {
    return <Outlet />
  }

  return (
    <AeOperatorShell
      role="owner"
      title="Inquiries"
      description="Read submitted messages, reply state, and delivery status from source-owned inbox readback."
      currentPath="/owner/inquiries"
    >
      <div className="grid gap-6">
        {readback.error === undefined ? null : (
          <Alert variant="destructive">
            <AlertTitle>Owner inbox needs sign-in</AlertTitle>
            <AlertDescription>{readback.error.reason}</AlertDescription>
          </Alert>
        )}
        <OwnerInquiryInboxSummary inbox={readback.inbox} />
        <OwnerInquiryList inbox={readback.inbox} />
      </div>
    </AeOperatorShell>
  )
}

export function OwnerInquiryInboxSummary({ inbox }: { inbox: OwnerInboxReadback }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Message readback</CardTitle>
        <CardDescription>Counts come from the message source state for this owner.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 text-sm md:grid-cols-4">
          <ReadbackFact label="Unread" value={String(inbox.buckets.unread)} />
          <ReadbackFact label="Needs reply" value={String(inbox.buckets.needs_reply)} />
          <ReadbackFact label="Resolved" value={String(inbox.buckets.resolved)} />
          <ReadbackFact label="Delivery issues" value={String(inbox.delivery.failed + inbox.delivery.held)} />
        </dl>
      </CardContent>
    </Card>
  )
}

export function OwnerInquiryList({ inbox }: { inbox: OwnerInboxReadback }) {
  return <AeInquiryInboxPanel inbox={inbox} />
}

function ReadbackFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <dt className="text-xs font-medium uppercase tracking-[var(--ae-public-tracking-mono-label)] text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-foreground">{value}</dd>
    </div>
  )
}
