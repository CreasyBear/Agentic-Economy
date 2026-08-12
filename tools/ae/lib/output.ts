import { isRecord } from '@/modules/common/is-record'
import { ConvexSourceError } from '@/lib/server/convex-source'
import { kindForStatus, PROBLEM_KINDS, type ProblemKind } from '@/lib/errors'

export type CliFailureOptions = {
  exitCode?: number
  kind?: ProblemKind
  code?: string
  detail?: unknown
  retryable?: boolean
  retryAfter?: string
  recovery?: unknown
  nextAction?: unknown
}

export class CliFailure extends Error {
  readonly exitCode: number
  readonly kind: ProblemKind
  readonly code: string | undefined
  readonly detail: unknown | undefined
  readonly retryable: boolean | undefined
  readonly retryAfter: string | undefined
  readonly recovery: unknown | undefined
  readonly nextAction: unknown | undefined

  constructor(message: string, options: CliFailureOptions = {}) {
    super(message)
    this.name = 'CliFailure'
    this.exitCode = options.exitCode ?? 1
    this.kind = options.kind ?? 'INTERNAL'
    this.code = options.code
    this.detail = options.detail
    this.retryable = options.retryable
    this.retryAfter = options.retryAfter
    this.recovery = options.recovery
    this.nextAction = options.nextAction
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
const SAFE_FAILURE_CODE = /^[a-z][a-z0-9_:-]{0,95}$/u
const MAX_FAILURE_TEXT_LENGTH = 2_000

function boundedFailureText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  return value.slice(0, MAX_FAILURE_TEXT_LENGTH)
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
    const body = outcome.body
    const kind = PROBLEM_KINDS.find((candidate) => candidate !== 'no_data' && candidate === body.kind) ?? kindForStatus(status)
    const code = typeof body.code === 'string' && SAFE_FAILURE_CODE.test(body.code) ? body.code : String(status)
    const detail = boundedFailureText(body.detail)
    const title = boundedFailureText(body.title)
    const retryAfter = outcome.headers.get('retry-after')?.trim()
    // One clean actionable line for humans; the parsed detail/code/kind and
    // explicit retry/recovery fields ride the CliFailure for --json.
    const suffix = (detail ?? title ?? '').replace(/\s+/gu, ' ').trim()
    throw new CliFailure(`${path} returned ${status}${suffix ? `: ${suffix}` : ''}`, {
      exitCode: 1,
      kind,
      code,
      detail,
      ...(typeof body.retryable === 'boolean' ? { retryable: body.retryable } : {}),
      ...(retryAfter === undefined || retryAfter.length === 0 ? {} : { retryAfter }),
      ...(body.recovery === undefined ? {} : { recovery: body.recovery }),
      ...(body.nextAction === undefined ? {} : { nextAction: body.nextAction }),
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


