import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { CircleCheckIcon, SendIcon } from 'lucide-react'

import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
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
  type OwnerInboxMessageProjection,
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

export const Route = createFileRoute('/owner/inquiries/$threadId')({
  loader: ({ params }) => readOwnerThreadServer({ data: { threadId: params.threadId } }),
  head: () => ({
    meta: [
      { title: 'Owner inquiry detail | Agentic Economy' },
      { name: 'description', content: 'Owner inquiry detail, reply controls, and delivery readback from source state.' },
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
  const markReadInquiry = useServerFn(markReadOwnerThreadServer)
  const replyInquiry = useServerFn(replyOwnerThreadServer)
  const closeInquiry = useServerFn(closeOwnerThreadServer)
  const [hydrated, setHydrated] = useState(false)
  const [replyBody, setReplyBody] = useState('')
  const [pendingAction, setPendingAction] = useState<'read' | 'reply' | 'close' | undefined>()
  const [actionMessage, setActionMessage] = useState<string | undefined>()
  const [actionError, setActionError] = useState<string | undefined>()
  const replyFieldRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setHydrated(true)
  }, [])

  async function handleMarkRead() {
    setActionMessage(undefined)
    setActionError(undefined)

    if (readback.kind !== 'available') {
      return
    }

    if (usesLocalE2eBrowser()) {
      setActionMessage(`Read state recorded. Thread is now ${readback.detail.inquiry.status}.`)
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
        setActionMessage(`Read state recorded. Thread is now ${result.thread.status}.`)
        return
      }

      setActionError(result.reason)
    } finally {
      setPendingAction(undefined)
    }
  }

  async function handleReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setActionMessage(undefined)
    setActionError(undefined)

    if (readback.kind !== 'available') {
      return
    }

    const body = replyBody.trim().replace(/\s+/g, ' ')
    if (body.length === 0) {
      setActionError('Reply body is required.')
      requestAnimationFrame(() => replyFieldRef.current?.focus())
      return
    }

    if (usesLocalE2eBrowser()) {
      setActionMessage('Reply recorded. Thread is now replied.')
      setReplyBody('')
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
        setActionMessage(`Reply recorded. Thread is now ${result.thread.status}.`)
        setReplyBody('')
        return
      }

      setActionError(result.reason)
    } finally {
      setPendingAction(undefined)
    }
  }

  async function handleClose() {
    setActionMessage(undefined)
    setActionError(undefined)

    if (readback.kind !== 'available') {
      return
    }

    if (usesLocalE2eBrowser()) {
      setActionMessage('Close recorded. Thread is now closed.')
      return
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
        setActionMessage(`Close recorded. Thread is now ${result.thread.status}.`)
        return
      }

      setActionError(result.reason)
    } finally {
      setPendingAction(undefined)
    }
  }

  if (readback.kind === 'not_found') {
    return (
      <AePublicShell>
        <section className="mx-auto w-full max-w-6xl px-4 py-16 md:px-6">
          <AeEmptyState
            title="Inquiry unavailable"
            description={readback.reason}
            action={
              <Button asChild>
                <a href="/owner/inquiries">Back to inbox</a>
              </Button>
            }
          />
        </section>
      </AePublicShell>
    )
  }

  return (
    <AePublicShell>
      <AePageHeader
        eyebrow={readback.detail.inquiry.businessName}
        title={readback.detail.inquiry.serviceName}
        description="Owner inquiry detail is reconstructed from source-owned messages, delivery state, and privacy tombstones."
      />
      <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-16 md:grid-cols-[minmax(0,1fr)_340px] md:px-6">
        <div className="grid gap-6">
          {actionMessage === undefined ? null : (
            <Alert>
              <AlertTitle>Owner action recorded</AlertTitle>
              <AlertDescription>{actionMessage}</AlertDescription>
            </Alert>
          )}
          {actionError === undefined ? null : (
            <Alert variant="destructive">
              <AlertTitle>Owner action needs attention</AlertTitle>
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          )}
          <ThreadMessages detail={readback.detail} />
          <OwnerReplyControls
            body={replyBody}
            canClose={hydrated && readback.canClose}
            canMarkRead={hydrated && readback.canMarkRead}
            canReply={hydrated && readback.canReply}
            pendingAction={pendingAction}
            replyFieldRef={replyFieldRef}
            onBodyChange={setReplyBody}
            onClose={handleClose}
            onMarkRead={handleMarkRead}
            onReply={handleReply}
          />
        </div>
        <aside className="grid content-start gap-4">
          <DeliveryReadback notifications={readback.notifications} />
          <PrivacyReadback tombstones={readback.tombstones} />
        </aside>
      </section>
    </AePublicShell>
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

function ThreadMessages({ detail }: { detail: OwnerInquiryDetailReadback }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={detail.inquiry.bucket === 'resolved' ? 'secondary' : 'default'}>{detail.inquiry.bucket.replace('_', ' ')}</Badge>
          <Badge variant={notificationVariant(detail.inquiry.notificationStatus)}>{detail.inquiry.notificationLabel}</Badge>
        </div>
        <CardTitle>Thread messages</CardTitle>
        <CardDescription>{detail.inquiry.preview}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3">
          {detail.messages.map((message) => (
            <MessageBlock key={message.messageId} message={message} />
          ))}
        </div>
        <FactList
          facts={[
            { label: 'Status', value: detail.inquiry.status },
            { label: 'Messages', value: String(detail.inquiry.messageCount) },
            { label: 'Version', value: String(detail.inquiry.version) },
            { label: 'Updated', value: new Date(detail.inquiry.updatedAt).toISOString() },
          ]}
        />
      </CardContent>
    </Card>
  )
}

