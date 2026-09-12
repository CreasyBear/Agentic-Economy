import {
  toolCompareInputSchema,
} from '@/modules/capability-supply/public'
import { toolChoiceCompareOutputSchema } from '@/modules/registry/tool-choice-contracts'
import { TOOL_MARKET_COMPARE_PATH } from '@/modules/registry/tool-entry'

import type { CliOptions } from '../lib/args'
import { CliFailure, callJson, heading, line, printJson, requireOk } from '../lib/output'
import { continuationCommand } from '../lib/continuation-command'
import { usageFailure } from '../lib/help'
import { toolLabel } from '../lib/tool-format'
import { throwToolReadFailure } from '../lib/tool-read-failure'

/** Compare exact current Tool references through the anonymous market route. */
export async function runCompareCommand(args: readonly string[], options: CliOptions): Promise<void> {
  if (args.length < 1 || args.length > 4) {
    throw usageFailure('compare', 'compare-usage')
  }

  const parsedInput = compareCommandDescriptor.inputSchema.safeParse({
    toolRefs: args.map((arg) => arg.trim()),
  })
  if (!parsedInput.success) {
    throw new CliFailure('Compare requires two to four exact tool references.', {
      kind: 'INVALID_ARGUMENT',
      code: 'compare-input',
    })
  }
  if (parsedInput.data.toolRefs.length === 1) {
    const toolRef = parsedInput.data.toolRefs[0]!
    throw new CliFailure('A comparison needs at least two Tools.', {
      kind: 'INVALID_ARGUMENT',
      code: 'compare-needs-alternative',
      suggestion: 'Describe this Tool directly, or search for another Provider to compare.',
      nextCommand: continuationCommand([
        'ae', 'describe', toolRef,
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
    throw new CliFailure('The market returned an invalid tool comparison result.', {
      kind: 'UNAVAILABLE',
      code: 'tool-compare-result-invalid',
    })
  }

  const result = parsedResult.data
  if (result.kind === 'unavailable') {
    throwToolReadFailure({ reason: result.reason })
  }
  const nextCommands = result.tools.map((tool) => ({
    toolRef: tool.toolRef,
    command: continuationCommand([
      'ae', 'describe', tool.toolRef,
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

  printHumanComparison(result, parsedInput.data.toolRefs.length, options.technical === true)
  line('  Choose one Provider, then describe its exact Tool:')
  for (const next of nextCommands) line(`    ${next.command}`)
}

function printMissingRefs(missing: readonly string[] | undefined): void {
  if (missing === undefined || missing.length === 0) return
  line('  not found or unavailable:')
  for (const toolRef of missing) line(`    ${toolRef}`)
}

type AvailableComparison = Extract<ReturnType<typeof toolChoiceCompareOutputSchema.parse>, { kind: 'ok' }>

function printHumanComparison(result: AvailableComparison, requestedCount: number, technical: boolean): void {
  heading(`Tool comparison (${requestedCount} exact references)`)
  line('  tools:')
  for (const [index, tool] of result.tools.entries()) {
    line(`    ${index + 1}. ${toolLabel(tool)}`)
    line(`       ${tool.description}`)
    line(`       indicative price: ${tool.priceLabel}`)
    line(`       health: ${tool.healthStatus}`)
  }
  printMissingRefs(result.missing)
  if (technical) printTechnicalComparison(result)
}

function printTechnicalComparison(result: AvailableComparison): void {
  line('  technical:')
  line(`    schema: ${result.schemaVersion}`)
  for (const tool of result.tools) {
    line(`    ${tool.toolRef} · capability=${tool.capabilityId}`)
  }
}

export const compareCommandDescriptor = {
  command: 'compare',
  actionId: 'registry.tools.compare',
  path: TOOL_MARKET_COMPARE_PATH,
  inputSchema: toolCompareInputSchema,
  outputSchema: toolChoiceCompareOutputSchema,
  run: runCompareCommand,
} as const
