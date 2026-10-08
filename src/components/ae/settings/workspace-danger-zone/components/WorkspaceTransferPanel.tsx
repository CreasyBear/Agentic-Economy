import { Field as BaseField } from '@base-ui/react/field'
import { Link } from '@tanstack/react-router'

import { AeConfirmDialog } from '@/components/ae/feedback/AeConfirmDialog'
import { Button } from '@/components/arc/button/button'
import { Label } from '@/components/ui/label'

import type { WorkspaceTransferPanelProps } from '../workspace-danger-zone.contracts'
import { WorkspaceDangerDiagnosticSlot } from './WorkspaceDangerDiagnosticSlot'
import '../WorkspaceDangerComposition.css'

const OWNER_ONLY_COPY = 'Only the workspace owner can close the workspace or transfer ownership.'

export function WorkspaceTransferPanel({
  callerIsOwner,
  transferCandidates,
  selectedSuccessor,
  successorName,
  transferDisabled,
  transferDiagnostic,
  showTransferConfirmDialog,
  transferPending,
  transferAttemptUnconfirmed = false,
  onSuccessorChange,
  onRequestTransfer,
  onTransferDialogOpenChange,
  onConfirmTransfer,
}: WorkspaceTransferPanelProps) {
  return (
    <section className="arc-market arc-workspace-danger-region">
      <details>
        <summary className="arc-workspace-danger-summary">Transfer ownership</summary>
        {callerIsOwner ? (
          <div className="arc-workspace-danger-body">
            {transferCandidates.length === 0 ? (
              <p className="arc-workspace-danger-description">
                Nobody else can receive ownership. <Link to="/owner/settings/team" search={{ purpose: 'transfer' }} className="underline underline-offset-4">Invite someone from Team.</Link>
              </p>
            ) : (
            <BaseField.Root className="arc-workspace-danger-field">
              <Label>New workspace owner</Label>
              <select
                aria-label="New workspace owner"
                disabled={transferPending || transferAttemptUnconfirmed}
                value={selectedSuccessor}
                onChange={(event) => {
                  onSuccessorChange(event.target.value)
                }}
                className="arc-workspace-danger-select"
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
              variant="secondary"
              size="md"
              className="arc-workspace-danger-action"
              disabled={transferDisabled}
              onClick={onRequestTransfer}
            >
              {transferAttemptUnconfirmed ? 'Check transfer attempt' : 'Transfer ownership'}
            </Button>
            )}
            <WorkspaceDangerDiagnosticSlot diagnostic={transferDiagnostic} />
            <AeConfirmDialog
              open={showTransferConfirmDialog}
              onOpenChange={onTransferDialogOpenChange}
              title={transferAttemptUnconfirmed ? 'Check this ownership transfer?' : 'Transfer workspace ownership?'}
              description={`Transfer ownership to ${successorName}. You stay a member. Balances and Calls stay on this workspace.`}
              confirmLabel={transferAttemptUnconfirmed ? 'Check same transfer attempt' : 'Transfer ownership'}
              pending={transferPending}
              onConfirm={onConfirmTransfer}
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
