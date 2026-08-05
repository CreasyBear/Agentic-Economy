import { useRef, useState, type RefObject } from 'react'
import { CircleCheckIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { AeConfirmDialog } from '@/components/ae/feedback/AeConfirmDialog'
import { AeOwnerReplyComposer } from './AeOwnerReplyComposer'

export function OwnerReplyControls({
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
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const replyInvalid = replyAttempted && body.trim().length === 0

  function handleCloseConfirmOpenChange(nextOpen: boolean) {
    setCloseConfirmOpen(nextOpen)
    if (!nextOpen) {
      window.setTimeout(() => closeButtonRef.current?.focus(), 0)
    }
  }

  async function handleCloseConfirm() {
    const closed = await onClose()
    if (closed) {
      handleCloseConfirmOpenChange(false)
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
              ref={closeButtonRef}
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
          onOpenChange={handleCloseConfirmOpenChange}
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
