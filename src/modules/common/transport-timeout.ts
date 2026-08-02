export async function runWithAbortAndTimeout<T>(input: Readonly<{
  timeoutMs?: number
  timeoutError: (timeoutMs: number) => Error
  abortError?: (reason: unknown) => Error
  parentSignal?: AbortSignal
  useControllerSignal?: boolean
  deferRun?: boolean
  run: (signal: AbortSignal | undefined) => T | Promise<T>
  timeoutErrorMs?: number
}>): Promise<T> {
  const parentSignal = input.parentSignal
  if (parentSignal?.aborted === true) {
    throw input.abortError?.(parentSignal.reason) ?? new Error('Operation aborted')
  }

  const controller = new AbortController()
  const workSignal = input.useControllerSignal === false ? parentSignal : controller.signal
  const generated = input.deferRun === true
    ? Promise.resolve().then(() => input.run(workSignal))
    : Promise.resolve(input.run(workSignal))
  const timeoutSignal = input.timeoutMs === undefined ? undefined : AbortSignal.timeout(input.timeoutMs)
  const abortSignal = parentSignal === undefined
    ? timeoutSignal
    : timeoutSignal === undefined
      ? parentSignal
      : AbortSignal.any([parentSignal, timeoutSignal])

  if (abortSignal === undefined) {
    return generated
  }

  let onAbort: (() => void) | undefined
  const deadline = new Promise<never>((_resolve, reject) => {
    onAbort = () => {
      const timedOut = timeoutSignal !== undefined && abortSignal.reason === timeoutSignal.reason
      const reason = parentSignal === undefined ? abortSignal.reason : parentSignal.reason
      const error = timedOut
        ? input.timeoutError(input.timeoutErrorMs ?? input.timeoutMs ?? 0)
        : input.abortError?.(reason) ?? new Error('Operation aborted')
      controller.abort(error)
      reject(error)
    }

    if (abortSignal.aborted) {
      onAbort()
    } else {
      abortSignal.addEventListener('abort', onAbort, { once: true })
    }
  })

  try {
    return await Promise.race([generated, deadline])
  } finally {
    if (onAbort !== undefined) {
      abortSignal.removeEventListener('abort', onAbort)
    }
  }
}
