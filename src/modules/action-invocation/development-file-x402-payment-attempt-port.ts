import {
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { dirname } from 'node:path'
import { exactAmountSchema } from '@/modules/money/public'

import {
  x402CustodyDigestReferenceValid,
  x402PaymentAttemptKey,
  type X402PaymentAttempt,
  type X402PaymentAttemptPort,
  type X402PaymentAuthorizationEvent,
} from './x402-payment-attempt'

type DevelopmentPaymentState = Readonly<{
  format: 'x402-payment-attempts:development:v1'
  attempts: readonly X402PaymentAttempt[]
  authorizationEvents: readonly X402PaymentAuthorizationEvent[]
}>

const EMPTY: DevelopmentPaymentState = {
  format: 'x402-payment-attempts:development:v1',
  attempts: [],
  authorizationEvents: [],
}

/**
 * Labelled local-development persistence. A temp-file write, file fsync,
 * atomic rename, and directory fsync make each attempt/event pair visible
 * together after process death. This is not a production custody store.
 */
export function createDevelopmentFileX402PaymentAttemptPort(
  filePath: string,
): X402PaymentAttemptPort {
  const read = (): DevelopmentPaymentState => {
    if (!existsSync(filePath)) return EMPTY
    const value = JSON.parse(readFileSync(filePath, 'utf8')) as unknown
    assertState(value)
    return value
  }
  return {
    load: (key) => read().attempts.find((attempt) => x402PaymentAttemptKey(attempt) === key),
    loadAuthorizationEvent: (key) => read().authorizationEvents.find(
      (event) => x402PaymentAttemptKey(event) === key,
    ),
    persist: ({ attempt, authorizationEvent }) => {
      const state = read()
      const key = x402PaymentAttemptKey(authorizationEvent)
      if (attempt !== undefined && x402PaymentAttemptKey(attempt) !== key) {
        throw new Error('x402_payment_record_attribution_invalid')
      }
      if (attempt !== undefined && !x402CustodyDigestReferenceValid(attempt.custodyRef)) {
        throw new Error('x402_payment_custody_reference_invalid')
      }
      const next: DevelopmentPaymentState = {
        format: EMPTY.format,
        attempts: replaceByKey(state.attempts, key, attempt),
        authorizationEvents: replaceByKey(
          state.authorizationEvents,
          key,
          authorizationEvent,
        ),
      }
      const temporaryPath = `${filePath}.next-${process.pid}`
      writeFileSync(temporaryPath, JSON.stringify(next), { encoding: 'utf8', mode: 0o600 })
      const file = openSync(temporaryPath, 'r')
      try {
        fsyncSync(file)
      } finally {
        closeSync(file)
      }
      renameSync(temporaryPath, filePath)
      const directory = openSync(dirname(filePath), 'r')
      try {
        fsyncSync(directory)
      } finally {
        closeSync(directory)
      }
    },
    list: () => read().attempts,
    listAuthorizationEvents: () => read().authorizationEvents,
  }
}

function replaceByKey<T extends X402PaymentAttempt | X402PaymentAuthorizationEvent>(
  rows: readonly T[],
  key: string,
  value: T | undefined,
): readonly T[] {
  const retained = rows.filter((row) => x402PaymentAttemptKey(row) !== key)
  return value === undefined ? retained : [...retained, value]
}

function assertState(value: unknown): asserts value is DevelopmentPaymentState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('x402_development_payment_state_invalid')
  }
  const state = value as Record<string, unknown>
  if (state.format !== EMPTY.format
    || !Array.isArray(state.attempts)
    || !Array.isArray(state.authorizationEvents)
    || state.attempts.some((attempt) => {
      if (typeof attempt !== 'object' || attempt === null) return true
      const paymentAttempt = attempt as X402PaymentAttempt
      return !x402CustodyDigestReferenceValid(String(paymentAttempt.custodyRef))
        || !exactAmountSchema.safeParse(paymentAttempt.amount).success
        || (
          paymentAttempt.settledAmount !== undefined
          && !exactAmountSchema.safeParse(paymentAttempt.settledAmount).success
        )
    })) {
    throw new Error('x402_development_payment_state_invalid')
  }
}
