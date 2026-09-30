import type {
  WorkspaceDangerDiagnostic,
  WorkspaceTransferCandidate,
} from '@/modules/principal-account/workspace-decommission.view-model'

export const WORKSPACE_MFA_REVERIFICATION_COPY =
  'Verify with two-factor authentication to continue.'

export type WorkspaceDangerDiagnosticSlotProps = Readonly<{
  diagnostic: WorkspaceDangerDiagnostic | null
}>

export type DecommissionFenceListProps = Readonly<{
  fenceMessages: readonly string[]
}>

export type WorkspaceClosePanelProps = Readonly<{
  callerIsOwner: boolean
  fencesPresent: boolean
  fenceMessages: readonly string[]
  displayName: string
  confirmationName: string
  closeDisabled: boolean
  closeDiagnostic: WorkspaceDangerDiagnostic | null
  showCloseConfirmDialog: boolean
  closePending: boolean
  onConfirmationNameChange: (value: string) => void
  onRequestClose: () => void
  onCloseDialogOpenChange: (open: boolean) => void
  onConfirmClose: () => void
}>

export type WorkspaceTransferPanelProps = Readonly<{
  callerIsOwner: boolean
  transferCandidates: readonly WorkspaceTransferCandidate[]
  selectedSuccessor: string
  successorName: string
  transferDisabled: boolean
  transferDiagnostic: WorkspaceDangerDiagnostic | null
  showTransferConfirmDialog: boolean
  transferPending: boolean
  onSuccessorChange: (principalRef: string) => void
  onRequestTransfer: () => void
  onTransferDialogOpenChange: (open: boolean) => void
  onConfirmTransfer: () => void
}>

export type UseWorkspaceDangerZoneResult = Readonly<{
  loading: boolean
  closePanel: WorkspaceClosePanelProps | null
  transferPanel: WorkspaceTransferPanelProps | null
}>
