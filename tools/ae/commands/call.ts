import { isRecord } from '@/modules/common/is-record'
import { randomUUID } from 'node:crypto'
import { Buffer } from 'node:buffer'
import type { Readable } from 'node:stream'
import { CALL_ROUTE_CONTRACT } from '@/modules/capability-execution/call-entry'
import {
  callInputSchema,
  callMachineResultSchema,
  projectCallMachineResult,
  type CallMachineResult,
} from '@/modules/capability-execution/call-contracts'
import {
  TOOL_QUOTE_ACTION_ID,
  TOOL_QUOTE_PATH,
  toolQuoteInputSchema,
  toolQuoteResultSchema,
  type ToolQuoteInput,
  type ToolQuoteResult,
} from '@/modules/capability-execution/quote'
import type { CallStatusResult } from '@/modules/capability-execution/call-recovery-contracts'
import { AGENT_ACCOUNT_SELF_ROUTE_CONTRACT, agentAccountSelfResultSchema } from '@/modules/agent-access/account.actions'
import type { CliOptions } from '../lib/args'
import { resolveAgentAccessCredential } from '../lib/config'
import { acknowledgeCallRecovery, findCallRecovery, readCallRecovery, retainCallRecovery, type CallRecoveryRecord } from '../lib/call-recovery-journal'
import { CliFailure, callJson, heading, line, printJson, requireOk, table } from '../lib/output'
import { usageFailure } from '../lib/help'
import { toolCallCommand } from '../lib/tool-format'
import { cliContinuation, continuationCommand } from '../lib/continuation-command'
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
  if (parsed.success && (!('callRef' in parsed.data) || parsed.data.callRef === undefined || parsed.data.callRef.length > 0)) return parsed.data
  throw new CliFailure('The gateway returned an invalid Call result.', {
    kind: 'UNAVAILABLE',
    code: 'call-result-invalid',
  })
}

function resumeCommand(record: CallRecoveryRecord, options: CliOptions): string {
  return continuationCommand(['ae', 'call', 'resume', record.recoveryRef, '--base-url', record.origin, ...(options.json ? ['--json'] : [])])
}

function unknownCallTransport(record: CallRecoveryRecord, options: CliOptions): CliFailure {
  const detail = {
    toolRef: record.toolRef,
    recoveryRef: record.recoveryRef,
    ...(record.callRef === undefined ? {} : { callRef: record.callRef }),
    recovery: 'Resume the retained purchase; do not create a new Call.',
    identityPreserved: true,
  }
  return new CliFailure(
    `Call transport is unknown for ${record.toolRef}; resume the retained purchase.`,
    {
      kind: 'UNAVAILABLE',
      code: 'call-transport-unknown',
      detail,
      nextCommand: resumeCommand(record, options),
    },
  )
}

