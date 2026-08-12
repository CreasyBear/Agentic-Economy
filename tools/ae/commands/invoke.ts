import { isRecord } from '@/modules/common/is-record'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'
import {
  operationInvokeInputSchema,
  operationInvokeResultSchema,
  type OperationInvokeResult,
  type OperationInvokeStatusResult,
} from '@/modules/capability-execution/operation-invoke'

import type { CliOptions } from '../lib/args'
import { CliFailure, callJson, heading, line, printJson, requireOk, table } from '../lib/output'
import {
  MAX_STATUS_WAIT_MS,
  operationStatusPath,
  pendingDelay,
  readOperationStatus,
  requireAgentAccessKey,
  statusCommandFor,
  terminalResult,
} from './status'

function parseInvokeResult(value: unknown): OperationInvokeResult {
  const parsed = operationInvokeResultSchema.safeParse(value)
  if (parsed.success) return parsed.data
  throw new CliFailure('The gateway returned an invalid operation invocation result.', {
    kind: 'UNAVAILABLE',
    code: 'operation-invoke-result-invalid',
  })
}

function recoveryMessage(
  message: string,
  recovery: Readonly<{
    operationRef: string
    idempotencyKey: string
    invocationRef?: string
    statusPath?: string
    retryHint: string
  }>,
): string {
  const fields = [
    `operationRef=${recovery.operationRef}`,
    ...(recovery.invocationRef === undefined ? [] : [`invocationRef=${recovery.invocationRef}`]),
    `idempotencyKey=${recovery.idempotencyKey}`,
    ...(recovery.statusPath === undefined ? [] : [`statusPath=${recovery.statusPath}`]),
    `retryHint=${recovery.retryHint}`,
  ]
  return `${message} ${fields.join(' ')}`
}

function unknownInvokeTransport(
  operationRef: string,
  idempotencyKey: string,
  invocationRef?: string,
): CliFailure {
  const statusPath = invocationRef === undefined ? undefined : operationStatusPath(invocationRef)
  const retryHint = invocationRef === undefined
    ? `Retry npm run -s ae -- invoke with --idempotency-key ${idempotencyKey}.`
    : statusCommandFor(invocationRef)
  const recovery = {
    operationRef,
    idempotencyKey,
    ...(invocationRef === undefined ? {} : { invocationRef }),
    ...(statusPath === undefined ? {} : { statusPath }),
    retryHint,
  }
  return new CliFailure(recoveryMessage('Operation transport is unknown; do not retry with a new identity.', recovery), {
    kind: 'UNAVAILABLE',
    code: 'operation-transport-unknown',
    detail: recovery,
  })
}

function waitTimeoutFailure(
  operationRef: string,
  idempotencyKey: string,
  invocationRef: string,
): CliFailure {
  const recovery = {
    operationRef,
    invocationRef,
    idempotencyKey,
    statusPath: operationStatusPath(invocationRef),
    retryHint: statusCommandFor(invocationRef),
  }
  return new CliFailure(recoveryMessage('Operation wait timed out; the outcome remains unknown.', recovery), {
    kind: 'UNAVAILABLE',
    code: 'operation-wait-timeout',
    detail: recovery,
  })
}

function resolveIdempotencyKey(options: CliOptions): string {
  const explicit = options.idempotencyKey?.trim()
  if (explicit !== undefined && explicit.length > 0) return explicit
  throw new CliFailure('Invoke requires an explicit --idempotency-key so a restarted process can recover the same invocation.', {
    kind: 'INVALID_ARGUMENT',
    code: 'idempotency-key-required',
  })
}

function invokeOutput(
  result: OperationInvokeResult | OperationInvokeStatusResult,
  idempotencyKey: string,
): Record<string, unknown> {
  const invocationRef = 'invocationRef' in result ? result.invocationRef : undefined
  const nextCommand = invocationRef === undefined
    ? undefined
    : result.kind === 'reconciliation_required'
      ? `npm run -s ae -- recover ${invocationRef} '<evidence-json>' --idempotency-key ${idempotencyKey}`
      : statusCommandFor(invocationRef)
  return {
    ...result,
    idempotencyKey,
    ...(nextCommand === undefined ? {} : { nextCommand }),
  }
}

