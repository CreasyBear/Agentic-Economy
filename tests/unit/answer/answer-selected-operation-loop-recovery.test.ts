import {
  executionMocks,
  selectedDescriptor,
  selectedExecuteInput,
  selectedSource,
  selectedToolName,
} from './answer-selected-operation-loop-harness'
import { describe, expect, it } from 'vitest'

import { runAnswerToolUseAgent } from '@/modules/answer/internal/answer-tool-use-agent'
import {
  openRouterStructuredProseResponse,
  openRouterToolResponse,
  startOpenRouterContractServer,
} from '../../helpers/openrouter-contract-server'

describe('selected keyless operation answer loop recovery', () => {
  it('repairs one malformed known operation input from the request context without replaying execution', async () => {
    executionMocks.executeKeylessOperation.mockResolvedValue({
      kind: 'ok' as const,
      operationRef: selectedDescriptor.operationRef,
      capabilityId: selectedDescriptor.capabilityId,
      name: selectedDescriptor.name,
      output: { value: 'repaired-result' },
      evidenceHash: 'sha256:repaired-result',
    })
    const server = await startOpenRouterContractServer((request) => {
      if ((request.tools?.length ?? 0) > 0) {
        return openRouterToolResponse([{
          id: 'call-invalid',
          toolId: selectedToolName(),
          input: selectedExecuteInput({}),
        }])
      }
      if (request.response_format?.json_schema?.name !== 'answer_prose') {
        return {
          id: 'chatcmpl-repair',
          model: 'test-model',
          choices: [{
            finish_reason: 'stop',
            message: {
              role: 'assistant',
              content: JSON.stringify({ kind: 'repair', input: { value: 'repaired' } }),
            },
          }],
          usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 },
        }
      }
      return openRouterStructuredProseResponse({
        oneLine: 'The repaired result is repaired-result.',
        summary: 'The operation succeeded after one input repair.',
        whatToDoNow: 'Use the repaired result.',
      })
    })
    const restoreOpenRouter = server.installEnv()

    try {
      const result = await runAnswerToolUseAgent({
        query: 'what is the live value repaired?',
        keylessExecutableSource: selectedSource,
        maxToolCalls: 1,
      })

      expect(result.gate.ok).toBe(true)
      expect(result.toolCalls).toHaveLength(1)
      expect(JSON.parse(result.toolCalls[0]!.inputJson)).toEqual({
        operationRef: selectedDescriptor.operationRef,
        input: {},
      })
    } finally {
      restoreOpenRouter()
      await server.close()
    }
  })
})
