import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AnswerEffectPolicy, AnswerRequestRoute } from '@/modules/answer/answer-schema'
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
  preflightRoute?: AnswerRequestRoute
  preflightEffectPolicy?: AnswerEffectPolicy
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
    const preflightSchemaName = body.response_format?.json_schema?.name
    const isSafetyRequest =
      preflightSchemaName === 'answer_query_safety'
      || preflightSchemaName === 'answer_request_preflight'
      || body.messages.some((message) =>
        message.role === 'system' && message.content.includes('Classify the user request'),
      )
    requests.push(body)
    let payload: unknown
    if (isSafetyRequest) {
      payload = openRouterSafetyChoiceResponse(
        options.safetyDecision ?? 'allow',
        preflightSchemaName,
        options.preflightRoute,
        options.preflightEffectPolicy,
      )
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
  schemaName?: string,
  preflightRoute: AnswerRequestRoute = 'business',
  preflightEffectPolicy: AnswerEffectPolicy = 'run_when_ready',
): unknown {
  const content =
    schemaName === 'answer_request_preflight'
      ? {
          safety: result,
          interpretation: {
            route: preflightRoute,
            requestedIntents: [{
              intentId: preflightRoute === 'operation'
                ? 'operation-request'
                : 'business-search',
              phrase: preflightRoute === 'operation'
                ? 'operation request'
                : 'business search',
              requestedResult: preflightRoute === 'operation'
                ? 'requested live result'
                : 'matching businesses',
            }],
            continuation: 'new',
            effectPolicy: preflightEffectPolicy,
          },
        }
      : { result }
  return {
    id: `chatcmpl-safety-${result}`,
    model: 'test-model',
    choices: [{
      finish_reason: 'stop',
      message: {
        role: 'assistant',
        content: JSON.stringify(content),
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
  navigationOperationRef?: string
  stageOperationReads?: boolean
  emitAllToolCallsTogether?: boolean
  stageBusinessRecovery?: boolean
  prose: OpenRouterProsePlan
}): OpenRouterContractResponseSource {
  const toolCalls = input.toolCalls ?? []
  let nextToolCallIndex = 0
  const emitNextActiveToolCall = (
    activeNames: ReadonlySet<string>,
  ): unknown | undefined => {
    const nextToolCall = toolCalls[nextToolCallIndex]
    if (nextToolCall === undefined) return undefined
    const providerSafeName = openRouterToolName(nextToolCall.toolId)
    if (!activeNames.has(providerSafeName)) {
      throw new Error(
        `unexpected_unstructured_tool_request: expected ${providerSafeName}`,
      )
    }
    nextToolCallIndex += 1
    return openRouterToolResponse([nextToolCall])
  }
  const advanceCursorPast = (
    toolCall: OpenRouterToolCallPlan | undefined,
  ): void => {
    if (toolCall === undefined) return
    const planIndex = toolCalls.indexOf(toolCall)
    if (planIndex >= 0) {
      nextToolCallIndex = Math.max(nextToolCallIndex, planIndex + 1)
    }
  }
  return (request) => {
    // The safety preflight uses Output.choice, while answer prose uses Output.object.
    // Keep the fixture's ordinary response path unchanged after answering the choice.
    const preflightSchemaName = request.response_format?.json_schema?.name
    if (
      preflightSchemaName === 'answer_query_safety'
      || preflightSchemaName === 'answer_request_preflight'
      || request.messages.some((message) =>
        message.role === 'system' && message.content.includes('Classify the user request'),
      )
    ) {
      return openRouterSafetyChoiceResponse('allow', preflightSchemaName)
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
      // AI SDK tool rounds are not structured-output rounds. Match the
      // planned call to the currently exposed stage-specific toolset.
      const activeNames = new Set(
        request.tools?.map((tool) => tool.function.name) ?? [],
      )
      const hasToolResults = request.messages.some(
        (message) => message.role === 'tool',
      )
      if (toolCalls.length === 0) {
        return {
          id: 'chatcmpl-no-tool-calls',
          model: 'test-model',
          choices: [{
            finish_reason: 'stop',
            message: { role: 'assistant', content: '' },
          }],
        }
      }
      if (input.emitAllToolCallsTogether === true) {
        nextToolCallIndex = toolCalls.length
        return openRouterToolResponse(toolCalls)
      }
      const nextResponse = emitNextActiveToolCall(activeNames)
      if (nextResponse !== undefined) return nextResponse
      if (!hasToolResults) {
        throw new Error('unexpected_unstructured_tool_request')
      }
      return openRouterStructuredProseResponse(input.prose)
    }
    if (
      input.stageBusinessRecovery === true &&
      request.response_format?.json_schema?.name === 'answer_navigation'
    ) {
      const completedReads = request.messages.filter(
        (message) => message.role === 'tool',
      ).length
      const businessReads = toolCalls.filter((call) =>
        call.toolId === 'registry.search' ||
        call.toolId === 'registry.detail',
      )
      const businessRead = businessReads[completedReads]
      if (businessRead === undefined) {
        advanceCursorPast(businessReads[businessReads.length - 1])
        return openRouterProseResponse({
          kind: 'answer',
          prose: input.prose,
        } as unknown as OpenRouterProsePlan)
      }
      advanceCursorPast(businessRead)
      return openRouterToolResponse([businessRead])
    }
    if (
      input.stageOperationReads === true &&
      input.navigationOperationRef !== undefined &&
      request.response_format?.json_schema?.name === 'answer_navigation'
    ) {
      const completedReads = request.messages.filter(
        (message) => message.role === 'tool',
      ).length
      const readCalls = toolCalls.filter((call) =>
        call.toolId.startsWith('registry.operations.'),
      )
      const nextRead = readCalls[completedReads]
      if (nextRead === undefined) {
        advanceCursorPast(readCalls[readCalls.length - 1])
        return openRouterNavigationCallResponse(input.navigationOperationRef)
      }
      advanceCursorPast(nextRead)
      return openRouterToolResponse([nextRead])
    }
    if ((request.tools?.length ?? 0) > 0 && toolCalls.length > 0) {
      const activeNames = new Set(
        request.tools?.map((tool) => tool.function.name) ?? [],
      )
      const nextResponse = emitNextActiveToolCall(activeNames)
      if (nextResponse !== undefined) return nextResponse
    }
    return request.response_format?.json_schema?.name === 'answer_navigation'
      ? openRouterProseResponse({ kind: 'answer', prose: input.prose } as never)
      : openRouterStructuredProseResponse(input.prose)
  }
}

function openRouterNavigationCallResponse(operationRef: string): unknown {
  return {
    id: 'chatcmpl-navigation-call',
    model: 'test-model',
    choices: [{
      finish_reason: 'stop',
      message: {
        role: 'assistant',
        content: JSON.stringify({ kind: 'call', operationRef }),
      },
    }],
    usage: { prompt_tokens: 100, completion_tokens: 25, total_tokens: 125 },
  }
}


function restoreEnv(name: string, previous: string | undefined): void {
  if (previous === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = previous
  }
}

