import { parseJsonEventStream } from '@ai-sdk/provider-utils'
import { expect, test } from '@playwright/test'
import { uiMessageChunkSchema } from 'ai'

import { vercelProtectionBypassHeaders } from './vercel-bypass'

test('anonymous chat streams a native AI SDK UI message', async ({ request: _request }, testInfo) => {
  const response = await fetch(new URL('/api/chat/anonymous', requiredBaseUrl()), {
    method: 'POST',
    headers: {
      accept: 'text/event-stream',
      'content-type': 'application/json',
      ...vercelProtectionBypassHeaders(),
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: 'Find a current weather operation' }],
    }),
    signal: AbortSignal.timeout(40_000),
  })

  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toContain('no-store')
  expect(response.headers.get('content-type')).toContain('text/event-stream')
  expect(response.headers.get('x-vercel-ai-ui-message-stream')).toBe('v1')
  expect(response.headers.get('x-accel-buffering')).toBe('no')
  expect(response.body).not.toBeNull()

  let firstByteAt: string | undefined
  let finishedAt: string | undefined
  let sawTextDelta = false
  const observed = response.body!.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      if (firstByteAt === undefined && chunk.byteLength > 0) {
        firstByteAt = new Date().toISOString()
        testInfo.annotations.push({ type: 'first-byte-at', description: firstByteAt })
      }
      controller.enqueue(chunk)
    },
  }))

  for await (const candidate of parseJsonEventStream({
    stream: observed,
    schema: uiMessageChunkSchema,
  })) {
    if (!candidate.success) throw new Error('chat_stream_chunk_invalid')
    if (candidate.value.type === 'text-delta' && candidate.value.delta.trim().length > 0) {
      sawTextDelta = true
    }
    if (candidate.value.type === 'finish') {
      finishedAt = new Date().toISOString()
      testInfo.annotations.push({ type: 'finished-at', description: finishedAt })
    }
  }

  expect(firstByteAt).toBeDefined()
  expect(sawTextDelta).toBe(true)
  expect(finishedAt).toBeDefined()
  console.log(JSON.stringify({ chatStreamTiming: { firstByteAt, finishedAt } }))
})

function requiredBaseUrl(): URL {
  const configured = process.env.PLAYWRIGHT_BASE_URL?.trim()
  if (configured === undefined || configured.length === 0) {
    throw new Error('PLAYWRIGHT_BASE_URL_required')
  }
  const url = new URL(configured)
  if (url.protocol !== 'https:') throw new Error('PLAYWRIGHT_BASE_URL_https_required')
  if (
    url.username.length > 0
    || url.password.length > 0
    || url.search.length > 0
    || url.hash.length > 0
  ) {
    throw new Error('PLAYWRIGHT_BASE_URL_must_not_contain_credentials_or_query')
  }
  return url
}
