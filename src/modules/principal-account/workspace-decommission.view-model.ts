import type { Rule4Diagnostic } from '@/lib/ui/diagnostic'

export type WorkspaceDecommissionFence =
  | 'unsettled_provider_obligations'
  | 'unwithdrawn_earnings'
  | 'open_calls'
  | 'unreleased_call_holds'
  | 'in_flight_funding'
  | 'open_reconciliation'

export type WorkspaceTransferCandidate = Readonly<{
  principalRef: string
  displayName: string
  membershipRef: string
}>

export type WorkspaceDecommissionEligibilityView = Readonly<{
  accountRef: string
  displayName: string
  accountRevision: number
  ownershipRevision: number
  callerIsOwner: boolean
  canClose: boolean
  canTransfer: boolean
  fences: readonly WorkspaceDecommissionFence[]
  transferCandidates: readonly WorkspaceTransferCandidate[]
}>

export type WorkspaceCloseCommand = Readonly<{
  confirmationName: string
  expectedAccountRevision: number
  expectedOwnershipRevision: number
  correlationRef: string
  idempotencyRef: string
}>

export type WorkspaceTransferCommand = Readonly<{
  successorPrincipalRef: string
  expectedAccountRevision: number
  expectedOwnershipRevision: number
  correlationRef: string
  idempotencyRef: string
}>

export type WorkspaceMfaReverificationRefusal = Readonly<{
  kind: 'refused'
  code: 'mfa_reverification_required'
}>

export type WorkspaceCloseResult =
  | WorkspaceMfaReverificationRefusal
  | Readonly<{
    kind: 'closed' | 'replayed'
    accountRef: string
    accountRevision: number
  }>

export type WorkspaceTransferResult =
  | WorkspaceMfaReverificationRefusal
  | Readonly<{
    kind: 'transferred'
    accountRef: string
    previousOwnershipRef: string
    currentOwnershipRef: string
    accountRevision: number
  }>
  | Readonly<{
    kind: 'replayed'
    accountRef: string
    currentOwnershipRef: string
    accountRevision: number
  }>

export function isWorkspaceMfaReverificationRefusal(
  value: WorkspaceCloseResult | WorkspaceTransferResult,
): value is WorkspaceMfaReverificationRefusal {
  return value.kind === 'refused'
}

export type WorkspaceDangerDiagnostic = Rule4Diagnostic

export const FENCE_MESSAGES: Record<WorkspaceDecommissionFence, string> = {
  unsettled_provider_obligations: 'Provider obligations are still unsettled.',
  unwithdrawn_earnings: 'Provider earnings have not been withdrawn.',
  open_calls: 'One or more Calls are still open.',
  unreleased_call_holds: 'Call holds have not been released.',
  in_flight_funding: 'A funding command is still in flight.',
  open_reconciliation: 'A reconciliation case is still open.',
}

export const CLOSE_FAILURE_DIAGNOSTIC: WorkspaceDangerDiagnostic = {
  whatHappened: 'Workspace close did not complete.',
  financialImpact: 'A$0.00 moved — prepaid credit and balances are unchanged.',
  nextStep: 'Resolve the listed blockers or try again in a moment.',
}

export const TRANSFER_FAILURE_DIAGNOSTIC: WorkspaceDangerDiagnostic = {
  whatHappened: 'Ownership transfer did not complete.',
  financialImpact: 'A$0.00 moved — balances and Calls stayed on this workspace.',
  nextStep: 'Confirm the successor is still an active member and try again.',
}

export function fenceMessagesFor(
  fences: readonly WorkspaceDecommissionFence[],
): readonly string[] {
  return fences.map((fence) => FENCE_MESSAGES[fence])
}
