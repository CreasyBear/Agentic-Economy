import type { PublicAuthorityRequest } from './call-contracts'
import type { CapabilityContract } from '@/modules/capability-contract/public'

export type CallApprovalDecisionContext = Readonly<{
  agent: Readonly<{
    principalRef: string
    applicationRef: string
    /** Current account-owned label, never an accepted commercial term. */
    currentDisplayName: string | null
  }>
  /** The caller's larger task purpose is not recorded by the Call contract. */
  purpose: null
  acceptedQuote:
    | Readonly<{
        kind: 'available'
        quoteRef: string
        tool: Readonly<{ name: string; description: string }>
        provider: Readonly<{ ref: string; name: null }>
        maximumSpend: Readonly<{ currency: 'AUD'; units: string; exponent: 6 }>
        /** Empty lists mean no declarations, not a guarantee of no disclosure/effects. */
        dataUse: CapabilityContract['dataUse']
        effects: CapabilityContract['effects']
      }>
    | Readonly<{
        kind: 'unavailable'
        reason: 'quote_missing' | 'quote_mismatch' | 'material_invalid'
      }>
}>

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
  /** Additive owner readback; older deployed sources may omit it. */
  decisionContext?: CallApprovalDecisionContext
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
