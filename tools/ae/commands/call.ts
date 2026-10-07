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
import { TOOL_PROCURE_PATH, toolProcureInputSchema, toolProcureResultSchema } from '@/modules/capability-execution/procure'
import { TOOL_SELECTION_PREFERENCES, type ToolSelectionPreference } from '@/modules/common/tool-selection-score'
import type { CallStatusResult } from '@/modules/capability-execution/call-recovery-contracts'
import { AGENT_ACCOUNT_SELF_ROUTE_CONTRACT, agentAccountSelfResultSchema } from '@/modules/agent-access/account.actions'
import type { CliOptions } from '../lib/args'
import { resolveAgentAccessCredential } from '../lib/config'
import { acknowledgePurchaseRecovery, findPurchaseRecovery, readPurchaseRecovery, retainPurchaseRecovery, type ProcureRecoveryRecord, acknowledgeCallRecovery, findCallRecovery, readCallRecovery, retainCallRecovery, type CallRecoveryRecord } from '../lib/call-recovery-journal'
import { attachPurchaseRecovery, purchaseRecoveryRequired, purchaseResumeCommand, readPurchasePrincipal, requirePurchasePrincipal } from '../lib/purchase-recovery'
import { CliFailure, callJson, heading, line, printJson, requireOk, table } from '../lib/output'
import { usageFailure } from '../lib/help'
import { toolCallCommand } from '../lib/tool-format'
import { journeyNextCommand } from '../lib/journey-next-command'
import { continuationCommand } from '../lib/continuation-command'
import {
  connectionContinuationForCli,
} from '../lib/suggested-continuation-adapter'
import {
  MAX_STATUS_WAIT_MS,
  pendingDelay,
  readCallStatus,
  requireAgentAccessKey,
  terminalResult,
} from './status'

const MAX_CALL_BODY_BYTES = 256 * 1024
// First-use ledger preparation and paid dispatch can exceed an ordinary read.
// The longer bounded wait does not change admission, retries or Call identity.
const PURCHASE_REQUEST_TIMEOUT_MS = 60_000

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
function recoveryCommand(record: CallRecoveryRecord, options: CliOptions): string {
  return record.callRef === undefined ? resumeCommand(record, options)
    : continuationCommand(['ae', 'status', record.callRef, '--base-url', record.origin, ...(options.json ? ['--json'] : [])])
}


