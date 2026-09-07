import { CALL_ROUTE_CONTRACT } from '@/modules/capability-execution/call-entry'
import { callStatusInputSchema } from '@/modules/capability-execution/call-recovery.actions'
import type { CallStatusResult } from '@/modules/capability-execution/call-recovery-contracts'

import type { CliOptions } from '../lib/args'
import { usageFailure } from '../lib/help'
import { CliFailure } from '../lib/output'
import {
  MAX_STATUS_WAIT_MS,
  pendingDelay,
  readCallStatus,
  renderStatusResult,
  terminalResult,
} from './status'

const DEFAULT_STATUS_DELAY_MS = 1_000

function waitCommandFor(callRef: string): string {
  return `ae wait ${callRef}`
}

function waitTimeoutFailure(callRef: string): CliFailure {
  return new CliFailure('Call wait timed out; the call remains recorded.', {
    kind: 'UNAVAILABLE',
    code: 'call-wait-timeout',
    suggestion: 'Continue observing the same call identity; do not create a replacement call.',
    nextCommand: waitCommandFor(callRef),
    detail: {
      recovery: 'Continue observing the same call identity.',
      identityPreserved: true,
    },
  })
}

function waitTransportFailure(callRef: string): CliFailure {
  return new CliFailure('Call wait transport is unknown; the call remains recorded.', {
    kind: 'UNAVAILABLE',
    code: 'call-wait-transport-unknown',
    suggestion: 'Continue observing the same call identity; do not create a replacement call.',
    nextCommand: waitCommandFor(callRef),
    detail: {
      recovery: 'Continue observing the same call identity.',
      identityPreserved: true,
    },
  })
}

async function readWaitStatus(
  options: CliOptions,
  callRef: string,
): Promise<CallStatusResult> {
  try {
    return await readCallStatus(options, callRef, 'wait')
  } catch (error) {
    if (error instanceof CliFailure && error.kind !== 'UNAVAILABLE') throw error
    throw waitTransportFailure(callRef)
  }
}

export async function runWaitCommand(args: readonly string[], options: CliOptions): Promise<void> {
  const callRef = args[0]?.trim()
  const parsedRef = callStatusInputSchema.safeParse({ callRef })
  if (!parsedRef.success || args.length > 1) {
    throw usageFailure('wait', 'wait-usage')
  }

  const recordedRef = parsedRef.data.callRef
  const deadline = Date.now() + MAX_STATUS_WAIT_MS
  let body = await readWaitStatus(options, recordedRef)
  let delayMs = pendingDelay(body, DEFAULT_STATUS_DELAY_MS)

  while (terminalResult(body) === undefined) {
    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) throw waitTimeoutFailure(recordedRef)
    await new Promise<void>((resolve) => {
      setTimeout(resolve, Math.min(delayMs, remainingMs))
    })
    if (!options.json) process.stderr.write('Waiting for the recorded Call outcome.\n')
    body = await readWaitStatus(options, recordedRef)
    delayMs = pendingDelay(body, delayMs)
  }

  renderStatusResult('Call result', recordedRef, body, options)
}

export const waitCommandDescriptor = {
  command: 'wait',
  actionId: CALL_ROUTE_CONTRACT.status.actionId,
  path: CALL_ROUTE_CONTRACT.status.path,
  method: CALL_ROUTE_CONTRACT.status.method,
  run: runWaitCommand,
} as const
