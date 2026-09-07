import { isRecord } from '@/modules/common/is-record'
import { randomUUID } from 'node:crypto'
import { Buffer } from 'node:buffer'
import type { Readable } from 'node:stream'
import { CALL_ROUTE_CONTRACT } from '@/modules/capability-execution/call-entry'
import {
  callInputSchema,
  callMachineResultSchema,
  type CallMachineResult,
} from '@/modules/capability-execution/call-contracts'
import {
  TOOL_QUOTE_PATH,
  toolQuoteInputSchema,
  toolQuoteResultSchema,
} from '@/modules/capability-execution/quote'
import type { CallStatusResult } from '@/modules/capability-execution/call-recovery-contracts'
import type { CliOptions } from '../lib/args'
import { resolveAgentAccessCredential } from '../lib/config'
import { CliFailure, callJson, heading, line, printJson, requireOk, table } from '../lib/output'
import { usageFailure } from '../lib/help'
import { continuationCommand } from '../lib/continuation-command'
import {
  connectionContinuationForCli,
  creditContinuationForCli,
  callNextActionForCli,
} from '../lib/suggested-continuation-adapter'
import {
  MAX_STATUS_WAIT_MS,
  pendingDelay,
  readCallStatus,
  requireAgentAccessKey,
  terminalResult,
} from './status'

const MAX_CALL_BODY_BYTES = 256 * 1024

async function readBoundedStdin(stdin: Readable): Promise<string> {
  const chunks: Buffer[] = []
  let totalBytes = 0
  for await (const chunk of stdin) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    totalBytes += bytes.byteLength
    if (totalBytes > MAX_CALL_BODY_BYTES) {
      throw new CliFailure('Tool input is too large.', {
        kind: 'PAYLOAD_TOO_LARGE',
        code: 'payload_too_large',
      })
    }
    chunks.push(bytes)
  }
  return Buffer.concat(chunks, totalBytes).toString('utf8')
}


function parseCallResult(value: unknown): CallMachineResult {
  const parsed = callMachineResultSchema.safeParse(value)
  if (parsed.success) return parsed.data
  throw new CliFailure('The gateway returned an invalid Call result.', {
    kind: 'UNAVAILABLE',
    code: 'call-result-invalid',
  })
}

function unknownCallTransport(
  toolRef: string,
  _idempotencyKey: string,
  callRef?: string,
): CliFailure {
  const detail = {
    toolRef,
    recovery: callRef === undefined
      ? 'Repeat call with the same idempotency identity.'
      : 'Read Call status with the same Call identity.',
    identityPreserved: true,
  }
  return new CliFailure(
    `Call transport is unknown for ${toolRef}; do not retry with a new identity.`,
    {
      kind: 'UNAVAILABLE',
      code: 'call-transport-unknown',
      detail,
    },
  )
}

function waitTimeoutFailure(
  toolRef: string,
  _idempotencyKey: string,
  _callRef: string,
): CliFailure {
  const detail = {
    toolRef,
    recovery: 'Read Call status with the same Call identity before retrying.',
    identityPreserved: true,
  }
  return new CliFailure('Call wait timed out; the outcome remains unknown.', {
    kind: 'UNAVAILABLE',
    code: 'call-wait-timeout',
    detail,
  })
}

function resolveIdempotencyKey(options: CliOptions): string {
  const explicit = options.idempotencyKey?.trim()
  if (explicit !== undefined && explicit.length > 0) return explicit
  return randomUUID()
}

function callOutput(
  result: CallMachineResult | CallStatusResult,
  options: CliOptions,
): Record<string, unknown> {
  const callRef = 'callRef' in result ? result.callRef : undefined
  const continuation = result.kind === 'completed' && result.usage.chargeState === 'insufficient_credit'
    ? creditContinuationForCli()
    : result.kind === 'completed' || callRef === undefined
      ? undefined
      : result.kind === 'outcome_unknown'
        ? callNextActionForCli({ kind: 'found', callRef, state: 'reconciliation_required' })
        : callNextActionForCli({ kind: 'found', callRef, state: 'in_progress' })
  const continuationSuffix = continuationCommand([
    ...(options.baseUrlSource === undefined || options.baseUrlSource === 'hosted_default'
      ? []
      : ['--base-url', options.baseUrl]),
    ...(options.json ? ['--json'] : []),
  ])
  const nextCommand = continuation?.command === undefined
    ? undefined
    : continuationSuffix.length === 0
      ? continuation.command
      : `${continuation.command} ${continuationSuffix}`
  return {
    ...result,
    ...(nextCommand === undefined ? {} : { nextCommand }),
  }
}

