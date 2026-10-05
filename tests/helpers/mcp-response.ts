import { parseJsonEventStream } from '@ai-sdk/provider-utils'
import { z } from 'zod'

export type JsonRpcBody = {
  result?: Record<string, unknown>
  error?: Record<string, unknown>
}

export async function readMcpBody(response: Response): Promise<JsonRpcBody> {
  const text = await response.text()
  if (response.headers.get('content-type')?.includes('text/event-stream') === true) {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`${text}\n\n`))
        controller.close()
      },
    })
    for await (const candidate of parseJsonEventStream({ stream, schema: z.unknown() })) {
      if (!candidate.success) continue
      return candidate.value as JsonRpcBody
    }
    throw new Error('MCP stream did not include a data event.')
  }
  return JSON.parse(text) as JsonRpcBody
}
