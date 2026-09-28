import { isRecord } from '@/modules/common/is-record'
import { ConvexSourceError } from '@/lib/server/convex-source'
import { buildProblem, remoteProblemToProblem, type ProblemKind } from '@/lib/errors'
import { HOSTED_DEFAULT_BASE_URL, safeOriginForDiagnostics } from './args'
import { authContinuation } from '@/lib/http/auth-continuation'
import { projectCliJourneyProblem, validateJourneyNext, type JourneyNext } from '@/modules/actions'
import { journeyNextCommand } from './journey-next-command'

const REDACTED_FAILURE_VALUE = '<redacted>'
/**
 * Only secret-bearing fields are dropped. Structural fields (path, input, url,
 * refs) stay, because a placeholder in their place makes the envelope lie about
 * the continuation the caller must perform; their string values are still
 * sanitized for embedded credentials.
 */
const SECRET_FAILURE_FIELD = /^(?:authorization|access[_-]?token|api[_-]?key|bearer|cookie|credential|headers?|password|secret|token|userinfo)$/iu
const URL_IN_FAILURE_TEXT = /https?:\/\/[^\s"'<>]+/giu
const SENSITIVE_FAILURE_TEXT = /\b(?:authorization|access[_-]?token|api[_-]?key|bearer|idempotency[_-]?key|invocation[_-]?ref|password|secret|token)\s*[:=]\s*[^\s,;]+/giu

function sanitizeFailureText(value: string): string {
  return value
    .replace(URL_IN_FAILURE_TEXT, (url) => {
      const trailing = url.match(/[.,;!?]+$/u)?.[0] ?? ''
      return `${safeOriginForDiagnostics(url.slice(0, url.length - trailing.length))}${trailing}`
    })
    .replace(/\bBearer\s+\S+/giu, 'Bearer <redacted>')
    .replace(SENSITIVE_FAILURE_TEXT, (field) => `${field.slice(0, field.search(/[:=]/u) + 1)}${REDACTED_FAILURE_VALUE}`)
}

/** Secret fields are omitted rather than replaced, so the surviving structure stays honest. */
function sanitizeFailureValue(value: unknown): unknown {
  if (typeof value === 'string') return sanitizeFailureText(value)
  if (Array.isArray(value)) return value.map((item) => sanitizeFailureValue(item))
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SECRET_FAILURE_FIELD.test(key))
      .map(([key, item]) => [key, sanitizeFailureValue(item)]),
  )
}

/** Show enough of a credential-shaped value to identify it, never enough to use it. */
export function maskCredential(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length <= 12) return REDACTED_FAILURE_VALUE
  return `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`
}

export type CliFailureOptions = {
  exitCode?: number
  kind?: ProblemKind
  code?: string
  status?: number
  instance?: string
  requestId?: string
  next?: readonly JourneyNext[]
  detail?: unknown
  retryable?: boolean
  retryAfter?: string
  suggestion?: string
  nextCommand?: string
}

export class CliFailure extends Error {
  readonly exitCode: number
  readonly kind: ProblemKind
  readonly code: string | undefined
  readonly status: number | undefined
  readonly instance: string | undefined
  readonly requestId: string | undefined
  readonly next: CliFailureOptions['next']
  readonly detail: unknown | undefined
  readonly retryable: boolean | undefined
  readonly retryAfter: string | undefined
  readonly suggestion: string | undefined
  readonly nextCommand: string | undefined

  constructor(message: string, options: CliFailureOptions = {}) {
    super(sanitizeFailureText(message))
    this.name = 'CliFailure'
    this.exitCode = options.exitCode ?? 1
    this.kind = options.kind ?? 'INTERNAL'
    this.code = options.code
    this.status = options.status
    this.instance = options.instance
    this.requestId = options.requestId
    this.next = options.next
    this.detail = options.detail === undefined ? undefined : sanitizeFailureValue(options.detail)
    this.retryable = options.retryable
    this.retryAfter = options.retryAfter
    this.suggestion = options.suggestion === undefined ? undefined : sanitizeFailureText(options.suggestion)
    this.nextCommand = options.nextCommand === undefined ? undefined : sanitizeFailureText(options.nextCommand)
  }
}

/** Preserve typed Convex source failures without exposing an arbitrary error payload. */
export function sourceErrorToCliFailure(error: unknown): CliFailure | undefined {
  if (!(error instanceof ConvexSourceError)) return undefined
  const kind: ProblemKind = error.code === 'missing_auth' ? 'UNAUTHENTICATED' : 'UNAVAILABLE'
  return new CliFailure(error.message, {
    kind,
    code: error.code,
    detail: error.message,
  })
}


