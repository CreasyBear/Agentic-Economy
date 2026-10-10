export type ResendEmailInput = Readonly<{
  apiKey: string
  from: string
  to: string
  subject: string
  text: string
  idempotencyKey: string
  /** Extra message headers, e.g. RFC 8058 List-Unsubscribe and List-Unsubscribe-Post. */
  headers?: Readonly<Record<string, string>>
}>

export type ResendEmailResult =
  | { outcome: 'sent'; vendorMessageId?: string }
  | { outcome: 'failed'; code: string }

/** One Resend POST. Throws on 429/409/5xx and network errors so the caller's retry path owns them. */
export async function postResendEmail(input: ResendEmailInput): Promise<ResendEmailResult> {
  let response: Response
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': input.idempotencyKey,
        'User-Agent': 'aecon-notifications/1',
      },
      body: JSON.stringify({
        from: input.from, to: [input.to], subject: input.subject, text: input.text,
        ...(input.headers === undefined ? {} : { headers: input.headers }),
      }),
    })
  } catch {
    throw new Error('resend_network_error')
  }

  if (response.status === 429 || response.status === 409 || response.status >= 500) {
    throw new Error(`resend_retryable_status_${response.status}`)
  }
  if (response.status < 200 || response.status >= 300) {
    return { outcome: 'failed', code: `provider_rejected_${response.status}` }
  }

  let vendorMessageId: string | undefined
  try {
    const body: unknown = await response.json()
    if (typeof body === 'object' && body !== null && 'id' in body
      && typeof body.id === 'string' && body.id.length > 0) vendorMessageId = body.id
  } catch {
    // An accepted send remains successful when Resend omits its response body.
  }
  return {
    outcome: 'sent',
    ...(vendorMessageId === undefined ? {} : { vendorMessageId }),
  }
}
