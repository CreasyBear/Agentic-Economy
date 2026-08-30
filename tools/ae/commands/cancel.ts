import { operationInvokeRecoveryResultSchema, operationCancelInputSchema } from '@/modules/capability-execution/operation-recovery.actions'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'

import type { CliOptions } from '../lib/args'
import { CliFailure, callJson, requireOk } from '../lib/output'
import { usageFailure } from '../lib/help'
import {
  recoveryTransportFailure,
  renderStatusResult,
  requireAgentAccessKey,
} from './status'

function cancelPath(invocationRef: string): string {
  return OPERATION_INVOKE_ROUTE_CONTRACT.cancel.path.replace(
    '{invocationRef}',
    encodeURIComponent(invocationRef),
  )
}

export async function runCancelCommand(args: readonly string[], options: CliOptions): Promise<void> {
  const invocationRef = args[0]?.trim()
  if (invocationRef === undefined || invocationRef.length === 0 || args.length > 1) {
    throw usageFailure('cancel', 'cancel-usage')
  }
  const apiKey = requireAgentAccessKey('cancel', options)
  const idempotencyKey = options.idempotencyKey?.trim()
  const parsedInput = operationCancelInputSchema.safeParse({ invocationRef, idempotencyKey })
  if (!parsedInput.success) {
    throw new CliFailure('Cancel requires --idempotency-key with a bounded stable command identity.', {
      kind: 'INVALID_ARGUMENT',
      code: 'idempotency-key-required',
    })
  }

  const path = cancelPath(parsedInput.data.invocationRef)
  let outcome
  try {
    outcome = await callJson(options.baseUrl, path, {
      method: OPERATION_INVOKE_ROUTE_CONTRACT.cancel.method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ idempotencyKey: parsedInput.data.idempotencyKey }),
    })
  } catch (error) {
    if (error instanceof CliFailure) throw error
    throw recoveryTransportFailure('cancel', parsedInput.data.invocationRef, parsedInput.data.idempotencyKey)
  }
  let resultBody: unknown
  try {
    resultBody = requireOk(outcome, 'operation cancellation')
  } catch (error) {
    if (error instanceof CliFailure && error.kind !== 'UNAVAILABLE') throw error
    throw recoveryTransportFailure('cancel', parsedInput.data.invocationRef, parsedInput.data.idempotencyKey)
  }
  const parsedResult = operationInvokeRecoveryResultSchema.safeParse(resultBody)
  if (!parsedResult.success) {
    throw new CliFailure('The gateway returned an invalid cancellation result.', {
      kind: 'UNAVAILABLE',
      code: 'operation-cancel-result-invalid',
    })
  }
  renderStatusResult('Operation cancellation', parsedInput.data.invocationRef, parsedResult.data, options)
}
