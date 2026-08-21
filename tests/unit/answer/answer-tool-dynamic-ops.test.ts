import { describe, expect, it } from 'vitest'

import { buildAnswerAgentTools } from '@/modules/answer/internal/answer-tool-use-agent'
import { openRouterToolName } from '@/modules/answer/internal/action-to-tool-spec'
import { ANSWER_READ_TOOL_IDS } from '@/modules/answer-thread/tooling'

describe('registered answer model tools', () => {
  it('registers only listAnswerModelToolActions tools, including generic operation.execute', async () => {
    const calls: Array<{ toolId: string; raw: unknown; toolCallId: string }> = []
    const tools = buildAnswerAgentTools(async (toolId, raw, toolCallId) => {
      calls.push({ toolId, raw, toolCallId })
      return '{}'
    })

    const names = Object.keys(tools).sort()
    expect(names).toEqual([...ANSWER_READ_TOOL_IDS.map(openRouterToolName)].sort())
    expect(names).toContain(openRouterToolName('registry.search'))
    expect(names).toContain(openRouterToolName('registry.operations.search'))
    expect(names).toContain(openRouterToolName('operation.execute'))
    expect(names.some((name) => name.startsWith('capability_'))).toBe(false)

    const executeTool = tools[openRouterToolName('operation.execute')]
    expect(executeTool).toBeDefined()
    const operationRef = 'operation:v1:' + 'f'.repeat(64)
    const result = await executeTool!.execute!(
      { operationRef, input: { from: 'EUR', to: 'USD' } },
      { toolCallId: 'tc-op-1' } as never,
    )
    expect(result).toBe('{}')
    expect(calls).toEqual([
      {
        toolId: 'operation.execute',
        raw: {
          operationRef,
          input: { from: 'EUR', to: 'USD' },
        },
        toolCallId: 'tc-op-1',
      },
    ])
  })
})
