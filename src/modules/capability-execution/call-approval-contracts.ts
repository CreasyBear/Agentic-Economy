import type { PublicAuthorityRequest } from './call-contracts'

/**
 * Shared with call-approval.functions.ts (the TanStack server-function
 * entry) and src/lib/server/call-approval-source.ts (its Convex-facing
 * adapter). Kept in its own leaf file so the adapter can depend on these
 * shapes without importing the entry surface that itself depends on the
 * adapter for its implementation.
 */

export type PendingCallApproval = Readonly<{
  callRef: string
  toolRef: string
  authorityRequest: PublicAuthorityRequest
  createdAt: number
}>

export type CallApprovalDecisionResult =
  | Readonly<{
      kind: 'approved' | 'denied' | 'replayed'
      callRef: string
    }>
  | Readonly<{
      kind: 'refused'
      code:
        | 'authentication_required'
        | 'invocation_not_found'
        | 'authority_not_pending'
        | 'grant_not_current'
        | 'invocation_invalid'
    }>
