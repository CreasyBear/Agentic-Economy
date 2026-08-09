import { readFileSync } from 'node:fs'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { generateText, isStepCount } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import { z } from 'zod'
import type { KeylessExecutableSourcePort } from '@/modules/capability-execution'
import { runAnswerToolUseAgent } from '@/modules/answer/internal/answer-tool-use-agent'
import { DEFAULT_AE_SEARCH_CONTEXT } from '@/modules/answer/search-context'
import { actionToOpenRouterTool, openRouterToolName } from '@/modules/answer/internal/action-to-tool-spec'
import { findAction } from '@/modules/actions'
import { buildHarnessRunReport } from '@/modules/harness/public'
import {
  buildToolUseAgentSystemPrompt,
  buildToolUseAgentUserPrompt,
} from '@/modules/answer/internal/answer-llm-prompts'
import { ANSWER_READ_TOOL_IDS } from '@/modules/answer-thread/tooling'
import {
  openRouterStructuredProseResponse,
  openRouterToolResponse,
  openRouterToolThenProseResponses,
  startOpenRouterContractServer,
  type OpenRouterProsePlan,
} from '../../helpers/openrouter-contract-server'

const aiSdkTestState = vi.hoisted(() => ({
  generateTextCalls: [] as Array<Record<string, unknown>>,
}))
const emptyKeylessSource: KeylessExecutableSourcePort = {
  list: async () => [],
  read: async () => null,
  search: async () => [],
}
const emptyKeylessDataAsk = {
  kind: 'resolved' as const,
  descriptors: [],
  candidates: [],
}
type AiModuleForMock = {
  readonly [key: string]: unknown
  readonly generateText: typeof generateText
}


vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<AiModuleForMock>()
  return {
    ...actual,
    generateText: new Proxy(actual.generateText, {
      apply(target, thisArg, args) {
        aiSdkTestState.generateTextCalls.push(args[0] as Record<string, unknown>)
        return Reflect.apply(target, thisArg, args)
      },
    }),
  }
})

afterEach(() => {
  aiSdkTestState.generateTextCalls.length = 0
  delete process.env.OPENROUTER_API_KEY
  delete process.env.AE_OPENROUTER_API_BASE_URL
})

describe('actionToOpenRouterTool', () => {
  it('maps registry.search into an OpenRouter function tool spec with required query', () => {
    const spec = actionToOpenRouterTool(findAction('registry.search')!)
    expect(spec.type).toBe('function')
    expect(spec.function.name).toBe('registry_search')
    expect(spec.function.parameters.type).toBe('object')
    expect(spec.function.parameters.properties.query?.type).toBe('string')
    expect(spec.function.parameters.properties.limit?.type).toBe('number')
    expect(spec.function.parameters.properties.mode?.enum).toEqual([
      'near_me',
      'whole_catalogue',
    ])
    expect(spec.function.parameters.properties.location?.type).toBe('string')
    expect(spec.function.parameters.required).toContain('query')
    expect(spec.function.description).toMatch(/boundaries/i)
  })

  it('maps registry.detail with a required slug', () => {
    const spec = actionToOpenRouterTool(findAction('registry.detail')!)
    expect(spec.function.name).toBe('registry_detail')
    expect(spec.function.parameters.properties.slug?.type).toBe('string')
    expect(spec.function.parameters.required).toContain('slug')
  })
})

describe('AI SDK v7 multi-step usage', () => {
  it('aggregates result.usage while finalStep.usage stays last-step-only', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: [
        {
          content: [{
            type: 'tool-call',
            toolCallId: 'call-usage-1',
            toolName: 'lookup',
            input: '{"value":"first"}',
          }],
          finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
          usage: {
            inputTokens: {
              total: 11,
              noCache: 11,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: {
              total: 3,
              text: 3,
              reasoning: undefined,
            },
          },
          warnings: [],
        },
        {
          content: [{ type: 'text', text: 'done' }],
          finishReason: { unified: 'stop', raw: undefined },
          usage: {
            inputTokens: {
              total: 17,
              noCache: 17,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: {
              total: 5,
              text: 5,
              reasoning: undefined,
            },
          },
          warnings: [],
        },
      ],
    })

    const result = await generateText({
      model,
      prompt: 'Use lookup, then answer.',
      tools: {
        lookup: {
          inputSchema: z.object({ value: z.string() }),
          execute: async ({ value }) => value,
        },
      },
      stopWhen: isStepCount(2),
    })

    expect(result.steps).toHaveLength(2)
    expect(result.usage).toMatchObject({
      inputTokens: 28,
      outputTokens: 8,
      totalTokens: 36,
    })
    expect(result.finalStep.usage).toMatchObject({
      inputTokens: 17,
      outputTokens: 5,
      totalTokens: 22,
    })
  })
})

