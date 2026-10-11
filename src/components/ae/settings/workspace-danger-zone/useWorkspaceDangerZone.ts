import { flushSync } from 'react-dom'
import { isReverificationCancelledError } from '@clerk/tanstack-react-start/errors'
import { makeFunctionReference } from 'convex/server'
import { useQuery } from 'convex/react'
import { closeWorkspaceServer, transferWorkspaceOwnershipServer } from '@/lib/server/workspace-profile.functions'
import { useEffect, useMemo, useRef, useState } from 'react'

import { useTypedReverification } from '@/lib/client/useTypedReverification'
import { toast } from '@/lib/ui/toast'
import {
  CLOSE_FAILURE_DIAGNOSTIC,
  FENCE_MESSAGES,
  TRANSFER_FAILURE_DIAGNOSTIC,
  fenceMessagesFor,
  fenceDestinationsFor,
  isWorkspaceMfaReverificationRefusal,
  type WorkspaceCloseCommand,
  type WorkspaceDangerDiagnostic,
  type WorkspaceDecommissionEligibilityView,
  type WorkspaceTransferCommand,
} from '@/modules/principal-account/workspace-decommission.view-model'

import {
  WORKSPACE_MFA_REVERIFICATION_COPY,
  type UseWorkspaceDangerZoneResult,
} from './workspace-danger-zone.contracts'

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

const CLOSE_MFA_DIAGNOSTIC: WorkspaceDangerDiagnostic = {
  ...CLOSE_FAILURE_DIAGNOSTIC,
  nextStep: WORKSPACE_MFA_REVERIFICATION_COPY,
}

const TRANSFER_MFA_DIAGNOSTIC: WorkspaceDangerDiagnostic = {
  ...TRANSFER_FAILURE_DIAGNOSTIC,
  nextStep: WORKSPACE_MFA_REVERIFICATION_COPY,
}