function unknownCallTransport(record: CallRecoveryRecord, options: CliOptions): CliFailure {
  const detail = {
    toolRef: record.toolRef,
    recoveryRef: record.recoveryRef,
    ...(record.callRef === undefined ? {} : { callRef: record.callRef }),
    recovery: record.callRef === undefined
      ? 'Resume the retained purchase; do not create a new Call.'
      : 'Read the original Call status; do not create a new Call.',
    identityPreserved: true,
  }
  return new CliFailure(
    `Call transport is unknown for ${record.toolRef}; ${record.callRef === undefined ? 'resume the retained purchase' : 'read the original Call status'}.`,
    {
      kind: 'UNAVAILABLE',
      code: 'call-transport-unknown',
      detail,
      nextCommand: recoveryCommand(record, options),
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
    nextCommand: recoveryCommand(record, options),
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
  const nextCommand = 'next' in result && Array.isArray(result.next)
    ? journeyNextCommand(result.next[0], options) : undefined
  return {
    ...result,
    ...(nextCommand === undefined ? {} : { nextCommand }),
  }
}

/** Stop sleeps and status reads at the same deadline; expiry preserves the Call. */
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
    const requestBudgetMs = deadline - Date.now()
    if (requestBudgetMs <= 0) break
    if (!options.json) process.stderr.write('Waiting for the Call outcome.\n')
    let status: CallStatusResult
    try {
      status = await readCallStatus(options, callRef, 'status', requestBudgetMs)
    } catch (error) {
      if (Date.now() >= deadline) throw waitTimeoutFailure(record, options)
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
    if (Date.now() >= deadline) throw waitTimeoutFailure(record, options)
    delayMs = pendingDelay(status, delayMs)
  }
  throw waitTimeoutFailure(record, options)
}

function pendingRecoveryFailure(record: CallRecoveryRecord, options: CliOptions): CliFailure {
  return new CliFailure('This request already has a retained purchase. Check it before creating another Call.', {
    kind: 'FAILED_PRECONDITION', code: 'call-recovery-required',
    detail: { recoveryRef: record.recoveryRef, ...(record.callRef === undefined ? {} : { callRef: record.callRef }), identityPreserved: true },
    nextCommand: recoveryCommand(record, options),
  })
}

function attachRecovery(error: unknown, record: CallRecoveryRecord, options: CliOptions): CliFailure {
  if (!(error instanceof CliFailure)) return unknownCallTransport(record, options)
  if (error.code === 'request-timeout') return new CliFailure(
    record.callRef === undefined
      ? 'Call request timed out; the outcome remains unknown. Resume the retained purchase, not a new Call.'
      : 'Call status timed out; the original Call outcome remains unknown. Read its exact status.',
    {
      kind: 'UNAVAILABLE', code: 'call-transport-timeout',
      detail: {
        toolRef: record.toolRef, quoteRef: record.command.quoteRef,
        recoveryRef: record.recoveryRef, ...(record.callRef === undefined ? {} : { callRef: record.callRef }),
        identityPreserved: true,
      },
      nextCommand: recoveryCommand(record, options),
    },
  )
  return new CliFailure(error.message, {
    exitCode: error.exitCode, kind: error.kind,
    ...(error.code === undefined ? {} : { code: error.code }),
    ...(error.retryable === undefined ? {} : { retryable: error.retryable }),
    ...(error.retryAfter === undefined ? {} : { retryAfter: error.retryAfter }),
    detail: { cause: error.detail, recoveryRef: record.recoveryRef, ...(record.callRef === undefined ? {} : { callRef: record.callRef }), identityPreserved: true },
    ...(error.suggestion === undefined ? {} : { suggestion: error.suggestion }), nextCommand: recoveryCommand(record, options),
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
        result = await waitForCallResult(options, record, projectCallMachineResult({ kind: 'pending', toolRef: record.toolRef, callRef: status.callRef, retryAfterMs: 100 }))
      }
    } else {
      const apiKey = requireAgentAccessKey('call', options)
      if (!options.json) process.stderr.write(`Submitting the retained Call (up to 60 s). Recovery: ${resumeCommand(record, options)}\n`)
      const outcome = await callJson(options.baseUrl, callCommandDescriptor.path, {
        method: callCommandDescriptor.method, headers: { Authorization: `Bearer ${apiKey}` }, body: JSON.stringify(record.command),
      }, PURCHASE_REQUEST_TIMEOUT_MS)
      result = parseCallResult(requireOk(outcome, callCommandDescriptor.path))
      record = await observeResult(record, result)
      if (result.kind === 'pending' && options.wait === true) result = await waitForCallResult(options, record, result)
    }
    record = await observeResult(record, result)
    const rendered: Record<string, unknown> = {
      ...callOutput(result, options),
      ...(record.callRef === undefined ? {} : { callRef: record.callRef }),
      recoveryRef: record.recoveryRef,
    }
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
  if (!options.json) process.stderr.write('Requesting a Quote (up to 60 s).\n')
  const quoteOutcome = await callJson(options.baseUrl, TOOL_QUOTE_PATH, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(quoteInputData),
  }, PURCHASE_REQUEST_TIMEOUT_MS)
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
    const nextCommand = quote.data.continuation === undefined ? undefined : journeyNextCommand(quote.data.continuation, options)
    const suggestion = quote.data.reason ?? quote.data.ownerHandoff?.reason
    throw new CliFailure(`Tool quote refused: ${quote.data.code}.`, {
      kind: 'FAILED_PRECONDITION',
      code: quote.data.code,
      detail: quote.data,
      retryable: quote.data.retryable,
      ...(suggestion === undefined ? {} : { suggestion }),
      ...(nextCommand === undefined ? {} : { nextCommand }),
      ...(quote.data.continuation === undefined ? {} : { next: [quote.data.continuation] }),
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
/** Select without effects, or purchase only the caller's complete exact-input request. */
export async function runProcureCommand(args: readonly string[], options: CliOptions, stdin: Readable = process.stdin): Promise<void> {
  if (args[0] === 'resume') return resumeProcure(args, options)
  if (args.length !== 0 || options.input === undefined) throw usageFailure('procure', 'procure-usage')
  if (options.prefer !== undefined && !TOOL_SELECTION_PREFERENCES.includes(options.prefer as ToolSelectionPreference)) {
    throw new CliFailure('Preference must be balanced, cheapest or reliable.', { kind: 'INVALID_ARGUMENT', code: 'procure-prefer' })
  }
  const raw = options.input.trim() === '-' ? await readBoundedStdin(stdin) : options.input
  let input: unknown
  try {
    input = JSON.parse(raw)
  } catch {
    throw new CliFailure('Procurement input must be valid JSON.', { kind: 'INVALID_ARGUMENT', code: 'procure-input' })
  }
  const parsed = toolProcureInputSchema.safeParse(input)
  if (!parsed.success) throw new CliFailure('Procurement input must contain a need or an exact ToolRef, input, AUD ceiling and purchase key.', {
    kind: 'INVALID_ARGUMENT', code: 'procure-input',
  })
  if (options.prefer !== undefined && parsed.data.kind !== 'need') {
    throw new CliFailure('--prefer can only be used when selecting by need.', { kind: 'INVALID_ARGUMENT', code: 'procure-prefer' })
  }
  const request = parsed.data.kind === 'need' && options.prefer !== undefined
    ? { ...parsed.data, prefer: options.prefer as ToolSelectionPreference }
    : parsed.data
  // Match the actual procurement HTTP limit for literal and stdin requests.
  if (Buffer.byteLength(JSON.stringify(request), 'utf8') > 64 * 1024) {
    throw new CliFailure('Procurement input is too large.', { kind: 'PAYLOAD_TOO_LARGE', code: 'payload_too_large' })
  }
  if (request.kind === 'exact') {
    const principal = await readPurchasePrincipal(options)
    const recoveryRequest = { intent: 'procure_exact' as const, origin: options.baseUrl, ...principal, command: request }
    const previous = findPurchaseRecovery(recoveryRequest, options)
    if (previous !== undefined) {
      if (previous.intent !== 'procure_exact') throw new Error('procure_recovery_intent_invalid')
      if (previous.command.idempotencyKey !== request.idempotencyKey) throw purchaseRecoveryRequired(previous, options)
      return resumeRetainedProcure(previous, options)
    }
    const retained = await retainPurchaseRecovery(recoveryRequest, options)
    if (retained.record.intent !== 'procure_exact') throw new Error('procure_recovery_intent_invalid')
    if (!retained.created) throw purchaseRecoveryRequired(retained.record, options)
    return submitRetainedProcure(retained.record, options)
  }
  return presentProcureResult(await requestProcure(request, options), options)
}

async function requestProcure(request: unknown, options: CliOptions): Promise<Record<string, unknown>> {
  const apiKey = requireAgentAccessKey('procure', options)
  const outcome = await callJson(options.baseUrl, TOOL_PROCURE_PATH, {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: JSON.stringify(request),
  }, PURCHASE_REQUEST_TIMEOUT_MS)
  const body = requireOk(outcome, TOOL_PROCURE_PATH)
  if (!isRecord(body)) throw new CliFailure('The gateway returned an invalid procurement result.', { kind: 'UNAVAILABLE', code: 'procure-result-invalid' })
  return body
}

function validatedProcure(body: Record<string, unknown>) {
  const { next: _next, ...result } = body
  const validated = toolProcureResultSchema.safeParse(body.status === 'needs_input' ? body : result)
  if (!validated.success) throw new CliFailure('The gateway returned an invalid procurement result.', { kind: 'UNAVAILABLE', code: 'procure-result-invalid' })
  return validated.data
}

async function submitRetainedProcure(record: ProcureRecoveryRecord, options: CliOptions): Promise<void> {
  try {
    if (!options.json) process.stderr.write(`Procurement prepared. Recovery: ${purchaseResumeCommand(record, options)}\n`)
    const body = await requestProcure(record.command, options)
    const result = validatedProcure(body)
    if (result.status === 'needs_input' || result.idempotencyKey !== record.command.idempotencyKey
      || ('toolRef' in result && result.toolRef !== record.command.toolRef)) {
      throw new CliFailure('The gateway changed the retained procurement identity.', { kind: 'UNAVAILABLE', code: 'purchase-recovery-identity-conflict' })
    }
    await acknowledgePurchaseRecovery(record, {
      ...('quoteRef' in result && result.quoteRef !== undefined ? { quoteRef: result.quoteRef } : {}),
      ...('callRef' in result ? { callRef: result.callRef } : {}),
      // Delivery does not establish financial resolution. Even a delivered
      // response stays open until the original Call status proves completion.
      // A refusal without a CallRef can also conceal an accepted Call.
      terminal: false,
    })
    presentProcureResult(body, options, record.recoveryRef)
  } catch (error) { throw attachPurchaseRecovery(error, record, options) }
}

async function resumeRetainedProcure(record: ProcureRecoveryRecord, options: CliOptions): Promise<void> {
  try {
    await requirePurchasePrincipal(record, options)
    if (record.callRef === undefined) return submitRetainedProcure(record, options)
    const status = await readCallStatus(options, record.callRef)
    if (status.callRef !== record.callRef || (status.kind === 'found' && status.toolRef !== undefined && status.toolRef !== record.command.toolRef)) {
      throw new CliFailure('The gateway changed the retained Call identity.', { kind: 'UNAVAILABLE', code: 'purchase-recovery-identity-conflict' })
    }
    await acknowledgePurchaseRecovery(record, { terminal: status.kind === 'found' && (status.state === 'cancelled'
      || (status.state === 'terminal' && status.result !== undefined && (status.result.kind === 'refused'
        || (status.result.kind === 'completed' && status.result.usage.chargeState !== 'outcome_unknown')))) })
    const result = { ...status, recoveryRef: record.recoveryRef }
    if (options.json) printJson(result)
    else { heading('Procurement Call status'); line(JSON.stringify(result, undefined, 2)) }
  } catch (error) { throw attachPurchaseRecovery(error, record, options) }
}

async function resumeProcure(args: readonly string[], options: CliOptions): Promise<void> {
  if (args.length !== 2 || options.input !== undefined || options.idempotencyKey !== undefined || options.prefer !== undefined) {
    throw new CliFailure('Use ae procure resume <recoveryRef> without input, preference or a new purchase key.', { kind: 'INVALID_ARGUMENT', code: 'procure-resume-usage' })
  }
  const record = readPurchaseRecovery(args[1]!, options.baseUrl, 'procure_exact')
  if (record.intent !== 'procure_exact') throw new Error('procure_recovery_intent_invalid')
  return resumeRetainedProcure(record, options)
}

function presentProcureResult(body: Record<string, unknown>, options: CliOptions, recoveryRef?: string): void {
  const { next, ...result } = body
  const validated = { data: validatedProcure(body) }
  if (options.json) { printJson({ ...body, ...(recoveryRef === undefined ? {} : { recoveryRef }) }); return }
  if (recoveryRef !== undefined) line(`Recovery reference: ${recoveryRef}`)
  if (validated.data.status === 'needs_input') {
    heading(`Selected ${validated.data.toolName}${validated.data.reasons.length === 0 ? '' : ` · ${validated.data.reasons.join(' · ')}`}`)
    line('Alternates:')
    for (const alternate of validated.data.alternates) {
      line(`- ${alternate.title} (${alternate.reasons.join(' · ')})`)
    }
    table([['ToolRef', validated.data.toolRef], ['required input', validated.data.requiredFields.join(', ') || 'none']])
    line(`Input JSON Schema: ${JSON.stringify(validated.data.inputJsonSchema)}`)
    line(`Next: ${JSON.stringify(validated.data.next)}. Supply exact input, maxSpendAud and a fresh idempotencyKey with ae procure --input '<json>'.`)
    return
  }
  heading(`Procurement ${validated.data.status}`)
  line(JSON.stringify(result, undefined, 2))
  if (next !== undefined) line(`Next: ${JSON.stringify(next)}`)
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
