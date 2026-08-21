import {
  answerToolMocks,
  completedToolCallIds,
  executionMocks,
  operationRoute,
  selectedDescriptor,
  selectedExecuteInput,
  selectedToolName,
  stagedDetailResult,
  stagedSearchResult,
  stagedSource,
} from './answer-selected-operation-loop-harness'
import { describe, expect, it } from 'vitest'

import type { AnswerTurnCheckpoint } from '@/modules/answer-thread/answer-thread.schema'
import { openRouterToolName } from '@/modules/answer/internal/action-to-tool-spec'
import {
  runAnswerToolUseAgent,
  type AnswerToolUseAgentCheckpoint,
} from '@/modules/answer/internal/answer-tool-use-agent'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  openRouterStructuredProseResponse,
  openRouterToolResponse,
  startOpenRouterContractServer,
} from '../../helpers/openrouter-contract-server'

describe('selected keyless operation answer loop', () => {
  it('resumes an operation-read checkpoint before effect selection and invokes once', async () => {
    answerToolMocks.runAnswerToolCall.mockImplementation(async (callInput) => {
      const result = callInput.toolId === 'registry.operations.search'
        ? stagedSearchResult
        : callInput.toolId === 'registry.operations.detail'
          ? stagedDetailResult
          : undefined
      if (result === undefined) {
        throw new Error(`unexpected_read_tool:${callInput.toolId}`)
      }
      const resultJson = JSON.stringify(result)
      return {
        record: {
          toolCallId: `call-${callInput.toolId}`,
          turnId: callInput.turnId,
          seq: callInput.seq,
          toolId: callInput.toolId,
          inputJson: JSON.stringify(callInput.input),
          resultSummaryJson: JSON.stringify({ slugs: [], count: 0 }),
          resultJson,
          resultHash: canonicalDigest(resultJson).toString(),
          status: 'complete',
          createdAt: Date.now(),
        },
        providers: [],
        allowedSlugs: new Set<string>(),
        timings: [],
        resultJson,
      }
    })
    executionMocks.executeKeylessOperation.mockResolvedValue({
      kind: 'ok' as const,
      operationRef: selectedDescriptor.operationRef,
      capabilityId: selectedDescriptor.capabilityId,
      name: selectedDescriptor.name,
      output: { value: 'resumed-live-value' },
      evidenceHash: 'sha256:resumed-live-value',
    })
    let recoveryMode = false
    const server = await startOpenRouterContractServer((request) => {
      const activeNames = new Set(
        request.tools?.map((tool) => tool.function.name) ?? [],
      )
      const completedIds = completedToolCallIds(request)
      const searchName = openRouterToolName('registry.operations.search')
      const detailName = openRouterToolName('registry.operations.detail')
      const capabilityName = selectedToolName()
      if (
        activeNames.has(searchName)
        && !completedIds.has('call-operation-search')
      ) {
        return openRouterToolResponse([{
          id: 'call-operation-search',
          toolId: 'registry.operations.search',
          input: { query: 'current test live value' },
        }])
      }
      if (
        activeNames.has(detailName)
        && completedIds.has('call-operation-search')
        && !completedIds.has('call-operation-detail')
      ) {
        if (!recoveryMode) {
          return openRouterStructuredProseResponse({
            oneLine: 'Checkpoint capture stopped before detail retrieval.',
            summary: 'The search checkpoint is ready to resume.',
            whatToDoNow: 'Resume the captured checkpoint to continue.',
          })
        }
        return openRouterToolResponse([{
          id: 'call-operation-detail',
          toolId: 'registry.operations.detail',
          input: { operationRef: selectedDescriptor.operationRef },
        }])
      }
      if (
        activeNames.has(capabilityName)
        && completedIds.has('call-operation-detail')
        && !completedIds.has('call-selected-capability')
      ) {
        return openRouterToolResponse([{
          id: 'call-selected-capability',
          toolId: selectedToolName(),
          input: selectedExecuteInput({ value: 'resumed-input' }),
        }])
      }
      if ((request.tools?.length ?? 0) === 0) {
        return openRouterStructuredProseResponse({
          oneLine: 'The resumed live value is resumed-live-value.',
          summary: 'The recovered operation returned the live value.',
          whatToDoNow: 'Use the resumed live value.',
        })
      }
      return openRouterStructuredProseResponse({
        oneLine: 'The checkpoint has no additional executable step.',
        summary: 'The saved search evidence was preserved without another provider effect.',
        whatToDoNow: 'Resume from the saved checkpoint.',
      })
    })
    const restoreOpenRouter = server.installEnv()
    let captured: AnswerToolUseAgentCheckpoint | undefined

    try {
      const capturedResult = await runAnswerToolUseAgent({
        query: 'What is the current test live value?',
        keylessExecutableSource: stagedSource,
        effectiveRoute: operationRoute,
        maxToolCalls: 1,
        onToolCheckpoint: async (checkpoint) => {
          captured ??= checkpoint
        },
      })
      expect(capturedResult.toolCalls.map((call) => call.toolId)).toEqual([
        'registry.operations.search',
      ])
      expect(captured).toBeDefined()
      expect(captured?.toolCalls.map((call) => call.toolId)).toEqual([
        'registry.operations.search',
      ])
      expect(executionMocks.executeKeylessOperation).not.toHaveBeenCalled()
      recoveryMode = true
      if (captured === undefined) throw new Error('checkpoint_not_captured')

      const resumeCheckpoint: AnswerTurnCheckpoint = {
        schemaVersion: 1,
        reservationKey: 'resume-navigation-reservation',
        requestDigest: 'resume-navigation-digest',
        generation: 0,
        threadId: 'resume-navigation-thread',
        turnId: 'resume-navigation-turn',
        turnSeq: 1,
        route: 'tool_search',
        intent: 'refine_search',
        query: 'What is the current test live value?',
        toolCallDigests: [],
        priorTurnCount: 0,
        ...captured,
      }
      const result = await runAnswerToolUseAgent({
        query: resumeCheckpoint.query,
        keylessExecutableSource: stagedSource,
        resumeCheckpoint,
        effectiveRoute: operationRoute,
      })

      expect(result.modelRequests).toHaveLength(4)
      expect(server.requests).toHaveLength(5)
      const firstToolNames = server.requests[0]?.tools?.map(
        (tool) => tool.function.name,
      ) ?? []
      expect(firstToolNames).toContain(openRouterToolName('registry.operations.search'))
      expect(server.requests[0]?.tool_choice).toBe('required')
      expect(server.requests[1]?.tools ?? []).toHaveLength(0)
      expect(server.requests[2]?.tools?.map((tool) => tool.function.name) ?? [])
        .toContain(openRouterToolName('registry.operations.detail'))
      expect(['required', undefined, 'auto']).toContain(server.requests[2]?.tool_choice)
      expect(server.requests[3]?.tools?.map((tool) => tool.function.name) ?? [])
        .toEqual(expect.arrayContaining([selectedToolName()]))
      expect(server.requests[4]?.tools ?? []).toHaveLength(0)
      expect(result.toolCalls.map((call) => call.toolId)).toEqual([
        'registry.operations.search',
        'registry.operations.detail',
        'operation.execute',
      ])
      expect(executionMocks.executeKeylessOperation).toHaveBeenCalledTimes(1)
      expect(result.prose.oneLine).toBe('The resumed live value is resumed-live-value.')
    } finally {
      restoreOpenRouter()
      await server.close()
    }
  })
})
