import { Field as BaseField } from '@base-ui/react/field'

import { AeConfirmDialog } from '@/components/ae/feedback/AeConfirmDialog'
import { TACTILE } from '@/components/ae/settings/OwnerNotificationSettings'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

import type { WorkspaceTransferPanelProps } from '../workspace-danger-zone.contracts'
import { WorkspaceDangerDiagnosticSlot } from './WorkspaceDangerDiagnosticSlot'

const OWNER_ONLY_COPY = 'Only the workspace owner can close the workspace or transfer ownership.'

const SELECT_CLASS = `rounded-md border border-input bg-background px-3 py-2 ${TACTILE}`

export function WorkspaceTransferPanel({
  callerIsOwner,
  transferCandidates,
  selectedSuccessor,
  successorName,
  transferDisabled,
  transferDiagnostic,
  showTransferConfirmDialog,
  transferPending,
  onSuccessorChange,
  onRequestTransfer,
  onTransferDialogOpenChange,
  onConfirmTransfer,
}: WorkspaceTransferPanelProps) {
  return (
    <section className="grid gap-4">
      <h2 className="text-lg font-semibold tracking-tight">Transfer ownership</h2>
      {!callerIsOwner ? (
        <p className="text-muted-foreground text-sm">{OWNER_ONLY_COPY}</p>
      ) : (
        <>
          <BaseField.Root className="grid gap-2 text-sm">
            <Label>New workspace owner</Label>
            <select
              aria-label="New workspace owner"
              value={selectedSuccessor}
              onChange={(event) => {
                onSuccessorChange(event.target.value)
              }}
              className={SELECT_CLASS}
            >
              {transferCandidates.map((candidate) => (
                <option key={candidate.principalRef} value={candidate.principalRef}>
                  {candidate.displayName}
                </option>
              ))}
            </select>
          </BaseField.Root>
          <Button
            type="button"
            variant="outline"
            className={cn('w-fit', TACTILE)}
            disabled={transferDisabled}
            onClick={onRequestTransfer}
          >
            Transfer ownership
          </Button>
          <WorkspaceDangerDiagnosticSlot diagnostic={transferDiagnostic} />
          <AeConfirmDialog
            open={showTransferConfirmDialog}
            onOpenChange={onTransferDialogOpenChange}
            title="Transfer workspace ownership?"
            description={`Are you sure you want to transfer ownership to ${successorName}? A$0.00 moved — ownership changes, balances and Calls stay on this workspace. You will remain an active member.`}
            confirmLabel="Transfer ownership"
            pending={transferPending}
            onConfirm={onConfirmTransfer}
          />
        </>
      )}
    </section>
  )
}
