import { Outlet, createFileRoute, useLocation } from '@tanstack/react-router'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

import { AeInquiryInboxPanel } from '@/components/ae/inquiries/AeInquiryInboxPanel'
import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import {
  readCurrentOwnerInboxServer,
  type OwnerInboxServerResult,
} from '@/modules/inquiries/inquiry.functions'
import { readOwnerInquiriesRouteReadback, type OwnerInquiriesRouteReadback } from '@/modules/inquiries/owner-inquiry-route'
import type { OwnerInboxReadback } from '@/modules/inquiries/public'

const readOwnerInboxServer = readCurrentOwnerInboxServer

export const Route = createFileRoute('/_operator/owner/inquiries')({
  ...operatorRouteOptions,
  loader: async () => ownerInboxServerToRouteReadback(await readOwnerInboxServer()),
  head: () => ({
    meta: [
      { title: 'Owner messages | Agentic Economy' },
      { name: 'description', content: 'Owner view of human first-contact messages and dispatch state.' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OwnerInquiriesRoute,
})

function ownerInboxServerToRouteReadback(result: OwnerInboxServerResult): OwnerInquiriesRouteReadback {
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
      operatorRole="owner"
      title="Inquiries"
      description="Read submitted messages, reply state, and delivery status for every inquiry in your inbox."
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
