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

export type X402PaymentAttemptPort = Readonly<{
  load(key: string): X402PaymentAttempt | undefined
  persist(attempt: X402PaymentAttempt): Promise<void> | void
  list(): readonly X402PaymentAttempt[]
}>

export function createInMemoryX402PaymentAttemptPort(
  initial: readonly X402PaymentAttempt[] = [],
): X402PaymentAttemptPort {
  const attempts = new Map(initial.map((attempt) => [x402PaymentAttemptKey(attempt), attempt]))
  return {
    load: (key) => attempts.get(key),
    persist: (attempt) => {
      attempts.set(x402PaymentAttemptKey(attempt), attempt)
    },
    list: () => [...attempts.values()],
  }
}

export function x402PaymentAttemptKey(input: Readonly<{
  invocationRef: string
  attemptRef: string
  effectGeneration: number
}>): string {
  return `${input.invocationRef}\u0000${input.attemptRef}\u0000${input.effectGeneration}`
}
