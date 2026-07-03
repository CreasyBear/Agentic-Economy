import { AlertDialog } from '@astryxdesign/core/AlertDialog'

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
  const actionVariant = confirmVariant === 'destructive' ? 'destructive' : 'primary'

  function handleOpenChange(nextOpen: boolean) {
    if (pending && !nextOpen) {
      return
    }

    onOpenChange(nextOpen)
  }

  async function handleConfirm() {
    await onConfirm()
  }

  return (
    <AlertDialog
      isOpen={open}
      onOpenChange={handleOpenChange}
      title={title}
      description={description}
      cancelLabel={cancelLabel}
      actionLabel={confirmLabel}
      actionVariant={actionVariant}
      isActionLoading={pending}
      onAction={handleConfirm}
    />
  )
}
