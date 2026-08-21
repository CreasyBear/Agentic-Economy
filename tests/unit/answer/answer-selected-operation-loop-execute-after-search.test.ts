import {
  READ_ONLY_OPERATION_LANE_TOOL_NAMES,
  answerToolMocks,
  completedToolCallIds,
  executionMocks,
  operationRoute,
  selectedDescriptor,
  selectedExecuteInput,
  selectedToolName,
  stagedCompareResult,
  stagedDetailResult,
  stagedInspectPlanResult,
  stagedSearchResult,
  stagedSource,
} from './answer-selected-operation-loop-harness'
import { describe, expect, it } from 'vitest'

import { openRouterToolName } from '@/modules/answer/internal/action-to-tool-spec'
import { runAnswerToolUseAgent } from '@/modules/answer/internal/answer-tool-use-agent'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  openRouterStructuredProseResponse,
  openRouterToolResponse,
  startOpenRouterContractServer,
} from '../../helpers/openrouter-contract-server'

describe('selected keyless operation answer loop', () => {
  it('does not let the model call operation.execute after search without authenticated detail', async () => {
    answerToolMocks.runAnswerToolCall.mockImplementation(async (callInput) => {
      const resultJson = JSON.stringify(stagedSearchResult)
      return {
        record: {
          toolCallId: 'call-operation-search',
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
    const server = await startOpenRouterContractServer((request) => {
      const activeNames = new Set(
        request.tools?.map((tool) => tool.function.name) ?? [],
      )
      const completedIds = completedToolCallIds(request)
      const searchName = openRouterToolName('registry.operations.search')
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
        activeNames.has(selectedToolName())
        && completedIds.has('call-operation-search')
      ) {
        throw new Error('search must not unlock operation.execute')
      }
      return openRouterStructuredProseResponse({
        oneLine: 'Search found a matching operation that still needs exact detail.',
        summary: 'Search is not enough to run the operation.',
        whatToDoNow: 'Inspect exact detail of the selected operation before running it.',
      })
    })
    const restoreOpenRouter = server.installEnv()

    try {
      const result = await runAnswerToolUseAgent({
        query: 'What is the current test live value?',
        keylessExecutableSource: stagedSource,
        effectiveRoute: operationRoute,
      })
      expect(result.toolCalls.some((call) => call.toolId === 'operation.execute')).toBe(false)
      expect(executionMocks.executeKeylessOperation).not.toHaveBeenCalled()
      expect(server.requests[0]?.response_format?.type).not.toBe('json_schema')
      expect(server.requests[0]?.tools?.length).toBeGreaterThan(0)
      expect(server.requests[1]?.tools?.map((tool) => tool.function.name)).not.toContain(
        selectedToolName(),
      )
      expect(server.requests[1]?.tool_choice).toBe('required')
      const proseRequest = server.requests[server.requests.length - 1]
      expect(proseRequest?.tools ?? []).toHaveLength(0)
      expect(proseRequest?.response_format?.json_schema?.name).toBe('answer_prose')
    } finally {
      restoreOpenRouter()
      await server.close()
    }
  })
  it('lets the model call operation.execute after completed detail of the selected ordinal', async () => {
    answerToolMocks.runAnswerToolCall.mockImplementation(async (callInput) => {
      const result =
        callInput.toolId === 'registry.operations.search'
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
      output: { value: 'detail-then-execute' },
      evidenceHash: 'sha256:detail-then-execute',
    })
    const server = await startOpenRouterContractServer((request) => {
      const activeNames = new Set(
        request.tools?.map((tool) => tool.function.name) ?? [],
      )
      const completedIds = completedToolCallIds(request)
      const searchName = openRouterToolName('registry.operations.search')
      const detailName = openRouterToolName('registry.operations.detail')
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
        return openRouterToolResponse([{
          id: 'call-operation-detail',
          toolId: 'registry.operations.detail',
          input: { operationRef: selectedDescriptor.operationRef },
        }])
      }
      if (
        activeNames.has(selectedToolName())
        && completedIds.has('call-operation-detail')
        && !completedIds.has('call-execute')
      ) {
        return openRouterToolResponse([{
          id: 'call-execute',
          toolId: selectedToolName(),
          input: selectedExecuteInput({ value: 'from-detail' }),
        }])
      }
      return openRouterStructuredProseResponse({
        oneLine: 'The live value is detail-then-execute.',
        summary: 'The operation ran after exact detail of the selected ordinal.',
        whatToDoNow: 'Use the returned value.',
      })
    })
    const restoreOpenRouter = server.installEnv()

    try {
      const result = await runAnswerToolUseAgent({
        query: 'What is the current test live value?',
        keylessExecutableSource: stagedSource,
        effectiveRoute: operationRoute,
      })
      expect(result.toolCalls.map((call) => call.toolId)).toEqual([
        'registry.operations.search',
        'registry.operations.detail',
        'operation.execute',
      ])
      expect(executionMocks.executeKeylessOperation).toHaveBeenCalled()
      expect(server.requests[1]?.tools?.map((tool) => tool.function.name)).not.toContain(
        selectedToolName(),
      )
      expect(server.requests[2]?.tools?.map((tool) => tool.function.name)).toContain(
        selectedToolName(),
      )
      expect(server.requests[2]?.tool_choice).toBe('required')
      const proseRequest = server.requests[server.requests.length - 1]
      expect(proseRequest?.tools ?? []).toHaveLength(0)
      expect(proseRequest?.response_format?.json_schema?.name).toBe('answer_prose')
    } finally {
      restoreOpenRouter()
      await server.close()
    }
  })
  it('stops at a reviewable candidate when the request authorized reads only', async () => {
    answerToolMocks.runAnswerToolCall.mockImplementation(async (callInput) => {
      const result =
        callInput.toolId === 'registry.operations.search'
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
    const server = await startOpenRouterContractServer((request) => {
      const activeNames = new Set(
        request.tools?.map((tool) => tool.function.name) ?? [],
      )
      const completedIds = completedToolCallIds(request)
      if (
        activeNames.has(openRouterToolName('registry.operations.search'))
        && !completedIds.has('call-operation-search')
      ) {
        return openRouterToolResponse([{
          id: 'call-operation-search',
          toolId: 'registry.operations.search',
          input: { query: 'current test live value' },
        }])
      }
      if (
        activeNames.has(openRouterToolName('registry.operations.detail'))
        && completedIds.has('call-operation-search')
        && !completedIds.has('call-operation-detail')
      ) {
        return openRouterToolResponse([{
          id: 'call-operation-detail',
          toolId: 'registry.operations.detail',
          input: { operationRef: selectedDescriptor.operationRef },
        }])
      }
      if (
        completedIds.has('call-operation-detail')
        || (request.tools?.length ?? 0) === 0
      ) {
        return openRouterStructuredProseResponse({
          oneLine: 'I found a matching operation and left it unrun.',
          summary: 'The matching operation was reviewed and made no provider call.',
          whatToDoNow: 'Run the operation when you are ready.',
        })
      }
      throw new Error('candidate-only navigation must not reach a provider effect')
    })
    const restoreOpenRouter = server.installEnv()

    try {
      const result = await runAnswerToolUseAgent({
        query: 'Find the test live value operation. Search only; do not run it.',
        keylessExecutableSource: stagedSource,
        effectiveRoute: { ...operationRoute, effectAllowed: false },
      })

      expect(result.modelRequests).toHaveLength(4)
      expect(server.requests).toHaveLength(4)
      expect(server.requests.slice(0, 2).map((request) =>
        request.tools?.map((tool) => tool.function.name) ?? [],
      )).toEqual([
        [...READ_ONLY_OPERATION_LANE_TOOL_NAMES],
        [...READ_ONLY_OPERATION_LANE_TOOL_NAMES],
      ])
      expect(server.requests[server.requests.length - 1]?.tools ?? []).toHaveLength(0)
      expect(server.requests.every((request) =>
        !(request.tools ?? []).some((tool) => tool.function.name === selectedToolName()),
      )).toBe(true)
      expect(result.toolCalls.map((call) => call.toolId)).toEqual([
        'registry.operations.search',
        'registry.operations.detail',
      ])
      expect(result.prose.oneLine).toBe('I found a matching operation and left it unrun.')
      expect(result.prose.summary).toContain('made no provider call')
      expect(executionMocks.executeKeylessOperation).not.toHaveBeenCalled()
      expect(result.toolCalls.some((call) => call.toolId === 'operation.execute'))
        .toBe(false)
    } finally {
      restoreOpenRouter()
      await server.close()
    }
  })
  it('uses compare and inspect-plan reads only when navigation needs them', async () => {
    answerToolMocks.runAnswerToolCall.mockImplementation(async (callInput) => {
      const result =
        callInput.toolId === 'registry.operations.search'
          ? stagedSearchResult
          : callInput.toolId === 'registry.operations.detail'
            ? stagedDetailResult
            : callInput.toolId === 'registry.operations.compare'
              ? stagedCompareResult
              : callInput.toolId === 'registry.operations.inspectPlan'
                ? stagedInspectPlanResult
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
    const server = await startOpenRouterContractServer((request) => {
      const activeNames = new Set(
        request.tools?.map((tool) => tool.function.name) ?? [],
      )
      const completedIds = completedToolCallIds(request)
      if (
        activeNames.has(openRouterToolName('registry.operations.search'))
        && !completedIds.has('call-operation-search')
      ) {
        return openRouterToolResponse([{
          id: 'call-operation-search',
          toolId: 'registry.operations.search',
          input: { query: 'current test live value' },
        }])
      }
      if (
        activeNames.has(openRouterToolName('registry.operations.detail'))
        && completedIds.has('call-operation-search')
        && !completedIds.has('call-operation-detail')
      ) {
        return openRouterToolResponse([{
          id: 'call-operation-detail',
          toolId: 'registry.operations.detail',
          input: { operationRef: selectedDescriptor.operationRef },
        }])
      }
      if (
        activeNames.has(openRouterToolName('registry.operations.compare'))
        && completedIds.has('call-operation-detail')
        && !completedIds.has('call-operation-compare')
      ) {
        return openRouterToolResponse([{
          id: 'call-operation-compare',
          toolId: 'registry.operations.compare',
          input: { operationRefs: [selectedDescriptor.operationRef] },
        }])
      }
      if (
        activeNames.has(openRouterToolName('registry.operations.inspectPlan'))
        && completedIds.has('call-operation-compare')
        && !completedIds.has('call-operation-inspect-plan')
      ) {
        return openRouterToolResponse([{
          id: 'call-operation-inspect-plan',
          toolId: 'registry.operations.inspectPlan',
          input: { operationRefs: [selectedDescriptor.operationRef] },
        }])
      }
      if ((request.tools?.length ?? 0) === 0) {
        return openRouterStructuredProseResponse({
          oneLine: 'The current operation evidence is ready to review.',
          summary: 'Search, exact detail, comparison, and plan inspection completed without execution.',
          whatToDoNow: 'Choose whether to run the exact operation.',
        })
      }
      throw new Error('capability effect must not follow read-only navigation')
    })
    const restoreOpenRouter = server.installEnv()

    try {
      const result = await runAnswerToolUseAgent({
        query: 'Compare and inspect the current test live operation before running it.',
        keylessExecutableSource: stagedSource,
        effectiveRoute: { ...operationRoute, effectAllowed: false },
      })

      expect(result.modelRequests).toHaveLength(5)
      expect(server.requests).toHaveLength(5)
      const firstToolNames = server.requests[0]?.tools?.map(
        (tool) => tool.function.name,
      ) ?? []
      expect(firstToolNames).toContain(openRouterToolName('registry.operations.search'))
      expect(server.requests[0]?.tool_choice).toBe('required')
      expect(server.requests.slice(1, -1).every((request) =>
        request.tools?.some((tool) => tool.function.name === selectedToolName()) !== true))
        .toBe(true)
      expect(server.requests.at(-1)?.tools ?? []).toHaveLength(0)
      expect(result.toolCalls.map((call) => call.toolId)).toEqual([
        'registry.operations.search',
        'registry.operations.detail',
        'registry.operations.compare',
        'registry.operations.inspectPlan',
      ])
      expect(result.toolCalls.every((call) => call.status === 'complete')).toBe(true)
      expect(JSON.parse(result.toolCalls[2]!.inputJson)).toEqual({
        operationRefs: [selectedDescriptor.operationRef],
      })
      expect(JSON.parse(result.toolCalls[3]!.inputJson)).toEqual({
        operationRefs: [selectedDescriptor.operationRef],
      })
      expect(executionMocks.executeKeylessOperation).not.toHaveBeenCalled()
      expect(result.snapshot.operationOutcome).toBeUndefined()
      expect(result.gate.ok).toBe(true)
    } finally {
      restoreOpenRouter()
      await server.close()
    }
  })
})
