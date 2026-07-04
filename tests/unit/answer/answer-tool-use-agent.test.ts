import { readFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterEach, describe, expect, it } from 'vitest'

import { runAnswerToolUseAgent } from '@/modules/answer/internal/answer-tool-use-agent'
import { DEFAULT_AE_SEARCH_CONTEXT } from '@/modules/answer/search-context'
import { actionToOpenRouterTool } from '@/modules/answer/internal/action-to-tool-spec'
import { findAction } from '@/modules/actions'
import { buildHarnessRunReport } from '@/modules/harness/public'

afterEach(() => {
  delete process.env.OPENROUTER_API_KEY
  delete process.env.AE_OPENROUTER_API_BASE_URL
})

describe('actionToOpenRouterTool', () => {
  it('maps registry.search into an OpenRouter function tool spec with required query', () => {
    const spec = actionToOpenRouterTool(findAction('registry.search')!)
    expect(spec.type).toBe('function')
    expect(spec.function.name).toBe('registry.search')
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
    expect(spec.function.name).toBe('registry.detail')
    expect(spec.function.parameters.properties.slug?.type).toBe('string')
    expect(spec.function.parameters.required).toContain('slug')
  })
})

describe('runAnswerToolUseAgent — tool-choice recovery', () => {
  it('feeds actual tool result JSON back to the model before final prose', async () => {
    const server = await startOpenRouterServer([
      {
        id: 'chatcmpl-round-1',
        model: 'test-model-resolved',
        usage: {
          prompt_tokens: 100,
          completion_tokens: 25,
          total_tokens: 125,
          cost: 0.00000125,
          prompt_tokens_details: {
            cached_tokens: 10,
          },
          completion_tokens_details: {
            reasoning_tokens: 3,
          },
        },
        choices: [
          {
            finish_reason: 'tool_calls',
            message: {
              content: '',
              tool_calls: [
                {
                  id: 'call-search-1',
                  type: 'function',
                  function: {
                    name: 'registry.search',
                    arguments: JSON.stringify({ query: 'parramatta' }),
                  },
                },
              ],
            },
          },
        ],
      },
      {
        id: 'chatcmpl-round-2',
        model: 'test-model-resolved',
        usage: {
          prompt_tokens: 140,
          completion_tokens: 42,
          total_tokens: 182,
          cost: 0.00000182,
        },
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: JSON.stringify({
                oneLine: 'One listed business matches this need.',
                summary:
                  'The listing publishes emergency pipe repair. The business handles timing, price, and availability. Agentic Economy does not book or take payment on this page.',
                whatToDoNow: 'Open the provider page and send an inquiry when published. Agentic Economy does not book or take payment on this page.',
              }),
            },
          },
        ],
      },
    ])

    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const result = await runAnswerToolUseAgent({
        query: 'paramata',
        config: { apiKey: 'test-key', model: 'test-model', apiBaseUrl: server.endpointUrl },
      })

      expect(result.gate.ok).toBe(true)
      expect(result.providers.map((provider) => provider.slug)).toContain(
        'parramatta-emergency-plumbing',
      )
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
        totalTokens: 307,
      })
      expect(harnessReport.summary.cost).toEqual({
        estimatedUsd: 0.00000307,
        unavailableReasons: [],
      })
      expect(result.timings.filter((timing) => timing.name === 'model.openrouter_round')).toHaveLength(2)
    } finally {
      if (previousLocalRegistry === undefined) {
        delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      } else {
        process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
      }
      await server.close()
    }

    const requests = server.requests
    expect(requests).toHaveLength(2)
    expect(requests[0]?.tools?.map((tool) => tool.function.name)).toEqual([
      'registry.search',
      'registry.detail',
    ])
    expect(requests[0]?.tool_choice).toBe('auto')
    expect(requests[0]?.parallel_tool_calls).toBe(false)
    expect(requests[0]?.tools?.map((tool) => tool.function.name)).not.toContain(
      'inquiry.submit',
    )
    expect(requests[1]?.tool_choice).toBe('auto')

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

  it('fails closed if the model emits a tool call when tools are disabled', async () => {
    const modelRequests: unknown[] = []

    const server = await startOpenRouterServer([
      {
        id: 'chatcmpl-disabled-tools',
        model: 'test-model',
        choices: [
          {
            message: {
              content: '',
              tool_calls: [
                {
                  id: 'call-search-disabled',
                  type: 'function',
                  function: {
                    name: 'registry.search',
                    arguments: JSON.stringify({ query: 'parramatta' }),
                  },
                },
              ],
            },
          },
        ],
      },
    ])

    try {
      await expect(
        runAnswerToolUseAgent({
          query: 'compare the first two',
          disableTools: true,
          config: { apiKey: 'test-key', model: 'test-model', apiBaseUrl: server.endpointUrl },
          onModelRequest: (record) => modelRequests.push(record),
        }),
      ).rejects.toMatchObject({ code: 'tool_unavailable' })

      const requests = server.requests
      expect(requests[0]?.tools).toBeUndefined()
      expect(requests[0]?.tool_choice).toBe('none')
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
      await server.close()
    }
  })

  it('recovers a misspelled query when the model chooses registry.search("parramatta")', async () => {
    const server = await startOpenRouterServer(toolThenProseResponses({
      toolCalls: [{ toolId: 'registry.search', input: { query: 'parramatta' } }],
      prose: matchingProviderProse(),
    }))
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const result = await runAnswerToolUseAgent({
        query: 'paramata',
        config: { apiKey: 'test-key', model: 'test-model', apiBaseUrl: server.endpointUrl },
      })
      expect(result.providers.map((provider) => provider.slug)).toContain(
        'parramatta-emergency-plumbing',
      )
      expect(result.allowedSlugs.has('parramatta-emergency-plumbing')).toBe(true)
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
        'parramatta-emergency-plumbing',
      )
    } finally {
      if (previousLocalRegistry === undefined) {
        delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      } else {
        process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
      }
      await server.close()
    }
  })

  it('records the chosen tool input as evidence, not the raw user query', async () => {
    const server = await startOpenRouterServer(toolThenProseResponses({
      toolCalls: [{ toolId: 'registry.search', input: { query: 'parramatta' } }],
      prose: matchingProviderProse(),
    }))
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const result = await runAnswerToolUseAgent({
        query: 'paramata',
        config: { apiKey: 'test-key', model: 'test-model', apiBaseUrl: server.endpointUrl },
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
      await server.close()
    }
  })

  it('persists active near-me context on location-free registry searches', async () => {
    const server = await startOpenRouterServer(toolThenProseResponses({
      toolCalls: [{ toolId: 'registry.search', input: { query: 'emergency plumber' } }],
      prose: {
        oneLine: 'No listed businesses match this need yet.',
        summary: 'No listed businesses publish coverage for that place yet.',
        whatToDoNow: 'Try a nearby suburb or browse services.',
      },
    }))
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const result = await runAnswerToolUseAgent({
        query: 'emergency plumber',
        searchContext: DEFAULT_AE_SEARCH_CONTEXT,
        config: { apiKey: 'test-key', model: 'test-model', apiBaseUrl: server.endpointUrl },
      })
      const input = JSON.parse(result.toolCalls[0]!.inputJson)
      expect(input).toMatchObject({
        query: 'emergency plumber',
        mode: 'near_me',
        location: 'Perth',
      })
      expect(result.snapshot.agentJsonUrl).toContain('mode=near_me')
      expect(result.snapshot.agentJsonUrl).toContain('location=Perth')
    } finally {
      if (previousLocalRegistry === undefined) {
        delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      } else {
        process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
      }
      await server.close()
    }
  })

  it('keeps empty-provider prose structured when the model names a slug no tool returned', async () => {
    const server = await startOpenRouterServer(toolThenProseResponses({
      toolCalls: [{ toolId: 'registry.search', input: { query: 'no-such-suburb' } }],
      prose: {
        oneLine: 'Fictional Plumbing is the best pick.',
        summary:
          'Fictional Plumbing can help. The business handles timing, price, and availability. Agentic Economy does not book or take payment on this page.',
        whatToDoNow: 'Contact fictional-plumbing directly.',
      },
    }))
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const result = await runAnswerToolUseAgent({
        query: 'no-such-suburb',
        config: { apiKey: 'test-key', model: 'test-model', apiBaseUrl: server.endpointUrl },
      })
      expect(result.providers).toEqual([])
      // The prose itself passed copy guards (no epistemic vocab), but the
      // empty-providers path means grounding is not the failure mode; the
      // snapshot has no providers so the gate does not reject on grounding.
      // This test still proves the loop runs and returns a structured result.
      expect(result.snapshot.providers).toEqual([])
    } finally {
      if (previousLocalRegistry === undefined) {
        delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      } else {
        process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
      }
      await server.close()
    }
  })

  it('falls back to deterministic-style empty providers when the model calls no tools', async () => {
    const server = await startOpenRouterServer(toolThenProseResponses({
      prose: {
        oneLine: 'No listed businesses match this need yet.',
        summary:
          'No providers are listed for this query on Agentic Economy. We do not book or take payment on this page.',
        whatToDoNow: 'Try a nearby suburb or a different trade word.',
      },
    }))
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const result = await runAnswerToolUseAgent({
        query: 'paramata',
        config: { apiKey: 'test-key', model: 'test-model', apiBaseUrl: server.endpointUrl },
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
      await server.close()
    }
  })

  it('uses frozen prior providers for a filter_known intent without calling a tool', async () => {
    const server = await startOpenRouterServer(toolThenProseResponses({
      prose: {
        oneLine: 'One listing matches the prior results.',
        summary:
          'The earlier provider still applies. The business handles timing, price, and availability. Agentic Economy does not book or take payment on this page.',
        whatToDoNow: 'Open the provider page and send an inquiry when published. Agentic Economy does not book or take payment on this page.',
      },
    }))
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

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
        priorProviders: [priorProvider],
        priorAllowedSlugs: ['parramatta-emergency-plumbing'],
        followUpIntent: 'filter_known',
        disableTools: true,
        config: { apiKey: 'test-key', model: 'test-model', apiBaseUrl: server.endpointUrl },
      })
      expect(result.providers.map((provider) => provider.slug)).toEqual([
        'parramatta-emergency-plumbing',
      ])
      expect(result.allowedSlugs.has('parramatta-emergency-plumbing')).toBe(true)
      expect(result.toolCalls).toEqual([])
      expect(server.requests[0]?.tool_choice).toBe('none')
      expect(result.gate.ok).toBe(true)
    } finally {
      if (previousLocalRegistry === undefined) {
        delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      } else {
        process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
      }
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


type OpenRouterTestRequest = {
  messages: { role: string; content: string; tool_call_id?: string }[]
  tools?: { function: { name: string } }[]
  tool_choice?: unknown
  parallel_tool_calls?: unknown
  response_format?: { type?: string; json_schema?: { strict?: boolean } }
}

type OpenRouterProsePlan = {
  oneLine: string
  summary: string
  whatToDoNow: string
}

function matchingProviderProse(): OpenRouterProsePlan {
  return {
    oneLine: 'One listed business matches this need.',
    summary:
      'The listing publishes emergency pipe repair. The business handles timing, price, and availability. Agentic Economy does not book or take payment on this page.',
    whatToDoNow: 'Open the provider page and send an inquiry when published. Agentic Economy does not book or take payment on this page.',
  }
}

function toolThenProseResponses(input: {
  toolCalls?: readonly { toolId: string; input: unknown; id?: string }[]
  prose: OpenRouterProsePlan
}): readonly unknown[] {
  const toolCalls = input.toolCalls ?? []
  if (toolCalls.length === 0) {
    return [proseResponse(input.prose)]
  }
  return [toolResponse(toolCalls), proseResponse(input.prose)]
}

function toolResponse(toolCalls: readonly { toolId: string; input: unknown; id?: string }[]): unknown {
  return {
    id: 'chatcmpl-tool-turn',
    model: 'test-model',
    choices: [
      {
        finish_reason: 'tool_calls',
        message: {
          content: '',
          tool_calls: toolCalls.map((toolCall, index) => ({
            id: toolCall.id ?? `call-${index + 1}`,
            type: 'function',
            function: {
              name: toolCall.toolId,
              arguments: JSON.stringify(toolCall.input),
            },
          })),
        },
      },
    ],
  }
}

function proseResponse(prose: OpenRouterProsePlan): unknown {
  return {
    id: 'chatcmpl-prose-turn',
    model: 'test-model',
    choices: [
      {
        finish_reason: 'stop',
        message: {
          content: JSON.stringify(prose),
        },
      },
    ],
  }
}

async function startOpenRouterServer(responses: readonly unknown[]) {
  const requests: OpenRouterTestRequest[] = []
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const body = JSON.parse(await readRequestBody(request)) as OpenRouterTestRequest
    requests.push(body)
    const payload = responses[requests.length - 1]
    if (payload === undefined) {
      response.writeHead(500, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: 'unexpected_openrouter_request' }))
      return
    }
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify(payload))
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })

  const address = server.address() as AddressInfo
  return {
    endpointUrl: `http://127.0.0.1:${address.port}/api/v1/chat/completions`,
    requests,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error === undefined ? resolve() : reject(error))
    }),
  }
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  let raw = ''
  for await (const chunk of request) {
    raw += String(chunk)
  }
  return raw
}