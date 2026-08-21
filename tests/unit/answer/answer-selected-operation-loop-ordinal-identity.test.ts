import {
  executionMocks,
  selectedDescriptor,
  selectedExecuteInput,
  selectedSource,
  selectedToolName,
  stagedDetailResult,
} from './answer-selected-operation-loop-harness'
import { describe, expect, it, vi } from 'vitest'

import type { AnswerTurnCheckpoint } from '@/modules/answer-thread/answer-thread.schema'
import {
  runAnswerToolUseAgent,
  type AnswerToolUseAgentCheckpoint,
} from '@/modules/answer/internal/answer-tool-use-agent'
import type { OperationInvokeService } from '@/modules/capability-execution/operation-invoke'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  openRouterStructuredProseResponse,
  openRouterToolResponse,
  startOpenRouterContractServer,
} from '../../helpers/openrouter-contract-server'

describe('selected keyless operation answer loop', () => {
  it('routes an authenticated selected capability through the canonical invocation service', async () => {
    const principal = {
      principalId: 'clerk_api_key:key:answer',
      ownerId: 'owner:answer',
      credentialId: 'key:answer',
      applicationRef: 'agentic-economy',
      environment: 'sandbox' as const,
      scopes: ['market_operations:invoke'],
      authorityMode: 'approve_each' as const,
    }
    const completed = {
      kind: 'completed' as const,
      invocationRef: 'invocation:answer',
      operationRef: selectedDescriptor.operationRef,
      output: { value: 'gateway-result' },
      evidenceHash: 'sha256:gateway-result',
      usage: {
        chargeState: 'free_tier' as const,
        amount: { currency: 'USD', units: '0', exponent: 0 },
      },
    }
    const invokeOperation = vi.fn().mockResolvedValue(completed)
    const unavailable = async (): Promise<never> => {
      throw new Error('recovery method should not run')
    }
    const service = {
      invokeOperation,
      readInvocationStatus: vi.fn(unavailable),
      cancelInvocation: vi.fn(unavailable),
      reconcileInvocation: vi.fn(unavailable),
    }
    const server = await startOpenRouterContractServer((request) => {
      if ((request.tools?.length ?? 0) > 0) {
        return openRouterToolResponse([
          { id: 'call-gateway', toolId: selectedToolName(), input: selectedExecuteInput({ value: 'gateway-result' }) },
        ])
      }
      return openRouterStructuredProseResponse({
        oneLine: 'The authenticated operation returned gateway-result.',
        summary: 'The gateway completed the operation.',
        whatToDoNow: 'Use the returned value.',
      })
    })
    const restoreOpenRouter = server.installEnv()

    try {
      const result = await runAnswerToolUseAgent({
        turnId: 'turn:gateway',
        query: 'what is the authenticated live value?',
        keylessExecutableSource: selectedSource,
        maxToolCalls: 1,
        operationInvokeContext: {
          principal,
          correlationId: 'corr:answer',
          reservationKey: 'reservation:answer',
          generation: 3,
          service,
        },
      })

      expect(result.toolCalls).toHaveLength(1)
      expect(result.toolCalls[0]).toMatchObject({
        toolCallId: 'call-gateway',
        toolId: 'operation.invoke',
        status: 'complete',
      })
      expect(result.modelRequests).toHaveLength(2)
      expect(server.requests).toHaveLength(2)
      expect(server.requests[1]?.tools ?? []).toHaveLength(0)
      expect(JSON.parse(result.toolCalls[0]!.resultJson)).toEqual(completed)
      expect(invokeOperation).toHaveBeenCalledWith({
        input: {
          operationRef: selectedDescriptor.operationRef,
          input: { value: 'gateway-result' },
          idempotencyKey: expect.any(String),
        },
        principal,
        correlationId: 'corr:answer',
      })
      expect(executionMocks.executeKeylessOperation).not.toHaveBeenCalled()
      const pending = {
        kind: 'pending' as const,
        invocationRef: 'invocation:pending',
        operationRef: selectedDescriptor.operationRef,
        retryAfterMs: 1_000,
      }
      invokeOperation.mockResolvedValueOnce(pending)
      const pendingResult = await runAnswerToolUseAgent({
        turnId: 'turn:gateway-pending',
        query: 'run the authenticated live operation',
        keylessExecutableSource: selectedSource,
        maxToolCalls: 1,
        operationInvokeContext: {
          principal,
          correlationId: 'corr:answer-pending',
          reservationKey: 'reservation:answer-pending',
          generation: 0,
          service,
        },
      })

      expect(pendingResult.toolCalls[0]).toMatchObject({
        toolId: 'operation.invoke',
        status: 'complete',
      })
      expect(JSON.parse(pendingResult.toolCalls[0]!.resultJson)).toEqual(pending)
      expect(pendingResult.prose).toEqual({
        oneLine: 'The operation was accepted and is still running.',
        summary: 'No terminal result is available yet.',
        whatToDoNow: 'Check the invocation status before taking any result-dependent action.',
      })
    } finally {
      restoreOpenRouter()
      await server.close()
    }
  })
  it('keeps the provider budget refusal when a duplicate authenticated call is locally refused', async () => {
    const principal = {
      principalId: 'clerk_api_key:key:answer-budget',
      ownerId: 'owner:answer',
      credentialId: 'key:answer-budget',
      applicationRef: 'agentic-economy',
      environment: 'sandbox' as const,
      scopes: ['market_operations:invoke'],
      authorityMode: 'approve_each' as const,
    }
    const refused = {
      kind: 'refused' as const,
      operationRef: selectedDescriptor.operationRef,
      code: 'budget_exceeded' as const,
      retryable: false,
    }
    const invokeOperation = vi.fn().mockResolvedValue(refused)
    const unavailable = async (): Promise<never> => {
      throw new Error('recovery method should not run')
    }
    const service = {
      invokeOperation,
      readInvocationStatus: vi.fn(unavailable),
      cancelInvocation: vi.fn(unavailable),
      reconcileInvocation: vi.fn(unavailable),
    }
    const server = await startOpenRouterContractServer((request) => {
      if ((request.tools?.length ?? 0) > 0) {
        return openRouterToolResponse([
          {
            id: 'call-budget-primary',
            toolId: selectedToolName(),
            input: selectedExecuteInput({ value: 'provider-refusal' }),
          },
          {
            id: 'call-budget-duplicate',
            toolId: selectedToolName(),
            input: selectedExecuteInput({ value: 'provider-refusal' }),
          },
        ])
      }
      return openRouterStructuredProseResponse({
        oneLine: 'The authenticated operation succeeded.',
        summary: 'Use the successful operation result.',
        whatToDoNow: 'Rely on the returned value.',
      })
    })
    const restoreOpenRouter = server.installEnv()

    try {
      const result = await runAnswerToolUseAgent({
        turnId: 'turn:gateway-budget',
        query: 'run the authenticated live operation',
        keylessExecutableSource: selectedSource,
        maxToolCalls: 1,
        operationInvokeContext: {
          principal,
          correlationId: 'corr:answer-budget',
          reservationKey: 'reservation:answer-budget',
          generation: 0,
          service,
        },
      })

      const operationCalls = result.toolCalls.filter(
        (call) => call.toolId === 'operation.invoke',
      )
      expect(operationCalls).toHaveLength(2)
      expect(operationCalls[0]).toMatchObject({
        toolCallId: 'call-budget-primary',
        toolId: 'operation.invoke',
        status: 'refused',
      })
      expect(operationCalls[0]?.executed).not.toBe(false)
      expect(JSON.parse(operationCalls[0]!.resultJson)).toEqual(refused)
      expect(operationCalls[1]).toMatchObject({
        toolCallId: 'call-budget-duplicate',
        toolId: 'operation.invoke',
        status: 'refused',
        executed: false,
      })
      expect(JSON.parse(operationCalls[1]!.resultJson)).toEqual({
        kind: 'refused',
        code: 'budget_exceeded',
      })
      expect(invokeOperation).toHaveBeenCalledTimes(1)
      expect(result.snapshot.operationOutcome?.toolId).toBe('operation.invoke')
      expect(result.snapshot.operationOutcome?.result).toEqual(refused)
      expect(result.prose).toEqual({
        oneLine: 'The operation was refused.',
        summary: 'The operation was refused with code budget_exceeded.',
        whatToDoNow:
          'Review the refusal and the published operation requirements before trying again.',
      })
      expect(result.prose.oneLine).not.toBe("I couldn't complete the live lookup.")
      expect(result.modelRequests).toHaveLength(2)
      expect(server.requests).toHaveLength(2)
      expect(server.requests[1]?.tools ?? []).toHaveLength(0)
    } finally {
      restoreOpenRouter()
      await server.close()
    }
  })
  it('keeps authenticated effect identity stable across lease generations and distinct by tool ordinal', async () => {
    const principal = {
      principalId: 'clerk_api_key:key:pra004',
      ownerId: 'owner:pra004',
      credentialId: 'key:pra004',
      applicationRef: 'agentic-economy',
      environment: 'sandbox' as const,
      scopes: ['market_operations:invoke'],
      authorityMode: 'approve_each' as const,
    }
    const completedFor = (value: string) => ({
      kind: 'completed' as const,
      invocationRef: `invocation:${value}`,
      operationRef: selectedDescriptor.operationRef,
      output: { value },
      evidenceHash: `sha256:${value}`,
      usage: {
        usageRef: `usage:${value}`,
        observedAt: 1,
        chargeState: 'free_tier' as const,
        amount: { currency: 'USD', units: '0', exponent: 0 },
        priceDigest: 'sha256:price',
      },
    })
    const makeService = (failAfterEffect = false) => {
      const materialByKey = new Map<string, string>()
      let effectCount = 0
      let shouldFailAfterEffect = failAfterEffect
      const invokeOperation = vi.fn(async (request: {
        input: {
          operationRef: string
          input: Record<string, unknown>
          idempotencyKey: string
        }
      }) => {
        const material = JSON.stringify({
          operationRef: request.input.operationRef,
          input: request.input.input,
        })
        const previous = materialByKey.get(request.input.idempotencyKey)
        if (previous !== undefined && previous !== material) {
          return {
            kind: 'refused' as const,
            operationRef: request.input.operationRef,
            code: 'idempotency_conflict' as const,
            retryable: false,
          }
        }
        if (previous === undefined) {
          materialByKey.set(request.input.idempotencyKey, material)
          effectCount += 1
          if (shouldFailAfterEffect) {
            shouldFailAfterEffect = false
            throw new Error('killed after provider effect')
          }
        }
        return completedFor(String(request.input.input.value))
      })
      const unavailable = async (): Promise<never> => {
        throw new Error('unused operation recovery method')
      }
      return {
        service: {
          invokeOperation,
          readInvocationStatus: vi.fn(unavailable),
          cancelInvocation: vi.fn(unavailable),
          reconcileInvocation: vi.fn(unavailable),
        },
        invokeOperation,
        effectCount: () => effectCount,
      }
    }
    const runSelected = async (options: {
      service: OperationInvokeService
      value: string
      resumeCheckpoint?: AnswerTurnCheckpoint
      generation?: number
      onToolCheckpoint?: (
        checkpoint: AnswerToolUseAgentCheckpoint,
      ) => Promise<void>
      maxToolCalls?: number
    }) => {
      const server = await startOpenRouterContractServer((request) => {
        if ((request.tools?.length ?? 0) > 0) {
          return openRouterToolResponse([
            {
              id: `call-${options.value}`,
              toolId: selectedToolName(),
              input: selectedExecuteInput({ value: options.value }),
            },
          ])
        }
        return openRouterStructuredProseResponse({
          oneLine: `The live value is ${options.value}.`,
          summary: 'The authenticated operation returned the requested value.',
          whatToDoNow: 'Use the returned value.',
        })
      })
      const restoreOpenRouter = server.installEnv()
      try {
        return await runAnswerToolUseAgent({
          turnId: 'turn:pra004',
          query: 'what is the live value?',
          keylessExecutableSource: selectedSource,
          maxToolCalls: options.maxToolCalls ?? 1,
          operationInvokeContext: {
            principal,
            correlationId: 'corr:pra004',
            reservationKey: 'reservation:pra004',
            generation: options.generation ?? 4,
            service: options.service,
          },
          ...(options.resumeCheckpoint === undefined
            ? {}
            : { resumeCheckpoint: options.resumeCheckpoint }),
          ...(options.onToolCheckpoint === undefined
            ? {}
            : { onToolCheckpoint: options.onToolCheckpoint }),
        })
      } finally {
        restoreOpenRouter()
        await server.close()
      }
    }

    const completedService = makeService()
    const completedCheckpoints: AnswerToolUseAgentCheckpoint[] = []
    await runSelected({
      service: completedService.service,
      value: 'completed',
      onToolCheckpoint: async (checkpoint) => {
        completedCheckpoints.push(checkpoint)
      },
    })
    const completedCheckpoint = completedCheckpoints.find(
      (checkpoint) => checkpoint.operationOutcome !== undefined,
    )
    if (completedCheckpoint === undefined) {
      throw new Error('expected completed operation checkpoint')
    }
    const completedResume = await runSelected({
      service: completedService.service,
      value: 'completed',
      resumeCheckpoint: {
        schemaVersion: 1,
        reservationKey: 'reservation:pra004',
        requestDigest: 'request:pra004',
        generation: 4,
        threadId: 'thread:pra004',
        turnId: 'turn:pra004',
        turnSeq: 1,
        route: 'tool_search',
        intent: 'refine_search',
        query: 'what is the live value?',
        priorTurnCount: 0,
        toolCallDigests: completedCheckpoint.toolCalls.map((call) => ({
          toolCallId: call.toolCallId,
          inputDigest: canonicalDigest(call.inputJson).toString(),
          resultDigest: call.resultHash,
        })),
        ...completedCheckpoint,
      },
    })
    expect(completedService.effectCount()).toBe(1)
    expect(completedService.invokeOperation).toHaveBeenCalledTimes(1)
    expect(completedResume.snapshot.operationOutcome).toEqual(
      completedCheckpoint.operationOutcome,
    )

    const replayService = makeService(true)
    await expect(
      runSelected({
        service: replayService.service,
        value: 'replayed',
        generation: 4,
      }),
    ).rejects.toMatchObject({ code: 'tool_unavailable' })
    const replay = await runSelected({
      service: replayService.service,
      value: 'replayed',
      generation: 5,
    })
    expect(replayService.effectCount()).toBe(1)
    expect(replayService.invokeOperation).toHaveBeenCalledTimes(2)
    expect(
      replayService.invokeOperation.mock.calls[0]?.[0].input.idempotencyKey,
    ).toBe(
      replayService.invokeOperation.mock.calls[1]?.[0].input.idempotencyKey,
    )
    expect(replay.toolCalls[0]?.seq).toBe(0)

    const conflictService = makeService()
    await runSelected({ service: conflictService.service, value: 'first' })
    const conflict = await runSelected({
      service: conflictService.service,
      value: 'changed',
    })
    expect(conflictService.effectCount()).toBe(1)
    expect(
      conflictService.invokeOperation.mock.calls[0]?.[0].input.idempotencyKey,
    ).toBe(
      conflictService.invokeOperation.mock.calls[1]?.[0].input.idempotencyKey,
    )
    expect(JSON.parse(conflict.toolCalls[0]!.resultJson)).toMatchObject({
      kind: 'refused',
      code: 'idempotency_conflict',
    })

    const ordinalService = makeService()
    const firstOrdinal = await runSelected({
      service: ordinalService.service,
      value: 'same',
    })
    const priorCall: AnswerTurnCheckpoint['toolCalls'][number] = {
      toolCallId: 'prior-detail',
      turnId: 'turn:pra004',
      seq: 0,
      toolId: 'registry.operations.detail',
      inputJson: JSON.stringify({
        operationRef: selectedDescriptor.operationRef,
      }),
      resultSummaryJson: '{"slugs":[],"count":0}',
      resultJson: JSON.stringify(stagedDetailResult),
      resultHash: 'prior-detail-hash',
      status: 'complete',
      createdAt: 1,
    }
    const secondOrdinal = await runSelected({
      service: ordinalService.service,
      value: 'same',
      maxToolCalls: 2,
      resumeCheckpoint: {
        schemaVersion: 1,
        reservationKey: 'reservation:pra004',
        requestDigest: 'request:pra004',
        generation: 4,
        threadId: 'thread:pra004',
        turnId: 'turn:pra004',
        turnSeq: 1,
        stepOrdinal: 1,
        route: 'tool_search',
        intent: 'refine_search',
        query: 'what is the live value?',
        priorTurnCount: 0,
        priorProviders: [],
        priorAllowedSlugs: [],
        toolCalls: [priorCall],
        toolCallDigests: [],
        modelRequests: [],
        replayMessagesJson: '[{"role":"user","content":"what is the live value?"}]',
      },
    })
    expect(firstOrdinal.toolCalls.find((call) => call.toolId === 'operation.invoke')?.seq).toBe(0)
    expect(secondOrdinal.toolCalls.find((call) => call.toolId === 'operation.invoke')?.seq).toBe(1)
    expect(ordinalService.effectCount()).toBe(2)
    expect(
      ordinalService.invokeOperation.mock.calls[0]?.[0].input.idempotencyKey,
    ).not.toBe(
      ordinalService.invokeOperation.mock.calls[1]?.[0].input.idempotencyKey,
    )
  })
})
