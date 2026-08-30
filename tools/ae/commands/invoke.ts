import { isRecord } from '@/modules/common/is-record'
import { randomUUID } from 'node:crypto'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'
import {
  operationInvokeInputSchema,
  operationInvokeResultSchema,
  type OperationInvokeResult,
} from '@/modules/capability-execution/operation-invoke-contracts'
import type { OperationInvokeStatusResult } from '@/modules/capability-execution/operation-recovery-contracts'

import type { CliOptions } from '../lib/args'
import { resolveAgentAccessCredential } from '../lib/config'
import { CliFailure, callJson, heading, line, printJson, requireOk, table } from '../lib/output'
import { usageFailure } from '../lib/help'
import {
  MAX_STATUS_WAIT_MS,
  pendingDelay,
  readOperationStatus,
  requireAgentAccessKey,
  statusCommandFor,
  terminalResult,
} from './status'



function parseInvokeResult(value: unknown): OperationInvokeResult {
  const parsed = invokeCommandDescriptor.outputSchema.safeParse(value)
  if (parsed.success) return parsed.data
  throw new CliFailure('The gateway returned an invalid operation invocation result.', {
    kind: 'UNAVAILABLE',
    code: 'operation-invoke-result-invalid',
  })
}

function unknownInvokeTransport(
  operationRef: string,
  _idempotencyKey: string,
  invocationRef?: string,
): CliFailure {
  const detail = {
    operationRef,
    recovery: invocationRef === undefined
      ? 'Repeat invoke with the same idempotency identity.'
      : 'Read operation status with the same invocation identity.',
    identityPreserved: true,
  }
  return new CliFailure(
    `Operation transport is unknown for ${operationRef}; do not retry with a new identity.`,
    {
      kind: 'UNAVAILABLE',
      code: 'operation-transport-unknown',
      detail,
    },
  )
}

function waitTimeoutFailure(
  operationRef: string,
  _idempotencyKey: string,
  _invocationRef: string,
): CliFailure {
  const detail = {
    operationRef,
    recovery: 'Read operation status with the same invocation identity before retrying.',
    identityPreserved: true,
  }
  return new CliFailure('Operation wait timed out; the outcome remains unknown.', {
    kind: 'UNAVAILABLE',
    code: 'operation-wait-timeout',
    detail,
  })
}

function resolveIdempotencyKey(options: CliOptions): string {
  const explicit = options.idempotencyKey?.trim()
  if (explicit !== undefined && explicit.length > 0) return explicit
  return randomUUID()
}

function invokeOutput(
  result: OperationInvokeResult | OperationInvokeStatusResult,
  idempotencyKey: string,
): Record<string, unknown> {
  const invocationRef = 'invocationRef' in result ? result.invocationRef : undefined
  const nextCommand = invocationRef === undefined
    ? undefined
    : result.kind === 'reconciliation_required'
      ? `ae recover ${invocationRef} '<evidence-json>' --idempotency-key ${idempotencyKey}`
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
    if (!options.json) process.stderr.write('Waiting for the operation outcome.\n')
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
export async function runInvokeCommand(
  args: readonly string[],
  options: CliOptions,
): Promise<void> {
  const credential = resolveAgentAccessCredential(options.baseUrl)
  const operationRef = args[0]?.trim()
  if (
    args.length !== 1
    || operationRef === undefined
    || operationRef.length === 0
  ) {
    throw usageFailure('call', 'call-usage')
  }

  const rawInput = options.input?.trim()
  if (rawInput === undefined || rawInput.length === 0) {
    throw usageFailure('call', 'call-usage')
  }
  let input: unknown
  try {
    input = JSON.parse(rawInput)
  } catch {
    throw new CliFailure('Operation input must be valid JSON.', { kind: 'INVALID_ARGUMENT', code: 'invoke-input' })
  }
  if (!isRecord(input)) {
    throw new CliFailure('Operation input must be a JSON object.', { kind: 'INVALID_ARGUMENT', code: 'invoke-input' })
  }
  if (credential === undefined) {
    throw new CliFailure('No AE agent credential is configured. Run ae connect, then repeat the same call.', {
      kind: 'UNAUTHENTICATED',
      code: 'agent_access_key_required',
      detail: { operationRef, nextAction: 'ae connect' },
    })
  }

  const idempotencyKey = resolveIdempotencyKey(options)
  const parsedInput = invokeCommandDescriptor.inputSchema.safeParse({ operationRef, input, idempotencyKey })
  if (!parsedInput.success) {
    throw new CliFailure('Operation input or identity does not match operation.invoke:v1.', {
      kind: 'INVALID_ARGUMENT',
      code: 'invoke-input',
    })
  }
  if (!options.json) process.stderr.write(`Call prepared: operationRef=${operationRef}. A durable retry identity has been retained.\n`)

  const apiKey = requireAgentAccessKey('invoke', options)

  const path = invokeCommandDescriptor.path
  let outcome
  try {
    outcome = await callJson(options.baseUrl, path, {
      method: invokeCommandDescriptor.method,
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
export const invokeCommandDescriptor = {
  command: 'call',
  actionId: OPERATION_INVOKE_ROUTE_CONTRACT.invoke.actionId,
  path: OPERATION_INVOKE_ROUTE_CONTRACT.invoke.path,
  method: OPERATION_INVOKE_ROUTE_CONTRACT.invoke.method,
  inputSchema: operationInvokeInputSchema,
  outputSchema: operationInvokeResultSchema,
  run: runInvokeCommand,
} as const
