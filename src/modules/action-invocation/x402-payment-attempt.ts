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
  settledAmount?: Readonly<{ currency: string; amountMinor: number }>
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

export function createInMemoryX402PaymentAttemptPort(
  initial: readonly X402PaymentAttempt[] = [],
  initialAuthorizationEvents: readonly X402PaymentAuthorizationEvent[] = [],
): X402PaymentAttemptPort {
  const attempts = new Map(initial.map((attempt) => [x402PaymentAttemptKey(attempt), attempt]))
  const authorizationEvents = new Map(initialAuthorizationEvents.map(
    (event) => [x402PaymentAttemptKey(event), event],
  ))
  return {
    load: (key) => attempts.get(key),
    loadAuthorizationEvent: (key) => authorizationEvents.get(key),
    persist: ({ attempt, authorizationEvent }) => {
      const key = x402PaymentAttemptKey(authorizationEvent)
      if (attempt !== undefined && x402PaymentAttemptKey(attempt) !== key) {
        throw new Error('x402_payment_record_attribution_invalid')
      }
      if (attempt !== undefined) attempts.set(key, attempt)
      authorizationEvents.set(key, authorizationEvent)
    },
    list: () => [...attempts.values()],
    listAuthorizationEvents: () => [...authorizationEvents.values()],
  }
}

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
