import { useRef } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type AeConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  cancelLabel?: string
  confirmVariant?: 'default' | 'destructive'
  pending?: boolean
  onConfirm: () => void | Promise<void>
}

export function AeConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  confirmVariant = 'default',
  pending = false,
  onConfirm,
}: AeConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)

  function handleOpenChange(nextOpen: boolean) {
    if (pending && !nextOpen) {
      return
    }

    onOpenChange(nextOpen)
  }

  async function handleConfirm() {
    if (pending) {
      return
    }
    await onConfirm()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        role="alertdialog"
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          const activeElement = document.activeElement
          openerRef.current = activeElement instanceof HTMLElement ? activeElement : null
          cancelRef.current?.focus()
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          openerRef.current?.focus()
          openerRef.current = null
        }}
        onEscapeKeyDown={(event) => {
          if (pending) {
            event.preventDefault()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            ref={cancelRef}
            type="button"
            variant="outline"
            onClick={() => {
              if (!pending) {
                onOpenChange(false)
              }
            }}
          >
            {cancelLabel}
          </Button>
          <Button type="button" variant={confirmVariant} disabled={pending} onClick={() => void handleConfirm()}>
            {pending ? 'Working…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