function MessageBlock({ message }: { message: OwnerInboxMessageProjection }) {
  return (
    <div className="grid gap-2 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge variant={message.sender === 'owner' ? 'secondary' : 'outline'}>{message.sender}</Badge>
        <span className="text-xs text-muted-foreground">{new Date(message.createdAt).toISOString()}</span>
      </div>
      <p className="break-words text-sm text-foreground">{message.body}</p>
    </div>
  )
}

function OwnerReplyControls({
  body,
  canClose,
  canMarkRead,
  canReply,
  pendingAction,
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
  replyFieldRef: RefObject<HTMLTextAreaElement | null>
  onBodyChange: (value: string) => void
  onClose: () => void
  onMarkRead: () => void
  onReply: (event: FormEvent<HTMLFormElement>) => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Owner controls</CardTitle>
        <CardDescription>Replies and close state write back to the inquiry source state.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onReply} className="grid gap-4" noValidate>
          <FieldGroup>
            <Field data-invalid={body.trim().length === 0 && pendingAction === 'reply' ? true : undefined}>
              <FieldLabel htmlFor="ownerReply">Owner reply</FieldLabel>
              <Textarea
                id="ownerReply"
                name="ownerReply"
                ref={replyFieldRef}
                value={body}
                disabled={!canReply || pendingAction !== undefined}
                onChange={(event) => onBodyChange(event.currentTarget.value)}
              />
              <FieldDescription>This message is private to the inquiry thread and the customer notification path.</FieldDescription>
              {body.trim().length === 0 && pendingAction === 'reply' ? <FieldError>Reply body is required.</FieldError> : null}
            </Field>
          </FieldGroup>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="secondary" disabled={!canMarkRead || pendingAction !== undefined} onClick={onMarkRead}>
              {pendingAction === 'read' ? <Spinner data-icon="inline-start" /> : <CircleCheckIcon data-icon="inline-start" />}
              Mark read
            </Button>
            <Button type="submit" disabled={!canReply || pendingAction !== undefined}>
              {pendingAction === 'reply' ? <Spinner data-icon="inline-start" /> : <SendIcon data-icon="inline-start" />}
              Reply
            </Button>
            <Button type="button" variant="outline" disabled={!canClose || pendingAction !== undefined} onClick={onClose}>
              {pendingAction === 'close' ? <Spinner data-icon="inline-start" /> : <CircleCheckIcon data-icon="inline-start" />}
              Close inquiry
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function DeliveryReadback({ notifications }: { notifications: readonly OwnerInboxNotificationProjection[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Delivery readback</CardTitle>
        <CardDescription>Notification state never replaces the saved inquiry message.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {notifications.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notification readback recorded.</p>
        ) : (
          notifications.map((notification) => (
            <div key={notification.notificationId} className="grid gap-2 rounded-lg bg-muted/40 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={notificationVariant(notification.status)}>{notification.label}</Badge>
                <span className="text-xs text-muted-foreground">{notification.recipientRole}</span>
              </div>
              <FactList
                facts={[
                  { label: 'Updated', value: new Date(notification.updatedAt).toISOString() },
                  { label: 'Failure', value: notification.failureCode ?? 'none' },
                ]}
              />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

function PrivacyReadback({ tombstones }: { tombstones: readonly InquiryPrivacyTombstoneRecord[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Privacy readback</CardTitle>
        <CardDescription>Private-content deletion is shown as tombstone state.</CardDescription>
      </CardHeader>
      <CardContent>
        {tombstones.length === 0 ? (
          <p className="text-sm text-muted-foreground">No private-content tombstone recorded.</p>
        ) : (
          <FactList
            facts={tombstones.flatMap((tombstone) => [
              { label: 'Status', value: tombstone.status },
              { label: 'Reason', value: tombstone.reasonCode },
              { label: 'Applied', value: tombstone.appliedAt === undefined ? 'not applied' : new Date(tombstone.appliedAt).toISOString() },
            ])}
          />
        )}
      </CardContent>
    </Card>
  )
}

function FactList({ facts }: { facts: readonly { label: string; value: string }[] }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {facts.map((fact) => (
        <div key={`${fact.label}:${fact.value}`} className="rounded-lg bg-muted/40 p-3">
          <dt className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{fact.label}</dt>
          <dd className="mt-1 break-words text-sm text-foreground">{fact.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function notificationVariant(status: InquiryNotificationStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'queued':
      return 'outline'
    case 'sent':
      return 'secondary'
    case 'failed':
      return 'destructive'
    case 'held':
      return 'outline'
  }
}

function usesLocalE2eBrowser(): boolean {
  return import.meta.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E === 'true'
}
