import { useRef, useState, type RefObject } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { CircleCheckIcon } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'

import { Conversation, ConversationContent } from '@/components/ai-elements/conversation'
import { Message, MessageContent } from '@/components/ai-elements/message'
import { toast } from '@/lib/ui/toast'
import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { AeOperatorFactGrid } from '@/components/ae/operator/AeOperatorFactGrid'
import { AeConfirmDialog } from '@/components/ae/feedback/AeConfirmDialog'
import { AeInquiryOriginCard } from '@/components/ae/inquiries/AeInquiryOriginCard'
import { AeOwnerReplyComposer } from '@/components/ae/inquiries/AeOwnerReplyComposer'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { formatTimestamp, timestampIso } from '@/lib/ui/format-time'
import { useClientMounted } from '@/hooks/use-client-mounted'
import type { OwnerId } from '@/modules/common/ids'
import {
  closeCurrentOwnerInquiryServer,
  markCurrentOwnerInquiryReadServer,
  readCurrentOwnerInquiryThreadServer,
  replyCurrentOwnerInquiryServer,
  type OwnerInquiryThreadServerResult,
} from '@/modules/inquiries/inquiry.functions'
import {
  createEmptyInquirySourceState,
  readInquiryDeliveryReadback,
  readInquiryPrivacyTombstone,
  readOwnerInquiry,
  type InquiryNotificationStatus,
  type InquiryPrivacyTombstoneRecord,
  type InquirySourceState,
  type InquiryThreadId,
  type OwnerInboxNotificationProjection,
  type OwnerInquiryDetailReadback,
} from '@/modules/inquiries/public'


export type OwnerInquiryThreadRouteInput = {
  state?: InquirySourceState
  ownerId?: OwnerId
  threadId?: InquiryThreadId
}

export type OwnerInquiryThreadRouteReadback =
  | {
      kind: 'available'
      detail: OwnerInquiryDetailReadback
      notifications: readonly OwnerInboxNotificationProjection[]
      tombstones: readonly InquiryPrivacyTombstoneRecord[]
      canReply: boolean
      canClose: boolean
      canMarkRead: boolean
    }
  | {
      kind: 'not_found'
      reason: string
    }

const defaultOwnerId = 'owner:inquiry-thread-route' as OwnerId
const emptyInquiryState = createEmptyInquirySourceState()
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

