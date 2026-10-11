import {
  callPublicSourceMutation,
  createConvexServerFunctionAssertion,
  sourceMutation,
  type ConvexServerFunctionAssertion,
} from '@/lib/server/convex-source'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { degrade } from '@/lib/observability/degrade'
import { problem } from '@/lib/server/problem'
import { awaitBoundedRead, SOURCE_READ_TIMEOUT_MS } from '@/lib/bounded-read'

export type RateLimitName =
  | 'public-read'
  | 'public-mutation'
  | 'oauth-issuance'
  | 'oauth-device-poll'
  | 'chat-anonymous'
  | 'chat-anonymous-edge'
  | 'mcp-anonymous'
  | 'funding-checkout'

type HttpRateLimitName = Exclude<RateLimitName, 'chat-submit' | 'chat-anonymous'>
type GenericHttpRateLimitName = Exclude<HttpRateLimitName, 'chat-anonymous-edge'>

export type RateLimitResult =
  | { ok: true; retryAfter?: number | undefined }
  | { ok: false; retryAfter: number }

type RateLimitMutationArgs = {
  name: GenericHttpRateLimitName
  key: string
  serviceAuth: ConvexServerFunctionAssertion
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
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(SOURCE_READ_TIMEOUT_MS)])
  // Bound the admission decision, including signing and transports that ignore
  // abort. An uncertain quota debit never permits or retries the operation.
  return await awaitBoundedRead(signal => readHttpAdmission(request, name, options, signal), signal)
}

async function readHttpAdmission(
  request: Request,
  name: HttpRateLimitName,
  options: Readonly<{ key?: string; keySuffix?: string }>,
  signal: AbortSignal,
): Promise<RateLimitResult> {
  const key = options.key ?? (name === 'chat-anonymous-edge'
    ? anonymousChatAdmissionKey(request)
    : requestAdmissionKey(request, options.keySuffix))
  if (admissionForTests !== undefined) return await admissionForTests({ request, name, key })
  if (name === 'chat-anonymous-edge') {
    const serviceAuth = await createConvexServerFunctionAssertion({
      operation: 'chatAdmission.admitAnonymousEdge',
      scope: 'chat_anonymous:admit',
      command: { key },
    })
    signal.throwIfAborted()
    const result = await callPublicSourceMutation(anonymousChatAdmissionMutation, {
      key,
      serviceAuth,
    }, { signal })
    if (result.kind === 'refused') throw new Error('anonymous_chat_admission_refused')
    return result.kind === 'limited'
      ? { ok: false, retryAfter: result.retryAfter }
      : result.retryAfter === undefined
        ? { ok: true }
        : { ok: true, retryAfter: result.retryAfter }
  }
  const serviceAuth = await createConvexServerFunctionAssertion({
    operation: 'rateLimit.admitHttp',
    scope: 'rate_limit:admit_http',
    command: { name, key },
  })
  signal.throwIfAborted()
  return await callPublicSourceMutation(admitMutation, { name, key, serviceAuth }, { signal })
}

export function createHttpRateLimitAdmission(name: HttpRateLimitName): RateLimitAdmission {
  return async ({ request, key, keySuffix }) => await assertHttpAdmission(request, name, {
    ...(key === undefined ? {} : { key }),
    ...(keySuffix === undefined ? {} : { keySuffix }),
  })
}

/**
 * Requires a deferred operation and successful external admission before dispatch.
 * Ensures admission failure returns a retryable 503 without invoking the operation.
 * Invariant: exhaustion stays 429; admitted operation errors propagate unchanged.
 * On violation: report unavailability, never retry or substitute an admission.
 */
export async function withHttpRateLimit(
  request: Request,
  name: HttpRateLimitName,
  operation: () => Promise<Response>,
): Promise<Response> {
  let admission: RateLimitResult
  try {
    admission = await assertHttpAdmission(request, name)
    request.signal.throwIfAborted()
  } catch (cause) {
    return degrade(cause, problem({
      status: 503, kind: 'UNAVAILABLE', code: 'source_unavailable', retryable: true,
      detail: 'Request admission is temporarily unavailable. Retry after 5 seconds.',
    }, { 'Retry-After': '5' }), { site: 'withHttpRateLimit', reason: 'source_unavailable' })
  }
  if (!admission.ok) return rateLimitedResponse(admission.retryAfter)
  return await operation()
}

export function rateLimitedResponse(retryAfter: number): Response {
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
    },
  )
}

export function requestAdmissionKey(request: Request, keySuffix?: string): string {
  const base = `ip:${canonicalDigest(trustedIngressIp(request))}`
  return keySuffix === undefined || keySuffix.length === 0
    ? base
    : `${base}:${canonicalDigest(keySuffix)}`
}

export function anonymousChatAdmissionKey(request: Request): string {
  return `ip:${canonicalDigest(trustedIngressIp(request))}:${canonicalDigest('chat-anonymous')}`
}

function trustedIngressIp(request: Request): string {
  // Client-IP trust assumes the Vercel deploy host (vercel.json); off-Vercel header trust is dev-only.
  const ingress = process.env.VERCEL === undefined
    ? firstNonEmptyHeader(request, ['x-vercel-forwarded-for', 'cf-connecting-ip', 'x-real-ip'])
    : request.headers.get('x-vercel-forwarded-for')
  return ingress?.split(',')[0]?.trim() || 'unknown'
}

function firstNonEmptyHeader(request: Request, names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = request.headers.get(name)?.trim()
    if (value !== undefined && value.length > 0) return value
  }
  return undefined
}