async function waitForCallResult(
  options: CliOptions,
  toolRef: string,
  idempotencyKey: string,
  pending: CallMachineResult,
): Promise<CallMachineResult | CallStatusResult> {
  if (pending.kind !== 'pending' || pending.callRef.length === 0) {
    throw new CliFailure('The gateway returned a pending result without a callRef.', {
      kind: 'UNAVAILABLE',
      code: 'call-status-malformed',
    })
  }
  const callRef = pending.callRef
  const deadline = Date.now() + MAX_STATUS_WAIT_MS
  let delayMs = pendingDelay(pending)
  while (Date.now() < deadline) {
    const remainingMs = deadline - Date.now()
    await new Promise<void>((resolve) => {
      setTimeout(resolve, Math.min(delayMs, remainingMs))
    })
    if (!options.json) process.stderr.write('Waiting for the Call outcome.\n')
    let status: unknown
    try {
      status = await readCallStatus(options, callRef)
    } catch (error) {
      if (error instanceof CliFailure) throw error
      throw unknownCallTransport(toolRef, idempotencyKey, callRef)
    }
    const terminal = terminalResult(status)
    if (terminal !== undefined) {
      return isRecord(terminal) && terminal.kind === 'found'
        ? terminal as CallStatusResult
        : parseCallResult(terminal)
    }
    delayMs = pendingDelay(status, delayMs)
  }
  throw waitTimeoutFailure(toolRef, idempotencyKey, callRef)
}
export async function runCallCommand(
  args: readonly string[],
  options: CliOptions,
  stdin: Readable = process.stdin,
): Promise<void> {
  const toolRef = args[0]?.trim()
  if (
    args.length !== 1
    || toolRef === undefined
    || toolRef.length === 0
  ) {
    throw usageFailure('call', 'call-usage')
  }

  const configuredInput = options.input?.trim()
  if (configuredInput === undefined || configuredInput.length === 0) {
    throw usageFailure('call', 'call-usage')
  }
  const rawInput = (configuredInput === '-' ? await readBoundedStdin(stdin) : configuredInput).trim()
  if (rawInput.length === 0) throw usageFailure('call', 'call-usage')
  let input: unknown
  try {
    input = JSON.parse(rawInput)
  } catch {
    throw new CliFailure('Tool input must be valid JSON.', { kind: 'INVALID_ARGUMENT', code: 'call-input' })
  }
  if (!isRecord(input)) {
    throw new CliFailure('Tool input must be a JSON object.', { kind: 'INVALID_ARGUMENT', code: 'call-input' })
  }
  const quoteInput = toolQuoteInputSchema.safeParse({ toolRef, input })
  if (!quoteInput.success) {
    throw new CliFailure('Tool input or identity does not match tool.quote:v2.', {
      kind: 'INVALID_ARGUMENT',
      code: 'call-input',
    })
  }
  const credential = resolveAgentAccessCredential(options.baseUrl)
  if (credential === undefined) {
    const continuation = connectionContinuationForCli('buyer')
    throw new CliFailure('No AE agent credential is configured. Run ae connect, then repeat the same call.', {
      kind: 'UNAUTHENTICATED',
      code: 'agent_access_key_required',
      detail: { toolRef, ...(continuation.command === undefined ? {} : { nextAction: continuation.command }) },
      suggestion: continuation.label,
      ...(continuation.command === undefined ? {} : { nextCommand: continuation.command }),
    })
  }

  const apiKey = requireAgentAccessKey('call', options)

  const quoteOutcome = await callJson(options.baseUrl, TOOL_QUOTE_PATH, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(quoteInput.data),
  })
  const quote = toolQuoteResultSchema.safeParse(requireOk(quoteOutcome, TOOL_QUOTE_PATH))
  if (!quote.success) {
    throw new CliFailure('The gateway returned an invalid Tool quote.', {
      kind: 'UNAVAILABLE',
      code: 'tool-quote-result-invalid',
    })
  }
  if (quote.data.kind === 'refused') {
    throw new CliFailure(`Tool quote refused: ${quote.data.code}.`, {
      kind: 'FAILED_PRECONDITION',
      code: quote.data.code,
      detail: quote.data,
    })
  }
  const idempotencyKey = resolveIdempotencyKey(options)
  const parsedCall = callCommandDescriptor.inputSchema.safeParse({
    quoteRef: quote.data.quoteRef,
    idempotencyKey,
  })
  if (!parsedCall.success) throw new Error('tool_quote_projection_invalid')
  if (!options.json) process.stderr.write(`Call committed: toolRef=${toolRef}. A durable retry identity has been retained.\n`)

  const path = callCommandDescriptor.path
  let outcome
  try {
    outcome = await callJson(options.baseUrl, path, {
      method: callCommandDescriptor.method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(parsedCall.data),
    })
  } catch (error) {
    if (error instanceof CliFailure) throw error
    throw unknownCallTransport(toolRef, idempotencyKey)
  }
  let acceptedBody: unknown
  try {
    acceptedBody = requireOk(outcome, path)
  } catch (error) {
    if (error instanceof CliFailure) throw error
    throw unknownCallTransport(toolRef, idempotencyKey)
  }
  const accepted = parseCallResult(acceptedBody)
  const result = accepted.kind === 'pending' && options.wait === true
    ? await waitForCallResult(options, toolRef, idempotencyKey, accepted)
    : accepted
  const rendered = callOutput(result, options)

  if (options.json) {
    printJson(rendered)
    return
  }
  heading(`Tool ${toolRef}`)
  table([
    ['status', result.kind],
    ['duration', `${outcome.durationMs}ms`],
    ...(rendered.nextCommand === undefined ? [] : [['next command', String(rendered.nextCommand)] as const]),
  ])
  line(JSON.stringify(rendered, undefined, 2))
}
export const callCommandDescriptor = {
  command: 'call',
  actionId: CALL_ROUTE_CONTRACT.call.actionId,
  path: CALL_ROUTE_CONTRACT.call.path,
  method: CALL_ROUTE_CONTRACT.call.method,
  inputSchema: callInputSchema,
  outputSchema: callMachineResultSchema,
  run: runCallCommand,
} as const
