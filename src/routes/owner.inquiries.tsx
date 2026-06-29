import { Outlet, createFileRoute, useLocation } from '@tanstack/react-router'

import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  readCurrentOwnerInboxServer,
  type OwnerInboxServerResult,
} from '@/modules/inquiries/inquiry.functions'
import {
  createEmptyInquirySourceState,
  listOwnerInbox,
  type InquirySourceState,
  type OwnerInboxInquiryProjection,
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
    <AePublicShell>
      <AePageHeader
        eyebrow="Owner messages"
        title="Human messages stay source-owned."
        description="Owners see submitted messages, read state, responses, close state, and dispatch status without relying on external success as truth."
      />
      <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-16 md:px-6">
        {readback.error === undefined ? null : (
          <Alert variant="destructive">
            <AlertTitle>Owner inbox needs sign-in</AlertTitle>
            <AlertDescription>{readback.error.reason}</AlertDescription>
          </Alert>
        )}
        <OwnerInquiryInboxSummary inbox={readback.inbox} />
        <OwnerInquiryList inbox={readback.inbox} />
      </section>
    </AePublicShell>
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
  if (inbox.empty) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No messages yet</CardTitle>
          <CardDescription>Published services with contact handling will appear here after a customer submits a message.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="grid gap-4">
      {inbox.inquiries.map((inquiry) => (
        <OwnerInquiryCard key={inquiry.threadId} inquiry={inquiry} />
      ))}
    </div>
  )
}

function OwnerInquiryCard({ inquiry }: { inquiry: OwnerInboxInquiryProjection }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={inquiry.bucket === 'resolved' ? 'secondary' : 'default'}>{inquiry.bucket.replace('_', ' ')}</Badge>
          <Badge variant={inquiry.notificationStatus === 'failed' || inquiry.notificationStatus === 'held' ? 'destructive' : 'outline'}>
            {inquiry.notificationLabel}
          </Badge>
        </div>
        <CardTitle>{inquiry.serviceName}</CardTitle>
        <CardDescription>{inquiry.businessName}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm text-foreground">{inquiry.preview}</p>
        <dl className="grid gap-3 text-sm md:grid-cols-3">
          <ReadbackFact label="Messages" value={String(inquiry.messageCount)} />
          <ReadbackFact label="Status" value={inquiry.status} />
          <ReadbackFact label="Updated" value={new Date(inquiry.updatedAt).toISOString()} />
        </dl>
        <Button asChild variant="outline" size="sm">
          <a href={`/owner/inquiries/${encodeURIComponent(inquiry.threadId)}`}>Open inquiry</a>
        </Button>
      </CardContent>
    </Card>
  )
}

function ReadbackFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <dt className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-foreground">{value}</dd>
    </div>
  )
}
