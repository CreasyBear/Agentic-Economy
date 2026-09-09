import {
 toolChoiceDescribeOutputSchema,
  toolDescribeInputSchema,
} from '@/modules/registry/tool-choice-contracts'
import { TOOL_MARKET_DESCRIBE_PATH } from '@/modules/registry/tool-entry'

import type { CliOptions } from '../lib/args'
import { CliFailure, callJson, heading, line, printJson, requireOk } from '../lib/output'
import { continuationFlags } from '../lib/continuation-command'
import { usageFailure } from '../lib/help'
import { toolCallCommand } from '../lib/tool-format'
import { QUOTE_MCP_TOOL_NAME } from './manifest'
import { throwToolReadFailure } from '../lib/tool-read-failure'

/** Describe one exact current Market Tool without a caller credential. */
export async function runDescribeCommand(args: readonly string[], options: CliOptions): Promise<void> {
  const toolRef = args[0]?.trim()
  if (toolRef === undefined || toolRef.length === 0 || args.length > 1) {
    throw usageFailure('describe', 'describe-usage')
  }
  const parsedInput = describeCommandDescriptor.inputSchema.safeParse({ toolRef })
  if (!parsedInput.success) {
    throw new CliFailure('Tool reference must match operation:v1:<64 lowercase hex characters>.', {
      kind: 'INVALID_ARGUMENT', code: 'tool-ref-invalid',
    })
  }
  const outcome = await callJson(options.baseUrl, describeCommandDescriptor.path, {
    method: 'POST', body: JSON.stringify(parsedInput.data),
  })
  const parsed = describeCommandDescriptor.outputSchema.safeParse(requireOk(outcome, describeCommandDescriptor.path))
  if (!parsed.success) {
    throw new CliFailure('The market returned an invalid Tool description.', {
      kind: 'UNAVAILABLE', code: 'tool-describe-result-invalid',
    })
  }
  if (parsed.data.kind === 'not_found') throwToolReadFailure({ reason: 'tool_not_found', options })
  if (parsed.data.kind === 'unavailable') {
    throwToolReadFailure({ reason: 'source_unavailable', toolRef })
  }
  const tool = parsed.data.tool
  if (options.json) {
    printJson(parsed.data)
    return
  }
  heading(`Market Tool ${toolRef} (${outcome.durationMs}ms)`)
  line(`  ${tool.provider.name} — ${tool.title}`)
  line(`  ${tool.description}`)
  line(`  health: ${tool.healthStatus}`)
  line(`  indicative price: ${tool.priceLabel}`)
  line(`  inputs: ${(tool.parameters ?? []).map((parameter) => `${parameter.name}${parameter.required ? '' : '?'}`).join(', ') || 'none'}`)
  line(`  Tool reference: ${tool.toolRef}`)
  line(`  Next: ${[toolCallCommand(tool.toolRef), ...continuationFlags(options)].join(' ')}`)
  line(`  From an MCP client: ${QUOTE_MCP_TOOL_NAME} with this Tool reference and input.`)
}

export const describeCommandDescriptor = {
  command: 'describe',
  actionId: 'registry.tools.describe',
  path: TOOL_MARKET_DESCRIBE_PATH,
  inputSchema: toolDescribeInputSchema,
  outputSchema: toolChoiceDescribeOutputSchema,
  run: runDescribeCommand,
} as const