function waitTimeoutFailure(record: CallRecoveryRecord, options: CliOptions): CliFailure {
  const detail = {
    toolRef: record.toolRef,
    recoveryRef: record.recoveryRef,
    callRef: record.callRef,
    recovery: 'Read Call status with the same Call identity before retrying.',
    identityPreserved: true,
  }
  return new CliFailure('Call wait timed out; the outcome remains unknown.', {
    kind: 'UNAVAILABLE',
    code: 'call-wait-timeout',
    detail,
    nextCommand: resumeCommand(record, options),
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
  record: CallRecoveryRecord,
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
    let status: CallStatusResult
    try {
      status = await readCallStatus(options, callRef)
    } catch (error) {
      if (error instanceof CliFailure) throw error
      throw unknownCallTransport(record, options)
    }
    if (status.callRef !== callRef) throw new CliFailure('The gateway changed the Call status identity.', { kind: 'UNAVAILABLE', code: 'call-recovery-identity-conflict' })
    const terminal = terminalResult(status)
    if (terminal !== undefined) {
      await observeResult(record, status)
      if (status.kind === 'found' && status.result !== undefined) return projectCallMachineResult(status.result)
      return isRecord(terminal) && terminal.kind === 'found'
        ? terminal as CallStatusResult
        : parseCallResult(terminal)
    }
    delayMs = pendingDelay(status, delayMs)
  }
  throw waitTimeoutFailure(record, options)
}

function pendingRecoveryFailure(record: CallRecoveryRecord, options: CliOptions): CliFailure {
  return new CliFailure('This request already has a retained purchase. Resume it before creating another Call.', {
    kind: 'FAILED_PRECONDITION', code: 'call-recovery-required',
    detail: { recoveryRef: record.recoveryRef, ...(record.callRef === undefined ? {} : { callRef: record.callRef }), identityPreserved: true },
    nextCommand: resumeCommand(record, options),
  })
}

function attachRecovery(error: unknown, record: CallRecoveryRecord, options: CliOptions): CliFailure {
  if (!(error instanceof CliFailure)) return unknownCallTransport(record, options)
  return new CliFailure(error.message, {
    exitCode: error.exitCode, kind: error.kind,
    ...(error.code === undefined ? {} : { code: error.code }),
    ...(error.retryable === undefined ? {} : { retryable: error.retryable }),
    ...(error.retryAfter === undefined ? {} : { retryAfter: error.retryAfter }),
    detail: { cause: error.detail, recoveryRef: record.recoveryRef, ...(record.callRef === undefined ? {} : { callRef: record.callRef }), identityPreserved: true },
    ...(error.suggestion === undefined ? {} : { suggestion: error.suggestion }), nextCommand: resumeCommand(record, options),
  })
}

async function observeResult(record: CallRecoveryRecord, result: CallMachineResult | CallStatusResult): Promise<CallRecoveryRecord> {
  if ('toolRef' in result && result.toolRef !== undefined && result.toolRef !== record.toolRef) {
    throw new CliFailure('The gateway returned a result for a different Tool.', { kind: 'UNAVAILABLE', code: 'call-recovery-identity-conflict' })
  }
  return acknowledgeCallRecovery(record, {
    ...('callRef' in result && result.callRef !== undefined ? { callRef: result.callRef } : {}),
    terminal: (result.kind === 'completed' && result.usage.chargeState !== 'outcome_unknown')
      || (result.kind === 'found' && (result.state === 'cancelled'
        || (result.state === 'terminal' && result.result?.kind === 'refused'))),
  })
}

async function submitOrReadCall(record: CallRecoveryRecord, options: CliOptions): Promise<void> {
  const startedAt = Date.now()
  try {
    let result: CallMachineResult | CallStatusResult
    if (record.callRef !== undefined) {
      const status = await readCallStatus(options, record.callRef)
      if (status.callRef !== record.callRef) throw new CliFailure('The gateway changed the Call status identity.', { kind: 'UNAVAILABLE', code: 'call-recovery-identity-conflict' })
      record = await observeResult(record, status)
      const terminal = terminalResult(status)
      result = terminal !== undefined && status.kind === 'found' && status.result !== undefined
        ? projectCallMachineResult(status.result)
        : terminal === undefined || (isRecord(terminal) && terminal.kind === 'found') ? status : parseCallResult(terminal)
      // Status owns the known purchase. A missing/refused status never causes
      // another submission, even if the original Quote has expired.
      if (options.wait === true && result.kind === 'found' && result.state === 'in_progress') {
        result = await waitForCallResult(options, record, { kind: 'pending', toolRef: record.toolRef, callRef: status.callRef, retryAfterMs: 100 })
      }
    } else {
      const apiKey = requireAgentAccessKey('call', options)
      const outcome = await callJson(options.baseUrl, callCommandDescriptor.path, {
        method: callCommandDescriptor.method, headers: { Authorization: `Bearer ${apiKey}` }, body: JSON.stringify(record.command),
      })
      result = parseCallResult(requireOk(outcome, callCommandDescriptor.path))
      record = await observeResult(record, result)
      if (result.kind === 'pending' && options.wait === true) result = await waitForCallResult(options, record, result)
    }
    record = await observeResult(record, result)
    const rendered: Record<string, unknown> = { ...callOutput(result, options), recoveryRef: record.recoveryRef }
    if (options.json) { printJson(rendered); return }
    heading(`Tool ${record.toolRef}`)
    table([
      ['status', result.kind], ['duration', `${Date.now() - startedAt}ms`],
      ['recovery', resumeCommand(record, options)],
      ...(rendered.nextCommand === undefined ? [] : [['next command', String(rendered.nextCommand)] as const]),
    ])
    line(JSON.stringify(rendered, undefined, 2))
  } catch (error) { throw attachRecovery(error, record, options) }
}

async function resumeCall(args: readonly string[], options: CliOptions): Promise<void> {
  if (args.length !== 2 || options.input !== undefined || options.idempotencyKey !== undefined) {
    throw new CliFailure('Use ae call resume <recoveryRef> without input or a new idempotency identity.', { kind: 'INVALID_ARGUMENT', code: 'call-resume-usage' })
  }
  const record = readCallRecovery(args[1]!, options.baseUrl)
  return resumeRetainedCall(record, options)
}

async function resumeRetainedCall(record: CallRecoveryRecord, options: CliOptions): Promise<void> {
  try {
    const apiKey = requireAgentAccessKey('call', options)
    const outcome = await callJson(options.baseUrl, AGENT_ACCOUNT_SELF_ROUTE_CONTRACT.path, {
      method: AGENT_ACCOUNT_SELF_ROUTE_CONTRACT.method, headers: { Authorization: `Bearer ${apiKey}` },
    })
    const self = agentAccountSelfResultSchema.safeParse(requireOk(outcome, 'account status'))
    if (!self.success) throw new CliFailure('The gateway returned an invalid agent identity.', { kind: 'UNAVAILABLE', code: 'account-result-invalid' })
    if (self.data.accountRef !== record.accountRef || self.data.principalRef !== record.principalRef) {
      throw new CliFailure('This purchase belongs to a different Account or Agent. Reconnect the original Agent before resuming.', {
        kind: 'PERMISSION_DENIED', code: 'call-recovery-owner-mismatch',
      })
    }
    await submitOrReadCall(record, options)
  } catch (error) { throw attachRecovery(error, record, options) }
}

type QuoteRefusalContinuation = Readonly<{ command: string; suggestion: string }>

/**
 * A refused Quote already names the one continuation the market expects. This
 * maps that continuation onto the runnable CLI command for it, so the funding
 * gate points at the same `ae fund` handoff doctor reports.
 */
function quoteRefusalContinuation(
  action: string | undefined,
  toolRef: string,
  options: CliOptions,
): QuoteRefusalContinuation | undefined {
  if (action === 'registry.tools.describe') {
    return {
      command: continuationCommand(['ae', 'describe', toolRef, '--base-url', options.baseUrl, ...(options.json ? ['--json'] : [])]),
      suggestion: 'Read the exact input contract for this Tool, then repeat the call.',
    }
  }
  if (action === 'funding.handoff.create') {
    return {
      command: cliContinuation(options, ['ae', 'fund']),
      suggestion: 'Add Account credit as the owner, then repeat this call.',
    }
  }
  return undefined
}

/**
 * The one place that calls `tool.quote:v2`. `ae call` uses this to prepare a
 * Call and `ae quote` uses it standalone to inspect price, budget, and
 * readiness without calling. A refusal, an invalid gateway response, or a
 * quote for a different Tool all throw the same way for both callers.
 */
async function resolveToolQuote(
  toolRef: string,
  quoteInputData: ToolQuoteInput,
  apiKey: string,
  options: CliOptions,
): Promise<Extract<ToolQuoteResult, { kind: 'committed' }>> {
  const quoteOutcome = await callJson(options.baseUrl, TOOL_QUOTE_PATH, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(quoteInputData),
  })
  if (quoteOutcome.status === 401) {
    throw new CliFailure('Your AE connection is no longer valid. Reconnect, then repeat the call.', {
      kind: 'UNAUTHENTICATED', code: 'agent_access_key_invalid',
      nextCommand: continuationCommand(['ae', 'connect', '--base-url', options.baseUrl, ...(options.json ? ['--json'] : [])]),
    })
  }
  const quote = toolQuoteResultSchema.safeParse(requireOk(quoteOutcome, TOOL_QUOTE_PATH))
  if (!quote.success) {
    throw new CliFailure('The gateway returned an invalid Tool quote.', {
      kind: 'UNAVAILABLE',
      code: 'tool-quote-result-invalid',
    })
  }
  if (quote.data.kind === 'refused') {
    const refusal = quoteRefusalContinuation(quote.data.continuation?.action, toolRef, options)
    const suggestion = quote.data.reason ?? refusal?.suggestion
    throw new CliFailure(`Tool quote refused: ${quote.data.code}.`, {
      kind: 'FAILED_PRECONDITION',
      code: quote.data.code,
      detail: quote.data,
      retryable: quote.data.retryable,
      ...(suggestion === undefined ? {} : { suggestion }),
      ...(refusal === undefined ? {} : { nextCommand: refusal.command }),
    })
  }
  if (quote.data.toolRef !== toolRef) {
    throw new CliFailure('The gateway returned a Quote for a different Tool.', { kind: 'UNAVAILABLE', code: 'tool-quote-result-invalid' })
  }
  return quote.data
}

