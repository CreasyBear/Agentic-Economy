import type { Infer } from 'convex/values'
import type { Doc } from '../../_generated/dataModel'
import {
  sourceWriteAdmissionArg,
  sourceWriteRequestArg,
} from '../../sourceWriteAdmission'
import type { JsonValue } from '@/modules/capability-contract/public'
import type { CallIdempotencyReservation } from '@/modules/capability-execution/call-authority'
import type { SellerOnboardingCanaryExecutionEnvelope } from '@/modules/capability-supply/public'
import type { pendingApprovalView } from './contracts'

export type CallPrincipal = Readonly<{
  principalId: string
  ownerId: string
  credentialId: string
  applicationRef: string
  environment: 'sandbox' | 'production'
  scopes: string[]
  authorityMode: 'read_only' | 'approval_required' | 'spending_policy' | 'unrestricted_test_only'
}>

export type AdmitArgs = {
  operationKey: string
  correlationId: string
  sourceWrite?: Infer<typeof sourceWriteAdmissionArg>
  sourceWriteRequest?: Infer<typeof sourceWriteRequestArg>
  principal: CallPrincipal
  toolRef: string
  input: Record<string, JsonValue>
  idempotencyKey: string
}

export type ReserveArgs = Readonly<{
  quoteRef: string
  callRef: string
  turnRef?: string
  principalId: string
  ownerId: string
  credentialId: string
  applicationRef: string
  grantRef: string
  environment: 'sandbox' | 'production'
  toolRef: string
  idempotencyKey: string
  inputDigest: string
  requestDigest: string
  grantGeneration: number
  policyDigest: string
  grantExpiresAt: number
  toolJson?: string
  inputJson?: string
  sellerOnboardingCanary?: SellerOnboardingCanaryExecutionEnvelope
  now: number
  organizationMonthlySpend?: Readonly<{
    enabled: boolean
    ceilingUnits?: string
    monthSpendUnits?: string
  }>
}>

export type ReserveResult =
  | { kind: 'reserved'; reservation: CallIdempotencyReservation }
  | { kind: 'replayed'; reservation: CallIdempotencyReservation }
  | { kind: 'conflict' }
  | {
      kind: 'refused'
      code:
        | 'grant_not_found'
        | 'grant_revoked'
        | 'grant_expired'
        | 'grant_generation_stale'
        | 'environment_mismatch'
        | 'rate_limited'
        | 'concurrency_limited'
        | 'budget_exceeded'
        | 'insufficient_balance'
        | 'treasury_capacity_unavailable'
        | 'commercial_policy_unavailable'
        | 'operation_not_ready'
      retryable: boolean
      nextAction?: string
    }

export type AbandonArgs = Omit<ReserveArgs, 'toolJson' | 'inputJson' | 'now'>

export type AbandonResult =
  | { kind: 'abandoned' }
  | { kind: 'not_found' }
  | { kind: 'dispatch_started' }

export type CallRow = Doc<'capabilityCalls'>
export type GrantRow = Doc<'agentAccessGrants'>

export type PendingApprovalView = Infer<typeof pendingApprovalView>

export type ApprovalDecisionResult =
  | { kind: 'approved' | 'denied' | 'replayed'; callRef: string }
  | {
      kind: 'refused'
      code:
        | 'authentication_required'
        | 'invocation_not_found'
        | 'authority_not_pending'
        | 'grant_not_current'
        | 'invocation_invalid'
    }