export function readOwnerInquiryThreadRouteReadback(input: OwnerInquiryThreadRouteInput = {}): OwnerInquiryThreadRouteReadback {
  if (input.threadId === undefined) {
    return { kind: 'not_found', reason: 'Inquiry thread is required.' }
  }

  const state = input.state ?? emptyInquiryState
  const authority = { ownerId: input.ownerId ?? defaultOwnerId }
  const detail = readOwnerInquiry(state, {
    authority,
    threadId: input.threadId,
  })

  if (detail.kind === 'error') {
    return { kind: 'not_found', reason: detail.reason }
  }

  const delivery = readInquiryDeliveryReadback(state, {
    authority,
    threadId: input.threadId,
  })
  const tombstones = readInquiryPrivacyTombstone(state, {
    authority,
    threadId: input.threadId,
  })
  const status = detail.readback.inquiry.status

  return {
    kind: 'available',
    detail: detail.readback,
    notifications: delivery.kind === 'ok' ? delivery.readback.notifications : detail.readback.notifications,
    tombstones: tombstones.kind === 'ok' ? tombstones.tombstones : [],
    canReply: status !== 'closed',
    canClose: status !== 'closed',
    canMarkRead: status !== 'closed',
  }
}

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
        <Button asChild variant="default"><a href="/owner/inquiries">Back to inbox</a></Button>
      </AeOperatorShell>
    )
  }

  return (
    <AeOperatorShell
      operatorRole="owner"
      eyebrow={readback.detail.inquiry.businessName}
      title={readback.detail.inquiry.serviceName}
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

function InquiryOriginCard({ detail }: { detail: OwnerInquiryDetailReadback }) {
  const origin = detail.inquiry.origin
  if (origin === undefined) {
    return null
  }

  return <AeInquiryOriginCard origin={origin} />
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

function ThreadMessages({ detail }: { detail: OwnerInquiryDetailReadback }) {
  return (
    <Card className="p-3">
      <div className="grid gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={detail.inquiry.bucket === 'resolved' ? 'secondary' : 'outline'}>{detail.inquiry.bucket.replace('_', ' ')}</Badge>
          <Badge variant={notificationVariant(detail.inquiry.notificationStatus)}>{detail.inquiry.notificationLabel}</Badge>
        </div>
        <h2 className="text-lg font-semibold text-foreground">Thread messages</h2>
        <p className="text-sm text-muted-foreground">{detail.inquiry.preview}</p>
      </div>
      <div className="mt-4 grid gap-4">
        <Conversation className="max-h-[min(32rem,60vh)] overflow-auto pr-3">
          <ConversationContent className="grid gap-3 p-0 pb-1">
            {detail.messages.map((message) => {
              const isOwner = message.sender === 'owner'
              const senderLabel = isOwner ? 'Owner' : 'Customer'
              const sender = isOwner ? 'user' : 'assistant'
              return (
                <Message key={message.messageId} from={sender} className="grid max-w-full gap-2">
                  <div className="flex items-start gap-2">
                    <Avatar size="sm" aria-label={senderLabel}>
                      <AvatarFallback>{senderLabel.slice(0, 1)}</AvatarFallback>
                    </Avatar>
                    <div className="grid min-w-0 gap-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-sm font-medium text-foreground">{senderLabel}</span>
                        <span className="text-xs text-muted-foreground">
                          <time dateTime={timestampIso(message.createdAt)} data-numeric>
                            {formatTimestamp(message.createdAt)}
                          </time>
                        </span>
                      </div>
                      <MessageContent className="rounded-md border border-border bg-card px-3 py-2 text-foreground">
                        {message.body}
                      </MessageContent>
                    </div>
                  </div>
                </Message>
              )
            })}
          </ConversationContent>
        </Conversation>
        {detail.inquiry.status === 'closed' ? (
          <>
            <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <span className="h-px flex-1 bg-border" aria-hidden="true" />
              <span>Thread closed</span>
              <span className="h-px flex-1 bg-border" aria-hidden="true" />
            </div>
            <Button asChild variant="secondary" size="sm" className="justify-self-start"><a href="/owner/inquiries">Back to inbox</a></Button>
          </>
        ) : null}
        <AeOperatorFactGrid
          facts={[
            { label: 'Status', value: detail.inquiry.status },
            { label: 'Messages', value: String(detail.inquiry.messageCount) },
            { label: 'Updated', value: formatTimestamp(detail.inquiry.updatedAt) },
          ]}
        />
      </div>
    </Card>
  )
}

function OwnerReplyControls({
  body,
  canClose,
  canMarkRead,
  canReply,
  pendingAction,
  replyAttempted,
  replyFieldRef,
  onBodyChange,
  onClose,
  onMarkRead,
  onReply,
}: {
  body: string
  canClose: boolean
  canMarkRead: boolean
  canReply: boolean
  pendingAction: 'read' | 'reply' | 'close' | undefined
  replyAttempted: boolean
  replyFieldRef: RefObject<HTMLTextAreaElement | null>
  onBodyChange: (value: string) => void
  onClose: () => Promise<boolean>
  onMarkRead: () => void
  onReply: () => void | Promise<void>
}) {
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false)
  const replyInvalid = replyAttempted && body.trim().length === 0

  async function handleCloseConfirm() {
    const closed = await onClose()
    if (closed) {
      setCloseConfirmOpen(false)
    }
  }

  function submitReply() {
    void onReply()
  }

  return (
    <Card className="p-3">
      <div className="grid gap-1.5">
        <h2 className="text-lg font-semibold text-foreground">Owner controls</h2>
        <p className="text-sm text-muted-foreground">
          Replies notify the customer through the saved contact path. They do not confirm booking, payment, or dispatch.
        </p>
      </div>
      <div className="mt-4">
        <div className="grid gap-4">
          <AeOwnerReplyComposer
            value={body}
            invalid={replyInvalid}
            disabled={!canReply || pendingAction !== undefined}
            pending={pendingAction === 'reply'}
            textareaRef={replyFieldRef}
            onChange={onBodyChange}
            onSubmit={submitReply}
          />
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="secondary"
              disabled={!canMarkRead || pendingAction !== undefined}
              onClick={onMarkRead}
            >
              {pendingAction === 'read' ? <Spinner data-icon="inline-start" /> : <CircleCheckIcon data-icon="inline-start" aria-hidden="true" />}
              Mark read
            </Button>
            <Button
              type="button"
              disabled={!canReply || pendingAction !== undefined}
              onClick={() => void onReply()}
            >
              {pendingAction === 'reply' ? <Spinner data-icon="inline-start" /> : null}
              Reply
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={!canClose || pendingAction !== undefined}
              onClick={() => setCloseConfirmOpen(true)}
            >
              {pendingAction === 'close' ? <Spinner data-icon="inline-start" /> : <CircleCheckIcon data-icon="inline-start" aria-hidden="true" />}
              Close inquiry
            </Button>
          </div>
        </div>
        <AeConfirmDialog
          open={closeConfirmOpen}
          onOpenChange={setCloseConfirmOpen}
          title="Close this inquiry?"
          description="Nothing is deleted. The thread stays visible for reference, but it won't accept further replies or read-state updates after this."
          confirmLabel="Close inquiry"
          pending={pendingAction === 'close'}
          onConfirm={handleCloseConfirm}
        />
      </div>
    </Card>
  )
}

function DeliveryReadback({ notifications }: { notifications: readonly OwnerInboxNotificationProjection[] }) {
  return (
    <Card className="p-3">
      <div className="grid gap-1.5">
        <h2 className="text-lg font-semibold text-foreground">Delivery status</h2>
        <p className="text-sm text-muted-foreground">
          Notification state never replaces the saved inquiry message.
        </p>
      </div>
      <div className="mt-4 grid gap-3">
        {notifications.length === 0 ? (
          <p className="text-sm text-muted-foreground">No delivery status recorded.</p>
        ) : (
          notifications.map((notification) => (
            <div key={notification.notificationId} className="grid gap-2 rounded-lg bg-muted/40 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={notificationVariant(notification.status)}>{notification.label}</Badge>
                <span className="text-xs text-muted-foreground">{notification.recipientRole}</span>
              </div>
              <AeOperatorFactGrid
                columns={2}
                facts={[
                  { label: 'Updated', value: formatTimestamp(notification.updatedAt) },
                  { label: 'Failure', value: notification.failureCode ?? 'none' },
                ]}
              />
            </div>
          ))
        )}
      </div>
    </Card>
  )
}

function InquiryNextStep({ detail }: { detail: OwnerInquiryDetailReadback }) {
  return (
    <Card className="p-3">
      <div className="grid gap-1.5">
        <h2 className="text-lg font-semibold text-foreground">Next step</h2>
        <p className="text-sm text-muted-foreground">{nextStepCopy(detail)}</p>
      </div>
    </Card>
  )
}

function nextStepCopy(detail: OwnerInquiryDetailReadback): string {
  if (detail.inquiry.notificationStatus === 'failed' || detail.inquiry.notificationStatus === 'held') {
    return 'Review delivery status before relying on customer notification, while keeping the saved message visible here.'
  }

  switch (detail.inquiry.status) {
    case 'unread':
      return 'Read the customer message, then reply or mark it read for owner follow-up.'
    case 'read':
      return 'Reply when the owner has enough detail, or close if no further follow-up is needed.'
    case 'replied':
      return 'Close the thread when the customer follow-up is complete.'
    case 'closed':
      return 'This thread is closed and remains available for reference.'
  }
}

function notificationVariant(status: InquiryNotificationStatus): 'outline' | 'secondary' | 'destructive' {
  switch (status) {
    case 'queued':
      return 'outline'
    case 'sent':
      return 'secondary'
    case 'failed':
    case 'held':
      return 'destructive'
  }
}

function usesLocalE2eBrowser(): boolean {
  return import.meta.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E === 'true'
}
