import { describe, expect, it, vi } from 'vitest'

import { MAX_CLERK_WEBHOOK_BODY_BYTES, verifyClerkWebhookRequest } from '@/lib/server/clerk-webhook-core'

describe('verifyClerkWebhookRequest', () => {
  it.each([
    ['an undeclared length', {}],
    ['a declared length', { 'content-length': String(6 * 64 * 1024) }],
  ])('rejects a streamed body over 256 KiB with %s without the caller reading it', async (_label, headers) => {
    const verify = vi.fn(async () => ({ type: 'session.created' }))
    const result = await verifyClerkWebhookRequest(streamedRequest(6, 64 * 1024, headers), verify)

    expect(MAX_CLERK_WEBHOOK_BODY_BYTES).toBeLessThan(6 * 64 * 1024)
    expect(result.kind).toBe('rejected')
    if (result.kind !== 'rejected') return
    expect(result.response.status).toBe(413)
    expect(result.response.headers.get('connection')).toBe('close')
    expect(verify).not.toHaveBeenCalled()
  })

  it('rejects a verifier exception with the Clerk invalid-webhook response', async () => {
    const result = await verifyClerkWebhookRequest(request('{}'), async () => {
      throw new Error('signature invalid')
    })

    expect(result.kind).toBe('rejected')
    if (result.kind !== 'rejected') return
    expect(result.response.status).toBe(400)
    expect(await result.response.text()).toContain('clerk_webhook_invalid')
  })

  it('returns the verified event and the svix-id delivery reference, verifying the same bytes', async () => {
    const event = { type: 'session.created', data: { id: 'sess_1' } }
    const body = JSON.stringify(event)
    const verify = vi.fn(async (verifiedRequest: Request) => {
      expect(await verifiedRequest.text()).toBe(body)
      expect(verifiedRequest.headers.get('svix-id')).toBe('delivery_123')
      return event
    })

    expect(await verifyClerkWebhookRequest(request(body, 'delivery_123'), verify)).toEqual({
      kind: 'verified',
      webhook: { event, deliveryRef: 'delivery_123' },
    })
    expect(verify).toHaveBeenCalledTimes(1)
  })

  it('does not disclose verifier exception details in a rejected response', async () => {
    const secret = 'whsec_unguessable_private_material_7381'
    const result = await verifyClerkWebhookRequest(request('{}'), async () => {
      throw new Error(`bad signature with ${secret}`)
    })

    expect(result.kind).toBe('rejected')
    if (result.kind !== 'rejected') return
    expect(result.response.status).toBe(400)
    expect(await result.response.text()).not.toContain(secret)
  })
})

function request(body: string, deliveryRef?: string): Request {
  return new Request('https://aecon.example.test/api/clerk/webhook', {
    method: 'POST',
    headers: deliveryRef === undefined ? {} : { 'svix-id': deliveryRef },
    body,
  })
}

function streamedRequest(chunks: number, chunkBytes: number, headers: Record<string, string>): Request {
  let sent = 0
  const chunk = new Uint8Array(chunkBytes).fill(120)
  return new Request('https://aecon.example.test/api/clerk/webhook', {
    method: 'POST',
    headers,
    body: new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent++ === chunks) controller.close()
        else controller.enqueue(chunk)
      },
    }),
    duplex: 'half',
  } as RequestInit & { duplex: 'half' })
}
