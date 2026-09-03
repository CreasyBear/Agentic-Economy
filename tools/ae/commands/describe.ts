import {
  operationChoiceDescribeOutputSchema,
  operationDescribeInputSchema,
} from '@/modules/registry/operation-choice-contracts'
import { OPERATION_MARKET_DESCRIBE_PATH } from '@/modules/registry/operation-entry'

import type { CliOptions } from '../lib/args'
import { CliFailure, callJson, heading, line, printJson, requireOk } from '../lib/output'
import { usageFailure } from '../lib/help'
import { throwOperationReadFailure } from '../lib/operation-read-failure'

/** Describe one exact current Market Operation without a caller credential. */
export async function runDescribeCommand(args: readonly string[], options: CliOptions): Promise<void> {
  const operationRef = args[0]?.trim()
  if (operationRef === undefined || operationRef.length === 0 || args.length > 1) {
    throw usageFailure('describe', 'describe-usage')
  }
  const parsedInput = describeCommandDescriptor.inputSchema.safeParse({ operationRef })
  if (!parsedInput.success) {
    throw new CliFailure('Operation reference must match operation:v1:<64 lowercase hex characters>.', {
      kind: 'INVALID_ARGUMENT', code: 'operation-ref-invalid',
    })
  }
  const outcome = await callJson(options.baseUrl, describeCommandDescriptor.path, {
    method: 'POST', body: JSON.stringify(parsedInput.data),
  })
  const parsed = describeCommandDescriptor.outputSchema.safeParse(requireOk(outcome, describeCommandDescriptor.path))
  if (!parsed.success) {
    throw new CliFailure('The market returned an invalid Operation description.', {
      kind: 'UNAVAILABLE', code: 'operation-describe-result-invalid',
    })
  }
  if (parsed.data.kind === 'not_found') throwOperationReadFailure({ reason: 'operation_not_found' })
  if (parsed.data.kind === 'unavailable') {
    throwOperationReadFailure({ reason: 'source_unavailable', operationRef })
  }
  const operation = parsed.data.operation
  if (options.json) {
    printJson(parsed.data)
    return
  }
  heading(`Market Operation ${operationRef} (${outcome.durationMs}ms)`)
  line(`  ${operation.provider.name} — ${operation.title}`)
  line(`  ${operation.description}`)
  line(`  health: ${operation.healthStatus}`)
  line(`  indicative price: ${operation.priceLabel}`)
  line(`  inputs: ${(operation.parameters ?? []).map((parameter) => `${parameter.name}${parameter.required ? '' : '?'}`).join(', ') || 'none'}`)
  line(`  Operation reference: ${operation.operationRef}`)
  line('  Next: use operation.inspect from your connected agent client.')
}

export const describeCommandDescriptor = {
  command: 'describe',
  actionId: 'registry.operations.describe',
  path: OPERATION_MARKET_DESCRIBE_PATH,
  inputSchema: operationDescribeInputSchema,
  outputSchema: operationChoiceDescribeOutputSchema,
  run: runDescribeCommand,
} as const
