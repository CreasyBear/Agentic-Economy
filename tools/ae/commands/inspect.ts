import {
  operationDetailInputSchema,
  operationDetailOutputSchema,
} from '@/modules/capability-supply/public'

import type { CliOptions } from '../lib/args'
import { CliFailure, callJson, heading, line, printJson, requireOk } from '../lib/output'
import { usageFailure } from '../lib/help'
import { OPERATION_MARKET_DETAIL_PATH } from '@/modules/registry/operation-entry'
import {
  formatOperationAuthentication,
  formatOperationAvailability,
  formatOperationContinuations,
  formatOperationInputs,
  formatOperationTotalPrice,
  formatOperationVerification,
  operationLabel,
} from '../lib/operation-format'
import { throwOperationReadFailure } from '../lib/operation-read-failure'
/** Read one exact current Market Operation without a caller credential. */
export async function runInspectCommand(args: readonly string[], options: CliOptions): Promise<void> {
  const operationRef = args[0]?.trim()
  if (operationRef === undefined || operationRef.length === 0 || args.length > 1) {
    throw usageFailure('inspect', 'inspect-usage')
  }
  const parsedInput = inspectCommandDescriptor.inputSchema.safeParse({ operationRef })
  if (!parsedInput.success) {
    throw new CliFailure('Operation reference must match operation:v1:<64 lowercase hex characters>.', {
      kind: 'INVALID_ARGUMENT',
      code: 'operation-ref-invalid',
    })
  }

  const path = inspectCommandDescriptor.path
  const outcome = await callJson(options.baseUrl, path, {
    method: 'POST',
    body: JSON.stringify(parsedInput.data),
  })
  const parsedResult = inspectCommandDescriptor.outputSchema.safeParse(requireOk(outcome, path))
  if (!parsedResult.success) {
    throw new CliFailure('The market returned an invalid operation detail result.', {
      kind: 'UNAVAILABLE',
      code: 'operation-detail-result-invalid',
    })
  }

  const result = parsedResult.data
  if (result.kind === 'not_found') {
    throwOperationReadFailure({ reason: 'operation_not_found' })
  }
  if (result.kind === 'unavailable') {
    throwOperationReadFailure({ reason: result.reason })
  }
  if (options.json) {
    printJson(result)
    return
  }

  heading(`Market Operation ${operationRef} (${outcome.durationMs}ms)`)
  const operation = result.operation
  line(`  ${operationLabel(operation)}`)
  line(`  ${operation.summary}`)
  line('')
  line(`  provider: ${operation.business.name}`)
  line(`  availability: ${formatOperationAvailability(operation.availability)}`)
  line(`  total price: ${formatOperationTotalPrice(operation)}`)
  line(`  authentication: ${formatOperationAuthentication(operation)}`)
  line(`  last verified: ${formatOperationVerification(operation)}`)
  line(`  inputs: ${formatOperationInputs(operation)}`)
  line(
    `  effects: ${operation.effects.length === 0
      ? 'none'
      : operation.effects.map((effect) => effect.class.replace(/_/gu, ' ')).join(', ')}`,
  )
  line(`  next: ${formatOperationContinuations(operation)}`)
  if (operation.contract.inputExamples?.[0] !== undefined) {
    line(`  example input: ${JSON.stringify(operation.contract.inputExamples[0].input)}`)
  }
}

export const inspectCommandDescriptor = {
  command: 'inspect',
  actionId: 'registry.operations.detail',
  path: OPERATION_MARKET_DETAIL_PATH,
  inputSchema: operationDetailInputSchema,
  outputSchema: operationDetailOutputSchema,
  run: runInspectCommand,
} as const
