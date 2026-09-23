import { Field as BaseField } from '@base-ui/react/field'

import { AeConfirmDialog } from '@/components/ae/feedback/AeConfirmDialog'
import { TACTILE } from '@/components/ae/settings/OwnerNotificationSettings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

import type { WorkspaceClosePanelProps } from '../workspace-danger-zone.contracts'
import { DecommissionFenceList } from './DecommissionFenceList'

const OWNER_ONLY_COPY = 'Only the workspace owner can close the workspace or transfer ownership.'

const SUMMARY_CLASS =
  'font-sans text-base font-medium leading-snug tracking-tight text-foreground cursor-pointer'

export function WorkspaceClosePanel({
  callerIsOwner,
  fencesPresent,
  fenceMessages,
  displayName,
  confirmationName,
  closeDisabled,
  closeDiagnostic,
  showCloseConfirmDialog,
  closePending,
  onConfirmationNameChange,
  onRequestClose,
  onCloseDialogOpenChange,
  onConfirmClose,
}: WorkspaceClosePanelProps) {
  return (
    <section className="grid gap-4">
      <details>
        <summary className={SUMMARY_CLASS}>Close workspace</summary>
        {callerIsOwner ? (
          <div className="mt-4 grid gap-4">
            {fencesPresent ? (
              <DecommissionFenceList fenceMessages={fenceMessages} />
            ) : (
              <p className="text-muted-foreground text-sm">
                Close is allowed. Confirming it ends this workspace.
              </p>
            )}
            <BaseField.Root className="grid gap-2 text-sm">
              <Label>Type the workspace name to confirm</Label>
              <div className="flex flex-wrap items-center gap-3">
                <Input
                  type="text"
                  aria-label="Type workspace name to confirm"
                  value={confirmationName}
                  onChange={(event) => {
                    onConfirmationNameChange(event.target.value)
                  }}
                />
                {displayName}
              </div>
            </BaseField.Root>
            <Button
              type="button"
              variant="destructive"
              disabled={closeDisabled}
              className={cn('w-fit', TACTILE)}
              onClick={onRequestClose}
            >
              Close workspace
            </Button>
            <AeConfirmDialog
              open={showCloseConfirmDialog}
              onOpenChange={onCloseDialogOpenChange}
              title="Close workspace?"
              description={`Permanently close ${displayName}. Tools, access keys, and delegations on this workspace stop.`}
              confirmLabel="Permanently close workspace"
              confirmVariant="destructive"
              pending={closePending}
              diagnostic={closeDiagnostic}
              onConfirm={onConfirmClose}
            />
          </div>
        ) : null}
      </details>
      {!callerIsOwner ? (
        <p className="text-muted-foreground text-sm">{OWNER_ONLY_COPY}</p>
      ) : null}
    </section>
  )
}
