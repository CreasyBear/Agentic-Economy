import type { StableHashValue } from '@/modules/common/stable-hash'
import type { Infer } from 'convex/values'
import type { ExactAmount, MoneyAcceptedCallCharge } from '@/modules/money/public'
import type { SellerOnboardingCanaryExecutionEnvelope } from '@/modules/capability-execution'
import type { CallPersistedAuthority, DurableActionExecutionPort } from '@/modules/capability-execution/convex'
import { callResultValue, recoveryResultValue, usageValue } from '@/modules/capability-execution/convex'
import type { CallResult } from '@/modules/capability-execution/call-contracts'

export type OpenDispatch = Readonly<{
  committedPaymentRequiredJson?: string
  sourceUsdcUnits?: string
  quoteRef?: string
  callRef: string
  principalId: string
  ownerId: string
  credentialId: string
  applicationRef: string
  environment: 'sandbox' | 'production'
  state: 'pending' | 'completed' | 'refused' | 'reconciliation_required' | 'cancelled'
  toolRef: string
  sellerOnboardingCanary?: SellerOnboardingCanaryExecutionEnvelope
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
      lossState?: 'none' | 'provider_output_invalid' | 'unknown'
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
  quoteRef?: string
  callRef: string
  principalId: string
  ownerId: string
  credentialId: string
  applicationRef: string
  environment: 'sandbox' | 'production'
  state: 'pending' | 'completed' | 'refused' | 'reconciliation_required' | 'cancelled'
  toolRef: string
  sellerOnboardingCanary?: SellerOnboardingCanaryExecutionEnvelope
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
