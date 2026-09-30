import { describe, expect, it, vi } from 'vitest'

import { MAX_CLERK_WEBHOOK_BODY_BYTES, verifyClerkWebhookRequest } from '@/lib/server/clerk-webhook-core'

describe('verifyClerkWebhookRequest', () => {
  it('rejects a body over 256 KiB before calling the verifier', async () => {
    const verify = vi.fn(async () => ({ type: 'session.created' }))
    const incoming = request('x'.repeat(MAX_CLERK_WEBHOOK_BODY_BYTES + 1))
    const resultPromise = verifyClerkWebhookRequest(incoming, verify)
    await incoming.text()
    const result = await resultPromise

    expect(result.kind).toBe('rejected')
    if (result.kind !== 'rejected') return
    expect(result.response.status).toBe(413)
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

  it('returns the verified event and the svix-id delivery reference', async () => {
    const event = { type: 'session.created', data: { id: 'sess_1' } }
    const incoming = request(JSON.stringify(event), 'delivery_123')
    const verify = vi.fn(async (verifiedRequest: Request) => {
      expect(verifiedRequest).toBe(incoming)
      return event
    })

    expect(await verifyClerkWebhookRequest(incoming, verify)).toEqual({
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
