import { isRecord } from '@/modules/common/is-record'
import { ConvexSourceError } from '@/lib/server/convex-source'
import { remoteProblemToProblem, type ProblemKind } from '@/lib/errors'
import { safeOriginForDiagnostics } from './args'

const REDACTED_FAILURE_VALUE = '<redacted>'
const SENSITIVE_FAILURE_FIELD = /^(?:authorization|access[_-]?token|api[_-]?key|bearer|base[_-]?url|body|credential|cookie|headers?|idempotency[_-]?key|invocation[_-]?ref|password|path|query|raw[_-]?url|request[_-]?url|retry[_-]?hint|secret|status[_-]?path|token|transport[_-]?url|url|userinfo)$/iu
const URL_IN_FAILURE_TEXT = /https?:\/\/[^\s"'<>]+/giu
const SENSITIVE_FAILURE_TEXT = /\b(?:authorization|access[_-]?token|api[_-]?key|bearer|idempotency[_-]?key|invocation[_-]?ref|password|secret|token)\s*[:=]\s*[^\s,;]+/giu

function sanitizeFailureText(value: string): string {
  return value
    .replace(URL_IN_FAILURE_TEXT, (url) => safeOriginForDiagnostics(url))
    .replace(/\bBearer\s+\S+/giu, 'Bearer <redacted>')
    .replace(SENSITIVE_FAILURE_TEXT, (field) => `${field.slice(0, field.search(/[:=]/u) + 1)}${REDACTED_FAILURE_VALUE}`)
}

function sanitizeFailureValue(value: unknown, field?: string): unknown {
  if (field !== undefined && SENSITIVE_FAILURE_FIELD.test(field)) return REDACTED_FAILURE_VALUE
  if (typeof value === 'string') return sanitizeFailureText(value)
  if (Array.isArray(value)) return value.map((item) => sanitizeFailureValue(item))
  if (!isRecord(value)) return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeFailureValue(item, key)]))
}

export type CliFailureOptions = {
  exitCode?: number
  kind?: ProblemKind
  code?: string
  detail?: unknown
  retryable?: boolean
  retryAfter?: string
}

export class CliFailure extends Error {
  readonly exitCode: number
  readonly kind: ProblemKind
  readonly code: string | undefined
  readonly detail: unknown | undefined
  readonly retryable: boolean | undefined
  readonly retryAfter: string | undefined

  constructor(message: string, options: CliFailureOptions = {}) {
    super(sanitizeFailureText(message))
    this.name = 'CliFailure'
    this.exitCode = options.exitCode ?? 1
    this.kind = options.kind ?? 'INTERNAL'
    this.code = options.code
    this.detail = options.detail === undefined ? undefined : sanitizeFailureValue(options.detail)
    this.retryable = options.retryable
    this.retryAfter = options.retryAfter
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

export type HttpOutcome = {
  status: number
  ok: boolean
  durationMs: number
  headers: Headers
  body: unknown
  bodyText: string
}

export async function callJson(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
): Promise<HttpOutcome> {
  const startedAt = Date.now()
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    redirect: 'manual',
    headers: {
      Accept: 'application/json',
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...init.headers,
    },
  })
  return readHttpOutcome(response, startedAt)
}

export async function readHttpOutcome(response: Response, startedAt: number): Promise<HttpOutcome> {
  const durationMs = Date.now() - startedAt
  const bodyText = await response.text()

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
    const problem = remoteProblemToProblem({ status, body: outcome.body })
    const retryAfter = outcome.headers.get('retry-after')?.trim()
    // One clean actionable line for humans; the canonical kind/code and
    // retry fields ride the CliFailure for --json.
    throw new CliFailure(`${path} returned ${status}: ${problem.title}`, {
      exitCode: 1,
      kind: problem.kind,
      code: problem.code,
      ...(problem.detail === undefined ? {} : { detail: problem.detail }),
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


