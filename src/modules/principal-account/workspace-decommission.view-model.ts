import type { Rule4Diagnostic } from '@/lib/ui/diagnostic'

export type WorkspaceDecommissionFence =
  | 'unsettled_provider_obligations'
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
  expectedAccountRef: string
  confirmationName: string
  expectedAccountRevision: number
  expectedOwnershipRevision: number
  correlationRef: string
  idempotencyRef: string
}>

export type WorkspaceTransferCommand = Readonly<{
  expectedAccountRef: string
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
  unsettled_provider_obligations: 'Provider obligations are still unsettled. Review their status and ask Support to resolve any obligation you cannot settle.',
  open_calls: 'One or more Calls are still open. Wait until they finish before close.',
  unreleased_call_holds: 'Call credit is still reserved. Review the affected Calls; only their recorded completion or recovery can release a hold.',
  in_flight_funding: 'A funding command is still in flight. Wait until it finishes before close.',
  open_reconciliation: 'A reconciliation case is still open. Resolve it before close.',
}

export const CLOSE_FAILURE_DIAGNOSTIC: WorkspaceDangerDiagnostic = {
  whatHappened: 'Workspace close did not complete.',
  financialImpact: 'No balance is shown for this attempt.',
  nextStep: 'Resolve the listed blockers or try again in a moment.',
}

export const TRANSFER_FAILURE_DIAGNOSTIC: WorkspaceDangerDiagnostic = {
  whatHappened: 'Ownership transfer did not complete.',
  financialImpact: 'No balance is shown for this attempt.',
  nextStep: 'Confirm the successor is still an active member and try again.',
}

export function fenceMessagesFor(
  fences: readonly WorkspaceDecommissionFence[],
): readonly string[] {
  return fences.map((fence) => FENCE_MESSAGES[fence])
}

export type WorkspaceFenceDestination = Readonly<{ fence: WorkspaceDecommissionFence; label: string; href: string; actionLabel: string }>
export function fenceDestinationsFor(fences: readonly WorkspaceDecommissionFence[], accountRef: string): readonly WorkspaceFenceDestination[] {
  const destinations: Record<WorkspaceDecommissionFence, { href: string; actionLabel: string }> = {
    open_calls: { href: '/activity', actionLabel: 'Review open Calls' },
    unreleased_call_holds: { href: '/activity', actionLabel: 'Review Call holds and recovery' },
    in_flight_funding: { href: '/owner/credit', actionLabel: 'Check the original funding attempt' },
    open_reconciliation: { href: '/activity', actionLabel: 'Review Calls needing reconciliation' },
    unsettled_provider_obligations: { href: '/support', actionLabel: 'Get help with unsettled Provider obligations' },
  }
  return fences.map(fence => ({ fence, label: fence === 'unsettled_provider_obligations' ? `${FENCE_MESSAGES[fence]} Workspace reference: ${accountRef}.` : FENCE_MESSAGES[fence], ...destinations[fence] }))
}
