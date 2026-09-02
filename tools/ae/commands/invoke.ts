import { isRecord } from '@/modules/common/is-record'
import { randomUUID } from 'node:crypto'
import { Buffer } from 'node:buffer'
import type { Readable } from 'node:stream'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'
import {
  operationInvokeInputSchema,
  operationInvokeMachineResultSchema,
  type OperationInvokeMachineResult,
} from '@/modules/capability-execution/operation-invoke-contracts'
import {
  OPERATION_INSPECT_PATH,
  operationInspectInputSchema,
  operationInspectResultSchema,
} from '@/modules/capability-execution/operation-commitment'
import type { OperationInvokeStatusResult } from '@/modules/capability-execution/operation-recovery-contracts'
import { operationDetailOutputSchema } from '@/modules/capability-supply/public'
import { OPERATION_MARKET_DETAIL_PATH } from '@/modules/registry/operation-entry'

import type { CliOptions } from '../lib/args'
import { resolveAgentAccessCredential } from '../lib/config'
import { CliFailure, callJson, heading, line, printJson, requireOk, table } from '../lib/output'
import { usageFailure } from '../lib/help'
import { continuationCommand } from '../lib/continuation-command'
import { throwOperationReadFailure } from '../lib/operation-read-failure'
import {
  connectionContinuationForCli,
  creditContinuationForCli,
  invocationContinuationForCli,
} from '../lib/suggested-continuation-adapter'
import {
  MAX_STATUS_WAIT_MS,
  pendingDelay,
  readOperationStatus,
  requireAgentAccessKey,
  terminalResult,
} from './status'

const MAX_OPERATION_INVOKE_BODY_BYTES = 256 * 1024

async function readBoundedStdin(stdin: Readable): Promise<string> {
  const chunks: Buffer[] = []
  let totalBytes = 0
  for await (const chunk of stdin) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    totalBytes += bytes.byteLength
    if (totalBytes > MAX_OPERATION_INVOKE_BODY_BYTES) {
      throw new CliFailure('Operation input is too large.', {
        kind: 'PAYLOAD_TOO_LARGE',
        code: 'payload_too_large',
      })
    }
    chunks.push(bytes)
  }
  return Buffer.concat(chunks, totalBytes).toString('utf8')
}


