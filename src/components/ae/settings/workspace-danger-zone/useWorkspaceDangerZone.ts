import { makeFunctionReference } from 'convex/server'
import { useMutation, useQuery } from 'convex/react'
import { useMemo, useRef, useState } from 'react'

import { toast } from '@/lib/ui/toast'
import {
  CLOSE_FAILURE_DIAGNOSTIC,
  TRANSFER_FAILURE_DIAGNOSTIC,
  fenceMessagesFor,
  type WorkspaceCloseCommand,
  type WorkspaceDangerDiagnostic,
  type WorkspaceDecommissionEligibilityView,
  type WorkspaceTransferCommand,
} from '@/modules/principal-account/workspace-decommission.view-model'

import type { UseWorkspaceDangerZoneResult } from './workspace-danger-zone.contracts'

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
  unknown
>('workspaceAccounts:closeWorkspace')

const transferWorkspaceOwnershipRef = makeFunctionReference<
  'mutation',
  WorkspaceTransferCommand,
  unknown
>('workspaceAccounts:transferWorkspaceOwnership')

export function useWorkspaceDangerZone(): UseWorkspaceDangerZoneResult {
  const eligibility = useQuery(readWorkspaceDecommissionEligibilityRef)
  const closeWorkspaceMutation = useMutation(closeWorkspaceRef)
  const transferOwnershipMutation = useMutation(transferWorkspaceOwnershipRef)

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
