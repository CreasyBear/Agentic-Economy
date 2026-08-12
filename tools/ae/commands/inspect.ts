import { isPublicOperationRef } from '@/modules/capability-supply/public'

import type { CliOptions } from '../lib/args'
import { CliFailure, callJson, heading, line, printJson, requireOk } from '../lib/output'
import { OPERATION_MARKET_DETAIL_PATH } from '@/modules/registry/operation-entry'
/** Read one exact current Market Operation without a caller credential. */
export async function runInspectCommand(args: readonly string[], options: CliOptions): Promise<void> {
  const operationRef = args[0]?.trim()
  if (operationRef === undefined || operationRef.length === 0 || args.length > 1) {
    throw new CliFailure('Usage: npm run -s ae -- inspect <operation-ref>', {
      kind: 'INVALID_ARGUMENT',
      code: 'inspect-usage',
    })
  }
  if (!isPublicOperationRef(operationRef)) {
    throw new CliFailure('Operation reference must match operation:v1:<64 lowercase hex characters>.', {
      kind: 'INVALID_ARGUMENT',
      code: 'operation-ref-invalid',
    })
  }

  const path = OPERATION_MARKET_DETAIL_PATH
  const outcome = await callJson(options.baseUrl, path, {
    method: 'POST',
    body: JSON.stringify({ operationRef }),
  })
  const body = requireOk(outcome, path)

  if (options.json) {
    printJson(body)
    return
  }

  heading(`Market Operation ${operationRef} (${outcome.durationMs}ms)`)
  if (body !== undefined) line(JSON.stringify(body, undefined, 2))
}
