import { makeFunctionReference } from 'convex/server'
import { useMutation, useQuery } from 'convex/react'
import { useMemo, useState } from 'react'

import { AeConfirmDialog } from '@/components/ae/feedback/AeConfirmDialog'

export type WorkspaceDecommissionEligibilityView = Readonly<{
  accountRef: string
  displayName: string
  accountRevision: number
  ownershipRevision: number
  callerIsOwner: boolean
  canClose: boolean
  canTransfer: boolean
  fences: readonly (
    | 'unsettled_provider_obligations'
    | 'unwithdrawn_earnings'
    | 'open_calls'
    | 'unreleased_call_holds'
    | 'in_flight_funding'
    | 'open_reconciliation'
  )[]
  transferCandidates: readonly Readonly<{
    principalRef: string
    displayName: string
    membershipRef: string
  }>[]
}>

const FENCE_LABELS: Record<WorkspaceDecommissionEligibilityView['fences'][number], string> = {
  unsettled_provider_obligations: 'Unsettled provider obligations',
  unwithdrawn_earnings: 'Unwithdrawn earnings',
  open_calls: 'Open calls',
  unreleased_call_holds: 'Unreleased call holds',
  in_flight_funding: 'In-flight funding',
  open_reconciliation: 'Open reconciliation',
}

function correlationRef(label: string): string {
  return `ui:workspace-danger:${label}`
}

function idempotencyRef(label: string): string {
  return `idem:workspace-danger:${label}`
}

const readWorkspaceDecommissionEligibilityRef = makeFunctionReference<
  'query',
  Record<string, never>,
  WorkspaceDecommissionEligibilityView
>('workspaceAccounts:readWorkspaceDecommissionEligibility')

const closeWorkspaceRef = makeFunctionReference<
  'mutation',
  Readonly<{
    confirmationName: string
    expectedAccountRevision: number
    expectedOwnershipRevision: number
    correlationRef: string
    idempotencyRef: string
    factorEvidence: { firstFactorAgeMinutes: number; secondFactorAgeMinutes: number }
  }>,
  unknown
>('workspaceAccounts:closeWorkspace')

const transferWorkspaceOwnershipRef = makeFunctionReference<
  'mutation',
  Readonly<{
    successorPrincipalRef: string
    expectedAccountRevision: number
    expectedOwnershipRevision: number
    correlationRef: string
    idempotencyRef: string
    factorEvidence: { firstFactorAgeMinutes: number; secondFactorAgeMinutes: number }
  }>,
  unknown
>('workspaceAccounts:transferWorkspaceOwnership')

export function WorkspaceDangerZone() {
  const eligibility = useQuery(readWorkspaceDecommissionEligibilityRef)
  const closeWorkspaceMutation = useMutation(closeWorkspaceRef)
  const transferOwnershipMutation = useMutation(transferWorkspaceOwnershipRef)

  const [confirmationName, setConfirmationName] = useState('')
  const [successorPrincipalRef, setSuccessorPrincipalRef] = useState('')
  const [showCloseConfirmDialog, setShowCloseConfirmDialog] = useState(false)

  const fenceLabels = useMemo(() => {
    if (eligibility === undefined) return []
    return eligibility.fences.map((fence) => FENCE_LABELS[fence])
  }, [eligibility])

  if (eligibility === undefined) {
    return null
  }

  const closeDisabled = eligibility.fences.length > 0
    || confirmationName !== eligibility.displayName

  const selectedSuccessor = successorPrincipalRef.length > 0
    ? successorPrincipalRef
    : eligibility.transferCandidates[0]?.principalRef ?? ''

  return (
    <div className="grid gap-section">
      <section className="grid gap-4">
        <h2 className="text-lg font-semibold tracking-tight">Close workspace</h2>
        {!eligibility.callerIsOwner ? (
          <p className="text-muted-foreground text-sm">
            Only the workspace owner can close the workspace or transfer ownership.
          </p>
        ) : (
          <>
            {fenceLabels.length > 0 && (
              <ul className="list-disc pl-5 text-sm">
                {fenceLabels.map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ul>
            )}
            <label className="grid gap-2 text-sm">
              Type workspace name to confirm
              <input
                type="text"
                aria-label="Type workspace name to confirm"
                value={confirmationName}
                onChange={(event) => setConfirmationName(event.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2"
              />
            </label>
            <button
              type="button"
              disabled={closeDisabled}
              className="inline-flex w-fit rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground disabled:opacity-50"
              onClick={() => {
                setShowCloseConfirmDialog(true)
              }}
            >
              Close workspace
            </button>
            <AeConfirmDialog
              open={showCloseConfirmDialog}
              onOpenChange={setShowCloseConfirmDialog}
              title="Close Workspace?"
              description={`Are you sure you want to permanently close "${eligibility.displayName}"? All tools, API keys, and active delegations will be immediately terminated.`}
              confirmLabel="Permanently Close Workspace"
              confirmVariant="destructive"
              onConfirm={async () => {
                await closeWorkspaceMutation({
                  confirmationName,
                  expectedAccountRevision: eligibility.accountRevision,
                  expectedOwnershipRevision: eligibility.ownershipRevision,
                  correlationRef: correlationRef('close'),
                  idempotencyRef: idempotencyRef(`close:${Date.now()}`),
                  factorEvidence: { firstFactorAgeMinutes: 1, secondFactorAgeMinutes: 1 },
                })
                setShowCloseConfirmDialog(false)
              }}
            />
          </>
        )}
      </section>

      <section className="grid gap-4">
        <h2 className="text-lg font-semibold tracking-tight">Transfer ownership</h2>
        {eligibility.callerIsOwner && (
          <>
            <label className="grid gap-2 text-sm">
              New workspace owner
              <select
                aria-label="New workspace owner"
                value={selectedSuccessor}
                onChange={(event) => setSuccessorPrincipalRef(event.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2"
              >
                {eligibility.transferCandidates.map((candidate) => (
                  <option key={candidate.principalRef} value={candidate.principalRef}>
                    {candidate.displayName}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="inline-flex w-fit rounded-md border border-input px-4 py-2 text-sm font-medium"
              disabled={eligibility.transferCandidates.length === 0 || selectedSuccessor.length === 0}
              onClick={() => {
                void transferOwnershipMutation({
                  successorPrincipalRef: selectedSuccessor,
                  expectedAccountRevision: eligibility.accountRevision,
                  expectedOwnershipRevision: eligibility.ownershipRevision,
                  correlationRef: correlationRef('transfer'),
                  idempotencyRef: idempotencyRef(`transfer:${Date.now()}`),
                  factorEvidence: { firstFactorAgeMinutes: 1, secondFactorAgeMinutes: 1 },
                })
              }}
            >
              Transfer ownership
            </button>
          </>
        )}
      </section>
    </div>
  )
}