/** Local CLI failures and validated remote problems share one JSON boundary. */
export function cliFailureToProblem(
  failure: CliFailure,
  presentation: Readonly<{ suggestion?: string; nextCommand?: string; origin?: string }> = {},
): Record<string, unknown> {
  const detail = typeof failure.detail === 'string' ? failure.detail : failure.message
  const next = [
    ...(failure.kind === 'UNAUTHENTICATED' && failure.nextCommand === undefined ? authContinuation() : []),
    ...(failure.next ?? []),
  ]
  const refs = isRecord(failure.detail)
    ? Object.fromEntries(Object.entries(failure.detail)
      .filter(([key, value]) => /^(?:callRef|quoteRef|recoveryRef|toolRef|idempotencyKey|identityPreserved)$/u.test(key)
        && (typeof value === 'string' || typeof value === 'boolean')))
    : {}
  const projected = projectCliJourneyProblem({
    ...buildProblem({
      kind: failure.kind, code: failure.code ?? 'cli_failure',
      ...(failure.status === undefined ? {} : { status: failure.status }),
      detail,
      instance: failure.instance ?? '/cli',
      retryable: failure.retryable ?? false,
    }),
    ...(failure.requestId === undefined ? {} : { requestId: failure.requestId }),
    next,
    ...(Object.keys(refs).length === 0 ? {} : { refs }),
  }, {
    source: failure.requestId === undefined ? 'local' : 'remote',
    origin: presentation.origin ?? HOSTED_DEFAULT_BASE_URL,
    exitCode: failure.exitCode,
  })
  const explicitAuthCommand = failure.kind === 'UNAUTHENTICATED'
    ? presentation.nextCommand ?? failure.nextCommand
    : undefined
  const nextCommand = explicitAuthCommand ?? (next.length > 0
    ? projected.next.map((action) => journeyNextCommand(action, {
      baseUrl: presentation.origin ?? HOSTED_DEFAULT_BASE_URL, json: false,
    })).find((command) => command !== undefined)
    : presentation.nextCommand ?? failure.nextCommand)
  return {
    ...projected,
    message: failure.message,
    ...(failure.retryAfter === undefined ? {} : { retryAfter: failure.retryAfter }),
    ...((presentation.suggestion ?? failure.suggestion) === undefined ? {} : { suggestion: presentation.suggestion ?? failure.suggestion }),
    ...(nextCommand === undefined ? {} : { nextCommand }),
  }
}

export type HttpOutcome = {
  status: number
  ok: boolean
  durationMs: number
  headers: Headers
  body: unknown
  baseUrl?: string
  bodyText: string
}

export const CLI_REQUEST_TIMEOUT_MS = 15_000

export async function callJson(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
): Promise<HttpOutcome> {
  const startedAt = Date.now()
  const deadline = new AbortController()
  const timer = setTimeout(() => deadline.abort(), CLI_REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: init.signal === undefined || init.signal === null
        ? deadline.signal : AbortSignal.any([init.signal, deadline.signal]),
      redirect: 'manual',
      headers: {
        Accept: 'application/json',
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...init.headers,
      },
    })
    // Keep the same deadline active until the entire response has been consumed.
    return { ...await readHttpOutcome(response, startedAt), baseUrl }
  } catch (error) {
    if (deadline.signal.aborted) {
      throw new CliFailure(`The request timed out after ${CLI_REQUEST_TIMEOUT_MS}ms.`, {
        kind: 'UNAVAILABLE', code: 'request-timeout',
      })
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export async function readHttpOutcome(response: Response, startedAt: number): Promise<HttpOutcome> {
  const bodyText = await response.text()
  const durationMs = Date.now() - startedAt

  let body: unknown
  try {
    body = JSON.parse(bodyText)
  } catch {
    body = undefined
  }

  return { status: response.status, ok: response.ok, durationMs, headers: response.headers, body, bodyText }
}
function isStructuredFailureBody(body: unknown, contentType: string): body is Record<string, unknown> {
  if (!isRecord(body)) return false
  if (!contentType.includes('application/problem+json') && !contentType.includes('application/json')) return false
  return ['type', 'title', 'kind', 'detail'].some((key) => key in body)
}

/** Non-2xx is a real failure for a single-shot command; journey reports it instead. */
export function requireOk(outcome: HttpOutcome, path: string): unknown {
  if (outcome.ok) return outcome.body ?? outcome.bodyText
  const status = outcome.status
  const contentType = (outcome.headers.get('content-type') ?? '').toLowerCase()
  if (isStructuredFailureBody(outcome.body, contentType)) {
    const problem = remoteProblemToProblem({ status, body: outcome.body, ...(outcome.baseUrl === undefined ? {} : { baseUrl: outcome.baseUrl }) })
    const retryAfter = outcome.headers.get('retry-after')?.trim()
    // One clean actionable line for humans; the canonical kind/code and
    // retry fields ride the CliFailure for --json.
    throw new CliFailure(`${path} returned ${status}: ${problem.title}`, {
      exitCode: 1,
      kind: problem.kind,
      status: problem.status,
      ...(typeof problem.instance === 'string' ? { instance: problem.instance } : {}),
      ...(Array.isArray(outcome.body.next) ? { next: validateJourneyNext(outcome.body.next, { origin: outcome.baseUrl ?? HOSTED_DEFAULT_BASE_URL }) } : {}),
      ...(outcome.headers.get('x-ae-request-id')?.match(/^[a-zA-Z0-9_-]{1,128}$/u) ? { requestId: outcome.headers.get('x-ae-request-id')! } : {}),
      code: problem.code,
      ...(problem.retryable === undefined ? {} : { retryable: problem.retryable }),
      ...(retryAfter === undefined || retryAfter.length === 0 ? {} : { retryAfter }),
    })
  }
  throw new CliFailure(`${path} returned ${status}`)
}

export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, undefined, 2)}\n`)
}

export function heading(text: string): void {
  process.stdout.write(`\n${text}\n${'-'.repeat(text.length)}\n`)
}

export function line(text = ''): void {
  process.stdout.write(`${text}\n`)
}

export function table(rows: readonly (readonly [string, string])[]): void {
  const width = rows.reduce((widest, [label]) => Math.max(widest, label.length), 0)
  for (const [label, value] of rows) {
    process.stdout.write(`  ${label.padEnd(width)}  ${value}\n`)
  }
}
