import { Field as BaseField } from '@base-ui/react/field'

import { AeConfirmDialog } from '@/components/ae/feedback/AeConfirmDialog'
import { TACTILE } from '@/components/ae/settings/OwnerNotificationSettings'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

import type { WorkspaceClosePanelProps } from '../workspace-danger-zone.contracts'
import { DecommissionFenceList } from './DecommissionFenceList'
import { WorkspaceDangerDiagnosticSlot } from './WorkspaceDangerDiagnosticSlot'

const OWNER_ONLY_COPY = 'Only the workspace owner can close the workspace or transfer ownership.'

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
      <h2 className="text-lg font-semibold tracking-tight">Close workspace</h2>
      {!callerIsOwner ? (
        <p className="text-muted-foreground text-sm">{OWNER_ONLY_COPY}</p>
      ) : (
        <>
          {fencesPresent ? (
            <DecommissionFenceList fenceMessages={fenceMessages} />
          ) : (
            <div className="grid gap-2">
              <Badge variant="secondary" className="font-mono tabular-nums">
                A$0.00 active obligations
              </Badge>
              <p className="text-muted-foreground text-sm">
                Close is allowed. This action does not move money until you confirm.
              </p>
            </div>
          )}
          <BaseField.Root className="grid gap-2 text-sm">
            <Label>Type workspace name to confirm</Label>
            <Input
              type="text"
              aria-label="Type workspace name to confirm"
              value={confirmationName}
              onChange={(event) => {
                onConfirmationNameChange(event.target.value)
              }}
            />
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
          <WorkspaceDangerDiagnosticSlot diagnostic={closeDiagnostic} />
          <AeConfirmDialog
            open={showCloseConfirmDialog}
            onOpenChange={onCloseDialogOpenChange}
            title="Close Workspace?"
            description={`Are you sure you want to permanently close "${displayName}"? All tools, API keys, and active delegations will be immediately terminated. A$0.00 moved by opening this dialog — prepaid credit is not spent until close succeeds.`}
            confirmLabel="Permanently Close Workspace"
            confirmVariant="destructive"
            pending={closePending}
            onConfirm={onConfirmClose}
          />
        </>
      )}
    </section>
  )
}