async function waitForOperationResult(
  options: CliOptions,
  operationRef: string,
  idempotencyKey: string,
  pending: OperationInvokeResult,
): Promise<OperationInvokeResult | OperationInvokeStatusResult> {
  if (pending.kind !== 'pending' || pending.invocationRef.length === 0) {
    throw new CliFailure('The gateway returned a pending result without an invocationRef.', {
      kind: 'UNAVAILABLE',
      code: 'invoke-status-malformed',
    })
  }
  const invocationRef = pending.invocationRef
  const deadline = Date.now() + MAX_STATUS_WAIT_MS
  let delayMs = pendingDelay(pending)
  while (Date.now() < deadline) {
    const remainingMs = deadline - Date.now()
    await new Promise<void>((resolve) => {
      setTimeout(resolve, Math.min(delayMs, remainingMs))
    })
    if (!options.json) process.stderr.write(`Waiting for operation ${invocationRef}.\n`)
    let status: unknown
    try {
      status = await readOperationStatus(options, invocationRef)
    } catch (error) {
      if (error instanceof CliFailure) throw error
      throw unknownInvokeTransport(operationRef, idempotencyKey, invocationRef)
    }
    const terminal = terminalResult(status)
    if (terminal !== undefined) {
      return isRecord(terminal) && terminal.kind === 'found'
        ? terminal as OperationInvokeStatusResult
        : parseInvokeResult(terminal)
    }
    delayMs = pendingDelay(status, delayMs)
  }
  throw waitTimeoutFailure(operationRef, idempotencyKey, invocationRef)
}

/** Invoke a Market Operation through the canonical authenticated HTTP gateway. */
export async function runInvokeCommand(args: readonly string[], options: CliOptions): Promise<void> {
  const operationRef = args[0]?.trim()
  if (
    args.length !== 2
    || operationRef === undefined
    || operationRef.length === 0
  ) {
    throw new CliFailure("Usage: npm run -s ae -- invoke <operation-ref> '<json>' --idempotency-key <key> [--wait]", {
      kind: 'INVALID_ARGUMENT',
      code: 'invoke-usage',
    })
  }

  const rawInput = args[1]!.trim()
  let input: unknown
  try {
    input = JSON.parse(rawInput)
  } catch {
    throw new CliFailure('Operation input must be valid JSON.', { kind: 'INVALID_ARGUMENT', code: 'invoke-input' })
  }
  if (!isRecord(input)) {
    throw new CliFailure('Operation input must be a JSON object.', { kind: 'INVALID_ARGUMENT', code: 'invoke-input' })
  }
  const idempotencyKey = resolveIdempotencyKey(options)
  const parsedInput = operationInvokeInputSchema.safeParse({ operationRef, input, idempotencyKey })
  if (!parsedInput.success) {
    throw new CliFailure('Operation input or identity does not match operation.invoke:v1.', {
      kind: 'INVALID_ARGUMENT',
      code: 'invoke-input',
    })
  }
  process.stderr.write(`Invocation identity: operationRef=${operationRef} idempotencyKey=${idempotencyKey}\n`)

  const apiKey = requireAgentAccessKey('invoke', options)

  const path = OPERATION_INVOKE_ROUTE_CONTRACT.invoke.path
  let outcome
  try {
    outcome = await callJson(options.baseUrl, path, {
      method: OPERATION_INVOKE_ROUTE_CONTRACT.invoke.method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        operationRef: parsedInput.data.operationRef,
        input: parsedInput.data.input,
        idempotencyKey: parsedInput.data.idempotencyKey,
      }),
    })
  } catch (error) {
    if (error instanceof CliFailure) throw error
    throw unknownInvokeTransport(operationRef, idempotencyKey)
  }
  let acceptedBody: unknown
  try {
    acceptedBody = requireOk(outcome, path)
  } catch (error) {
    if (error instanceof CliFailure) throw error
    throw unknownInvokeTransport(operationRef, idempotencyKey)
  }
  const accepted = parseInvokeResult(acceptedBody)
  const result = accepted.kind === 'pending' && options.wait === true
    ? await waitForOperationResult(options, operationRef, idempotencyKey, accepted)
    : accepted
  const rendered = invokeOutput(result, idempotencyKey)

  if (options.json) {
    printJson(rendered)
    return
  }
  heading(`Operation ${operationRef}`)
  table([
    ['status', result.kind],
    ['duration', `${outcome.durationMs}ms`],
    ['idempotency key', idempotencyKey],
    ...(rendered.nextCommand === undefined ? [] : [['next command', String(rendered.nextCommand)] as const]),
  ])
  line(JSON.stringify(rendered, undefined, 2))
}
