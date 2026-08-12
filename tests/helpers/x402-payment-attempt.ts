import {
  x402PaymentAttemptKey,
  type X402PaymentAttempt,
  type X402PaymentAttemptPort,
  type X402PaymentAuthorizationEvent,
} from '../../src/modules/action-invocation/x402-payment-attempt'

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
