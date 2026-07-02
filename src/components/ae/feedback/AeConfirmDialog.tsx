import type { MouseEvent, ReactNode } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Spinner } from '@/components/ui/spinner'

type AeConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: ReactNode
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
  const destructive = confirmVariant === 'destructive'

  function handleOpenChange(nextOpen: boolean) {
    if (pending && !nextOpen) {
      return
    }

    onOpenChange(nextOpen)
  }

  async function handleConfirm(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    await onConfirm()
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent
        aria-busy={pending || undefined}
        data-destructive={destructive ? true : undefined}
        data-pending={pending ? true : undefined}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            {description}
            {destructive ? <span className="sr-only"> Destructive action.</span> : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <span className="sr-only" role="status" aria-live="polite">
            {pending ? 'Action in progress.' : ''}
          </span>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            variant={confirmVariant}
            disabled={pending}
            aria-busy={pending || undefined}
            onClick={handleConfirm}
          >
            {pending ? <Spinner data-icon="inline-start" /> : null}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
