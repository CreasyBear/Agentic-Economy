import { reverificationError } from '@clerk/shared/authorization-errors'
import { useReverification } from '@clerk/tanstack-react-start'
import { makeFunctionReference } from 'convex/server'
import { useMutation, useQuery } from 'convex/react'
import { useMemo, useRef, useState } from 'react'

import { toast } from '@/lib/ui/toast'
import {
  CLOSE_FAILURE_DIAGNOSTIC,
  TRANSFER_FAILURE_DIAGNOSTIC,
  fenceMessagesFor,
  isWorkspaceMfaReverificationRefusal,
  type WorkspaceCloseCommand,
  type WorkspaceCloseResult,
  type WorkspaceDangerDiagnostic,
  type WorkspaceDecommissionEligibilityView,
  type WorkspaceTransferCommand,
  type WorkspaceTransferResult,
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

const closeWorkspaceRef = makeFunctionReference<
  'mutation',
  WorkspaceCloseCommand,
  WorkspaceCloseResult
>('workspaceAccounts:closeWorkspace')

const transferWorkspaceOwnershipRef = makeFunctionReference<
  'mutation',
  WorkspaceTransferCommand,
  WorkspaceTransferResult
>('workspaceAccounts:transferWorkspaceOwnership')

const CLOSE_MFA_DIAGNOSTIC: WorkspaceDangerDiagnostic = {
  ...CLOSE_FAILURE_DIAGNOSTIC,
  nextStep: WORKSPACE_MFA_REVERIFICATION_COPY,
}

const TRANSFER_MFA_DIAGNOSTIC: WorkspaceDangerDiagnostic = {
  ...TRANSFER_FAILURE_DIAGNOSTIC,
  nextStep: WORKSPACE_MFA_REVERIFICATION_COPY,
}

export function useWorkspaceDangerZone(): UseWorkspaceDangerZoneResult {
  const eligibility = useQuery(readWorkspaceDecommissionEligibilityRef)
  const closeWorkspaceMutation = useMutation(closeWorkspaceRef)
  const transferOwnershipMutation = useMutation(transferWorkspaceOwnershipRef)
  const closeReverificationAttempted = useRef(false)
  const transferReverificationAttempted = useRef(false)
  const closeWorkspace = useReverification(async (command: WorkspaceCloseCommand) => {
    const result = await closeWorkspaceMutation(command)
    if (
      isWorkspaceMfaReverificationRefusal(result)
      && !closeReverificationAttempted.current
    ) {
      closeReverificationAttempted.current = true
      return reverificationError('strict_mfa')
    }
    return result
  })
  const transferWorkspaceOwnership = useReverification(async (
    command: WorkspaceTransferCommand,
  ) => {
    const result = await transferOwnershipMutation(command)
    if (
      isWorkspaceMfaReverificationRefusal(result)
      && !transferReverificationAttempted.current
    ) {
      transferReverificationAttempted.current = true
      return reverificationError('strict_mfa')
    }
    return result
  })

  const [confirmationName, setConfirmationName] = useState('')
  const [successorPrincipalRef, setSuccessorPrincipalRef] = useState('')
  const [showCloseConfirmDialog, setShowCloseConfirmDialog] = useState(false)
  const [showTransferConfirmDialog, setShowTransferConfirmDialog] = useState(false)
  const [closePending, setClosePending] = useState(false)
  const [transferPending, setTransferPending] = useState(false)
  const [closeDiagnostic, setCloseDiagnostic] = useState<WorkspaceDangerDiagnostic | null>(null)
  const [transferDiagnostic, setTransferDiagnostic] = useState<WorkspaceDangerDiagnostic | null>(null)

  const closeAttemptIdempotencyRef = useRef<string | null>(null)
  const transferAttemptIdempotencyRef = useRef<string | null>(null)

  const fenceMessages = useMemo(() => {
    if (eligibility === undefined) return []
    return fenceMessagesFor(eligibility.fences)
  }, [eligibility])

  if (eligibility === undefined) {
    return {
      loading: true,
      closePanel: null,
      transferPanel: null,
    }
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

  const transferDisabled = eligibility.transferCandidates.length === 0
    || selectedSuccessor.length === 0
    || transferPending

  return {
    loading: false,
    closePanel: {
      callerIsOwner: eligibility.callerIsOwner,
      fencesPresent,
      fenceMessages,
      displayName: eligibility.displayName,
      confirmationName,
      closeDisabled,
      closeDiagnostic,
      showCloseConfirmDialog,
      closePending,
      onConfirmationNameChange: (value) => {
        setConfirmationName(value)
        setCloseDiagnostic(null)
      },
      onRequestClose: () => {
        closeAttemptIdempotencyRef.current = idempotencyRef(`close:${crypto.randomUUID()}`)
        setCloseDiagnostic(null)
        setShowCloseConfirmDialog(true)
      },
      onCloseDialogOpenChange: setShowCloseConfirmDialog,
      onConfirmClose: async () => {
        const attemptRef = closeAttemptIdempotencyRef.current ?? idempotencyRef(`close:${crypto.randomUUID()}`)
        setClosePending(true)
        setCloseDiagnostic(null)
        closeReverificationAttempted.current = false
        try {
          const result = await closeWorkspace({
            confirmationName,
            expectedAccountRevision: eligibility.accountRevision,
            expectedOwnershipRevision: eligibility.ownershipRevision,
            correlationRef: correlationRef('close'),
            idempotencyRef: attemptRef,
          })
          if (isWorkspaceMfaReverificationRefusal(result)) {
            setCloseDiagnostic(CLOSE_MFA_DIAGNOSTIC)
            toast.error('Workspace was not closed')
            return
          }
          toast.success('Workspace closed')
          setShowCloseConfirmDialog(false)
        } catch (cause) {
          void cause
          setCloseDiagnostic(CLOSE_FAILURE_DIAGNOSTIC)
          toast.error('Workspace was not closed')
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
      onSuccessorChange: (principalRef) => {
        setSuccessorPrincipalRef(principalRef)
        setTransferDiagnostic(null)
      },
      onRequestTransfer: () => {
        transferAttemptIdempotencyRef.current = idempotencyRef(`transfer:${crypto.randomUUID()}`)
        setTransferDiagnostic(null)
        setShowTransferConfirmDialog(true)
      },
      onTransferDialogOpenChange: setShowTransferConfirmDialog,
      onConfirmTransfer: async () => {
        const attemptRef =
          transferAttemptIdempotencyRef.current ?? idempotencyRef(`transfer:${crypto.randomUUID()}`)
        setTransferPending(true)
        setTransferDiagnostic(null)
        transferReverificationAttempted.current = false
        try {
          const result = await transferWorkspaceOwnership({
            successorPrincipalRef: selectedSuccessor,
            expectedAccountRevision: eligibility.accountRevision,
            expectedOwnershipRevision: eligibility.ownershipRevision,
            correlationRef: correlationRef('transfer'),
            idempotencyRef: attemptRef,
          })
          if (isWorkspaceMfaReverificationRefusal(result)) {
            setTransferDiagnostic(TRANSFER_MFA_DIAGNOSTIC)
            toast.error('Ownership was not transferred')
            return
          }
          toast.success('Workspace ownership transferred')
          setShowTransferConfirmDialog(false)
        } catch (cause) {
          void cause
          setTransferDiagnostic(TRANSFER_FAILURE_DIAGNOSTIC)
          toast.error('Ownership was not transferred')
        } finally {
          setTransferPending(false)
        }
      },
    },
  }
}
