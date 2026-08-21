import { callPublicSourceMutation, sourceMutation } from '@/lib/server/convex-source'
import { readCookie } from '@/lib/http/cookies'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { problem } from '@/lib/server/problem'
import { isLocalE2EAuthBypassEnabled } from '@/lib/server/local-e2e-bypass'

export type RateLimitName =
  | 'public-read'
  | 'public-mutation'
  | 'oauth-issuance'
  | 'answer-turn-submit'
  | 'answer-stream'

export type RateLimitResult =
  | { ok: true; retryAfter?: number | undefined }
  | { ok: false; retryAfter: number }

type RateLimitMutationArgs = {
  name: RateLimitName
  key: string
}

const admitMutation = sourceMutation<RateLimitMutationArgs, RateLimitResult>('rateLimit:admitHttp')

export type RateLimitAdmission = (input: Readonly<{
  request: Request
  key?: string
  keySuffix?: string
}>) => Promise<RateLimitResult>
export type HttpRateLimitAdmissionForTests = (input: Readonly<{
  request: Request
  name: RateLimitName
  key: string
}>) => Promise<RateLimitResult>

let admissionForTests: HttpRateLimitAdmissionForTests | undefined

export function setHttpRateLimitAdmissionForTests(admission: HttpRateLimitAdmissionForTests | undefined): void {
  admissionForTests = admission
}

export async function assertHttpAdmission(
  request: Request,
  name: RateLimitName,
  options: Readonly<{ key?: string; keySuffix?: string }> = {},
): Promise<RateLimitResult> {
  const key = options.key ?? requestAdmissionKey(request, options.keySuffix)
  if (admissionForTests !== undefined) return await admissionForTests({ request, name, key })
  if (isLocalE2EAuthBypassEnabled()) return { ok: true }
  return await callPublicSourceMutation(admitMutation, { name, key })
}

export function createHttpRateLimitAdmission(name: RateLimitName): RateLimitAdmission {
  return async ({ request, key, keySuffix }) => await assertHttpAdmission(request, name, {
    ...(key === undefined ? {} : { key }),
    ...(keySuffix === undefined ? {} : { keySuffix }),
  })
}

export async function withHttpRateLimit(
  request: Request,
  name: RateLimitName,
  operation: () => Promise<Response>,
): Promise<Response> {
  const admission = await assertHttpAdmission(request, name)
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
    { 'Retry-After': String(retryAfterSeconds) },
  )
}

export function requestAdmissionKey(request: Request, keySuffix?: string): string {
  const identity = requestIdentity(request)
  const base = `${identity.kind}:${canonicalDigest(identity.value)}`
  return keySuffix === undefined || keySuffix.length === 0
    ? base
    : `${base}:${canonicalDigest(keySuffix)}`
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