async function parseToolRefAndInput(
  command: 'call' | 'quote',
  args: readonly string[],
  options: CliOptions,
  stdin: Readable,
): Promise<{ toolRef: string; quoteInputData: ToolQuoteInput }> {
  const toolRef = args[0]?.trim()
  if (args.length !== 1 || toolRef === undefined || toolRef.length === 0) {
    throw usageFailure(command, `${command}-usage`)
  }
  const configuredInput = options.input?.trim()
  if (configuredInput === undefined || configuredInput.length === 0) {
    throw usageFailure(command, `${command}-usage`)
  }
  const rawInput = (configuredInput === '-' ? await readBoundedStdin(stdin) : configuredInput).trim()
  if (rawInput.length === 0) throw usageFailure(command, `${command}-usage`)
  let input: unknown
  try {
    input = JSON.parse(rawInput)
  } catch {
    throw new CliFailure('Tool input must be valid JSON.', { kind: 'INVALID_ARGUMENT', code: `${command}-input` })
  }
  if (!isRecord(input)) {
    throw new CliFailure('Tool input must be a JSON object.', { kind: 'INVALID_ARGUMENT', code: `${command}-input` })
  }
  const quoteInput = toolQuoteInputSchema.safeParse({ toolRef, input })
  if (!quoteInput.success) {
    throw new CliFailure('Tool input or identity does not match tool.quote:v2.', {
      kind: 'INVALID_ARGUMENT',
      code: `${command}-input`,
    })
  }
  return { toolRef, quoteInputData: quoteInput.data }
}

