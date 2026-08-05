import { useRef, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { Button } from '@/components/ui/button'

import { toast } from '@/lib/ui/toast'
import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { useClientMounted } from '@/hooks/use-client-mounted'
import {
  closeCurrentOwnerInquiryServer,
  markCurrentOwnerInquiryReadServer,
  readCurrentOwnerInquiryThreadServer,
  replyCurrentOwnerInquiryServer,
  type OwnerInquiryThreadServerResult,
} from '@/modules/inquiries/inquiry.functions'
import type { OwnerInquiryThreadRouteReadback } from '@/lib/operator/owner-inquiry-thread-readback'
import { DeliveryReadback } from '@/components/ae/inquiries/OwnerInquiryDeliveryReadback'
import { InquiryNextStep } from '@/components/ae/inquiries/OwnerInquiryNextStep'
import { InquiryOriginCard } from '@/components/ae/inquiries/OwnerInquiryOriginCard'
import { OwnerReplyControls } from '@/components/ae/inquiries/OwnerInquiryReplyControls'
import { ThreadMessages } from '@/components/ae/inquiries/OwnerInquiryThreadMessages'


const readOwnerThreadServer = readCurrentOwnerInquiryThreadServer
const markReadOwnerThreadServer = markCurrentOwnerInquiryReadServer
const replyOwnerThreadServer = replyCurrentOwnerInquiryServer
const closeOwnerThreadServer = closeCurrentOwnerInquiryServer

export const Route = createFileRoute('/_operator/owner/inquiries/$threadId')({
  ...operatorRouteOptions,
  loader: ({ params }) => readOwnerThreadServer({ data: { threadId: params.threadId } }),
  head: () => ({
    meta: [
      { title: 'Owner inquiry detail | Agentic Economy' },
      { name: 'description', content: 'Owner inquiry detail, reply controls, and delivery status from source state.' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OwnerInquiryThreadRoute,
})

function OwnerInquiryThreadRoute() {
  const serverReadback = Route.useLoaderData()
  const readback = ownerServerThreadToRouteReadback(serverReadback)
  const params = Route.useParams()
  const detailPath = `/owner/inquiries/${params.threadId}`
  const markReadInquiry = useServerFn(markReadOwnerThreadServer)
  const replyInquiry = useServerFn(replyOwnerThreadServer)
  const closeInquiry = useServerFn(closeOwnerThreadServer)
  const hydrated = useClientMounted()
  const [replyBody, setReplyBody] = useState('')
  const [pendingAction, setPendingAction] = useState<'read' | 'reply' | 'close' | undefined>()
  const [replyAttempted, setReplyAttempted] = useState(false)
  const replyFieldRef = useRef<HTMLTextAreaElement>(null)


  async function handleMarkRead() {
    if (readback.kind !== 'available') {
      return
    }

    if (usesLocalE2eBrowser()) {
      toast.success('Read state recorded.')
      return
    }

    setPendingAction('read')
    try {
      const result = await markReadInquiry({
        data: {
          threadId: readback.detail.inquiry.threadId,
          expectedVersion: readback.detail.inquiry.version,
        },
      })
      if (result.kind === 'ok') {
        toast.success(`Read state recorded. Thread is now ${result.thread.status}.`)
        return
      }

      toast.error(result.reason)
    } finally {
      setPendingAction(undefined)
    }
  }

  async function handleReply() {
    if (readback.kind !== 'available') {
      return
    }

    const body = replyBody.trim().replace(/\s+/g, ' ')
    setReplyAttempted(true)
    if (body.length === 0) {
      toast.error('Reply body is required.')
      window.setTimeout(() => replyFieldRef.current?.focus(), 0)
      return
    }

    if (usesLocalE2eBrowser()) {
      toast.success('Reply recorded. Thread is now replied.')
      setReplyBody('')
      setReplyAttempted(false)
      return
    }

    setPendingAction('reply')
    try {
      const result = await replyInquiry({
        data: {
          threadId: readback.detail.inquiry.threadId,
          expectedVersion: readback.detail.inquiry.version,
          body,
        },
      })
      if (result.kind === 'ok') {
        toast.success(`Reply recorded. Thread is now ${result.thread.status}.`)
        setReplyBody('')
        setReplyAttempted(false)
        return
      }

      toast.error(result.reason)
    } finally {
      setPendingAction(undefined)
    }
  }

  async function handleClose(): Promise<boolean> {
    if (readback.kind !== 'available') {
      return false
    }

    if (usesLocalE2eBrowser()) {
      toast.success('Close recorded. Thread is now closed.')
      return true
    }

    setPendingAction('close')
    try {
      const result = await closeInquiry({
        data: {
          threadId: readback.detail.inquiry.threadId,
          expectedVersion: readback.detail.inquiry.version,
        },
      })
      if (result.kind === 'ok') {
        toast.success(`Close recorded. Thread is now ${result.thread.status}.`)
        return true
      }

      toast.error(result.reason)
      return false
    } finally {
      setPendingAction(undefined)
    }
  }

  if (readback.kind === 'not_found') {
    return (
      <AeOperatorShell
        operatorRole="owner"
        eyebrow="Owner messages"
        title="Inquiry unavailable"
        description={readback.reason}
        currentPath={detailPath}
      >
        <Button asChild variant="default"><Link to="/owner/inquiries">Back to inbox</Link></Button>
      </AeOperatorShell>
    )
  }

  return (
    <AeOperatorShell
      operatorRole="owner"
      eyebrow={readback.detail.inquiry.businessName}
      title={readback.detail.inquiry.offeringName}
      description="Review the customer message, reply through the saved contact path, then close the thread when follow-up is done."
      currentPath={detailPath}
    >
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid gap-6">
          <ThreadMessages detail={readback.detail} />
          <OwnerReplyControls
            body={replyBody}
            canClose={hydrated && readback.canClose}
            canMarkRead={hydrated && readback.canMarkRead}
            canReply={hydrated && readback.canReply}
            pendingAction={pendingAction}
            replyAttempted={replyAttempted}
            replyFieldRef={replyFieldRef}
            onBodyChange={setReplyBody}
            onClose={handleClose}
            onMarkRead={handleMarkRead}
            onReply={handleReply}
          />
        </div>
        <aside className="grid content-start gap-4">
          <InquiryOriginCard detail={readback.detail} />
          <InquiryNextStep detail={readback.detail} />
          <DeliveryReadback notifications={readback.notifications} />
        </aside>
      </div>
    </AeOperatorShell>
  )
}

function ownerServerThreadToRouteReadback(result: OwnerInquiryThreadServerResult): OwnerInquiryThreadRouteReadback {
  if (result.kind === 'error') {
    return { kind: 'not_found', reason: result.reason }
  }

  const status = result.detail.inquiry.status
  return {
    kind: 'available',
    detail: result.detail,
    notifications: result.delivery.notifications,
    tombstones: result.tombstones,
    canReply: status !== 'closed',
    canClose: status !== 'closed',
    canMarkRead: status !== 'closed',
  }
}

function usesLocalE2eBrowser(): boolean {
  return import.meta.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E === 'true'
}
