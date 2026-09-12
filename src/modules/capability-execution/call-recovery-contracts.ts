import { z } from 'zod'
import type { JsonValue } from '@/modules/capability-contract/public'

import type {
  CallRefusalCode,
  CallReceipt,
  CallResult,
  CallUsageSummary,
  PublicReconciliationState,
} from './call-contracts'

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
