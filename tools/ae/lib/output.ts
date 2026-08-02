export class CliFailure extends Error {
  readonly exitCode: number

  constructor(message: string, exitCode = 1) {
    super(message)
    this.name = 'CliFailure'
    this.exitCode = exitCode
  }
}

export type HttpOutcome = {
  status: number
  ok: boolean
  durationMs: number
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
  const durationMs = Date.now() - startedAt
  const bodyText = await response.text()

  let body: unknown
  try {
    body = JSON.parse(bodyText)
  } catch {
    body = undefined
  }

  return { status: response.status, ok: response.ok, durationMs, body, bodyText }
}

/** Non-2xx is a real failure for a single-shot command; journey reports it instead. */
export function requireOk(outcome: HttpOutcome, path: string): unknown {
  if (outcome.ok) return outcome.body ?? outcome.bodyText
  throw new CliFailure(
    `${path} returned ${outcome.status}\n${outcome.bodyText.slice(0, 600)}`,
  )
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


