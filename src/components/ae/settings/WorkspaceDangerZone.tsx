import { Field as BaseField } from '@base-ui/react/field'
import { makeFunctionReference } from 'convex/server'
import { useMutation, useQuery } from 'convex/react'
import { useMemo, useRef, useState } from 'react'

import { AeConfirmDialog } from '@/components/ae/feedback/AeConfirmDialog'
import { TACTILE } from '@/components/ae/settings/OwnerNotificationSettings'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/ui/toast'

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

const FENCE_MESSAGES: Record<WorkspaceDecommissionEligibilityView['fences'][number], string> = {
  unsettled_provider_obligations: 'Provider obligations are still unsettled.',
  unwithdrawn_earnings: 'Provider earnings have not been withdrawn.',
  open_calls: 'One or more Calls are still open.',
  unreleased_call_holds: 'Call holds have not been released.',
  in_flight_funding: 'A funding command is still in flight.',
  open_reconciliation: 'A reconciliation case is still open.',
}

type DiagnosticTriplet = Readonly<{
  whatHappened: string
  financialImpact: string
  nextStep: string
}>

const CLOSE_FAILURE_DIAGNOSTIC: DiagnosticTriplet = {
  whatHappened: 'Workspace close did not complete.',
  financialImpact: 'A$0.00 moved — prepaid credit and balances are unchanged.',
  nextStep: 'Resolve the listed blockers or try again in a moment.',
}

const TRANSFER_FAILURE_DIAGNOSTIC: DiagnosticTriplet = {
  whatHappened: 'Ownership transfer did not complete.',
  financialImpact: 'A$0.00 moved — balances and Calls stayed on this workspace.',
  nextStep: 'Confirm the successor is still an active member and try again.',
}

const OWNER_ONLY_COPY = 'Only the workspace owner can close the workspace or transfer ownership.'

const SELECT_CLASS = `rounded-md border border-input bg-background px-3 py-2 ${TACTILE}`

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

function DiagnosticSlot({ diagnostic }: Readonly<{ diagnostic: DiagnosticTriplet | null }>) {
  return (
    <div className="min-h-[2.5rem]" role="status" aria-live="polite">
      {diagnostic ? (
        <div className="grid gap-1 text-sm text-muted-foreground">
          <p>
            <strong>What happened:</strong> {diagnostic.whatHappened}
          </p>
          <p className="font-mono text-xs tabular-nums">
            <strong>Financial impact:</strong> {diagnostic.financialImpact}
          </p>
          <p>
            <strong>Next step:</strong> {diagnostic.nextStep}
          </p>
        </div>
      ) : null}
    </div>
  )
}

