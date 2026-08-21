import {
  OPERATION_LANE_TOOL_NAMES,
  READ_ONLY_OPERATION_LANE_TOOL_NAMES,
  answerToolMocks,
  catDescriptor,
  catExecuteInput,
  catSource,
  catToolName,
  completedToolCallIds,
  executionMocks,
  operationRoute,
  resolutionForDescriptor,
  selectedCandidateSetDigest,
  selectedDescriptor,
  selectedExecuteInput,
  selectedPublicOperation,
  selectedSource,
  selectedToolName,
  stagedDetailResult,
  stagedSearchResult,
  stagedSource,
} from './answer-selected-operation-loop-harness'
import { describe, expect, it } from 'vitest'

import { HarnessRunLoop } from '@/modules/harness/public'
import { openRouterToolName } from '@/modules/answer/internal/action-to-tool-spec'
import {
  runAnswerToolUseAgent,
  type AnswerToolUseAgentCheckpoint,
} from '@/modules/answer/internal/answer-tool-use-agent'
import type { KeylessExecutableSourcePort, KeylessExecutableToolDescriptor } from '@/modules/capability-execution'
import type { PublicOperationDescriptor } from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  openRouterStructuredProseResponse,
  openRouterToolResponse,
  startOpenRouterContractServer,
} from '../../helpers/openrouter-contract-server'

