import {
  operationCompareInputSchema,
} from '@/modules/capability-supply/public'
import { operationChoiceCompareOutputSchema } from '@/modules/registry/operation-choice-contracts'
import { OPERATION_MARKET_COMPARE_PATH } from '@/modules/registry/operation-entry'

import type { CliOptions } from '../lib/args'
import { CliFailure, callJson, heading, line, printJson, requireOk } from '../lib/output'
import { continuationCommand } from '../lib/continuation-command'
import { usageFailure } from '../lib/help'
import { operationLabel } from '../lib/operation-format'
import { throwOperationReadFailure } from '../lib/operation-read-failure'

/** Compare exact current Operation references through the anonymous market route. */
export async function runCompareCommand(args: readonly string[], options: CliOptions): Promise<void> {
  if (args.length < 1 || args.length > 4) {
    throw usageFailure('compare', 'compare-usage')
  }

  const parsedInput = compareCommandDescriptor.inputSchema.safeParse({
    operationRefs: args.map((arg) => arg.trim()),
  })
  if (!parsedInput.success) {
    throw new CliFailure('Compare requires two to four exact operation references.', {
      kind: 'INVALID_ARGUMENT',
      code: 'compare-input',
    })
  }
  if (parsedInput.data.operationRefs.length === 1) {
    const operationRef = parsedInput.data.operationRefs[0]!
    throw new CliFailure('A comparison needs at least two Operations.', {
      kind: 'INVALID_ARGUMENT',
      code: 'compare-needs-alternative',
      suggestion: 'Describe this Operation directly, or search for another Provider to compare.',
      nextCommand: continuationCommand([
        'ae', 'describe', operationRef,
        ...(options.baseUrlSource === undefined || options.baseUrlSource === 'hosted_default'
          ? []
          : ['--base-url', options.baseUrl]),
        ...(options.json ? ['--json'] : []),
        ...(options.technical ? ['--technical'] : []),
      ]),
    })
  }

  const path = compareCommandDescriptor.path
  const outcome = await callJson(options.baseUrl, path, {
    method: 'POST',
    body: JSON.stringify(parsedInput.data),
  })
  const parsedResult = compareCommandDescriptor.outputSchema.safeParse(requireOk(outcome, path))
  if (!parsedResult.success) {
    throw new CliFailure('The market returned an invalid operation comparison result.', {
      kind: 'UNAVAILABLE',
      code: 'operation-compare-result-invalid',
    })
  }

  const result = parsedResult.data
  if (result.kind === 'unavailable') {
    throwOperationReadFailure({ reason: result.reason })
  }
  const nextCommands = result.operations.map((operation) => ({
    operationRef: operation.operationRef,
    command: continuationCommand([
      'ae', 'describe', operation.operationRef,
      ...(options.baseUrlSource === undefined || options.baseUrlSource === 'hosted_default'
        ? []
        : ['--base-url', options.baseUrl]),
      ...(options.json ? ['--json'] : []),
      ...(options.technical ? ['--technical'] : []),
    ]),
  }))
  if (options.json) {
    printJson({ ...result, nextCommands })
    return
  }

  printHumanComparison(result, parsedInput.data.operationRefs.length, options.technical === true)
  line('  Choose one Provider, then describe its exact Operation:')
  for (const next of nextCommands) line(`    ${next.command}`)
}

type AvailableComparison = Extract<ReturnType<typeof operationChoiceCompareOutputSchema.parse>, { kind: 'ok' }>

function printHumanComparison(result: AvailableComparison, requestedCount: number, technical: boolean): void {
  heading(`Operation comparison (${requestedCount} exact references)`)
  line('  operations:')
  for (const [index, operation] of result.operations.entries()) {
    line(`    ${index + 1}. ${operationLabel(operation)}`)
    line(`       ${operation.description}`)
    line(`       indicative price: ${operation.priceLabel}`)
    line(`       health: ${operation.healthStatus}`)
  }
  if (technical) printTechnicalComparison(result)
}

function printTechnicalComparison(result: AvailableComparison): void {
  line('  technical:')
  line(`    schema: ${result.schemaVersion}`)
  for (const operation of result.operations) {
    line(`    ${operation.operationRef} · capability=${operation.capabilityId}`)
  }
}

export const compareCommandDescriptor = {
  command: 'compare',
  actionId: 'registry.operations.compare',
  path: OPERATION_MARKET_COMPARE_PATH,
  inputSchema: operationCompareInputSchema,
  outputSchema: operationChoiceCompareOutputSchema,
  run: runCompareCommand,
} as const
