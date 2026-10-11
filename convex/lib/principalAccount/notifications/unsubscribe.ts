import type { Doc } from '../../../_generated/dataModel'
import type { QueryCtx } from '../../../_generated/server'
import { hasJourneyEvent } from '../../journey/stalled'
import type { JourneyEventName } from '../../journey/events'
/** Only controllable streams can be unsubscribed. Required (transactional) and operator mail never carries a token. */
export const UNSUBSCRIBABLE_STREAMS = ['alert', 'lifecycle'] as const
export type UnsubscribeStream = (typeof UNSUBSCRIBABLE_STREAMS)[number]

export type UnsubscribePayload = Readonly<{
  principalRef: string
  accountRef: string
  stream: UnsubscribeStream
}>

const encoder = new TextEncoder()
const decoder = new TextDecoder()

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '')
}

const fromBase64Url = (value: string): Uint8Array<ArrayBuffer> => {
  const padded = value.replace(/-/gu, '+').replace(/_/gu, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

const hmacKey = (secret: string) => crypto.subtle.importKey(
  'raw',
  encoder.encode(secret),
  { name: 'HMAC', hash: 'SHA-256' },
  false,
  ['sign', 'verify'],
)

/** Token is `base64url(json payload).base64url(HMAC-SHA256 of the payload segment)`. The address never appears in it. */
export async function signUnsubscribeToken(secret: string, payload: UnsubscribePayload): Promise<string> {
  const body = toBase64Url(encoder.encode(JSON.stringify({
    principalRef: payload.principalRef,
    accountRef: payload.accountRef,
    stream: payload.stream,
  })))
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(body))
  return `${body}.${toBase64Url(new Uint8Array(signature))}`
}

/** `crypto.subtle.verify` compares in constant time. Any malformed input returns null rather than throwing. */
export async function verifyUnsubscribeToken(secret: string, token: string): Promise<UnsubscribePayload | null> {
  const [body, signature, extra] = token.split('.')
  if (body === undefined || body.length === 0 || signature === undefined || extra !== undefined) return null
  try {
    const valid = await crypto.subtle.verify('HMAC', await hmacKey(secret), fromBase64Url(signature), encoder.encode(body))
    if (!valid) return null
    const parsed: unknown = JSON.parse(decoder.decode(fromBase64Url(body)))
    if (typeof parsed !== 'object' || parsed === null) return null
    const { principalRef, accountRef, stream } = parsed as Record<string, unknown>
    if (typeof principalRef !== 'string' || typeof accountRef !== 'string') return null
    if (!UNSUBSCRIBABLE_STREAMS.some((allowed) => allowed === stream)) return null
    return { principalRef, accountRef, stream: stream as UnsubscribeStream }
  } catch {
    return null
  }
}

/** One-click unsubscribe URL for a controllable stream. Null when this deployment cannot sign one, so the caller skips the send. */
export async function unsubscribeUrlFor(payload: UnsubscribePayload): Promise<string | null> {
  const secret = process.env.EMAIL_UNSUBSCRIBE_SECRET?.trim()
  const siteUrl = process.env.AE_SITE_URL?.trim().replace(/\/+$/u, '')
  if (!secret || !siteUrl) return null
  return `${siteUrl}/api/unsubscribe?t=${encodeURIComponent(await signUnsubscribeToken(secret, payload))}`
}

/** Lifecycle kinds that run through the account notice reader, with the journey events that end each one (design doc section 5). Stalled nudges end on their own step completion, checked in stalled.ts. */
export const LIFECYCLE_EXIT_EVENTS: Partial<Record<Doc<'notificationDeliveries'>['eventKind'], JourneyEventName[]>> = {
  welcome: ['funded'],
  first_call_done: [],
  week_one_wrap: [],
  first_call_failed: ['first_call'],
  stalled_not_funded: [],
  stalled_no_agent: [],
  stalled_never_called: [],
}

/** Send-time lifecycle checks shared by every lifecycle kind: exit conditions, owner opt-out, then the signed unsubscribe link (set on props). Returns a skip code or null. */
export async function lifecycleSkipCode(ctx: QueryCtx, delivery: Doc<'notificationDeliveries'>, props: Record<string, string>): Promise<string | null> {
  for (const event of LIFECYCLE_EXIT_EVENTS[delivery.eventKind] ?? []) {
    if (await hasJourneyEvent(ctx, delivery.accountRef, event)) return `${delivery.eventKind}_exited`
  }
  if (await hasJourneyEvent(ctx, delivery.accountRef, 'lifecycle_unsubscribed')) return 'opted_out'
  const unsubscribeUrl = await unsubscribeUrlFor({ principalRef: delivery.recipientPrincipalRef, accountRef: delivery.accountRef, stream: 'lifecycle' })
  if (unsubscribeUrl === null) return 'unsubscribe_url_missing'
  props.unsubscribeUrl = unsubscribeUrl
  return null
}
