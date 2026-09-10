import { callRecoveryResultSchema, callCancelInputSchema } from '@/modules/capability-execution/call-recovery.actions'
import { CALL_ROUTE_CONTRACT } from '@/modules/capability-execution/call-entry'

import type { CliOptions } from '../lib/args'
import { CliFailure, callJson, requireOk } from '../lib/output'
import { usageFailure } from '../lib/help'
import {
  recoveryTransportFailure,
  renderStatusResult,
  requireAgentAccessKey,
} from './status'

function cancelPath(callRef: string): string {
  return CALL_ROUTE_CONTRACT.cancel.path.replace(
    '{callRef}',
    encodeURIComponent(callRef),
  )
}

export async function runCancelCommand(args: readonly string[], options: CliOptions): Promise<number> {
  const callRef = args[0]?.trim()
  if (callRef === undefined || callRef.length === 0 || args.length > 1) {
    throw usageFailure('cancel', 'cancel-usage')
  }
  const apiKey = requireAgentAccessKey('cancel', options)
  const idempotencyKey = options.idempotencyKey?.trim()
  const parsedInput = callCancelInputSchema.safeParse({ callRef, idempotencyKey })
  if (!parsedInput.success) {
    throw new CliFailure('Cancel requires --idempotency-key with a bounded stable command identity.', {
      kind: 'INVALID_ARGUMENT',
      code: 'idempotency-key-required',
    })
  }

  const path = cancelPath(parsedInput.data.callRef)
  let outcome
  try {
    outcome = await callJson(options.baseUrl, path, {
      method: CALL_ROUTE_CONTRACT.cancel.method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ idempotencyKey: parsedInput.data.idempotencyKey }),
    })
  } catch (error) {
    if (error instanceof CliFailure) throw error
    throw recoveryTransportFailure('cancel', parsedInput.data.callRef, parsedInput.data.idempotencyKey)
  }
  let resultBody: unknown
  try {
    resultBody = requireOk(outcome, 'Call cancellation')
  } catch (error) {
    if (error instanceof CliFailure && error.kind !== 'UNAVAILABLE') throw error
    throw recoveryTransportFailure('cancel', parsedInput.data.callRef, parsedInput.data.idempotencyKey)
  }
  const parsedResult = callRecoveryResultSchema.safeParse(resultBody)
  if (!parsedResult.success) {
    throw new CliFailure('The gateway returned an invalid cancellation result.', {
      kind: 'UNAVAILABLE',
      code: 'call-cancel-result-invalid',
    })
  }
  return renderStatusResult('Call cancellation', parsedInput.data.callRef, parsedResult.data, options)
}
