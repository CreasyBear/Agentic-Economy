import { captureBackendException } from '@/lib/observability/degrade-backend'
import type { X402EvmReceipt } from './x402-settlement-verifier'

export type X402RpcMethod = 'dns' | 'agreement' | 'confirmation' | 'eth_blockNumber'
  | 'eth_getTransactionReceipt' | 'eth_getTransactionByHash' | 'eth_getBlockByNumber' | 'eth_call'
export type X402ReceiptFailureCode = 'rpc_timeout' | 'rpc_deadline_exceeded' | 'rpc_rate_limited'
  | 'rpc_authentication_failed' | 'rpc_configuration_invalid' | 'rpc_target_refused'
  | 'rpc_invalid_response' | 'rpc_transport_unavailable' | 'receipt_missing'
  | 'receipt_immature' | 'receipt_conflict'
export type X402ReceiptFailure = Readonly<{
  kind: 'failed'; code: X402ReceiptFailureCode; method: X402RpcMethod
  provider?: 'rpc_1' | 'rpc_2'; httpStatus?: number; retryAfterMs?: number; elapsedMs?: number
}>
export type X402ReceiptReadResult = Readonly<{ kind: 'receipt'; receipt: X402EvmReceipt }> | X402ReceiptFailure

export function receiptReadFailure(code: X402ReceiptFailureCode, method: X402RpcMethod,
  details: Omit<X402ReceiptFailure, 'kind' | 'code' | 'method'> = {}): X402ReceiptFailure {
  return { kind: 'failed', code, method, ...details }
}

export function retryableReceiptFailure(failure: X402ReceiptFailure): boolean {
  return failure.code === 'rpc_timeout' || failure.code === 'rpc_transport_unavailable'
    || failure.code === 'rpc_rate_limited' || failure.code === 'receipt_missing'
}

export class X402RpcReadError extends Error {
  constructor(readonly failure: X402ReceiptFailure) {
    super(failure.code)
    this.name = 'X402RpcReadError'
  }
}

/** Viem wraps transport failures; inspect bounded causes, never messages/URLs for logging. */
export function receiptFailureFromCause(cause: unknown): X402ReceiptFailure | undefined {
  let current = cause
  for (let depth = 0; depth < 8; depth += 1) {
    if (current instanceof X402RpcReadError) return current.failure
    if (typeof current !== 'object' || current === null || !('cause' in current)) return undefined
    current = current.cause
  }
  return undefined
}

export type X402ReadBudget = Readonly<{
  deadlineAt: number; signal: AbortSignal
  run: <T>(work: () => Promise<T>, method: X402RpcMethod, provider?: 'rpc_1' | 'rpc_2', signal?: AbortSignal) => Promise<T>
  wait: (delayMs: number) => Promise<void>
  dispose: () => void
}>

/**
 * Requires an absolute bounded caller deadline. Ensures DNS, HTTP, body reads
 * and corroboration share cancellation and late results cannot become success.
 * Invariant: no side effects are retried here, no fresh clock extends the budget.
 * On violation: a sanitized typed deadline/timeout failure; listeners are removed.
 * Cost: one shared race/cleanup boundary replaces independent unbounded waits.
 */
export function createX402ReadBudget(deadlineAt: number, callerSignal?: AbortSignal): X402ReadBudget {
  const controller = new AbortController()
  const remaining = deadlineAt - Date.now()
  if (!Number.isSafeInteger(deadlineAt) || remaining > 120_000) {
    throw new X402RpcReadError(receiptReadFailure('rpc_configuration_invalid', 'confirmation'))
  }
  const abortFromCaller = () => controller.abort()
  callerSignal?.addEventListener('abort', abortFromCaller, { once: true })
  if (callerSignal?.aborted) controller.abort()
  const timer = setTimeout(() => controller.abort(), Math.max(0, remaining))
  if (remaining <= 0) controller.abort()
  return {
    deadlineAt, signal: controller.signal,
    run<T>(work: () => Promise<T>, method: X402RpcMethod, provider?: 'rpc_1' | 'rpc_2', localSignal = controller.signal): Promise<T> {
      const signal = localSignal === controller.signal ? localSignal : AbortSignal.any([controller.signal, localSignal])
      const failure = () => new X402RpcReadError(receiptReadFailure(
        controller.signal.aborted || Date.now() >= deadlineAt ? 'rpc_deadline_exceeded' : 'rpc_timeout', method,
        provider === undefined ? {} : { provider },
      ))
      if (signal.aborted || controller.signal.aborted || Date.now() >= deadlineAt) return Promise.reject(failure())
      return new Promise<T>((resolve, reject) => {
        const abort = () => reject(failure())
        signal.addEventListener('abort', abort, { once: true })
        void Promise.resolve().then(() => {
          if (signal.aborted || controller.signal.aborted || Date.now() >= deadlineAt) throw failure()
          return work()
        }).then(value => {
          if (signal.aborted || controller.signal.aborted || Date.now() >= deadlineAt) reject(failure())
          else resolve(value)
        }, reject).finally(() => signal.removeEventListener('abort', abort))
      })
    },
    wait(delayMs) {
      if (controller.signal.aborted || Date.now() + delayMs >= deadlineAt) {
        return Promise.reject(new X402RpcReadError(receiptReadFailure('rpc_deadline_exceeded', 'confirmation')))
      }
      return new Promise<void>((resolve, reject) => {
        const abort = () => { clearTimeout(delayTimer); reject(new X402RpcReadError(receiptReadFailure('rpc_deadline_exceeded', 'confirmation'))) }
        const delayTimer = setTimeout(() => { controller.signal.removeEventListener('abort', abort); resolve() }, delayMs)
        controller.signal.addEventListener('abort', abort, { once: true })
      })
    },
    dispose() { clearTimeout(timer); callerSignal?.removeEventListener('abort', abortFromCaller); controller.abort() },
  }
}

/** Only fixed enums and numeric diagnostics cross the logging boundary. */
export function reportX402ReceiptFailure(failure: X402ReceiptFailure): void {
  captureBackendException(failure.code, {
    operation: 'x402ReceiptRead', method: failure.method,
    ...(failure.provider === undefined ? {} : { provider: failure.provider }),
    ...(failure.httpStatus === undefined ? {} : { httpStatus: String(failure.httpStatus) }),
    ...(failure.retryAfterMs === undefined ? {} : { retryAfterMs: String(failure.retryAfterMs) }),
    ...(failure.elapsedMs === undefined ? {} : { elapsedMs: String(failure.elapsedMs) }),
  })
}