describe('runAnswerToolUseAgent — credential boundary', () => {
  it('fails closed without a provider credential and never fabricates an answer', async () => {
    delete process.env.OPENROUTER_API_KEY

    await expect(runAnswerToolUseAgent({ query: 'emergency plumber parramatta' }))
      .rejects.toMatchObject({ code: 'unavailable' })
    expect(aiSdkTestState.generateTextCalls).toHaveLength(0)
  })
})

describe('runAnswerToolUseAgent — tool-choice recovery', () => {
  it('feeds actual tool result JSON back to the model before final prose', async () => {
    const server = await startOpenRouterContractServer([
      {
        ...(openRouterToolResponse(
          [
            {
              id: 'call-search-1',
              toolId: 'registry.search',
              input: { query: 'parramatta' },
            },
          ],
          { id: 'chatcmpl-round-1', model: 'test-model-resolved' },
        ) as Record<string, unknown>),
        usage: {
          prompt_tokens: 100,
          completion_tokens: 25,
          total_tokens: 125,
          cost: 0.00000125,
          prompt_tokens_details: {
            cached_tokens: 10,
            cache_write_tokens: 2,
          },
          completion_tokens_details: {
            reasoning_tokens: 3,
          },
        },
      },
      {
        ...(openRouterStructuredProseResponse(
          {
            oneLine: 'Start with an emergency plumber serving Parramatta.',
            summary:
              'Parramatta Emergency Plumbing lists Emergency pipe repair, while Demo Plumbing lists Diagnostic plumbing. Price and current availability still need confirmation.',
            whatToDoNow:
              'Contact one and ask: “Can you attend in Parramatta, what is the call-out price, and when are you available?”',
          },
          { id: 'chatcmpl-round-2', model: 'test-model-resolved' },
        ) as Record<string, unknown>),
        usage: {
          prompt_tokens: 140,
          completion_tokens: 42,
          total_tokens: 182,
          cost: 0.00000182,
        },
      },
    ])
    const restoreOpenRouter = server.installEnv()

    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    const previousConvexUrl = process.env.CONVEX_URL
    const previousPublicConvexUrl = process.env.VITE_CONVEX_URL
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
    delete process.env.CONVEX_URL
    delete process.env.VITE_CONVEX_URL

    try {
      const result = await runAnswerToolUseAgent({
        query: 'paramata',
        keylessDataAsk: emptyKeylessDataAsk,
        keylessExecutableSource: emptyKeylessSource,
      })
      expect(result.gate.ok).toBe(true)
      expect(result.providers.map((provider) => provider.slug)).toContain(
        'parramatta-emergency-plumbing',
      )
      expect(result.snapshot.oneLine).toBe(
        'Start with an emergency plumber serving Parramatta.',
      )
      expect(result.snapshot.summary).toContain(
        'Parramatta Emergency Plumbing lists Emergency pipe repair',
      )
      expect(result.snapshot.summary).toContain(
        'Price and current availability still need confirmation.',
      )
      expect(result.snapshot.nextStep).toContain(
        'what is the call-out price, and when are you available?',
      )
      const humanCopy = [
        result.snapshot.oneLine,
        result.snapshot.summary,
        result.snapshot.nextStep,
      ].join('\n')
      expect(humanCopy).not.toMatch(
        /(?:business|listing(?:s)?) (?:confirms?|handles?) .*?(?:timing|price|availability|work)/i,
      )
      expect(humanCopy).not.toMatch(/send an inquiry|inquiry form/i)
      expect(result.modelRequests).toHaveLength(2)
      expect(result.modelRequests[0]).toMatchObject({
        seq: 0,
        provider: 'openrouter',
        model: 'test-model-resolved',
        status: 'ok',
        responseId: 'chatcmpl-round-1',
        stopReason: 'tool_calls',
        usage: {
          inputTokens: 100,
          outputTokens: 25,
          cachedInputTokens: 10,
          cacheWriteTokens: 2,
          reasoningOutputTokens: 3,
          totalTokens: 125,
        },
        costUsd: 0.00000125,
      })
      expect(result.modelRequests[1]).toMatchObject({
        seq: 1,
        provider: 'openrouter',
        model: 'test-model-resolved',
        status: 'ok',
        responseId: 'chatcmpl-round-2',
        stopReason: 'stop',
        usage: {
          inputTokens: 140,
          outputTokens: 42,
          totalTokens: 182,
        },
        costUsd: 0.00000182,
      })
      const harnessReport = buildHarnessRunReport({ models: result.modelRequests })
      expect(harnessReport.summary.models).toMatchObject({
        total: 2,
        ok: 2,
        byProvider: {
          openrouter: {
            total: 2,
            ok: 2,
          },
        },
      })
      expect(harnessReport.summary.usage).toMatchObject({
        inputTokens: 240,
        outputTokens: 67,
        cachedInputTokens: 10,
        cacheWriteTokens: 2,
        totalTokens: 307,
      })
      expect(harnessReport.summary.cost).toEqual({
        estimatedUsd: 0.00000307,
        unavailableReasons: [],
      })
      expect(result.timings.filter((timing) => timing.name === 'model.openrouter_round')).toHaveLength(2)
      expect(result.timings.filter((timing) => timing.name === 'model.openrouter_final_prose')).toHaveLength(0)
    } finally {
      if (previousLocalRegistry === undefined) {
        delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      } else {
        process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
      }
      if (previousConvexUrl === undefined) {
        delete process.env.CONVEX_URL
      } else {
        process.env.CONVEX_URL = previousConvexUrl
      }
      if (previousPublicConvexUrl === undefined) {
        delete process.env.VITE_CONVEX_URL
      } else {
        process.env.VITE_CONVEX_URL = previousPublicConvexUrl
      }
      restoreOpenRouter()
      await server.close()
    }

    const requests = server.requests
    expect(requests).toHaveLength(2)
    expect(aiSdkTestState.generateTextCalls).toHaveLength(1)
    // A business/listing query has no deterministic keyless selection, so the
    // prompt names only the fixed discovery tools.
    for (const callOptions of aiSdkTestState.generateTextCalls) {
      expect(callOptions.instructions).toContain(
        `You have read-only tools: ${ANSWER_READ_TOOL_IDS.map(openRouterToolName).join(', ')}`,
      )
      expect(callOptions.instructions).not.toContain('execute_operation')
      expect(callOptions.instructions).not.toContain('capability_')
      expect(callOptions).not.toHaveProperty('system')
    }
    expect(requests[0]?.response_format?.type).toBe('json_schema')
    expect(buildToolUseAgentSystemPrompt()).toContain(
      `You have read-only tools: ${ANSWER_READ_TOOL_IDS.map(openRouterToolName).join(', ')}`,
    )
    expect(requests[0]?.tool_choice).toBe('auto')
    expect(requests[0]?.tools?.map((tool) => tool.function.name)).not.toContain(
      'inquiry.submit',
    )
    // The prose request withholds the toolset outright, which is stronger than
    // the `tool_choice: 'none'` hint the previous hand-rolled transport sent.
    expect(requests[1]?.tools).toBeUndefined()
    expect(requests[1]?.response_format?.type).toBe('json_schema')

    const toolMessage = requests[1]?.messages.find((message) => message.role === 'tool')
    expect(toolMessage?.tool_call_id).toBe('call-search-1')
    expect(toolMessage?.content).not.toContain('Accepted')

    const toolResult = JSON.parse(toolMessage!.content) as {
      kind: string
      items: readonly { slug: string }[]
    }
    expect(toolResult.kind).toBe('ok')
    expect(toolResult.items.map((item) => item.slug)).toContain(
      'parramatta-emergency-plumbing',
    )
  })

  it('describes an unconfirmed default location as a proposal, not search scope', () => {
    const prompt = buildToolUseAgentUserPrompt({
      query: 'Emergency plumber',
      searchContext: DEFAULT_AE_SEARCH_CONTEXT,
    })

    expect(prompt).toContain('Configured search context proposes Perth, WA.')
    expect(prompt).toContain('confirm Perth, WA')
    expect(prompt).not.toContain('Search scope: near Perth, WA.')
    expect(prompt).not.toContain('location="Perth, WA"')
  })

  it('uses a confirmed context as the active search scope', () => {
    const prompt = buildToolUseAgentUserPrompt({
      query: 'Emergency plumber',
      searchContext: {
        ...DEFAULT_AE_SEARCH_CONTEXT,
        location: {
          label: 'Perth, WA',
          suburb: 'Perth',
          stateTerritory: 'WA',
          countryCode: 'AU',
          source: 'user_selected',
        },
      },
    })

    expect(prompt).toContain('Search scope: near Perth, WA.')
    expect(prompt).toContain('location="Perth"')
  })

  it('fails closed if the model emits a tool call when tools are disabled', async () => {
    const modelRequests: unknown[] = []

    const server = await startOpenRouterContractServer([
      openRouterToolResponse(
        [{ toolId: 'registry.search', input: { query: 'parramatta' } }],
        { id: 'chatcmpl-disabled-tools' },
      ),
    ])
    const restoreOpenRouter = server.installEnv()

    try {
      await expect(
        runAnswerToolUseAgent({
          query: 'compare the first two',
          keylessDataAsk: emptyKeylessDataAsk,
          keylessExecutableSource: emptyKeylessSource,
          disableTools: true,
          onModelRequest: (record) => modelRequests.push(record),
        }),
      ).rejects.toMatchObject({ code: 'tool_unavailable' })

      const requests = server.requests
      expect(requests[0]?.tools).toBeUndefined()
      expect(requests[0]?.response_format?.type).toBe('json_schema')
      expect(requests[0]?.response_format?.json_schema?.strict).toBe(true)
      expect(modelRequests).toEqual([
        expect.objectContaining({
          provider: 'openrouter',
          model: 'test-model',
          status: 'ok',
          responseId: 'chatcmpl-disabled-tools',
          stopReason: 'tool_calls',
          costUnavailableReason: 'price_table_missing',
        }),
      ])
    } finally {
      restoreOpenRouter()
      await server.close()
    }
  })

  it('records one provider request when structured output parsing fails after the step', async () => {
    const modelRequests: unknown[] = []
    const server = await startOpenRouterContractServer([{
      id: 'chatcmpl-invalid-structured-output',
      model: 'test-model',
      choices: [{
        finish_reason: 'stop',
        message: { role: 'assistant', content: 'not json' },
      }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 2,
        total_tokens: 12,
      },
    }])
    const restoreOpenRouter = server.installEnv()

    try {
      await expect(
        runAnswerToolUseAgent({
          query: 'compare the first two',
          keylessDataAsk: emptyKeylessDataAsk,
          keylessExecutableSource: emptyKeylessSource,
          disableTools: true,
          onModelRequest: (record) => modelRequests.push(record),
        }),
      ).rejects.toMatchObject({ code: 'request_failed' })

      expect(modelRequests).toEqual([
        expect.objectContaining({
          responseId: 'chatcmpl-invalid-structured-output',
          status: 'ok',
          usage: expect.objectContaining({ totalTokens: 12 }),
        }),
      ])
    } finally {
      restoreOpenRouter()
      await server.close()
    }
  })

  it('records a failed provider step after a successful tool-call step', async () => {
    const modelRequests: unknown[] = []
    const server = await startOpenRouterContractServer([
      openRouterToolResponse(
        [{ toolId: 'registry.search', input: { query: 'parramatta' } }],
        { id: 'chatcmpl-tool-before-failure' },
      ),
      undefined,
    ])
    const restoreOpenRouter = server.installEnv()
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    const previousConvexUrl = process.env.CONVEX_URL
    const previousPublicConvexUrl = process.env.VITE_CONVEX_URL
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
    delete process.env.CONVEX_URL
    delete process.env.VITE_CONVEX_URL

    try {
      await expect(
        runAnswerToolUseAgent({
          query: 'paramata',
          keylessDataAsk: emptyKeylessDataAsk,
          keylessExecutableSource: emptyKeylessSource,
          model: 'test-model',
          onModelRequest: (record) => modelRequests.push(record),
        }),
      ).rejects.toMatchObject({ code: 'request_failed' })

      expect(server.requests).toHaveLength(2)
      expect(server.requests[1]?.messages.some((message) => message.role === 'tool')).toBe(true)
      expect(modelRequests).toHaveLength(2)
      expect(modelRequests[0]).toMatchObject({
        seq: 0,
        provider: 'openrouter',
        model: 'test-model',
        status: 'ok',
        responseId: 'chatcmpl-tool-before-failure',
        stopReason: 'tool_calls',
      })
      expect(modelRequests[1]).toMatchObject({
        seq: 1,
        provider: 'openrouter',
        model: 'test-model',
        status: 'error',
        errorCode: 'request_failed',
        costUnavailableReason: 'request_failed',
      })
    } finally {
      if (previousLocalRegistry === undefined) {
        delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      } else {
        process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
      }
      if (previousConvexUrl === undefined) {
        delete process.env.CONVEX_URL
      } else {
        process.env.CONVEX_URL = previousConvexUrl
      }
      if (previousPublicConvexUrl === undefined) {
        delete process.env.VITE_CONVEX_URL
      } else {
        process.env.VITE_CONVEX_URL = previousPublicConvexUrl
      }
      restoreOpenRouter()
      await server.close()
    }
  })

  it('recovers a misspelled query in one bounded model loop', async () => {
    const server = await startOpenRouterContractServer((_request, index) => {
      if (index === 0) {
        return openRouterToolResponse([
          { toolId: 'registry.search', input: { query: 'joondalup' } },
        ])
      }
      if (index === 1) {
        return openRouterStructuredProseResponse({
          oneLine: 'Joondalup Rapid Plumbing is listed for Emergency plumbing.',
          summary: 'Joondalup Rapid Plumbing lists Emergency plumbing, published pricing "Demo price — $180 call-out, quoted before work starts", and published availability "Mon–Fri 7am–5pm, Sat 8am–12pm".',
          whatToDoNow: 'Contact Joondalup Rapid Plumbing to confirm whether Emergency plumbing covers your job, whether "Demo price — $180 call-out, quoted before work starts" applies, and the earliest appointment within "Mon–Fri 7am–5pm, Sat 8am–12pm".',
        })
      }
      return openRouterStructuredProseResponse({
        oneLine: 'Joondalup Rapid Plumbing guarantees immediate service.',
        summary: 'Joondalup Rapid Plumbing can handle the work now.',
        whatToDoNow: 'Book it.',
      })
    })
    const restoreOpenRouter = server.installEnv()
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    const previousConvexUrl = process.env.CONVEX_URL
    const previousPublicConvexUrl = process.env.VITE_CONVEX_URL
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
    delete process.env.CONVEX_URL
    delete process.env.VITE_CONVEX_URL

    try {
      const result = await runAnswerToolUseAgent({
        query: 'jondalup',
        keylessDataAsk: emptyKeylessDataAsk,
        keylessExecutableSource: emptyKeylessSource,
      })
      expect(result.providers.map((provider) => provider.slug)).toContain(
        'joondalup-rapid-plumbing',
      )
      expect(result.allowedSlugs.has('joondalup-rapid-plumbing')).toBe(true)
      expect(result.toolCalls).toHaveLength(1)
      expect(result.modelRequests).toEqual([
        expect.objectContaining({
          provider: 'openrouter',
          model: 'test-model',
          status: 'ok',
          stopReason: 'tool_calls',
        }),
        expect.objectContaining({
          provider: 'openrouter',
          model: 'test-model',
          status: 'ok',
          stopReason: 'stop',
        }),
      ])
      expect(result.toolCalls[0]?.toolId).toBe('registry.search')
      expect(result.gate.ok).toBe(true)
      expect(result.snapshot.providers.map((provider) => provider.slug)).toContain(
        'joondalup-rapid-plumbing',
      )
      expect(result.snapshot.summary).toContain(
        'Joondalup Rapid Plumbing lists Emergency plumbing, published pricing "Demo price — $180 call-out, quoted before work starts", and published availability "Mon–Fri 7am–5pm, Sat 8am–12pm".',
      )
      expect(result.snapshot.nextStep).toBe(
        'Contact Joondalup Rapid Plumbing to confirm whether Emergency plumbing covers your job, whether "Demo price — $180 call-out, quoted before work starts" applies, and the earliest appointment within "Mon–Fri 7am–5pm, Sat 8am–12pm".',
      )
    } finally {
      if (previousLocalRegistry === undefined) {
        delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      } else {
        process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
      }
      if (previousConvexUrl === undefined) {
        delete process.env.CONVEX_URL
      } else {
        process.env.CONVEX_URL = previousConvexUrl
      }
      if (previousPublicConvexUrl === undefined) {
        delete process.env.VITE_CONVEX_URL
      } else {
        process.env.VITE_CONVEX_URL = previousPublicConvexUrl
      }
      restoreOpenRouter()
      await server.close()
    }
  })

  it('records the chosen tool input as evidence, not the raw user query', async () => {
    const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      toolCalls: [{ toolId: 'registry.search', input: { query: 'parramatta' } }],
      prose: matchingProviderProse(),
    }))
    const restoreOpenRouter = server.installEnv()
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    const previousConvexUrl = process.env.CONVEX_URL
    const previousPublicConvexUrl = process.env.VITE_CONVEX_URL
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
    delete process.env.CONVEX_URL
    delete process.env.VITE_CONVEX_URL

    try {
      const result = await runAnswerToolUseAgent({
        query: 'paramata',
        keylessDataAsk: emptyKeylessDataAsk,
        keylessExecutableSource: emptyKeylessSource,
      })
      const input = JSON.parse(result.toolCalls[0]!.inputJson)
      expect(input.query).toBe('parramatta')
      // The frozen snapshot query stays honest to what the person typed.
      expect(result.snapshot.query).toBe('paramata')
    } finally {
      if (previousLocalRegistry === undefined) {
        delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      } else {
        process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
      }
      if (previousConvexUrl === undefined) {
        delete process.env.CONVEX_URL
      } else {
        process.env.CONVEX_URL = previousConvexUrl
      }
      if (previousPublicConvexUrl === undefined) {
        delete process.env.VITE_CONVEX_URL
      } else {
        process.env.VITE_CONVEX_URL = previousPublicConvexUrl
      }
      restoreOpenRouter()
      await server.close()
    }
  })

  it('refuses over-budget tool calls from the same assistant message and requests final prose without tools', async () => {
    const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      toolCalls: [
        { id: 'call-search-allowed', toolId: 'registry.search', input: { query: 'parramatta' } },
        { id: 'call-detail-over-budget', toolId: 'registry.detail', input: { slug: 'parramatta-emergency-plumbing' } },
      ],
      prose: matchingProviderProse(),
    }))
    const restoreOpenRouter = server.installEnv()
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    const previousConvexUrl = process.env.CONVEX_URL
    const previousPublicConvexUrl = process.env.VITE_CONVEX_URL
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
    delete process.env.CONVEX_URL
    delete process.env.VITE_CONVEX_URL

    try {
      const result = await runAnswerToolUseAgent({
        query: 'paramata',
        keylessDataAsk: emptyKeylessDataAsk,
        keylessExecutableSource: emptyKeylessSource,
        maxToolCalls: 1,
      })

      expect(result.providers.map((provider) => provider.slug)).toContain(
        'parramatta-emergency-plumbing',
      )
      expect(result.toolCalls).toHaveLength(2)
      expect(result.toolCalls[0]).toMatchObject({
        toolId: 'registry.search',
        status: 'complete',
      })
      expect(JSON.parse(result.toolCalls[0]!.resultSummaryJson)).toMatchObject({
        count: expect.any(Number),
      })
      expect(result.toolCalls[1]).toMatchObject({
        toolCallId: 'call-detail-over-budget',
        toolId: 'registry.detail',
        status: 'refused',
      })
      expect(JSON.parse(result.toolCalls[1]!.resultSummaryJson)).toMatchObject({
        count: 0,
        errorCode: 'budget_exceeded',
      })
      expect(JSON.parse(result.toolCalls[1]!.resultJson)).toEqual({
        kind: 'refused',
        code: 'budget_exceeded',
      })
      expect(result.modelRequests).toHaveLength(2)
      expect(result.modelRequests[0]).toMatchObject({ stopReason: 'tool_calls' })
      expect(result.gate.ok).toBe(true)
    } finally {
      if (previousLocalRegistry === undefined) {
        delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      } else {
        process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
      }
      if (previousConvexUrl === undefined) {
        delete process.env.CONVEX_URL
      } else {
        process.env.CONVEX_URL = previousConvexUrl
      }
      if (previousPublicConvexUrl === undefined) {
        delete process.env.VITE_CONVEX_URL
      } else {
        process.env.VITE_CONVEX_URL = previousPublicConvexUrl
      }
      restoreOpenRouter()
      await server.close()
    }

    expect(server.requests).toHaveLength(2)
    // This listing query has no selected keyless operation, so only the fixed
    // discovery tools are exposed.
    const firstToolNames = server.requests[0]?.tools?.map((tool) => tool.function.name) ?? []
    expect(firstToolNames).toEqual(expect.arrayContaining(ANSWER_READ_TOOL_IDS.map(openRouterToolName)))
    expect(firstToolNames.some((name) => name.startsWith('capability_'))).toBe(false)
    expect(server.requests[0]?.tool_choice).toBe('auto')
    expect(server.requests[1]?.tools).toBeUndefined()
    expect(server.requests[1]?.response_format?.type).toBe('json_schema')
    expect(server.requests[1]?.messages.at(-1)?.content).toBe('{"kind":"refused","code":"budget_exceeded"}')

    const toolMessages = server.requests[1]?.messages.filter((message) => message.role === 'tool') ?? []
    expect(toolMessages).toHaveLength(2)
    expect(toolMessages.map((message) => message.tool_call_id)).toEqual([
      'call-search-allowed',
      'call-detail-over-budget',
    ])
    expect(JSON.parse(toolMessages[1]!.content)).toEqual({
      kind: 'refused',
      code: 'budget_exceeded',
    })
  })

  it('does not persist an unconfirmed default context on location-free registry searches', async () => {
    const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      toolCalls: [{ toolId: 'registry.search', input: { query: 'emergency plumber' } }],
      prose: {
        oneLine: 'No listed businesses match this need yet.',
        summary: 'No listed businesses publish coverage for that place yet.',
        whatToDoNow: 'Try a nearby suburb or browse services.',
      },
    }))
    const restoreOpenRouter = server.installEnv()
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    const previousConvexUrl = process.env.CONVEX_URL
    const previousPublicConvexUrl = process.env.VITE_CONVEX_URL
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
    delete process.env.CONVEX_URL
    delete process.env.VITE_CONVEX_URL

    try {
      const result = await runAnswerToolUseAgent({
        query: 'emergency plumber',
        keylessDataAsk: emptyKeylessDataAsk,
        keylessExecutableSource: emptyKeylessSource,
        searchContext: DEFAULT_AE_SEARCH_CONTEXT,
      })
      const input = JSON.parse(result.toolCalls[0]!.inputJson)
      expect(input).toMatchObject({
        query: 'emergency plumber',
      })
      expect(input.mode).toBeUndefined()
      expect(input.location).toBeUndefined()
      expect(result.snapshot.agentJsonUrl).not.toContain('mode=near_me')
      expect(result.snapshot.agentJsonUrl).not.toContain('location=Perth')
    } finally {
      if (previousLocalRegistry === undefined) {
        delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      } else {
        process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
      }
      if (previousConvexUrl === undefined) {
        delete process.env.CONVEX_URL
      } else {
        process.env.CONVEX_URL = previousConvexUrl
      }
      if (previousPublicConvexUrl === undefined) {
        delete process.env.VITE_CONVEX_URL
      } else {
        process.env.VITE_CONVEX_URL = previousPublicConvexUrl
      }
      restoreOpenRouter()
      await server.close()
    }
  })

  it('keeps empty-provider prose structured when the model names a slug no tool returned', async () => {
    const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      toolCalls: [{ toolId: 'registry.search', input: { query: 'no-such-suburb' } }],
      prose: {
        oneLine: 'Fictional Plumbing is the best pick.',
        summary:
          'Fictional Plumbing can help. The business confirms timing, price, availability, and the work.',
        whatToDoNow: 'Contact fictional-plumbing directly.',
      },
    }))
    const restoreOpenRouter = server.installEnv()
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    const previousConvexUrl = process.env.CONVEX_URL
    const previousPublicConvexUrl = process.env.VITE_CONVEX_URL
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
    delete process.env.CONVEX_URL
    delete process.env.VITE_CONVEX_URL

    try {
      const result = await runAnswerToolUseAgent({
        query: 'no-such-suburb',
        keylessDataAsk: emptyKeylessDataAsk,
        keylessExecutableSource: emptyKeylessSource,
      })
      expect(result.providers).toEqual([])
      // The prose itself passed copy guards (no epistemic vocab), but the
      // empty-providers path means grounding is not the failure mode; the
      // snapshot has no providers so the gate does not reject on grounding.
      // This test still proves the loop runs and returns a structured result.
      expect(result.snapshot.providers).toEqual([])
      expect(result.snapshot.oneLine).toBe('No businesses match "no-such-suburb" yet.')
      expect(result.snapshot.summary).toBe(
        'No matches found yet. Try a nearby location or a broader service description.',
      )
      expect(result.snapshot.nextStep).toBe('Try a nearby location or a broader service description.')
      expect(result.snapshot.oneLine).not.toContain('Fictional Plumbing')
      expect(result.snapshot.summary).not.toMatch(/confirms timing|inquiry/i)
      expect(result.snapshot.nextStep).not.toMatch(/confirms timing|inquiry/i)
    } finally {
      if (previousLocalRegistry === undefined) {
        delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      } else {
        process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
      }
      if (previousConvexUrl === undefined) {
        delete process.env.CONVEX_URL
      } else {
        process.env.CONVEX_URL = previousConvexUrl
      }
      if (previousPublicConvexUrl === undefined) {
        delete process.env.VITE_CONVEX_URL
      } else {
        process.env.VITE_CONVEX_URL = previousPublicConvexUrl
      }
      restoreOpenRouter()
      await server.close()
    }
  })

  it('falls back to deterministic-style empty providers when the model calls no tools', async () => {
    const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      prose: {
        oneLine: 'No listed businesses match this need yet.',
        summary:
          'No providers are listed for this query on Agentic Economy. We do not book or take payment on this page.',
        whatToDoNow: 'Try a nearby suburb or a different trade word.',
      },
    }))
    const restoreOpenRouter = server.installEnv()
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    const previousConvexUrl = process.env.CONVEX_URL
    const previousPublicConvexUrl = process.env.VITE_CONVEX_URL
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
    delete process.env.CONVEX_URL
    delete process.env.VITE_CONVEX_URL

    try {
      const result = await runAnswerToolUseAgent({
        query: 'paramata',
        keylessDataAsk: emptyKeylessDataAsk,
        keylessExecutableSource: emptyKeylessSource,
      })
      expect(result.providers).toEqual([])
      expect(result.toolCalls).toEqual([])
      // Empty providers skip the grounding check; the honest copy passes.
      expect(result.gate.ok).toBe(true)
    } finally {
      if (previousLocalRegistry === undefined) {
        delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      } else {
        process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
      }
      if (previousConvexUrl === undefined) {
        delete process.env.CONVEX_URL
      } else {
        process.env.CONVEX_URL = previousConvexUrl
      }
      if (previousPublicConvexUrl === undefined) {
        delete process.env.VITE_CONVEX_URL
      } else {
        process.env.VITE_CONVEX_URL = previousPublicConvexUrl
      }
      restoreOpenRouter()
      await server.close()
    }
  })

  it('uses frozen prior providers for a filter_known intent without calling a tool', async () => {
    const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      prose: {
        oneLine: 'One listing matches the prior results.',
        summary:
          'The earlier provider still publishes relevant services. Scope, price, and current availability still need confirmation.',
        whatToDoNow: 'Contact the business and ask whether it handles the work, what it costs, and when it is available.',
      },
    }))
    const restoreOpenRouter = server.installEnv()
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    const previousConvexUrl = process.env.CONVEX_URL
    const previousPublicConvexUrl = process.env.VITE_CONVEX_URL
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
    delete process.env.CONVEX_URL
    delete process.env.VITE_CONVEX_URL

    try {
      const priorProvider = {
        citationIndex: 1,
        slug: 'parramatta-emergency-plumbing',
        name: 'Parramatta Emergency Plumbing',
        category: 'Emergency plumbing',
        suburb: 'Parramatta',
        stateTerritory: 'NSW',
        serviceArea: 'Parramatta and nearby suburbs',
        hoursLabel: 'Hours supplied by owner',
        availabilityLabel: 'Checked by Agentic Economy',
        trustLabel: 'Checked',
        responseTimeLabel: 'Response time not supplied',
        trustCue: 'Checked',
        nextStepLabel: 'Send inquiry',
        detailUrl: '/parramatta-emergency-plumbing',
        inquiryUrl: '/parramatta-emergency-plumbing/inquiry',
        services: [{ name: 'Emergency pipe repair', category: 'Emergency plumbing', summary: 'x' }],
      }

      const result = await runAnswerToolUseAgent({
        query: 'which ones take inquiries?',
        keylessDataAsk: emptyKeylessDataAsk,
        keylessExecutableSource: emptyKeylessSource,
        priorProviders: [priorProvider],
        priorAllowedSlugs: ['parramatta-emergency-plumbing'],
        followUpIntent: 'filter_known',
        disableTools: true,
      })
      expect(result.providers.map((provider) => provider.slug)).toEqual([
        'parramatta-emergency-plumbing',
      ])
      expect(result.allowedSlugs.has('parramatta-emergency-plumbing')).toBe(true)
      expect(result.toolCalls).toEqual([])
      expect(server.requests[0]?.tools).toBeUndefined()
      expect(result.gate.ok).toBe(true)
    } finally {
      if (previousLocalRegistry === undefined) {
        delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      } else {
        process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
      }
      if (previousConvexUrl === undefined) {
        delete process.env.CONVEX_URL
      } else {
        process.env.CONVEX_URL = previousConvexUrl
      }
      if (previousPublicConvexUrl === undefined) {
        delete process.env.VITE_CONVEX_URL
      } else {
        process.env.VITE_CONVEX_URL = previousPublicConvexUrl
      }
      restoreOpenRouter()
      await server.close()
    }
  })
})

describe('hidden rewrite guard', () => {
  it('keeps production answer code free of retrievalQuery or query-rewrite env seams', () => {
    const productionSources = [
      'src/modules/answer/answer-synthesizer.ts',
      'src/modules/answer/internal/evidence-assembler.ts',
      'src/modules/answer/internal/llm-config.ts',
      'src/modules/answer-thread/internal/turn-orchestrator.ts',
    ]
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n')

    expect(productionSources).not.toContain('retrievalQuery')
    expect(productionSources).not.toMatch(
      /\b(AE_[A-Z0-9_]*(QUERY|RETRIEVAL)[A-Z0-9_]*REWRITE|QUERY_REWRITE|REWRITE_QUERY)\b/,
    )
  })
})


function matchingProviderProse(): OpenRouterProsePlan {
  return {
    oneLine: 'One listed business matches this need.',
    summary:
      'The listing publishes emergency pipe repair. Scope, price, and current availability still need confirmation.',
    whatToDoNow: 'Contact the business and ask whether it handles the work, what it costs, and when it is available.',
  }
}

