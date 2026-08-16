import type {
  X402SettlementResponse,
  X402SettlementStatus,
} from '@/modules/capability-supply/route-transport-runtime'
import type { ExactAmount } from '@/modules/money/public'

export type X402PaymentAttemptState =
  | 'prepared'
  | 'possibly_submitted'
  | 'observed'
  | 'reconciliation_required'
  | 'not_settled'
  | 'settled'

export type X402PaymentAttempt = Readonly<{
  paymentIdentifier: string
  invocationRef: string
  attemptRef: string
  effectGeneration: number
  operationKey: string
  challengeDigest: string
  scheme: string
  network: string
  asset: string
  payTo: string
  amount: ExactAmount
  providerEndpoint: string
  operationRevision: string
  authorizationDigest: string
  custodyRef: string
  operationRef?: string
  inputDigest?: string
  paymentObservationDigest?: string
  settlementStatus?: X402SettlementStatus
  settlementResponse?: X402SettlementResponse
  settlementDigest?: string
  paymentResolution?: 'not_released' | 'released' | 'unknown'
  settledAmount?: ExactAmount
  reconciliationEvidenceRef?: string
  reconciliationEvidenceDigest?: string
  state: X402PaymentAttemptState
  preparedAt: number
  submissionStartedAt?: number
  observedAt?: number
  evidenceRefs: readonly string[]
}>

export type X402PaymentAuthorizationEvent = Readonly<{
  invocationRef: string
  attemptRef: string
  effectGeneration: number
  operationKey: string
  queryRelease: 'released'
  authorization: 'not_created' | 'created' | 'unknown'
  recordedAt: number
  challengeDigest?: string
  authorizationDigest?: string
}>

export type X402PaymentAttemptPort = Readonly<{
  load(key: string): X402PaymentAttempt | undefined
  loadAuthorizationEvent(key: string): X402PaymentAuthorizationEvent | undefined
  persist(record: Readonly<{
    attempt?: X402PaymentAttempt
    authorizationEvent: X402PaymentAuthorizationEvent
  }>): Promise<void> | void
  list(): readonly X402PaymentAttempt[]
  listAuthorizationEvents(): readonly X402PaymentAuthorizationEvent[]
}>

export function x402CustodyDigestReferenceValid(value: string): boolean {
  return /^sha256:[0-9a-f]{64}$/.test(value)
}

export function x402PaymentAttemptKey(input: Readonly<{
  invocationRef: string
  attemptRef: string
  effectGeneration: number
}>): string {
  return `${input.invocationRef}\u0000${input.attemptRef}\u0000${input.effectGeneration}`
}