export async function runQuoteCommand(
  args: readonly string[],
  options: CliOptions,
  stdin: Readable = process.stdin,
): Promise<void> {
  const { toolRef, quoteInputData } = await parseToolRefAndInput('quote', args, options, stdin)
  const apiKey = requireAgentAccessKey('quote', options)
  const quote = await resolveToolQuote(toolRef, quoteInputData, apiKey, options)
  if (options.json) {
    printJson(quote)
    return
  }
  heading(`Tool quote ${toolRef}`)
  table([
    ['price', `${quote.price.units} × 10^-${quote.price.exponent} ${quote.price.currency}`],
    ['expires', new Date(quote.expiresAt).toISOString()],
    ['next', toolCallCommand(toolRef)],
  ])
  line(JSON.stringify(quote, undefined, 2))
}

export async function runCallCommand(
  args: readonly string[],
  options: CliOptions,
  stdin: Readable = process.stdin,
): Promise<void> {
  if (args[0] === 'resume') return resumeCall(args, options)
  const { toolRef, quoteInputData } = await parseToolRefAndInput('call', args, options, stdin)
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

  const recoveryRequest = { origin: options.baseUrl, toolRef, input: quoteInputData.input,
    ...(options.idempotencyKey?.trim() ? { idempotencyKey: options.idempotencyKey.trim() } : {}),
  }
  const previous = findCallRecovery(recoveryRequest)
  if (previous !== undefined) {
    if (recoveryRequest.idempotencyKey === previous.command.idempotencyKey) return resumeRetainedCall(previous, options)
    throw pendingRecoveryFailure(previous, options)
  }

  const quote = await resolveToolQuote(toolRef, quoteInputData, apiKey, options)
  const idempotencyKey = resolveIdempotencyKey(options)
  const parsedCall = callCommandDescriptor.inputSchema.safeParse({
    quoteRef: quote.quoteRef,
    idempotencyKey,
  })
  if (!parsedCall.success) throw new Error('tool_quote_projection_invalid')
  const retained = await retainCallRecovery(recoveryRequest, {
    quoteRef: parsedCall.data.quoteRef, accountRef: quote.account.accountRef, principalRef: quote.budget.principalRef,
  }, parsedCall.data.idempotencyKey)
  if (!retained.created) throw pendingRecoveryFailure(retained.record, options)
  if (!options.json) process.stderr.write(`Call prepared: toolRef=${toolRef}. Recovery: ${resumeCommand(retained.record, options)}\n`)
  await submitOrReadCall(retained.record, options)
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

/** Same dispatch path `call` uses for `tool.quote:v2`, exposed standalone. */
export const quoteCommandDescriptor = {
  command: 'quote',
  actionId: TOOL_QUOTE_ACTION_ID,
  path: TOOL_QUOTE_PATH,
  method: 'POST' as const,
  inputSchema: toolQuoteInputSchema,
  outputSchema: toolQuoteResultSchema,
  run: runQuoteCommand,
} as const
