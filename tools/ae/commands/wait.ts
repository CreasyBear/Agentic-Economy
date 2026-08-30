import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'
import { operationStatusInputSchema } from '@/modules/capability-execution/operation-recovery.actions'
import type { OperationInvokeStatusResult } from '@/modules/capability-execution/operation-recovery-contracts'

import type { CliOptions } from '../lib/args'
import { usageFailure } from '../lib/help'
import { CliFailure } from '../lib/output'
import {
  MAX_STATUS_WAIT_MS,
  pendingDelay,
  readOperationStatus,
  renderStatusResult,
  terminalResult,
} from './status'

const DEFAULT_STATUS_DELAY_MS = 1_000

function waitCommandFor(invocationRef: string): string {
  return `ae wait ${invocationRef}`
}

function waitTimeoutFailure(invocationRef: string): CliFailure {
  return new CliFailure('Operation wait timed out; the invocation remains recorded.', {
    kind: 'UNAVAILABLE',
    code: 'operation-wait-timeout',
    suggestion: 'Continue observing the same invocation identity; do not create a replacement call.',
    nextCommand: waitCommandFor(invocationRef),
    detail: {
      recovery: 'Continue observing the same invocation identity.',
      identityPreserved: true,
    },
  })
}

function waitTransportFailure(invocationRef: string): CliFailure {
  return new CliFailure('Operation wait transport is unknown; the invocation remains recorded.', {
    kind: 'UNAVAILABLE',
    code: 'operation-wait-transport-unknown',
    suggestion: 'Continue observing the same invocation identity; do not create a replacement call.',
    nextCommand: waitCommandFor(invocationRef),
    detail: {
      recovery: 'Continue observing the same invocation identity.',
      identityPreserved: true,
    },
  })
}

async function readWaitStatus(
  options: CliOptions,
  invocationRef: string,
): Promise<OperationInvokeStatusResult> {
  try {
    return await readOperationStatus(options, invocationRef, 'wait')
  } catch (error) {
    if (error instanceof CliFailure && error.kind !== 'UNAVAILABLE') throw error
    throw waitTransportFailure(invocationRef)
  }
}

export async function runWaitCommand(args: readonly string[], options: CliOptions): Promise<void> {
  const invocationRef = args[0]?.trim()
  const parsedRef = operationStatusInputSchema.safeParse({ invocationRef })
  if (!parsedRef.success || args.length > 1) {
    throw usageFailure('wait', 'wait-usage')
  }

  const recordedRef = parsedRef.data.invocationRef
  const deadline = Date.now() + MAX_STATUS_WAIT_MS
  let body = await readWaitStatus(options, recordedRef)
  let delayMs = pendingDelay(body, DEFAULT_STATUS_DELAY_MS)

  while (terminalResult(body) === undefined) {
    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) throw waitTimeoutFailure(recordedRef)
    await new Promise<void>((resolve) => {
      setTimeout(resolve, Math.min(delayMs, remainingMs))
    })
    if (!options.json) process.stderr.write('Waiting for the recorded operation outcome.\n')
    body = await readWaitStatus(options, recordedRef)
    delayMs = pendingDelay(body, delayMs)
  }

  renderStatusResult('Operation result', recordedRef, body, options)
}

export const waitCommandDescriptor = {
  command: 'wait',
  actionId: OPERATION_INVOKE_ROUTE_CONTRACT.status.actionId,
  path: OPERATION_INVOKE_ROUTE_CONTRACT.status.path,
  method: OPERATION_INVOKE_ROUTE_CONTRACT.status.method,
  run: runWaitCommand,
} as const
