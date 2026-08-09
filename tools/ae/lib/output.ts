import { isRecord } from '@/modules/common/is-record'
import { ConvexSourceError } from '@/lib/server/convex-source'
import { kindForStatus, PROBLEM_KINDS, type ProblemKind } from '@/lib/errors'

export type CliFailureOptions = {
  exitCode?: number
  kind?: ProblemKind
  code?: string
  detail?: unknown
}

export class CliFailure extends Error {
  readonly exitCode: number
  readonly kind: ProblemKind
  readonly code: string | undefined
  readonly detail: unknown | undefined

  constructor(message: string, options: CliFailureOptions = {}) {
    super(message)
    this.name = 'CliFailure'
    this.exitCode = options.exitCode ?? 1
    this.kind = options.kind ?? 'INTERNAL'
    this.code = options.code
    this.detail = options.detail
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

/** Non-2xx is a real failure for a single-shot command; journey reports it instead. */
export function requireOk(outcome: HttpOutcome, path: string): unknown {
  if (outcome.ok) return outcome.body ?? outcome.bodyText
  const status = outcome.status
  const contentType = outcome.headers.get('content-type') ?? ''
  if (contentType.includes('application/problem+json') && isRecord(outcome.body)) {
    const body = outcome.body
    const kind = PROBLEM_KINDS.find((candidate) => candidate !== 'no_data' && candidate === body.kind) ?? kindForStatus(status)
    const code = typeof body.code === 'string' ? body.code : String(status)
    // One clean actionable line for humans; the parsed detail/code/kind ride the
    // CliFailure for the --json envelope. Never dump the raw body to stderr.
    const detail = typeof body.detail === 'string' ? body.detail : undefined
    const title = typeof body.title === 'string' ? body.title : undefined
    const suffix = (detail ?? title ?? '').replace(/\s+/gu, ' ').trim()
    throw new CliFailure(`${path} returned ${status}${suffix ? `: ${suffix}` : ''}`, {
      exitCode: 1,
      kind,
      code,
      detail,
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


