import { EMAIL_SENDER_NAME } from '../../../../src/emails/brand'

const REPLY_TO = 'support@aecon.ai'

/** A bare address gets the brand display name; an address that already has one is left alone. */
export const formatFrom = (from: string): string => (from.includes('<') ? from : `${EMAIL_SENDER_NAME} <${from}>`)

export type ResendEmailInput = Readonly<{
  apiKey: string
  from: string
  to: string
  subject: string
  text: string
  /** Rendered HTML part. Omitted for the plain-text operator digest. */
  html?: string
  idempotencyKey: string
  /** Extra message headers, e.g. RFC 8058 List-Unsubscribe and List-Unsubscribe-Post. */
  headers?: Readonly<Record<string, string>>
  /** Resend tags for filtering in the Resend dashboard: stream, event_kind and env. */
  tags?: ReadonlyArray<Readonly<{ name: string; value: string }>>
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
        from: formatFrom(input.from), reply_to: REPLY_TO, to: [input.to], subject: input.subject, text: input.text,
        ...(input.html === undefined ? {} : { html: input.html }),
        ...(input.headers === undefined ? {} : { headers: input.headers }),
        ...(input.tags === undefined ? {} : { tags: input.tags }),
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
