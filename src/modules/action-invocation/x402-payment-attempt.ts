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
  amount: string
  providerEndpoint: string
  operationRevision: string
  authorizationDigest: string
  custodyRef: string
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

export function x402PaymentAttemptKey(input: Readonly<{
  invocationRef: string
  attemptRef: string
  effectGeneration: number
}>): string {
  return `${input.invocationRef}\u0000${input.attemptRef}\u0000${input.effectGeneration}`
}
