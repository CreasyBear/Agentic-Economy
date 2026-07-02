import { Outlet, createFileRoute, useLocation } from '@tanstack/react-router'

import { AeInquiryInboxPanel } from '@/components/ae/inquiries/AeInquiryInboxPanel'
import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
      navBadges={{ '/owner/inquiries': readback.inbox.buckets.unread + readback.inbox.buckets.needs_reply }}
    >
      <div className="grid gap-6">
        {readback.error === undefined ? null : (
          <Alert variant="destructive">
            <AlertTitle>Owner inbox needs sign-in</AlertTitle>
            <AlertDescription>{readback.error.reason}</AlertDescription>
          </Alert>
        )}
        <OwnerInquiryList inbox={readback.inbox} />
      </div>
    </AeOperatorShell>
  )
}

export function OwnerInquiryList({ inbox }: { inbox: OwnerInboxReadback }) {
  return <AeInquiryInboxPanel inbox={inbox} />
}
