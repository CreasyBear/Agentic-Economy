import { randomUUID } from 'node:crypto'

import type { CliOptions } from '../lib/args'
import { CliFailure, callJson, heading, line, printJson, requireOk, table } from '../lib/output'

/**
 * The /api/v1/requests lifecycle is agent-authenticated. Without an agent key
 * these calls return a structured refusal, which is itself the useful readback:
 * a cold agent learns the authority boundary from the response, not from docs.
 */
export async function runRequestCommand(args: readonly string[], options: CliOptions): Promise<void> {
  const [subcommand, ...rest] = args
  switch (subcommand) {
    case 'create':
      return await createRequest(rest, options)
    case 'get':
      return await readRequest(rest, options, '')
    case 'options':
      return await readRequest(rest, options, '/options')
    case 'confirm':
      return await confirmRequest(rest, options)
    default:
      throw new CliFailure(
        'Usage: npm run -s ae -- demand request create "<text>" | npm run -s ae -- demand request get <ref> | npm run -s ae -- demand request options <ref> | npm run -s ae -- demand request confirm <ref> <optionRef>',
        { kind: 'INVALID_ARGUMENT', code: 'request-usage' },
      )
  }
}

async function createRequest(args: readonly string[], options: CliOptions): Promise<void> {
  const text = args.join(' ').trim()
  if (text.length === 0) throw new CliFailure('Usage: npm run -s ae -- demand request create "<text>"', { kind: 'INVALID_ARGUMENT', code: 'request-usage' })

  const requestRef = `request:cli:${randomUUID()}`
  const outcome = await callJson(options.baseUrl, '/api/v1/requests', {
    method: 'POST',
    body: JSON.stringify({
      idempotencyKey: `command:cli:${randomUUID()}`,
      requestRef,
      agentRef: 'agent:ae-cli',
      request: text,
    }),
  })

  report('POST /api/v1/requests', outcome.status, outcome.durationMs, requireOk(outcome, 'POST /api/v1/requests'), options)
  if (!options.json) line(`\nrequestRef used: ${requestRef}`)
}

async function readRequest(args: readonly string[], options: CliOptions, suffix: string): Promise<void> {
  const ref = args[0]?.trim()
  if (ref === undefined || ref.length === 0) throw new CliFailure(`Usage: npm run -s ae -- demand request ${suffix === '' ? 'get' : 'options'} <ref>`, { kind: 'INVALID_ARGUMENT', code: 'request-usage' })

  const path = `/api/v1/requests/${encodeURIComponent(ref)}${suffix}`
  const outcome = await callJson(options.baseUrl, path)
  report(`GET ${path}`, outcome.status, outcome.durationMs, requireOk(outcome, path), options)
}

async function confirmRequest(args: readonly string[], options: CliOptions): Promise<void> {
  const [ref, optionRef] = args
  if (ref === undefined || optionRef === undefined) throw new CliFailure('Usage: npm run -s ae -- demand request confirm <ref> <optionRef>', { kind: 'INVALID_ARGUMENT', code: 'request-usage' })

  const path = `/api/v1/requests/${encodeURIComponent(ref)}/confirmation`
  const outcome = await callJson(options.baseUrl, path, {
    method: 'POST',
    body: JSON.stringify({ idempotencyKey: `command:cli:${randomUUID()}`, optionRef }),
  })
  report(`POST ${path}`, outcome.status, outcome.durationMs, requireOk(outcome, `POST ${path}`), options)
}

function report(label: string, status: number, durationMs: number, body: unknown, options: CliOptions): void {
  if (options.json) {
    printJson({ call: label, status, durationMs, body })
    return
  }

  heading(`${label} -> ${status} (${durationMs}ms)`)
  table([['body', JSON.stringify(body).slice(0, 900)]])
  if (status === 401 || status === 403) {
    line('\nThis lifecycle needs an agent key. The refusal itself is the authority readback.')
  }
}
