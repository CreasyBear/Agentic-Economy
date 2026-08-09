import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { json } from 'node:stream/consumers'
import { openRouterToolName } from '@/modules/answer/internal/action-to-tool-spec'

export type OpenRouterContractRequest = {
  messages: { role: string; content: string; tool_call_id?: string }[]
  tools?: { function: { name: string } }[]
  tool_choice?: unknown
  parallel_tool_calls?: unknown
  response_format?: { type?: string; json_schema?: { strict?: boolean; name?: string } }
}

export type OpenRouterToolCallPlan = {
  id?: string
  toolId: string
  input: unknown
}

export type OpenRouterProsePlan = {
  oneLine: string
  summary: string
  whatToDoNow: string
}

export type OpenRouterContractServer = {
  endpointUrl: string
  requests: OpenRouterContractRequest[]
  installEnv: () => () => void
  close: () => Promise<void>
}

export type OpenRouterContractResponseSource =
  | readonly unknown[]
  | ((request: OpenRouterContractRequest, index: number) => unknown | Promise<unknown>)

export type OpenRouterContractServerOptions = {
  safetyDecision?: 'allow' | 'refuse'
}

export async function startOpenRouterContractServer(
  responses: OpenRouterContractResponseSource,
  options: OpenRouterContractServerOptions = {},
): Promise<OpenRouterContractServer> {
  const responseSource = responses
  const requests: OpenRouterContractRequest[] = []
  let scenarioRequestCount = 0
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const body = await json(request) as OpenRouterContractRequest
    const isSafetyRequest =
      body.response_format?.json_schema?.name === 'answer_query_safety'
      || body.messages.some((message) =>
        message.role === 'system' && message.content.includes('Classify the user request'),
      )
    requests.push(body)
    let payload: unknown
    if (isSafetyRequest) {
      payload = openRouterSafetyChoiceResponse(options.safetyDecision ?? 'allow')
    } else {
      const responseIndex = scenarioRequestCount++
      payload = typeof responseSource === 'function'
        ? await responseSource(body, responseIndex)
        : responseSource[responseIndex]
    }
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
  const endpointUrl = `http://127.0.0.1:${address.port}/api/v1/chat/completions`
  // The AI SDK provider appends `/chat/completions` to its configured base URL.
  const baseUrl = `http://127.0.0.1:${address.port}/api/v1`
  return {
    endpointUrl,
    requests,
    installEnv() {
      const previousApiKey = process.env.OPENROUTER_API_KEY
      const previousApiBaseUrl = process.env.AE_OPENROUTER_API_BASE_URL
      process.env.OPENROUTER_API_KEY = 'test-key'
      process.env.AE_OPENROUTER_API_BASE_URL = baseUrl
      return () => {
        restoreEnv('OPENROUTER_API_KEY', previousApiKey)
        restoreEnv('AE_OPENROUTER_API_BASE_URL', previousApiBaseUrl)
      }
    },
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error === undefined ? resolve() : reject(error))
    }),
  }
}

export function openRouterToolResponse(
  toolCalls: readonly OpenRouterToolCallPlan[],
  options: { id?: string; model?: string } = {},
): unknown {
  return {
    id: options.id ?? 'chatcmpl-tool-turn',
    model: options.model ?? 'test-model',
    choices: [
      {
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: '',
          tool_calls: toolCalls.map((toolCall, index) => ({
            id: toolCall.id ?? `call-${index + 1}`,
            type: 'function',
            function: {
              name: openRouterToolName(toolCall.toolId),
              arguments: JSON.stringify(toolCall.input),
            },
          })),
        },
      },
    ],
    usage: {
      prompt_tokens: 100,
      completion_tokens: 25,
      total_tokens: 125,
    },
  }
}

export function openRouterProseResponse(
  prose: OpenRouterProsePlan,
  options: { id?: string; model?: string } = {},
): unknown {
  return {
    id: options.id ?? 'chatcmpl-prose-turn',
    model: options.model ?? 'test-model',
    choices: [
      {
        finish_reason: 'stop',
        message: {
          role: 'assistant',
          content: JSON.stringify(prose),
        },
      },
    ],
    usage: {
      prompt_tokens: 140,
      completion_tokens: 42,
      total_tokens: 182,
    },
  }
}

function openRouterSafetyChoiceResponse(
  result: 'allow' | 'refuse',
): unknown {
  return {
    id: `chatcmpl-safety-${result}`,
    model: 'test-model',
    choices: [{
      finish_reason: 'stop',
      message: {
        role: 'assistant',
        content: JSON.stringify({ result }),
      },
    }],
    usage: {
      prompt_tokens: 40,
      completion_tokens: 2,
      total_tokens: 42,
    },
  }
}

/** A schema-valid final response for an AI SDK `Output.object` request. */
export function openRouterStructuredProseResponse(
  prose: OpenRouterProsePlan,
  options: { id?: string; model?: string } = {},
): unknown {
  return openRouterProseResponse(prose, options)
}

export function openRouterToolThenProseResponses(input: {
  toolCalls?: readonly OpenRouterToolCallPlan[]
  prose: OpenRouterProsePlan
}): OpenRouterContractResponseSource {
  const toolCalls = input.toolCalls ?? []
  return (request) => {
    // The safety preflight uses Output.choice, while answer prose uses Output.object.
    // Keep the fixture's ordinary response path unchanged after answering the choice.
    if (
      request.response_format?.json_schema?.name === 'answer_query_safety'
      || request.messages.some((message) =>
        message.role === 'system' && message.content.includes('Classify the user request'),
      )
    ) {
      return openRouterSafetyChoiceResponse('allow')
    }
    // Route on request SHAPE, never call index: multi-turn tests reuse one
    // server and turns interleave discovery, tool, and structured requests.
    if (request.response_format?.type !== 'json_schema') {
      if (request.tools === undefined) {
        // Tool-less, schema-less requests are web-discovery imports.
        return {
          id: 'chatcmpl-discovery-empty',
          model: 'test-model',
          choices: [{
            finish_reason: 'stop',
            message: { role: 'assistant', content: JSON.stringify({ businesses: [] }) },
          }],
        }
      }
      // AI SDK tool rounds are not structured-output rounds. The next request
      // with tool results must withhold tools and carry the prose JSON schema.
      const hasToolResults = request.messages.some((message) => message.role === 'tool')
      if (toolCalls.length > 0 && !hasToolResults) {
        return openRouterToolResponse(toolCalls)
      }
      throw new Error('unexpected_unstructured_tool_request')
    }
    if ((request.tools?.length ?? 0) > 0 && toolCalls.length > 0) {
      // Tool round: tools exposed, planned calls unserved on this step chain.
      const hasToolResults = request.messages.some((message) => message.role === 'tool')
      if (!hasToolResults) {
        return openRouterToolResponse(toolCalls)
      }
      throw new Error('expected_tools_withheld_on_structured_round')
    }
    return openRouterStructuredProseResponse(input.prose)
  }
}


function restoreEnv(name: string, previous: string | undefined): void {
  if (previous === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = previous
  }
}