export function useWorkspaceDangerZone(options: Readonly<{
  confirmedCompletion?: UseWorkspaceDangerZoneResult['completion']
  onCompletion?: (completion: NonNullable<UseWorkspaceDangerZoneResult['completion']>) => void
  onReadPausedChange?: (paused: boolean) => void
}> = {}): UseWorkspaceDangerZoneResult {
  const [completion, setCompletion] = useState<UseWorkspaceDangerZoneResult['completion']>(options.confirmedCompletion)
  const [readUnavailable, setReadUnavailable] = useState(false)
  const [readPaused, setReadPaused] = useState(false)
  const [closeAttemptUnconfirmed, setCloseAttemptUnconfirmed] = useState(false)
  const [transferAttemptUnconfirmed, setTransferAttemptUnconfirmed] = useState(false)
  const liveEligibility = useQuery(readWorkspaceDecommissionEligibilityRef, completion === undefined && !readPaused ? {} : 'skip')
  const [lastEligibility, setLastEligibility] = useState<WorkspaceDecommissionEligibilityView>()
  if (liveEligibility !== undefined && liveEligibility !== lastEligibility) setLastEligibility(liveEligibility)
  const eligibility = liveEligibility ?? (readPaused ? lastEligibility : undefined)
  function pauseReads(paused: boolean) {
    // End active-account subscriptions before an operation can end that access.
    flushSync(() => { setReadPaused(paused); options.onReadPausedChange?.(paused) })
  }
  useEffect(() => {
    if (eligibility !== undefined || completion !== undefined) return
    const timer = setTimeout(() => setReadUnavailable(true), 10_000)
    return () => clearTimeout(timer)
  }, [eligibility, completion])
  const closeWorkspace = useTypedReverification(
    (data: WorkspaceCloseCommand) => closeWorkspaceServer({ data }),
    (result) => isWorkspaceMfaReverificationRefusal(result) ? 'strict_mfa' : null,
  )
  const transferWorkspaceOwnership = useTypedReverification(
    (data: WorkspaceTransferCommand) => transferWorkspaceOwnershipServer({ data }),
    (result) => isWorkspaceMfaReverificationRefusal(result) ? 'strict_mfa' : null,
  )

  const [confirmationName, setConfirmationName] = useState('')
  const [successorPrincipalRef, setSuccessorPrincipalRef] = useState('')
  const [showCloseConfirmDialog, setShowCloseConfirmDialog] = useState(false)
  const [showTransferConfirmDialog, setShowTransferConfirmDialog] = useState(false)
  const [closePending, setClosePending] = useState(false)
  const [transferPending, setTransferPending] = useState(false)
  const [closeDiagnostic, setCloseDiagnostic] = useState<WorkspaceDangerDiagnostic | null>(null)
  const [transferDiagnostic, setTransferDiagnostic] = useState<WorkspaceDangerDiagnostic | null>(null)

  const closeCommand = useRef<WorkspaceCloseCommand | undefined>(undefined)
  const transferCommand = useRef<WorkspaceTransferCommand | undefined>(undefined)
  const [submittedSuccessor, setSubmittedSuccessor] = useState<Readonly<{ principalRef: string; name: string }>>()
  const closeAttemptIdempotencyRef = useRef<string | null>(null)
  const transferAttemptIdempotencyRef = useRef<string | null>(null)

  const fenceMessages = useMemo(() => {
    if (eligibility === undefined) return []
    return fenceMessagesFor(eligibility.fences)
  }, [eligibility])

  if (completion !== undefined) return { loading: false, closePanel: null, transferPanel: null, completion }
  if (eligibility === undefined) {
    return {
      loading: !readUnavailable,
      readUnavailable,
      onRetryRead: () => window.location.reload(),
      closePanel: null,
      transferPanel: null,
    }
  }

  const closeDisabled = eligibility.fences.length > 0
    || confirmationName !== eligibility.displayName
    || closePending
    || (readPaused && !closeAttemptUnconfirmed)

  const selectedSuccessor = submittedSuccessor?.principalRef ?? (successorPrincipalRef.length > 0
    ? successorPrincipalRef
    : eligibility.transferCandidates[0]?.principalRef ?? '')

  const successorName = submittedSuccessor?.name ??
    eligibility.transferCandidates.find((candidate) => candidate.principalRef === selectedSuccessor)
      ?.displayName
    ?? 'the selected member'

  const fencesPresent = eligibility.fences.length > 0

  const transferDisabled = eligibility.transferCandidates.length === 0
    || selectedSuccessor.length === 0
    || transferPending
    || (readPaused && !transferAttemptUnconfirmed)

  return {
    loading: false,
    closePanel: {
      callerIsOwner: eligibility.callerIsOwner,
      fencesPresent,
      fenceMessages,
      fenceDestinations: fenceDestinationsFor(eligibility.fences, eligibility.accountRef),
      displayName: eligibility.displayName,
      confirmationName,
      closeDisabled,
      closeDiagnostic,
      showCloseConfirmDialog,
      closePending,
      closeAttemptUnconfirmed,
      onConfirmationNameChange: (value) => {
        if (closeCommand.current !== undefined) return
        setConfirmationName(value)
        setCloseDiagnostic(null)
      },
      onRequestClose: () => {
        if (!closeAttemptUnconfirmed) { closeAttemptIdempotencyRef.current = idempotencyRef(`close:${crypto.randomUUID()}`); closeCommand.current = undefined }
        setCloseDiagnostic(null)
        setShowCloseConfirmDialog(true)
      },
      onCloseDialogOpenChange: setShowCloseConfirmDialog,
      onConfirmClose: async () => {
        if (closePending || transferPending || completion !== undefined) return
        const attemptRef = closeAttemptIdempotencyRef.current ?? idempotencyRef(`close:${crypto.randomUUID()}`)
        setClosePending(true)
        setCloseDiagnostic(null)
        pauseReads(true)
        try {
          const command = closeCommand.current ?? {
            expectedAccountRef: eligibility.accountRef,
            confirmationName,
            expectedAccountRevision: eligibility.accountRevision,
            expectedOwnershipRevision: eligibility.ownershipRevision,
            correlationRef: correlationRef('close'),
            idempotencyRef: attemptRef,
          }
          closeCommand.current = command
          const result = await closeWorkspace(command)
          if (isWorkspaceMfaReverificationRefusal(result)) {
            if (!closeAttemptUnconfirmed) { closeCommand.current = undefined; pauseReads(false) }
            setCloseDiagnostic(closeAttemptUnconfirmed ? { ...CLOSE_MFA_DIAGNOSTIC, whatHappened: 'The original close attempt is still unconfirmed. It may already have completed.' } : CLOSE_MFA_DIAGNOSTIC)
            toast.error(closeAttemptUnconfirmed ? 'Workspace close could not be confirmed' : 'Workspace was not closed')
            return
          }
          if (result.kind === 'refused') {
            closeCommand.current = undefined; pauseReads(false)
            setCloseDiagnostic(result.code === 'positive_credit_balance'
              ? { whatHappened: 'Workspace close did not complete.', financialImpact: 'Your credit is unchanged.', nextStep: FENCE_MESSAGES.positive_credit_balance }
              : CLOSE_FAILURE_DIAGNOSTIC)
            toast.error('Workspace was not closed')
            return
          }
          const confirmed = { kind: 'closed' as const, accountRef: result.accountRef, displayName: command.confirmationName }
          setCompletion(confirmed); options.onCompletion?.(confirmed)
          toast.success('Workspace closed')
          setShowCloseConfirmDialog(false)
        } catch (cause) {
          if (isReverificationCancelledError(cause)) { if (!closeAttemptUnconfirmed) { closeCommand.current = undefined; pauseReads(false) }; return }
          setCloseAttemptUnconfirmed(true)
          setCloseDiagnostic({ ...CLOSE_FAILURE_DIAGNOSTIC, whatHappened: 'The close attempt could not be confirmed. It may already have completed.', nextStep: 'Check this same close attempt to confirm its recorded result before starting another workspace action.' })
          toast.error('Workspace close could not be confirmed')
        } finally {
          setClosePending(false)
        }
      },
    },
    transferPanel: {
      callerIsOwner: eligibility.callerIsOwner,
      transferCandidates: eligibility.transferCandidates,
      selectedSuccessor,
      successorName,
      transferDisabled,
      transferDiagnostic,
      showTransferConfirmDialog,
      transferPending,
      transferAttemptUnconfirmed,
      onSuccessorChange: (principalRef) => {
        if (transferCommand.current !== undefined) return
        setSuccessorPrincipalRef(principalRef)
        setTransferDiagnostic(null)
      },
      onRequestTransfer: () => {
        if (!transferAttemptUnconfirmed) { transferAttemptIdempotencyRef.current = idempotencyRef(`transfer:${crypto.randomUUID()}`); transferCommand.current = undefined }
        setTransferDiagnostic(null)
        setShowTransferConfirmDialog(true)
      },
      onTransferDialogOpenChange: setShowTransferConfirmDialog,
      onConfirmTransfer: async () => {
        if (closePending || transferPending || completion !== undefined) return
        const attemptRef =
          transferAttemptIdempotencyRef.current ?? idempotencyRef(`transfer:${crypto.randomUUID()}`)
        setTransferPending(true)
        setTransferDiagnostic(null)
        pauseReads(true)
        try {
          const command = transferCommand.current ?? {
            expectedAccountRef: eligibility.accountRef,
            successorPrincipalRef: selectedSuccessor,
            expectedAccountRevision: eligibility.accountRevision,
            expectedOwnershipRevision: eligibility.ownershipRevision,
            correlationRef: correlationRef('transfer'),
            idempotencyRef: attemptRef,
          }
          transferCommand.current = command
          setSubmittedSuccessor(previous => previous ?? { principalRef: command.successorPrincipalRef, name: successorName })
          const result = await transferWorkspaceOwnership(command)
          if (isWorkspaceMfaReverificationRefusal(result)) {
            if (!transferAttemptUnconfirmed) { transferCommand.current = undefined; setSubmittedSuccessor(undefined); pauseReads(false) }
            setTransferDiagnostic(transferAttemptUnconfirmed ? { ...TRANSFER_MFA_DIAGNOSTIC, whatHappened: 'The original transfer attempt is still unconfirmed. It may already have completed.' } : TRANSFER_MFA_DIAGNOSTIC)
            toast.error(transferAttemptUnconfirmed ? 'Ownership transfer could not be confirmed' : 'Ownership was not transferred')
            return
          }
          const confirmed = { kind: 'transferred' as const, accountRef: result.accountRef, displayName: eligibility.displayName, successorName: submittedSuccessor?.name ?? successorName }
          setCompletion(confirmed); options.onCompletion?.(confirmed)
          toast.success('Workspace ownership transferred')
          setShowTransferConfirmDialog(false)
        } catch (cause) {
          if (isReverificationCancelledError(cause)) { if (!transferAttemptUnconfirmed) { transferCommand.current = undefined; setSubmittedSuccessor(undefined); pauseReads(false) }; return }
          setTransferAttemptUnconfirmed(true)
          setTransferDiagnostic({ ...TRANSFER_FAILURE_DIAGNOSTIC, whatHappened: 'The ownership transfer could not be confirmed. It may already have completed.', nextStep: 'Check this same transfer attempt to confirm its recorded result before starting another workspace action.' })
          toast.error('Ownership transfer could not be confirmed')
        } finally {
          setTransferPending(false)
        }
      },
    },
  }
}
