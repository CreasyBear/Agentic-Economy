import { describe, expect, it } from 'vitest'

import { readBoundedRequestText } from '@/lib/server/bounded-request-body'

describe('readBoundedRequestText', () => {
  it('bounds response bodies through the same streaming contract', async () => {
    const response = new Response(JSON.stringify({ kind: 'quoted' }), {
      headers: { 'Content-Type': 'application/json' },
    })

    await expect(readBoundedRequestText(response, 64)).resolves.toEqual({
      ok: true,
      text: '{"kind":"quoted"}',
    })
  })

  it('cancels a declared oversized body before reading it', async () => {
    let canceled = false
    const response = new Response(
      new ReadableStream<Uint8Array>({
        cancel() {
          canceled = true
        },
      }),
      { headers: { 'Content-Length': '9' } },
    )

    await expect(readBoundedRequestText(response, 8)).resolves.toEqual({
      ok: false,
      code: 'payload_too_large',
    })
    expect(canceled).toBe(true)
  })

  it('rejects an oversized stream without content-length or Request.text()', async () => {
    const encoder = new TextEncoder()
    const maxBytes = 8
    let pullCount = 0
    let canceled = false
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pullCount += 1
        if (pullCount === 1) {
          controller.enqueue(encoder.encode('12345678'))
          return
        }
        controller.enqueue(encoder.encode('9'))
      },
      cancel() {
        canceled = true
      },
    })
    const request = new Request('https://ae.example/api/test', {
      method: 'POST',
      body,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' })
    let requestTextCalled = false
    Object.defineProperty(request, 'text', {
      value: async () => {
        requestTextCalled = true
        throw new Error('Request.text should not be called for bounded reads')
      },
    })

    await expect(readBoundedRequestText(request, maxBytes)).resolves.toEqual({
      ok: false,
      code: 'payload_too_large',
    })
    expect(request.headers.get('content-length')).toBeNull()
    expect(requestTextCalled).toBe(false)
    expect(canceled).toBe(true)
  })
})
