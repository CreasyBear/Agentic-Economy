import { Field as BaseField } from '@base-ui/react/field'
import { Link } from '@tanstack/react-router'

import { AeConfirmDialog } from '@/components/ae/feedback/AeConfirmDialog'
import { TACTILE } from '@/components/ae/settings/OwnerNotificationSettings'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

import type { WorkspaceTransferPanelProps } from '../workspace-danger-zone.contracts'
import { WorkspaceDangerDiagnosticSlot } from './WorkspaceDangerDiagnosticSlot'

const OWNER_ONLY_COPY = 'Only the workspace owner can close the workspace or transfer ownership.'

const SELECT_CLASS = `rounded-md border border-input bg-background px-3 py-2 ${TACTILE}`

const SUMMARY_CLASS =
  'font-sans text-base font-medium leading-snug tracking-tight text-foreground cursor-pointer'

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
      <details>
        <summary className={SUMMARY_CLASS}>Transfer ownership</summary>
        {callerIsOwner ? (
          <div className="mt-4 grid gap-4">
            {transferCandidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nobody else can receive ownership. <Link to="/owner/team" className="underline underline-offset-4">Invite someone from Team.</Link>
              </p>
            ) : (
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
            )}
            {transferCandidates.length === 0 ? null : (
            <Button
              type="button"
              variant="outline"
              className={cn('w-fit', TACTILE)}
              disabled={transferDisabled}
              onClick={onRequestTransfer}
            >
              Transfer ownership
            </Button>
            )}
            <WorkspaceDangerDiagnosticSlot diagnostic={transferDiagnostic} />
            <AeConfirmDialog
              open={showTransferConfirmDialog}
              onOpenChange={onTransferDialogOpenChange}
              title="Transfer workspace ownership?"
              description={`Transfer ownership to ${successorName}. You stay a member. Balances and Calls stay on this workspace.`}
              confirmLabel="Transfer ownership"
              pending={transferPending}
              onConfirm={onConfirmTransfer}
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