describe('selected keyless operation answer loop', () => {
  it('executes the selected operation directly, withholds tools after its result, and records canonical evidence', async () => {
    const executionResult = {
      kind: 'ok' as const,
      operationRef: selectedDescriptor.operationRef,
      capabilityId: selectedDescriptor.capabilityId,
      name: selectedDescriptor.name,
      output: { value: 'live-result' },
      evidenceHash: 'sha256:test-live-result',
    }
    executionMocks.executeKeylessOperation.mockResolvedValue(executionResult)
    const server = await startOpenRouterContractServer((request) => {
      if ((request.tools?.length ?? 0) > 0) {
        return openRouterToolResponse([
          { id: 'call-selected', toolId: selectedToolName(), input: selectedExecuteInput({ value: 'live-result' }) },
        ])
      }
      return openRouterStructuredProseResponse({
        oneLine: 'The live value is live-result.',
        summary: 'The selected operation returned live-result.',
        whatToDoNow: 'Use the returned value for this decision.',
      })
    })
    const restoreOpenRouter = server.installEnv()

    const harnessLoop = new HarnessRunLoop({
      runId: 'run-selected',
      sessionId: 'session-selected',
      tools: ['operation.execute'],
    })
    try {
      const result = await runAnswerToolUseAgent({
        query: 'what is the live value for live-result?',
        effectiveRoute: operationRoute,
        requestedIntents: [{
          intentId: 'follow-up-live-value',
          phrase: 'live value for live-result',
          requestedResult: 'live-result',
        }],
        keylessExecutableSource: selectedSource,
        maxToolCalls: 1,
        harnessLoop,
      })

      expect(result.gate.ok).toBe(true)
      expect(result.toolCalls).toHaveLength(1)
      expect(result.modelRequests).toHaveLength(2)
      expect(result.toolCalls[0]).toMatchObject({
        toolCallId: 'call-selected',
        toolId: 'operation.execute',
        status: 'complete',
      })
      expect(JSON.parse(result.toolCalls[0]!.inputJson)).toEqual({
        operationRef: selectedDescriptor.operationRef,
        input: { value: 'live-result' },
      })
      expect(JSON.parse(result.toolCalls[0]!.resultJson)).toMatchObject({
        kind: 'ok',
        output: { value: 'live-result' },
      })
      expect(executionMocks.executeKeylessOperation).toHaveBeenCalledWith(
        { operationRef: selectedDescriptor.operationRef, input: { value: 'live-result' } },
        selectedSource,
      )
      const report = harnessLoop.completeRun()
      const toolEvents = harnessLoop.events.filter((event) =>
        event.type === 'tool.started'
        || event.type === 'tool.completed'
        || event.type === 'tool.failed')
      expect(toolEvents).toMatchObject([
        {
          type: 'tool.started',
          runId: 'run-selected',
          toolCallId: 'call-selected',
          toolId: 'operation.execute',
        },
        {
          type: 'tool.completed',
          runId: 'run-selected',
          toolCallId: 'call-selected',
          toolId: 'operation.execute',
          status: 'ok',
          durationMs: expect.any(Number),
        },
      ])
      expect(toolEvents).toHaveLength(2)
      expect(report.summary.tools.byName['operation.execute']).toMatchObject({
        total: 1,
        ok: 1,
      })

      expect(server.requests).toHaveLength(2)
      expect(server.requests[1]?.tools ?? []).toHaveLength(0)
      expect(result.prose.oneLine).toContain('live-result')
    } finally {
      restoreOpenRouter()
      await server.close()
    }
  })

  it('accepts one completed forced capability call when an extra call is locally refused and checkpoints the canonical outcome', async () => {
    const executionResult = {
      kind: 'ok' as const,
      operationRef: selectedDescriptor.operationRef,
      capabilityId: selectedDescriptor.capabilityId,
      name: selectedDescriptor.name,
      output: { value: 'canonical-result' },
      evidenceHash: 'sha256:canonical-result',
    }
    executionMocks.executeKeylessOperation.mockResolvedValue(executionResult)
    const server = await startOpenRouterContractServer((request) => {
      if ((request.tools?.length ?? 0) > 0) {
        return openRouterToolResponse([
          {
            id: 'call-selected-primary',
            toolId: selectedToolName(),
            input: selectedExecuteInput({ value: 'canonical-result' }),
          },
          {
            id: 'call-selected-extra',
            toolId: selectedToolName(),
            input: selectedExecuteInput({ value: 'extra-attempt' }),
          },
        ])
      }
      return openRouterStructuredProseResponse({
        oneLine: 'The canonical live value is canonical-result.',
        summary: 'The selected operation completed once despite an extra attempted call.',
        whatToDoNow: 'Use the canonical live value.',
      })
    })
    const restoreOpenRouter = server.installEnv()
    const checkpoints: AnswerToolUseAgentCheckpoint[] = []

    try {
      const result = await runAnswerToolUseAgent({
        query: 'what is the live value for canonical-result?',
        effectiveRoute: operationRoute,
        requestedIntents: [{
          intentId: 'canonical-live-value',
          phrase: 'live value for canonical-result',
          requestedResult: 'canonical-result',
        }],
        keylessExecutableSource: selectedSource,
        maxToolCalls: 1,
        onToolCheckpoint: async (checkpoint) => {
          checkpoints.push(checkpoint)
        },
      })

      const operationCalls = result.toolCalls.filter(
        (call) => call.toolId === 'operation.execute',
      )
      expect(operationCalls).toHaveLength(2)
      expect(operationCalls).toContainEqual(expect.objectContaining({
        toolCallId: 'call-selected-primary',
        status: 'complete',
      }))
      expect(operationCalls).toContainEqual(expect.objectContaining({
        toolCallId: 'call-selected-extra',
        status: 'refused',
        executed: false,
      }))
      expect(executionMocks.executeKeylessOperation).toHaveBeenCalledTimes(1)
      expect(result.snapshot.operationOutcome).toMatchObject({
        toolId: 'operation.execute',
        operationRef: selectedDescriptor.operationRef,
        result: { kind: 'ok', output: { value: 'canonical-result' } },
      })
      expect(result.prose.oneLine).toBe(
        'The canonical live value is canonical-result.',
      )
      expect(checkpoints).toHaveLength(1)
      expect(checkpoints[0]?.operationOutcome).toMatchObject({
        toolId: 'operation.execute',
        operationRef: selectedDescriptor.operationRef,
        result: { kind: 'ok', output: { value: 'canonical-result' } },
      })
      expect(checkpoints[0]?.toolCalls).toHaveLength(2)
      expect(checkpoints[0]?.toolCalls).toEqual(expect.arrayContaining([
        expect.objectContaining({
          toolCallId: 'call-selected-primary',
          toolId: 'operation.execute',
          status: 'complete',
        }),
        expect.objectContaining({
          toolCallId: 'call-selected-extra',
          toolId: 'operation.execute',
          status: 'refused',
          executed: false,
        }),
      ]))
      expect(server.requests[0]?.tools?.map((tool) => tool.function.name)).toEqual(
        expect.arrayContaining([selectedToolName()]),
      )
      expect(server.requests[1]?.tools ?? []).toHaveLength(0)
    } finally {
      restoreOpenRouter()
      await server.close()
    }
  })

  it('reuses the prior operation for an elliptical count revision without catalog navigation', async () => {
    const images = Array.from({ length: 5 }, (_, index) => ({
      id: `cat-${index + 1}`,
      url: `https://example.test/cat-${index + 1}.jpg`,
    }))
    executionMocks.executeKeylessOperation.mockResolvedValue({
      kind: 'ok' as const,
      operationRef: catDescriptor.operationRef,
      capabilityId: catDescriptor.capabilityId,
      name: catDescriptor.name,
      output: images,
      evidenceHash: 'sha256:five-cats',
    })
    const server = await startOpenRouterContractServer((request) => {
      if ((request.tools?.length ?? 0) > 0) {
        return openRouterToolResponse([{
          id: 'call-five-cats',
          toolId: catToolName(),
          input: catExecuteInput({ count: 5 }),
        }])
      }
      return openRouterStructuredProseResponse({
        oneLine: 'Here are five cat images.',
        summary: 'The same cat-image operation returned five results.',
        whatToDoNow: 'Open any image you like.',
      })
    })
    const restoreOpenRouter = server.installEnv()

    try {
      const result = await runAnswerToolUseAgent({
        query: 'Make it five',
        effectiveRoute: operationRoute,
        requestedIntents: [{
          intentId: 'revise-count-five',
          phrase: 'Make it five',
          requestedResult: 'five results',
        }],
        keylessExecutableSource: catSource,
        priorOperationRef: catDescriptor.operationRef,
        maxToolCalls: 1,
      })

      expect(answerToolMocks.runAnswerToolCall).not.toHaveBeenCalled()
      expect(executionMocks.executeKeylessOperation).toHaveBeenCalledWith(
        { operationRef: catDescriptor.operationRef, input: { count: 5 } },
        catSource,
      )
      expect(server.requests[0]?.tools?.map((tool) => tool.function.name)).toEqual(
        expect.arrayContaining([catToolName()]),
      )
      expect(result.toolCalls).toHaveLength(1)
      expect(JSON.parse(result.toolCalls[0]!.inputJson)).toEqual({
        operationRef: catDescriptor.operationRef,
        input: { count: 5 },
      })
      expect(JSON.parse(result.toolCalls[0]!.resultJson)).toMatchObject({
        kind: 'ok',
        output: images,
      })
    } finally {
      restoreOpenRouter()
      await server.close()
    }
  })
  it('navigates search to exact detail, calls one strict capability, and grounds prose', async () => {
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
      output: { value: 'grounded-live-value' },
      evidenceHash: 'sha256:grounded-live-value',
    })
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
          input: selectedExecuteInput({ value: 'strict-input' }),
        }])
      }
      if ((request.tools?.length ?? 0) === 0) {
        return openRouterStructuredProseResponse({
          oneLine: 'The grounded live value is grounded-live-value.',
          summary: 'The exact capability result is grounded-live-value.',
          whatToDoNow: 'Use the grounded live value.',
        })
      }
      throw new Error('unexpected_active_tool_request')
    })
    const restoreOpenRouter = server.installEnv()

    try {
      const result = await runAnswerToolUseAgent({
        query: 'What is the current test live value?',
        effectiveRoute: operationRoute,
        requestedIntents: [{
          intentId: 'current-test-live-value',
          phrase: 'current test live value',
          requestedResult: 'live value',
        }],
        keylessExecutableSource: stagedSource,
      })

      expect(result.toolCalls.map((call) => call.toolId)).toEqual([
        'registry.operations.search',
        'registry.operations.detail',
        'operation.execute',
      ])
      expect(result.modelRequests).toHaveLength(4)
      expect(server.requests).toHaveLength(4)
      expect(server.requests.map((request) =>
        request.tools?.map((tool) => tool.function.name) ?? [],
      )).toEqual([
        [...OPERATION_LANE_TOOL_NAMES],
        [...READ_ONLY_OPERATION_LANE_TOOL_NAMES],
        [...OPERATION_LANE_TOOL_NAMES],
        [],
      ])
      expect(server.requests.slice(0, 3).map((request) => request.tool_choice))
        .toEqual(['required', 'required', 'required'])
      expect(server.requests[2]?.tools?.map((tool) => tool.function.name)).toEqual(
        expect.arrayContaining([selectedToolName()]),
      )
      expect(result.toolCalls.filter((call) => call.toolId === 'operation.execute')).toHaveLength(1)
      const executeCall = result.toolCalls.find((call) => call.toolId === 'operation.execute')
      expect(executeCall).toBeDefined()
      expect(JSON.parse(executeCall!.inputJson)).toEqual({
        operationRef: selectedDescriptor.operationRef,
        input: { value: 'strict-input' },
      })
      expect(executionMocks.executeKeylessOperation).toHaveBeenCalledTimes(1)
      expect(executionMocks.executeKeylessOperation).toHaveBeenCalledWith(
        {
          operationRef: selectedDescriptor.operationRef,
          input: { value: 'strict-input' },
        },
        stagedSource,
      )

      const capabilityRequest = server.requests.find((request) =>
        request.tools?.some((tool) => tool.function.name === selectedToolName()))
      expect(capabilityRequest?.tools?.map((tool) => tool.function.name)).toEqual(
        expect.arrayContaining([selectedToolName()]),
      )
      const finalRequest = server.requests[server.requests.length - 1]
      expect(finalRequest?.tools ?? []).toHaveLength(0)
      expect(result.prose.oneLine).toBe('The grounded live value is grounded-live-value.')
    } finally {
      restoreOpenRouter()
      await server.close()
    }
  })
  it('fails closed when exact detail omits the answer-thread execute navigation', async () => {
    const nonExecutableOperation = {
      ...selectedPublicOperation,
      navigation: [],
    } satisfies PublicOperationDescriptor
    const nonExecutableDetailResult = {
      ...stagedDetailResult,
      operation: nonExecutableOperation,
    }
    const nonExecutableSource: KeylessExecutableSourcePort = {
      ...stagedSource,
      readPublic: async () => nonExecutableOperation,
    }
    answerToolMocks.runAnswerToolCall.mockImplementation(async (callInput) => {
      const result = callInput.toolId === 'registry.operations.search'
        ? stagedSearchResult
        : callInput.toolId === 'registry.operations.detail'
          ? nonExecutableDetailResult
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
      return openRouterStructuredProseResponse({
        oneLine: 'The listed operation is not executable from this answer.',
        summary: 'Discovery finished without a live execute.',
        whatToDoNow: 'Choose another published source.',
      })
    })
    const restoreOpenRouter = server.installEnv()

    try {
      const result = await runAnswerToolUseAgent({
        query: 'What is the current test live value?',
        keylessExecutableSource: nonExecutableSource,
      })

      expect(answerToolMocks.runAnswerToolCall).toHaveBeenCalledTimes(2)
      expect(answerToolMocks.runAnswerToolCall.mock.calls[1]?.[0]).toMatchObject({
        toolId: 'registry.operations.detail',
        input: { operationRef: selectedDescriptor.operationRef },
      })
      expect(executionMocks.executeKeylessOperation).not.toHaveBeenCalled()
      expect(result.toolCalls.some((call) => call.toolId === 'operation.execute')).toBe(false)
      expect(server.requests.some((request) =>
        request.tools?.some((tool) => tool.function.name === selectedToolName())))
        .toBe(true)
    } finally {
      restoreOpenRouter()
      await server.close()
    }
  })

  it('does not host-refuse a scalar operation input when ordered intents remain', async () => {
    executionMocks.executeKeylessOperation.mockResolvedValue({
      kind: 'ok' as const,
      operationRef: selectedDescriptor.operationRef,
      capabilityId: selectedDescriptor.capabilityId,
      name: selectedDescriptor.name,
      output: { value: 'paris' },
      evidenceHash: 'sha256:paris',
    })
    const server = await startOpenRouterContractServer((request) => {
      if ((request.tools?.length ?? 0) > 0) {
        return openRouterToolResponse([{
          id: 'call-scalar-execute',
          toolId: selectedToolName(),
          input: selectedExecuteInput({ value: 'paris' }),
        }])
      }
      return openRouterStructuredProseResponse({
        oneLine: 'The operation returned paris.',
        summary: 'The selected operation completed for the supplied input.',
        whatToDoNow: 'Use the returned value.',
      })
    })
    const restoreOpenRouter = server.installEnv()

    try {
      const result = await runAnswerToolUseAgent({
        query: 'Get the value for Paris and London.',
        keylessExecutableSource: selectedSource,
        requestedIntents: [
          { intentId: 'paris', phrase: 'Paris', requestedResult: 'paris' },
          { intentId: 'london', phrase: 'London', requestedResult: 'london' },
        ],
        maxToolCalls: 1,
      })

      const operationCalls = result.toolCalls.filter((call) => call.toolId === 'operation.execute')
      expect(operationCalls).toHaveLength(1)
      expect(operationCalls[0]).toMatchObject({
        status: 'complete',
      })
      expect(executionMocks.executeKeylessOperation).toHaveBeenCalledOnce()
      expect(executionMocks.executeKeylessOperation).toHaveBeenCalledWith({
        operationRef: selectedDescriptor.operationRef,
        input: { value: 'paris' },
      }, selectedSource)
      expect(result.prose.oneLine).toBe('The operation returned paris.')
    } finally {
      restoreOpenRouter()
      await server.close()
    }
  })

  it('executes one native array batch for all ordered intents without a second effect', async () => {
    const arrayDescriptor: KeylessExecutableToolDescriptor = {
      ...selectedDescriptor,
      inputSchema: {
        type: 'object',
        properties: {
          values: {
            type: 'array',
            items: { type: 'string' },
            minItems: 2,
            maxItems: 2,
          },
        },
        required: ['values'],
        additionalProperties: false,
      },
    }
    const arrayResolution = resolutionForDescriptor(arrayDescriptor)
    executionMocks.executeKeylessOperation.mockResolvedValue({
      kind: 'ok' as const,
      operationRef: selectedDescriptor.operationRef,
      capabilityId: selectedDescriptor.capabilityId,
      name: selectedDescriptor.name,
      output: { values: ['bitcoin', 'ethereum'] },
      evidenceHash: 'sha256:bitcoin-ethereum',
    })
    const server = await startOpenRouterContractServer((request) => {
      if ((request.tools?.length ?? 0) > 0) {
        return openRouterToolResponse([{
          id: 'call-array-batch',
          toolId: selectedToolName(),
          input: selectedExecuteInput({ values: ['bitcoin', 'ethereum'] }),
        }])
      }
      return openRouterStructuredProseResponse({
        oneLine: 'The operation returned bitcoin and ethereum.',
        summary: 'One native batch covered both requested values.',
        whatToDoNow: 'Use the completed batch result.',
      })
    })
    const restoreOpenRouter = server.installEnv()

    try {
      const result = await runAnswerToolUseAgent({
        query: 'Get bitcoin and ethereum.',
        keylessExecutableSource: selectedSource,
        requestedIntents: [
          { intentId: 'bitcoin', phrase: 'Bitcoin', requestedResult: 'bitcoin' },
          { intentId: 'ethereum', phrase: 'Ethereum', requestedResult: 'ethereum' },
        ],
        maxToolCalls: 1,
      })

      const operationCalls = result.toolCalls.filter((call) => call.toolId === 'operation.execute')
      expect(operationCalls).toHaveLength(1)
      expect(operationCalls[0]).toMatchObject({
        status: 'complete',
        toolCallId: 'call-array-batch',
      })
      expect(JSON.parse(operationCalls[0]!.inputJson)).toEqual({
        operationRef: selectedDescriptor.operationRef,
        input: { values: ['bitcoin', 'ethereum'] },
      })
      expect(JSON.parse(operationCalls[0]!.resultJson)).toMatchObject({
        kind: 'ok',
        output: { values: ['bitcoin', 'ethereum'] },
      })
      expect(executionMocks.executeKeylessOperation).toHaveBeenCalledTimes(1)
      expect(executionMocks.executeKeylessOperation).toHaveBeenCalledWith(
        {
          operationRef: selectedDescriptor.operationRef,
          input: { values: ['bitcoin', 'ethereum'] },
        },
        selectedSource,
      )
      expect(result.snapshot.operationOutcome).toMatchObject({
        toolId: 'operation.execute',
        operationRef: selectedDescriptor.operationRef,
        result: { kind: 'ok' },
      })
      expect(result.toolCalls.filter((call) =>
        call.toolId === 'operation.execute' || call.toolId === 'operation.invoke'))
        .toHaveLength(1)
    } finally {
      restoreOpenRouter()
      await server.close()
    }
  })

  it('executes the model-supplied operation input rather than rewriting it from composer JSON', async () => {
    executionMocks.executeKeylessOperation.mockResolvedValue({
      kind: 'ok',
      operationRef: selectedDescriptor.operationRef,
      capabilityId: selectedDescriptor.capabilityId,
      name: selectedDescriptor.name,
      output: { value: 'server-authoritative' },
      evidenceHash: 'sha256:server-authoritative',
    })
    const server = await startOpenRouterContractServer((request) => {
      const activeNames = request.tools?.map((tool) => tool.function.name) ?? []
      if (activeNames.includes(selectedToolName())) {
        return openRouterToolResponse([{
          id: 'call-selected-capability',
          toolId: selectedToolName(),
          input: selectedExecuteInput({ value: 'model-conflicting-input' }),
        }])
      }
      if (activeNames.length === 0) {
        return openRouterStructuredProseResponse({
          oneLine: 'The exact input returned server-authoritative.',
          summary: 'The selected operation completed.',
          whatToDoNow: 'Use the returned value.',
        })
      }
      throw new Error('unexpected_active_tool_request')
    })
    const restoreOpenRouter = server.installEnv()

    try {
      const query = JSON.stringify({
        operationRef: selectedDescriptor.operationRef,
        input: { value: 'exact-user-input' },
        candidateSetDigest: selectedCandidateSetDigest,
      })
      const result = await runAnswerToolUseAgent({
        query,
        keylessExecutableSource: selectedSource,
        maxToolCalls: 1,
      })

      expect(executionMocks.executeKeylessOperation).toHaveBeenCalledOnce()
      expect(executionMocks.executeKeylessOperation).toHaveBeenCalledWith({
        operationRef: selectedDescriptor.operationRef,
        input: { value: 'model-conflicting-input' },
      }, selectedSource)
      expect(result.toolCalls).toHaveLength(1)
      expect(JSON.parse(result.toolCalls[0]!.inputJson)).toMatchObject({
        operationRef: selectedDescriptor.operationRef,
        input: { value: 'model-conflicting-input' },
      })
      expect(server.requests).toHaveLength(2)
      expect(server.requests.map((request) =>
        request.tools?.map((tool) => tool.function.name) ?? [],
      )).toEqual([
        expect.arrayContaining([selectedToolName()]),
        [],
      ])
      expect(result.prose.oneLine).toBe('The exact input returned server-authoritative.')
    } finally {
      restoreOpenRouter()
      await server.close()
    }
  })

  it('treats composer JSON as user text and still enters the tool loop', async () => {
    const server = await startOpenRouterContractServer(() => openRouterStructuredProseResponse({
      oneLine: 'This response must not be requested.',
      summary: 'This response must not be requested.',
      whatToDoNow: 'This response must not be requested.',
    }))
    const restoreOpenRouter = server.installEnv()
    try {
      const result = await runAnswerToolUseAgent({
        query: JSON.stringify({
          operationRef: selectedDescriptor.operationRef,
          input: {},
          candidateSetDigest: selectedCandidateSetDigest,
        }),
        keylessExecutableSource: selectedSource,
        maxToolCalls: 1,
      })

      expect(executionMocks.executeKeylessOperation).not.toHaveBeenCalled()
      expect(result.toolCalls).toHaveLength(0)
      expect(result.providers).toEqual([])
      expect(result.snapshot.operationOutcome).toBeUndefined()
      expect(result.prose.summary).toBe('This response must not be requested.')
      expect(server.requests.length).toBeGreaterThan(0)
    } finally {
      restoreOpenRouter()
      await server.close()
    }
  })
})
