import { createTool, type ToolCtx } from '@convex-dev/agent'
import type { FunctionArgs } from 'convex/server'
import { z } from 'zod'
import { deserializeToolCompareResult, deserializeToolDetailResult, type ToolCompareInput, type ToolDetailInput } from '@/modules/capability-supply/public'
import { CHAT_TOOL_NAME_MAP } from '@/modules/chat/tool-card'
import { projectToolCompareChoices, projectToolDescription } from '@/modules/registry/tool-choice-contracts'
import { registryToolsCompareContract, registryToolsDescribeContract } from '@/modules/registry/tool-action-contracts'
import { api } from '../../../_generated/api'
import { descriptionFor, type ReserveChatTool } from './contracts'
import { projectedModelFacingOutput } from './output'

export function createReadTools(reserve: ReserveChatTool) {
  const describeContract = registryToolsDescribeContract
  const compareContract = registryToolsCompareContract
  return {
    [CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.describe']]: createTool({
      description: descriptionFor(describeContract),
      inputSchema: describeContract.schema as z.ZodType<ToolDetailInput>,
      execute: async (ctx: ToolCtx, input: ToolDetailInput) => {
        const denied = reserve('registry.tools.describe')
        if (denied !== null) return denied
        const result = await ctx.runAction(api.capabilityToolCatalog.detail, input)
        return projectedModelFacingOutput(
          'registry.tools.describe',
          describeContract.outputSchema,
          () => projectToolDescription(deserializeToolDetailResult(result)),
        )
      },
    }),
    [CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.compare']]: createTool({
      description: descriptionFor(compareContract),
      inputSchema: compareContract.schema as z.ZodType<ToolCompareInput>,
      execute: async (ctx: ToolCtx, input: ToolCompareInput) => {
        const denied = reserve('registry.tools.compare')
        if (denied !== null) return denied
        const result = await ctx.runAction(
          api.capabilityToolCatalog.compare,
          structuredClone(input) as FunctionArgs<typeof api.capabilityToolCatalog.compare>,
        )
        return projectedModelFacingOutput(
          'registry.tools.compare',
          compareContract.outputSchema,
          () => projectToolCompareChoices(deserializeToolCompareResult(result)),
        )
      },
    }),
  }
}