export function WorkspaceDangerZone() {
  const eligibility = useQuery(readWorkspaceDecommissionEligibilityRef)
  const closeWorkspaceMutation = useMutation(closeWorkspaceRef)
  const transferOwnershipMutation = useMutation(transferWorkspaceOwnershipRef)

  const [confirmationName, setConfirmationName] = useState('')
  const [successorPrincipalRef, setSuccessorPrincipalRef] = useState('')
  const [showCloseConfirmDialog, setShowCloseConfirmDialog] = useState(false)
  const [showTransferConfirmDialog, setShowTransferConfirmDialog] = useState(false)
  const [closePending, setClosePending] = useState(false)
  const [transferPending, setTransferPending] = useState(false)
  const [closeDiagnostic, setCloseDiagnostic] = useState<DiagnosticTriplet | null>(null)
  const [transferDiagnostic, setTransferDiagnostic] = useState<DiagnosticTriplet | null>(null)

  const closeAttemptIdempotencyRef = useRef<string | null>(null)
  const transferAttemptIdempotencyRef = useRef<string | null>(null)

  const fenceMessages = useMemo(() => {
    if (eligibility === undefined) return []
    return eligibility.fences.map((fence) => FENCE_MESSAGES[fence])
  }, [eligibility])

  if (eligibility === undefined) {
    return (
      <div className="grid min-h-[28rem] gap-section" aria-busy="true">
        <Skeleton className="min-h-[12rem] w-full" />
        <Skeleton className="min-h-[12rem] w-full" />
      </div>
    )
  }

  const closeDisabled = eligibility.fences.length > 0
    || confirmationName !== eligibility.displayName
    || closePending

  const selectedSuccessor = successorPrincipalRef.length > 0
    ? successorPrincipalRef
    : eligibility.transferCandidates[0]?.principalRef ?? ''

  const successorName =
    eligibility.transferCandidates.find((candidate) => candidate.principalRef === selectedSuccessor)
      ?.displayName
    ?? 'the selected member'

  const fencesPresent = eligibility.fences.length > 0

  return (
    <div className="grid gap-section">
      <section className="grid gap-4">
        <h2 className="text-lg font-semibold tracking-tight">Close workspace</h2>
        {!eligibility.callerIsOwner ? (
          <p className="text-muted-foreground text-sm">{OWNER_ONLY_COPY}</p>
        ) : (
          <>
            {fencesPresent ? (
              <div className="grid gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="destructive">Close blocked</Badge>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    A$0.00 moved — close is refused until these clear.
                  </span>
                </div>
                <ul className="list-disc pl-5 text-sm text-muted-foreground">
                  {fenceMessages.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </div>
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
                  setConfirmationName(event.target.value)
                  setCloseDiagnostic(null)
                }}
                className={cn(TACTILE)}
              />
            </BaseField.Root>
            <Button
              type="button"
              variant="destructive"
              disabled={closeDisabled}
              className={cn('w-fit', TACTILE)}
              onClick={() => {
                closeAttemptIdempotencyRef.current = idempotencyRef(`close:${crypto.randomUUID()}`)
                setCloseDiagnostic(null)
                setShowCloseConfirmDialog(true)
              }}
            >
              Close workspace
            </Button>
            <DiagnosticSlot diagnostic={closeDiagnostic} />
            <AeConfirmDialog
              open={showCloseConfirmDialog}
              onOpenChange={setShowCloseConfirmDialog}
              title="Close Workspace?"
              description={`Are you sure you want to permanently close "${eligibility.displayName}"? All tools, API keys, and active delegations will be immediately terminated. A$0.00 moved by opening this dialog — prepaid credit is not spent until close succeeds.`}
              confirmLabel="Permanently Close Workspace"
              confirmVariant="destructive"
              pending={closePending}
              onConfirm={async () => {
                const attemptRef = closeAttemptIdempotencyRef.current ?? idempotencyRef(`close:${crypto.randomUUID()}`)
                setClosePending(true)
                setCloseDiagnostic(null)
                try {
                  await closeWorkspaceMutation({
                    confirmationName,
                    expectedAccountRevision: eligibility.accountRevision,
                    expectedOwnershipRevision: eligibility.ownershipRevision,
                    correlationRef: correlationRef('close'),
                    idempotencyRef: attemptRef,
                    factorEvidence: { firstFactorAgeMinutes: 1, secondFactorAgeMinutes: 1 },
                  })
                  toast.success('Workspace closed')
                  setShowCloseConfirmDialog(false)
                } catch {
                  setCloseDiagnostic(CLOSE_FAILURE_DIAGNOSTIC)
                  toast.error('Workspace was not closed')
                } finally {
                  setClosePending(false)
                }
              }}
            />
          </>
        )}
      </section>

      <section className="grid gap-4">
        <h2 className="text-lg font-semibold tracking-tight">Transfer ownership</h2>
        {!eligibility.callerIsOwner ? (
          <p className="text-muted-foreground text-sm">{OWNER_ONLY_COPY}</p>
        ) : (
          <>
            <BaseField.Root className="grid gap-2 text-sm">
              <Label>New workspace owner</Label>
              <select
                aria-label="New workspace owner"
                value={selectedSuccessor}
                onChange={(event) => {
                  setSuccessorPrincipalRef(event.target.value)
                  setTransferDiagnostic(null)
                }}
                className={SELECT_CLASS}
              >
                {eligibility.transferCandidates.map((candidate) => (
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
              disabled={
                eligibility.transferCandidates.length === 0
                || selectedSuccessor.length === 0
                || transferPending
              }
              onClick={() => {
                transferAttemptIdempotencyRef.current = idempotencyRef(`transfer:${crypto.randomUUID()}`)
                setTransferDiagnostic(null)
                setShowTransferConfirmDialog(true)
              }}
            >
              Transfer ownership
            </Button>
            <DiagnosticSlot diagnostic={transferDiagnostic} />
            <AeConfirmDialog
              open={showTransferConfirmDialog}
              onOpenChange={setShowTransferConfirmDialog}
              title="Transfer workspace ownership?"
              description={`Are you sure you want to transfer ownership to ${successorName}? A$0.00 moved — ownership changes, balances and Calls stay on this workspace. You will remain an active member.`}
              confirmLabel="Transfer ownership"
              pending={transferPending}
              onConfirm={async () => {
                const attemptRef =
                  transferAttemptIdempotencyRef.current ?? idempotencyRef(`transfer:${crypto.randomUUID()}`)
                setTransferPending(true)
                setTransferDiagnostic(null)
                try {
                  await transferOwnershipMutation({
                    successorPrincipalRef: selectedSuccessor,
                    expectedAccountRevision: eligibility.accountRevision,
                    expectedOwnershipRevision: eligibility.ownershipRevision,
                    correlationRef: correlationRef('transfer'),
                    idempotencyRef: attemptRef,
                    factorEvidence: { firstFactorAgeMinutes: 1, secondFactorAgeMinutes: 1 },
                  })
                  toast.success('Workspace ownership transferred')
                  setShowTransferConfirmDialog(false)
                } catch {
                  setTransferDiagnostic(TRANSFER_FAILURE_DIAGNOSTIC)
                  toast.error('Ownership was not transferred')
                } finally {
                  setTransferPending(false)
                }
              }}
            />
          </>
        )}
      </section>
    </div>
  )
}
