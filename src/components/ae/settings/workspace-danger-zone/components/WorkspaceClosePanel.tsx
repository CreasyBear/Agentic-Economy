import { Field as BaseField } from '@base-ui/react/field'

import { AeConfirmDialog } from '@/components/ae/feedback/AeConfirmDialog'
import { Button } from '@/components/arc/button/button'
import { Label } from '@/components/ui/label'

import type { WorkspaceClosePanelProps } from '../workspace-danger-zone.contracts'
import { DecommissionFenceList } from './DecommissionFenceList'
import '../WorkspaceDangerComposition.css'

const OWNER_ONLY_COPY = 'Only the workspace owner can close the workspace or transfer ownership.'

export function WorkspaceClosePanel({
  callerIsOwner,
  fencesPresent,
  fenceMessages,
  fenceDestinations,
  displayName,
  confirmationName,
  closeDisabled,
  closeDiagnostic,
  showCloseConfirmDialog,
  closePending,
  closeAttemptUnconfirmed = false,
  onConfirmationNameChange,
  onRequestClose,
  onCloseDialogOpenChange,
  onConfirmClose,
}: WorkspaceClosePanelProps) {
  return (
    <section className="arc-market arc-workspace-danger-region">
      <details>
        <summary className="arc-workspace-danger-summary">Close workspace</summary>
        {callerIsOwner ? (
          <div className="arc-workspace-danger-body">
            {fencesPresent ? (
              <DecommissionFenceList fenceMessages={fenceMessages} {...(fenceDestinations === undefined ? {} : { fenceDestinations })} />
            ) : (
              <p className="arc-workspace-danger-description">
                Close is allowed. Confirming it ends this workspace.
              </p>
            )}
            <BaseField.Root className="arc-workspace-danger-field">
              <Label>Type the workspace name to confirm</Label>
              <div className="arc-workspace-danger-confirmation">
                <input
                  className="arc-workspace-danger-input"
                  type="text"
                  aria-label="Type workspace name to confirm"
                  disabled={closePending || closeAttemptUnconfirmed}
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
              variant="danger"
              size="md"
              disabled={closeDisabled}
              className="arc-workspace-danger-action"
              onClick={onRequestClose}
            >
              {closeAttemptUnconfirmed ? 'Check close attempt' : 'Close workspace'}
            </Button>
            <AeConfirmDialog
              open={showCloseConfirmDialog}
              onOpenChange={onCloseDialogOpenChange}
              title={closeAttemptUnconfirmed ? 'Check this close attempt?' : 'Close workspace?'}
              description={`Permanently close ${displayName}. Tools, access keys, and delegations on this workspace stop.`}
              confirmLabel={closeAttemptUnconfirmed ? 'Check same close attempt' : 'Permanently close workspace'}
              confirmVariant="destructive"
              pending={closePending}
              diagnostic={closeDiagnostic}
              onConfirm={onConfirmClose}
            />
          </div>
        ) : null}
      </details>
      {!callerIsOwner ? (
        <p className="arc-workspace-danger-description">{OWNER_ONLY_COPY}</p>
      ) : null}
    </section>
  )
}
