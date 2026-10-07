import { createTool, type ToolCtx } from '@convex-dev/agent'
import type { FunctionArgs } from 'convex/server'
import { z } from 'zod'
import { deserializeToolCompareResult, deserializeToolDetailResult, type ToolCompareInput } from '@/modules/capability-supply/public'
import { CHAT_TOOL_NAME_MAP } from '@/modules/chat/tool-card'
import { projectToolCompareChoices, projectToolDescription } from '@/modules/registry/tool-choice-contracts'
import { registryToolsCompareContract, registryToolsDescribeContract } from '@/modules/registry/tool-action-contracts'
import { selectedChatDetailRequest } from './step'
import { api, internal } from '../../../_generated/api'
import { descriptionFor, failure, type ReserveChatTool } from './contracts'
import { projectedModelFacingOutput } from './output'

const externalDetailSchema = z.strictObject({
  kind: z.literal('external'),
  tool: z.strictObject({
    id: z.string(), toolRef: z.string(), title: z.string(), description: z.string(),
    source: z.literal('coinbase'), access: z.literal('external_listing'),
    readiness: z.literal('unverified'), provider: z.string(),
    input: z.unknown().optional(), output: z.unknown().optional(),
  }),
})

export function createReadTools(reserve: ReserveChatTool) {
  const describeContract = registryToolsDescribeContract
  const compareContract = registryToolsCompareContract
  return {
    [CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.describe']]: createTool({
      description: descriptionFor(describeContract),
      inputSchema: z.strictObject({ toolRef: z.string().min(1).max(200) }),
      execute: async (ctx: ToolCtx, input: { toolRef: string }, options) => {
        const denied = reserve('registry.tools.describe')
        if (denied !== null) return denied
        const selected = selectedChatDetailRequest(options.messages)
        if (selected !== null && input.toolRef !== selected.toolRef) {
          return failure('registry.tools.describe', 'selected_tool_mismatch')
        }
        let toolRef = input.toolRef
        if (/^registry:[0-9a-f]{64}$/u.test(toolRef)) {
          const detail = await ctx.runQuery(api.x402DirectoryIndex.detailById, { id: toolRef })
          if (detail.kind !== 'found') return failure('registry.tools.describe', 'tool_unavailable')
          if (detail.item.toolRef === undefined) {
            const entry = detail.item.entry
            return projectedModelFacingOutput('registry.tools.describe', externalDetailSchema, () => ({
              kind: 'external', tool: {
                id: toolRef, toolRef, source: 'coinbase', access: 'external_listing', readiness: 'unverified',
                title: entry.title, description: entry.description, provider: entry.provider,
                ...(entry.input === undefined ? {} : { input: entry.input }),
                ...(entry.output === undefined ? {} : { output: entry.output }),
              },
            }))
          }
          toolRef = detail.item.toolRef
        }
        if (!/^operation:v1:[0-9a-f]{64}$/u.test(toolRef)) return failure('registry.tools.describe', 'tool_unavailable')
        const result = await ctx.runAction(internal.capabilityToolCatalog.detailInternal, { toolRef })
        return projectedModelFacingOutput(
          'registry.tools.describe', describeContract.outputSchema,
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
