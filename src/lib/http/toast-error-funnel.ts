/**
 * The single global failure funnel for client-side server-function RPCs.
 *
 * TanStack Start runs `functionMiddleware` around EVERY `createServerFn`
 * invocation in the browser (registered on the start instance in
 * `src/start.ts`). This handler observes each failure once — thrown errors,
 * serialized problem bodies from raw non-serialized Responses, everything —
 * emits exactly ONE sanitized failure per event-loop tick (concurrent bursts
 * collapse instead of stacking), and re-throws untouched so callers keep
 * their original error handling.
 *
 * Emission decouples transport from UI: sanitized copy travels over
 * {@link REQUEST_FAILED_TOAST_EVENT}, consumed by the one `<Toaster>` host in
 * `src/routes/__root.tsx` which surfaces it through `@/lib/ui/toast`.
 * Sanitization itself lives in `./toast-sanitizer`.
 */
import { createMiddleware } from '@tanstack/react-start'
import { isNotFound, isRedirect } from '@tanstack/router-core'

import { sanitizeToastCopy } from './toast-sanitizer'

/** CustomEvent name carrying {@link RequestFailedToastDetail} on `detail`. */
export const REQUEST_FAILED_TOAST_EVENT = 'ae:request-failed'

/** Payload contract between the funnel and its single toast consumer. */
export type RequestFailedToastDetail = {
  /** Fully sanitized, length-capped user-facing copy. */
  message: string
}

/** Sink boundary so tests capture emissions without any event target. */
export type ToastFunnelEmit = (message: string) => void

/**
 * Raw client-middleware handler factory. The returned handler keeps the
 * wrapped chain's exact result type (`next()` passthrough); failures are
 * toasted once per event-loop tick, then re-thrown verbatim so callers keep
 * their original error handling. Testable without a start instance.
 */
export function toastErrorFunnelClient(emit: ToastFunnelEmit) {
  let toastClaimedInTick = false
  return async <TResult, Ctx extends { next: () => Promise<TResult> }>(
    options: Ctx,
  ): Promise<TResult> => {
    try {
      return await options.next()
    } catch (error) {
      // Redirects/not-found objects are navigation control flow, never failures.
      if (!isRedirect(error) && !isNotFound(error) && !toastClaimedInTick) {
        toastClaimedInTick = true
        setTimeout(() => {
          toastClaimedInTick = false
        }, 0)
        emit(sanitizeToastCopy(error))
      }
      throw error
    }
  }
}

/** Broadcast one sanitized failure on the shared global EventTarget. */
export function emitRequestFailedToast(message: string): void {
  globalThis.dispatchEvent(new CustomEvent<RequestFailedToastDetail>(REQUEST_FAILED_TOAST_EVENT, { detail: { message } }))
}

/** Production registration value wired into `createStart` functionMiddleware. */
export const toastErrorFunnel = createMiddleware({ type: 'function' }).client(toastErrorFunnelClient(emitRequestFailedToast))
