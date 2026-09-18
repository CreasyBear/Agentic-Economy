import { z } from 'zod'
import type { JsonValue } from '@/modules/capability-contract/public'

import type {
  CallRefusalCode,
  CallReceipt,
  CallResult,
  CallUsageSummary,
  PublicReconciliationState,
} from './call-contracts'
import type { PurchaseResolutionRecord } from './purchase-resolution'

export const callStatusStateValues = [
  'gathering_information',
  'awaiting_authority',
  'authorized',
  'leased',
  'in_progress',
  'retryable',
  'reconciliation_required',
  'terminal',
  'cancelled',
  'invalidated',
] as const
export const callStatusStateSchema = z.enum(callStatusStateValues)

export const callStatusRefusalCodeValues = [
  'invocation_not_found',
  'grant_not_found',
  'grant_revoked',
  'grant_expired',
  'grant_generation_stale',
  'environment_mismatch',
  'invocation_runtime_unavailable',
] as const
export const callStatusRefusalCodeSchema = z.enum(callStatusRefusalCodeValues)
export type CallStatusRefusalCode = (typeof callStatusRefusalCodeValues)[number]

export type CallStatusState = z.infer<typeof callStatusStateSchema>

/** Owner UI metadata only; never part of the public Call status protocol. */
export const ownerCallContextSchema = z.strictObject({
  purpose: z.null(),
  agent: z.strictObject({
    principalRef: z.string(), applicationRef: z.string(), currentDisplayName: z.string().nullable(),
  }),
  recordedTool: z.discriminatedUnion('kind', [
    z.strictObject({
      kind: z.literal('available'), basis: z.literal('call_snapshot'),
      name: z.string(), providerRef: z.string(), providerName: z.null(),
    }),
    z.strictObject({ kind: z.literal('unavailable') }),
  ]),
  /** Permission to submit only. The worker independently verifies evidence. */
  reconciliation: z.strictObject({
    canSubmitEvidence: z.literal(true), permissionBasis: z.literal('account_owner'),
    requiresVerifiedEvidence: z.literal(true),
  }),
})
export type OwnerCallContext = z.infer<typeof ownerCallContextSchema>

export type CallStatusResult =
  | Readonly<{
      kind: 'found'
      callRef: string
      version: number
      toolRef: string
      previousInput?: Readonly<Record<string, JsonValue>>
      state: CallStatusState
      usage?: CallUsageSummary
      evidenceHash?: string
      attemptRef?: string
      effectGeneration?: number
      result?: CallResult
      receipt?: CallReceipt
      purchaseResolution?: PurchaseResolutionRecord
    }>
  | Readonly<{
      kind: 'unchanged'
      callRef: string
      version: number
      retryAfterMs: number
    }>
  | Readonly<{
      kind: 'refused'
      callRef: string
      code: Extract<CallRefusalCode, 'invocation_not_found' | 'grant_not_found' | 'grant_revoked' | 'grant_expired' | 'grant_generation_stale' | 'environment_mismatch' | 'invocation_runtime_unavailable'>
      retryable: boolean
      nextAction?: string
      receipt?: CallReceipt
    }>
export type CallRecoveryResult =
  | CallStatusResult
  | Readonly<{
      kind: 'reconciliation_required'
      callRef: string
      toolRef: string
      evidence: PublicReconciliationState
      receipt?: CallReceipt
    }>

export type OwnerCallStatusResult =
  | (Extract<CallStatusResult, { kind: 'found' }> & Readonly<{ ownerContext?: OwnerCallContext | null }>)
  | Exclude<CallStatusResult, { kind: 'found' }>
