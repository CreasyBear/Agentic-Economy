import { createTool, type ToolCtx } from '@convex-dev/agent'
import type { FunctionArgs } from 'convex/server'
import { z } from 'zod'
import { deserializeToolCompareResult, deserializeToolDetailResult, type ToolCompareInput } from '@/modules/capability-supply/public'
import { CHAT_TOOL_NAME_MAP } from '@/modules/chat/tool-card'
import { projectToolCompareChoices, projectToolDescription } from '@/modules/registry/tool-choice-contracts'
import { registryToolsCompareContract, registryToolsDescribeContract } from '@/modules/registry/tool-action-contracts'
import { internal } from '../../../_generated/api'
import { descriptionFor, failure, type ReserveChatTool } from './contracts'
import { callableToolRef } from './callableRef'
import { projectedModelFacingOutput } from './output'

export function createReadTools(reserve: ReserveChatTool) {
  const describeContract = registryToolsDescribeContract
  const compareContract = registryToolsCompareContract
  return {
    [CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.describe']]: createTool({
      description: descriptionFor(describeContract),
      // Chat also accepts a directory listing id; it resolves to the operation so the
      // model can read the listing's input schema before it quotes.
      inputSchema: z.strictObject({ toolRef: z.string().min(1).max(200) }),
      execute: async (ctx: ToolCtx, input: { toolRef: string }) => {
        const denied = reserve('registry.tools.describe')
        if (denied !== null) return denied
        const toolRef = await callableToolRef(ctx, input.toolRef)
        if (toolRef === null) return failure('registry.tools.describe', 'tool_unavailable')
        const result = await ctx.runAction(internal.capabilityToolCatalog.detailInternal, { toolRef })
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
        const nativeResult = await ctx.runAction(
          internal.capabilityToolCatalog.compareInternal,
          structuredClone(input) as FunctionArgs<typeof internal.capabilityToolCatalog.compareInternal>,
        )
        return projectedModelFacingOutput(
          'registry.tools.compare',
          compareContract.outputSchema,
          () => {
            const result = deserializeToolCompareResult(nativeResult)
            return projectToolCompareChoices(result.kind === 'ok'
              ? { kind: 'ok', tools: result.tools }
              : { kind: 'unavailable', reason: result.reason })
          },
        )
      },
    }),
  }
}
