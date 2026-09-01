import { describe, expect, it, vi } from 'vitest'

import { handleClerkSecurityWebhookRequest } from '@/lib/server/clerk-security-webhook'
import type { ClerkSecurityObservation } from '@/modules/security/account-security'

const issuer = 'https://clerk.example.test'

describe('Clerk security webhook', () => {
  it('verifies before applying one redacted, hashed session observation', async () => {
    const applied: ClerkSecurityObservation[] = []
    const incoming = request('delivery_1', sensitiveBody())
    const response = await handleClerkSecurityWebhookRequest(incoming, {
      issuer,
      verify: async (verifiedRequest) => {
        expect(verifiedRequest).toBe(incoming)
        expect(await verifiedRequest.text()).toBe(sensitiveBody())
        expect(verifiedRequest.headers.get('svix-id')).toBe('delivery_1')
        return sessionEvent('session.created')
      },
      apply: async (command) => {
        applied.push(command)
        return { kind: 'accepted', status: 'applied', eventRef: 'audit:clerk:one' }
      },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      kind: 'accepted',
      status: 'applied',
      eventRef: 'audit:clerk:one',
    })
    expect(applied).toHaveLength(1)
    expect(applied[0]).toMatchObject({
      eventType: 'session.created',
      providerIdentifier: `${issuer}|user_owner_1`,
      observedAt: 1_000,
    })
    expect(applied[0]?.deliveryRefHash).toMatch(/^sha256:[0-9a-f]{64}$/u)
    expect(applied[0]?.targetRefHash).toMatch(/^sha256:[0-9a-f]{64}$/u)
    expect(JSON.stringify(applied[0])).not.toContain('delivery_1')
    expect(JSON.stringify(applied[0])).not.toContain('session_private_1')
    expect(JSON.stringify(applied[0])).not.toContain('owner@example.test')
    expect(JSON.stringify(applied[0])).not.toContain('192.0.2.1')
  })

  it('uses one stable target hash for the same session across lifecycle events', async () => {
    const commands: ClerkSecurityObservation[] = []
    for (const [index, type] of [
      'session.created',
      'session.ended',
      'session.revoked',
    ].entries()) {
      const response = await handleClerkSecurityWebhookRequest(request(`delivery_lifecycle_${index}`), {
        issuer,
        verify: async () => sessionEvent(type as 'session.created' | 'session.ended' | 'session.revoked'),
        apply: async (command) => {
          commands.push(command)
          return { kind: 'accepted', status: 'applied' }
        },
      })
      expect(response.status).toBe(200)
    }
    expect(new Set(commands.map((command) => command.targetRefHash)).size).toBe(1)
  })

  it('records user.updated only as a coarse security-profile observation', async () => {
    const apply = vi.fn(async (command: ClerkSecurityObservation) => ({
      kind: 'accepted' as const,
      status: 'applied' as const,
      eventRef: command.targetRefHash,
    }))
    const response = await handleClerkSecurityWebhookRequest(request('delivery_2'), {
      issuer,
      verify: async () => ({
        type: 'user.updated',
        object: 'event',
        data: {
          id: 'user_owner_1',
          updated_at: 2_000,
          two_factor_enabled: true,
          password_enabled: true,
          email_addresses: [{ email_address: 'owner@example.test' }],
        },
        event_attributes: { http_request: { client_ip: '192.0.2.1', user_agent: 'secret-browser' } },
      }),
      apply,
    })

    expect(response.status).toBe(200)
    const command = apply.mock.calls[0]?.[0]
    expect(command?.eventType).toBe('user.updated')
    expect(JSON.stringify(command)).not.toContain('two_factor')
    expect(JSON.stringify(command)).not.toContain('password')
    expect(JSON.stringify(command)).not.toContain('owner@example.test')
  })

  it.each(['session.removed', 'organization.created'])(
    'ignores verified unsupported event %s without a Convex write',
    async (type) => {
      const apply = vi.fn()
      const response = await handleClerkSecurityWebhookRequest(request('delivery_3'), {
        issuer,
        verify: async () => ({ type, object: 'event', data: {} }),
        apply,
      })
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ kind: 'accepted', status: 'ignored' })
      expect(apply).not.toHaveBeenCalled()
    },
  )

  it('rejects failed verification without applying or exposing the verifier error', async () => {
    const apply = vi.fn()
    const response = await handleClerkSecurityWebhookRequest(request('delivery_4'), {
      issuer,
      verify: async () => { throw new Error('whsec_private verifier details') },
      apply,
    })
    expect(response.status).toBe(400)
    expect(await response.text()).not.toContain('whsec_private')
    expect(apply).not.toHaveBeenCalled()
  })

  it('rejects an oversized body before verification', async () => {
    const verify = vi.fn()
    const response = await handleClerkSecurityWebhookRequest(
      request('delivery_5', 'x'.repeat(257 * 1024)),
      { issuer, verify },
    )
    expect(response.status).toBe(413)
    expect(verify).not.toHaveBeenCalled()
  })

  it('returns a retryable response when persistence is unavailable', async () => {
    const response = await handleClerkSecurityWebhookRequest(request('delivery_6'), {
      issuer,
      verify: async () => sessionEvent('session.revoked'),
      apply: async () => { throw new Error('private persistence failure') },
    })
    expect(response.status).toBe(503)
    expect(response.headers.get('Retry-After')).toBe('5')
    expect(await response.text()).not.toContain('private persistence failure')
  })
})

function request(deliveryRef: string, body = '{}'): Request {
  return new Request('http://localhost/api/clerk/webhook', {
    method: 'POST',
    body,
    headers: {
      'content-type': 'application/json',
      'svix-id': deliveryRef,
      'svix-timestamp': '1000',
      'svix-signature': 'v1,test',
      'content-length': String(new TextEncoder().encode(body).byteLength),
    },
  })
}

function sessionEvent(type: 'session.created' | 'session.ended' | 'session.revoked') {
  return {
    type,
    object: 'event',
    data: {
      id: 'session_private_1',
      user_id: 'user_owner_1',
      created_at: 1_000,
      updated_at: 2_000,
      latest_activity: { ip_address: '192.0.2.1' },
    },
    event_attributes: { http_request: { client_ip: '192.0.2.1', user_agent: 'secret-browser' } },
  }
}

function sensitiveBody(): string {
  return JSON.stringify({
    email: 'owner@example.test',
    token: 'Bearer private-session-token',
  })
}
