type BrowserSubmitRecoveryOptions = Readonly<{
  send?: typeof fetch
  sleep?: (milliseconds: number) => Promise<void>
}>

export async function fetchBrowserRequestWithInterpreterRecovery(
  input: RequestInfo | URL,
  init: RequestInit,
  options: BrowserSubmitRecoveryOptions = {},
): Promise<Response> {
  const send = options.send ?? fetch
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await send(input, init)
    if (!await isRetryableSubmitFailure(response) || attempt === 3) return response
    await (options.sleep ?? defaultSleep)(1_000)
  }
  throw new Error('browser_submit_interpreter_recovery_exhausted')
}

async function isRetryableSubmitFailure(response: Response): Promise<boolean> {
  if (response.status !== 503) return false
  try {
    const value: unknown = await response.clone().json()
    return value !== null && typeof value === 'object'
      && (('reason' in value && value.reason === 'interpreter_unavailable')
        || ('error' in value && value.error === 'request_unavailable'))
  } catch {
    return false
  }
}

async function defaultSleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds))
}
