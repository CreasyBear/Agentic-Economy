import {
  callPublicSourceMutation,
  createConvexServerFunctionAssertion,
  sourceMutation,
  type ConvexServerFunctionAssertion,
} from '@/lib/server/convex-source'
import { readCookie } from '@/lib/http/cookies'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { problem } from '@/lib/server/problem'
import { isLocalE2EAuthBypassEnabled } from '@/lib/server/local-e2e-bypass'
import { httpRateLimitCapacity, httpRateLimitWindowMs } from '@/modules/security/rate-limit-policy'

export type RateLimitName =
  | 'public-read'
  | 'public-mutation'
  | 'oauth-issuance'
  | 'oauth-device-poll'
  | 'chat-anonymous'
  | 'chat-anonymous-edge'

type HttpRateLimitName = Exclude<RateLimitName, 'chat-submit' | 'chat-anonymous'>
type GenericHttpRateLimitName = Exclude<HttpRateLimitName, 'chat-anonymous-edge'>

export type RateLimitResult =
  | { ok: true; retryAfter?: number | undefined }
  | { ok: false; retryAfter: number }

type RateLimitMutationArgs = {
  name: GenericHttpRateLimitName
  key: string
}

const admitMutation = sourceMutation<RateLimitMutationArgs, RateLimitResult>('rateLimit:admitHttp')
type AnonymousChatAdmissionResult =
  | Readonly<{ kind: 'admitted'; retryAfter?: number }>
  | Readonly<{ kind: 'limited'; retryAfter: number }>
  | Readonly<{ kind: 'refused'; code: 'authentication_required' }>
const anonymousChatAdmissionMutation = sourceMutation<{
  key: string
  serviceAuth: ConvexServerFunctionAssertion
}, AnonymousChatAdmissionResult>('chatAdmission:admitAnonymousEdge')

export type RateLimitAdmission = (input: Readonly<{
  request: Request
  key?: string
  keySuffix?: string
}>) => Promise<RateLimitResult>
export type HttpRateLimitAdmissionForTests = (input: Readonly<{
  request: Request
  name: HttpRateLimitName
  key: string
}>) => Promise<RateLimitResult>

let admissionForTests: HttpRateLimitAdmissionForTests | undefined

export function setHttpRateLimitAdmissionForTests(admission: HttpRateLimitAdmissionForTests | undefined): void {
  admissionForTests = admission
}

export async function assertHttpAdmission(
  request: Request,
  name: HttpRateLimitName,
  options: Readonly<{ key?: string; keySuffix?: string }> = {},
): Promise<RateLimitResult> {
  const key = options.key ?? (name === 'chat-anonymous-edge'
    ? anonymousChatAdmissionKey(request)
    : requestAdmissionKey(request, options.keySuffix))
  if (admissionForTests !== undefined) return await admissionForTests({ request, name, key })
  if (isLocalE2EAuthBypassEnabled()) return { ok: true }
  if (name === 'chat-anonymous-edge') {
    const serviceAuth = await createConvexServerFunctionAssertion({
      operation: 'chatAdmission.admitAnonymousEdge',
      scope: 'chat_anonymous:admit',
      command: { key },
    })
    const result = await callPublicSourceMutation(anonymousChatAdmissionMutation, {
      key,
      serviceAuth,
    })
    if (result.kind === 'refused') throw new Error('anonymous_chat_admission_refused')
    return result.kind === 'limited'
      ? { ok: false, retryAfter: result.retryAfter }
      : result.retryAfter === undefined
        ? { ok: true }
        : { ok: true, retryAfter: result.retryAfter }
  }
  return await callPublicSourceMutation(admitMutation, { name, key })
}

export function createHttpRateLimitAdmission(name: HttpRateLimitName): RateLimitAdmission {
  return async ({ request, key, keySuffix }) => await assertHttpAdmission(request, name, {
    ...(key === undefined ? {} : { key }),
    ...(keySuffix === undefined ? {} : { keySuffix }),
  })
}

export async function withHttpRateLimit(
  request: Request,
  name: HttpRateLimitName,
  operation: () => Promise<Response>,
): Promise<Response> {
  const admission = await assertHttpAdmission(request, name)
  if (!admission.ok) return rateLimitedResponse(admission.retryAfter, name)
  const response = await operation()
  return withRateLimitHeaders(response, name, admission)
}

