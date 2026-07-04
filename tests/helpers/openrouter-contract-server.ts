import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

export type OpenRouterContractRequest = {
  messages: { role: string; content: string; tool_call_id?: string }[]
  tools?: { function: { name: string } }[]
  tool_choice?: unknown
  parallel_tool_calls?: unknown
  response_format?: { type?: string; json_schema?: { strict?: boolean } }
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

export async function startOpenRouterContractServer(
  responses: OpenRouterContractResponseSource,
): Promise<OpenRouterContractServer> {
  const responseSource = responses
  const requests: OpenRouterContractRequest[] = []
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const body = JSON.parse(await readRequestBody(request)) as OpenRouterContractRequest
    requests.push(body)
    const responseIndex = requests.length - 1
    const payload = typeof responseSource === 'function'
      ? await responseSource(body, responseIndex)
      : responseSource[responseIndex]
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
  return {
    endpointUrl,
    requests,
    installEnv() {
      const previousApiKey = process.env.OPENROUTER_API_KEY
      const previousApiBaseUrl = process.env.AE_OPENROUTER_API_BASE_URL
      process.env.OPENROUTER_API_KEY = 'test-key'
      process.env.AE_OPENROUTER_API_BASE_URL = endpointUrl
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
          content: JSON.stringify(prose),
        },
      },
    ],
  }
}

export function openRouterToolThenProseResponses(input: {
  toolCalls?: readonly OpenRouterToolCallPlan[]
  prose: OpenRouterProsePlan
}): readonly unknown[] {
  const toolCalls = input.toolCalls ?? []
  if (toolCalls.length === 0) {
    return [openRouterProseResponse(input.prose)]
  }
  return [
    openRouterToolResponse(toolCalls),
    openRouterProseResponse(input.prose),
  ]
}

function restoreEnv(name: string, previous: string | undefined): void {
  if (previous === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = previous
  }
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  let body = ''
  for await (const chunk of request) {
    body += String(chunk)
  }
  return body
}
