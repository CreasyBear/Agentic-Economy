import { z } from 'zod'
import type { JsonValue } from '@/modules/capability-contract/public'

import type {
  OperationInvokeRefusalCode,
  OperationInvokeReceipt,
  OperationInvokeResult,
  OperationInvokeUsageSummary,
  PublicReconciliationState,
} from './operation-invoke-contracts'

export const operationInvokeStatusStateValues = [
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
export const operationInvokeStatusStateSchema = z.enum(operationInvokeStatusStateValues)

export const operationInvokeStatusRefusalCodeValues = [
  'invocation_not_found',
  'grant_not_found',
  'grant_revoked',
  'grant_expired',
  'grant_generation_stale',
  'environment_mismatch',
  'invocation_runtime_unavailable',
] as const
export const operationInvokeStatusRefusalCodeSchema = z.enum(operationInvokeStatusRefusalCodeValues)

export type OperationInvokeStatusState = z.infer<typeof operationInvokeStatusStateSchema>

export type OperationInvokeStatusResult =
  | Readonly<{
      kind: 'found'
      invocationRef: string
      operationRef: string
      previousInput?: Readonly<Record<string, JsonValue>>
      state: OperationInvokeStatusState
      usage?: OperationInvokeUsageSummary
      evidenceHash?: string
      attemptRef?: string
      effectGeneration?: number
      result?: OperationInvokeResult
      receipt?: OperationInvokeReceipt
    }>
  | Readonly<{
      kind: 'refused'
      invocationRef: string
      code: Extract<OperationInvokeRefusalCode, 'invocation_not_found' | 'grant_not_found' | 'grant_revoked' | 'grant_expired' | 'grant_generation_stale' | 'environment_mismatch' | 'invocation_runtime_unavailable'>
      retryable: boolean
      nextAction?: string
      receipt?: OperationInvokeReceipt
    }>
export type OperationInvokeRecoveryResult =
  | OperationInvokeStatusResult
  | Readonly<{
      kind: 'reconciliation_required'
      invocationRef: string
      operationRef: string
      evidence: PublicReconciliationState
      receipt?: OperationInvokeReceipt
    }>