export function rateLimitedResponse(retryAfter: number, name?: HttpRateLimitName): Response {
  const retryAfterSeconds = Math.max(1, Math.ceil(retryAfter / 1_000))
  return problem(
    {
      status: 429,
      kind: 'RESOURCE_EXHAUSTED',
      code: 'rate_limited',
      retryable: true,
      detail: 'Rate limit exceeded. Please retry later.',
    },
    {
      'Retry-After': String(retryAfterSeconds),
      ...(name === undefined ? {} : rateLimitHeaders(name, { ok: false, retryAfter })),
    },
  )
}

/**
 * IETF `draft-ietf-httpapi-ratelimit-headers` fields. `Limit`/`Reset`'s
 * window come from the shared policy in
 * `@/modules/security/rate-limit-policy` (the same capacity/window
 * `convex/lib/rateLimit.ts` hands to the `@convex-dev/rate-limiter`
 * component) plus this admission's `ok`/`retryAfter`. The limiter's public
 * admission contract (`RateLimiter.limit`, see
 * `node_modules/@convex-dev/rate-limiter/src/client/index.ts`) returns only
 * `{ ok, retryAfter? }` - it does not report the bucket's live fill level on
 * success, and getting that would need a second component round trip
 * (`RateLimiter.getValue`, a separate query) racing the mutation that just
 * ran. Not cheap enough to justify here, so `Remaining` reports the two
 * states admission actually distinguishes: 0 once a request is rejected, the
 * full window otherwise. `Reset` uses the limiter's own `retryAfter` when it
 * computed one (the 429 case: exactly when the next token is available);
 * otherwise it reports the bucket's configured window, the worst-case time
 * to a full refill.
 */
function rateLimitHeaders(name: HttpRateLimitName, admission: RateLimitResult): Record<string, string> {
  const limit = httpRateLimitCapacity(name)
  const resetMs = admission.retryAfter ?? httpRateLimitWindowMs(name)
  return {
    'RateLimit-Limit': String(limit),
    'RateLimit-Remaining': String(admission.ok ? limit : 0),
    'RateLimit-Reset': String(Math.max(1, Math.ceil(resetMs / 1_000))),
  }
}

function withRateLimitHeaders(response: Response, name: HttpRateLimitName, admission: RateLimitResult): Response {
  const headers = new Headers(response.headers)
  for (const [key, value] of Object.entries(rateLimitHeaders(name, admission))) headers.set(key, value)
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

export function requestAdmissionKey(request: Request, keySuffix?: string): string {
  const identity = requestIdentity(request)
  const base = `${identity.kind}:${canonicalDigest(identity.value)}`
  return keySuffix === undefined || keySuffix.length === 0
    ? base
    : `${base}:${canonicalDigest(keySuffix)}`
}

export function anonymousChatAdmissionKey(request: Request): string {
  const trustedIngressIp = firstNonEmptyHeader(request, [
    'x-vercel-forwarded-for',
    'cf-connecting-ip',
    'x-real-ip',
  ])?.split(',')[0]?.trim() || 'unknown'
  return `ip:${canonicalDigest(trustedIngressIp)}:${canonicalDigest('chat-anonymous')}`
}

function requestIdentity(request: Request): Readonly<{ kind: 'principal' | 'session' | 'ip'; value: string }> {
  const principal = firstNonEmptyHeader(request, ['x-api-key'])
    ?? bearerToken(request.headers.get('authorization'))
  if (principal !== undefined) return { kind: 'principal', value: principal }

  const cookieHeader = request.headers.get('cookie')
  const session = firstNonEmptyHeader(request, ['x-ae-session-id', 'x-session-id'])
    ?? readCookie(cookieHeader, 'ae_session')
    ?? readCookie(cookieHeader, 'pseudonymous_session_id')
    ?? readCookie(cookieHeader, 'session_id')
  if (session !== undefined) return { kind: 'session', value: session }

  const ip = firstNonEmptyHeader(request, ['cf-connecting-ip', 'x-real-ip'])
    ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return { kind: 'ip', value: ip === undefined || ip.length === 0 ? 'unknown' : ip }
}

function firstNonEmptyHeader(request: Request, names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = request.headers.get(name)?.trim()
    if (value !== undefined && value.length > 0) return value
  }
  return undefined
}

function bearerToken(value: string | null): string | undefined {
  if (value === null) return undefined
  const match = /^Bearer\s+(.+)$/iu.exec(value.trim())
  return match?.[1]?.trim() || undefined
}