function parseInvokeResult(value: unknown): OperationInvokeMachineResult {
  const parsed = operationInvokeMachineResultSchema.safeParse(value)
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

async function requireOperationCanBenefitFromBuyerConnection(
  baseUrl: string,
  operationRef: string,
): Promise<void> {
  const outcome = await callJson(baseUrl, OPERATION_MARKET_DETAIL_PATH, {
    method: 'POST',
    body: JSON.stringify({ operationRef }),
  })
  const parsed = operationDetailOutputSchema.safeParse(requireOk(outcome, OPERATION_MARKET_DETAIL_PATH))
  if (!parsed.success) {
    throw new CliFailure('The market returned an invalid operation detail result.', {
      kind: 'UNAVAILABLE',
      code: 'operation-detail-result-invalid',
    })
  }
  if (parsed.data.kind === 'not_found') {
    throwOperationReadFailure({ reason: 'operation_not_found', operationRef })
  }
  if (parsed.data.kind === 'unavailable') {
    throwOperationReadFailure({ reason: parsed.data.reason, operationRef })
  }
  if (
    parsed.data.operation.availability.posture !== 'routeable'
    || !parsed.data.operation.navigation.some(({ relation }) => relation === 'invoke')
  ) {
    throwOperationReadFailure({ reason: 'operation_unavailable', operationRef })
  }
}

function invokeOutput(
  result: OperationInvokeMachineResult | OperationInvokeStatusResult,
  options: CliOptions,
): Record<string, unknown> {
  const invocationRef = 'invocationRef' in result ? result.invocationRef : undefined
  const continuation = result.kind === 'completed' && result.usage.chargeState === 'insufficient_credit'
    ? creditContinuationForCli()
    : result.kind === 'completed' || invocationRef === undefined
      ? undefined
      : result.kind === 'outcome_unknown'
        ? invocationContinuationForCli({ kind: 'found', invocationRef, state: 'reconciliation_required' })
        : invocationContinuationForCli({ kind: 'found', invocationRef, state: 'in_progress' })
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

async function waitForOperationResult(
  options: CliOptions,
  operationRef: string,
  idempotencyKey: string,
  pending: OperationInvokeMachineResult,
): Promise<OperationInvokeMachineResult | OperationInvokeStatusResult> {
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
  stdin: Readable = process.stdin,
): Promise<void> {
  const operationRef = args[0]?.trim()
  if (
    args.length !== 1
    || operationRef === undefined
    || operationRef.length === 0
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
    throw new CliFailure('Operation input must be valid JSON.', { kind: 'INVALID_ARGUMENT', code: 'invoke-input' })
  }
  if (!isRecord(input)) {
    throw new CliFailure('Operation input must be a JSON object.', { kind: 'INVALID_ARGUMENT', code: 'invoke-input' })
  }
  const inspectionInput = operationInspectInputSchema.safeParse({ operationRef, input })
  if (!inspectionInput.success) {
    throw new CliFailure('Operation input or identity does not match operation.inspect:v1.', {
      kind: 'INVALID_ARGUMENT',
      code: 'invoke-input',
    })
  }
  const credential = resolveAgentAccessCredential(options.baseUrl)
  if (credential === undefined) {
    await requireOperationCanBenefitFromBuyerConnection(options.baseUrl, operationRef)
    const continuation = connectionContinuationForCli('buyer')
    throw new CliFailure('No AE agent credential is configured. Run ae connect, then repeat the same call.', {
      kind: 'UNAUTHENTICATED',
      code: 'agent_access_key_required',
      detail: { operationRef, ...(continuation.command === undefined ? {} : { nextAction: continuation.command }) },
      suggestion: continuation.label,
      ...(continuation.command === undefined ? {} : { nextCommand: continuation.command }),
    })
  }

  const apiKey = requireAgentAccessKey('invoke', options)

  const inspectionOutcome = await callJson(options.baseUrl, OPERATION_INSPECT_PATH, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(inspectionInput.data),
  })
  const inspection = operationInspectResultSchema.safeParse(requireOk(inspectionOutcome, OPERATION_INSPECT_PATH))
  if (!inspection.success) {
    throw new CliFailure('The gateway returned an invalid Operation inspection.', {
      kind: 'UNAVAILABLE',
      code: 'operation-inspect-result-invalid',
    })
  }
  if (inspection.data.kind === 'refused') {
    throw new CliFailure(`Operation inspection refused: ${inspection.data.code}.`, {
      kind: 'FAILED_PRECONDITION',
      code: inspection.data.code,
      detail: inspection.data,
    })
  }
  const idempotencyKey = resolveIdempotencyKey(options)
  const parsedInput = invokeCommandDescriptor.inputSchema.safeParse({
    commitmentRef: inspection.data.commitmentRef,
    idempotencyKey,
  })
  if (!parsedInput.success) throw new Error('operation_commitment_projection_invalid')
  if (!options.json) process.stderr.write(`Call committed: operationRef=${operationRef}. A durable retry identity has been retained.\n`)

  const path = invokeCommandDescriptor.path
  let outcome
  try {
    outcome = await callJson(options.baseUrl, path, {
      method: invokeCommandDescriptor.method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(parsedInput.data),
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
  const rendered = invokeOutput(result, options)

  if (options.json) {
    printJson(rendered)
    return
  }
  heading(`Operation ${operationRef}`)
  table([
    ['status', result.kind],
    ['duration', `${outcome.durationMs}ms`],
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
  outputSchema: operationInvokeMachineResultSchema,
  run: runInvokeCommand,
} as const
