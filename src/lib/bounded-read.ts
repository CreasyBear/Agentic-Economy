export const BROWSER_READ_TIMEOUT_MS = 15_000
export const SOURCE_READ_TIMEOUT_MS = 12_000

/** Bound the complete read promise, including body consumption or a transport that ignores abort. */
export function awaitBoundedRead<T>(read: (signal: AbortSignal) => Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', abort)
    const abort = () => { cleanup(); reject(signal.reason) }
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) { abort(); return }
    try {
      read(signal).then(value => {
        cleanup()
        if (signal.aborted) reject(signal.reason)
        else resolve(value)
      }, cause => { cleanup(); reject(cause) })
    } catch (cause) { cleanup(); reject(cause) }
  })
}
