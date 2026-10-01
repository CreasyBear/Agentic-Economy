import type { StableHashValue } from '@/modules/common/stable-hash'
import type { Infer } from 'convex/values'
import type { ExactAmount, MoneyAcceptedCallCharge } from '@/modules/money/public'
import type { CallPersistedAuthority } from '../internal/convex-schema'
import { callResultValue, recoveryResultValue, usageValue } from '../internal/convex-schema'
import type { DurableActionExecutionPort } from '@/modules/action-execution/runtime'
import type { CallResult } from '@/modules/capability-execution/call-contracts'

export type OpenDispatch = Readonly<{
  committedPaymentRequiredJson?: string
  sourceUsdcUnits?: string
  x402RequirementDigest?: string
  quoteRef?: string
  callRef: string
  principalId: string
  ownerId: string
  credentialId: string
  applicationRef: string
  environment: 'sandbox' | 'production'
  state: 'pending' | 'completed' | 'refused' | 'reconciliation_required' | 'cancelled'
  toolRef: string
  idempotencyKey: string
  inputDigest: string
  requestDigest: string
  grantGeneration: number
  policyDigest: string
  grantExpiresAt: number
  grantRef: string
  toolJson: string
  inputJson: string
  workId?: string
  attemptRef?: string
  dispatchState?: 'enqueued' | 'running' | 'completed' | 'failed' | 'reconciliation_required'
  authority?: CallPersistedAuthority
}>

export type ContractOutputValidation =
  | Readonly<{ valid: false }>
  | Readonly<{ valid: true; output: StableHashValue }>

export type ChargeSettlementResult =
  | Readonly<{
      kind: 'settled'
      outcome: 'not_released' | 'released'
      externalSettlementRef?: string
      settlementTransactionHash?: string
      paymentIdentifier?: string
      accountingTransactionRefs?: readonly string[]
      refundState?: 'released' | 'not_applicable' | 'unknown'
      lossState?: 'none' | 'provider_output_invalid' | 'provider_http_error' | 'unknown'
    }>
  | Readonly<{
      kind: 'reconciliation_required'
      paymentIdentifier?: string
      accountingTransactionRefs?: readonly string[]
      refundState?: 'unknown'
      lossState?: 'unknown'
    }>

export type WorkerAcceptedCharge = Omit<MoneyAcceptedCallCharge, 'transactionRef' | 'providerNet' | 'rake'> & Readonly<{
  transactionRef?: string | undefined
  providerNet?: ExactAmount | undefined
  rake?: ExactAmount | undefined
}>

export type CanonicalPort = Pick<
  DurableActionExecutionPort<CallResult>,
  'transact' | 'readControl' | 'readAttempt' | 'readAttempts' | 'readHistory' | 'readHistoryCommand' | 'recordLateObservation'
>

export type RecoveryRow = Readonly<{
  requiresManualSettlementReview?: true
  quoteRef?: string
  callRef: string
  principalId: string
  ownerId: string
  credentialId: string
  applicationRef: string
  environment: 'sandbox' | 'production'
  state: 'pending' | 'completed' | 'refused' | 'reconciliation_required' | 'cancelled'
  toolRef: string
  inputDigest: string
  requestDigest: string
  grantGeneration: number
  toolJson: string
  inputJson: string
  result?: Infer<typeof callResultValue>
  usage?: Infer<typeof usageValue>
  evidenceHash?: string
  attemptRef?: string
  updatedAt: number
}>

export type WorkerRecoveryResult = Infer<typeof recoveryResultValue>

export type RecoveryAttempt = Readonly<{
  attemptRef: string
  effectGeneration: number
  outcome: Readonly<{ state: string; reconciliationRequiredAt?: string }>
}>

export type RecoveryOuterProjectionOptions = Readonly<{
  clearResult?: boolean
  clearWorkId?: boolean
  clearAttemptRef?: boolean
  clearEvidenceHash?: boolean
  clearDispatchState?: boolean
}>
