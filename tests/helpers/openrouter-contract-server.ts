import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { json } from 'node:stream/consumers'

export type OpenRouterContractRequest = {
  messages: { role: string; content: string; tool_call_id?: string }[]
  tools?: { function: { name: string } }[]
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

export async function startOpenRouterContractServer(
  responses: readonly unknown[],
): Promise<OpenRouterContractServer> {
  const requests: OpenRouterContractRequest[] = []
  let responseIndex = 0
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    requests.push(await json(request) as OpenRouterContractRequest)
    const payload = responses[responseIndex++]
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

export function openRouterProseResponse(
  prose: OpenRouterProsePlan,
  options: { id?: string; model?: string } = {},
): unknown {
  return {
    id: options.id ?? 'chatcmpl-prose-turn',
    model: options.model ?? 'test-model',
    choices: [{
      finish_reason: 'stop',
      message: { role: 'assistant', content: JSON.stringify(prose) },
    }],
    usage: { prompt_tokens: 140, completion_tokens: 42, total_tokens: 182 },
  }
}

function restoreEnv(name: string, previous: string | undefined): void {
  if (previous === undefined) delete process.env[name]
  else process.env[name] = previous
}
