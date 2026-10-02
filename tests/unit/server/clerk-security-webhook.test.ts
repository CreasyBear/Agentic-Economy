import { describe, expect, it, vi } from 'vitest'

import { handleClerkSecurityWebhookRequest } from '@/lib/server/clerk-security-webhook'
import type { ClerkSecurityObservation } from '@/modules/security/account-security'
import { verifiedClerkWebhook } from '../../helpers/clerk-webhook'

const issuer = 'https://clerk.example.test'

describe('Clerk security webhook', () => {
  it('applies one redacted, hashed session observation', async () => {
    const applied: ClerkSecurityObservation[] = []
    const incoming = request('delivery_1', sensitiveBody())
    const webhook = await verifiedClerkWebhook(incoming, async (verifiedRequest) => {
      expect(await verifiedRequest.text()).toBe(sensitiveBody())
      expect(verifiedRequest.headers.get('svix-id')).toBe('delivery_1')
      return sessionEvent('session.created')
    })
    const response = await handleClerkSecurityWebhookRequest(webhook, {
      issuer,
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
      const response = await handleClerkSecurityWebhookRequest(
        await verifiedClerkWebhook(request(`delivery_lifecycle_${index}`), async () =>
          sessionEvent(type as 'session.created' | 'session.ended' | 'session.revoked')),
        {
          issuer,
          apply: async (command) => {
            commands.push(command)
            return { kind: 'accepted', status: 'applied' }
          },
        },
      )
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
    const response = await handleClerkSecurityWebhookRequest(
      await verifiedClerkWebhook(request('delivery_2'), async () => ({
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
      })),
      {
        issuer,
        apply,
      },
    )

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
      const response = await handleClerkSecurityWebhookRequest(
        await verifiedClerkWebhook(request('delivery_3'), async () => ({ type, object: 'event', data: {} })),
        { issuer, apply },
      )
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ kind: 'accepted', status: 'ignored' })
      expect(apply).not.toHaveBeenCalled()
    },
  )


  it('A1: maps session.revoked to revoke_interactive_credentials', async () => {
    const applied: ClerkSecurityObservation[] = []
    const response = await handleClerkSecurityWebhookRequest(
      await verifiedClerkWebhook(request('delivery_revoked'), async () => sessionEvent('session.revoked')),
      {
        issuer,
        apply: async (command) => {
          applied.push(command)
          return { kind: 'accepted', status: 'applied' }
        },
      },
    )
    expect(response.status).toBe(200)
    expect(applied[0]?.securityAction).toBe('revoke_interactive_credentials')
  })

  it.each(['session.created', 'session.ended'] as const)(
    'A2: maps %s to observe_only',
    async (eventType) => {
      const applied: ClerkSecurityObservation[] = []
      const response = await handleClerkSecurityWebhookRequest(
        await verifiedClerkWebhook(request(`delivery_${eventType}`), async () => sessionEvent(eventType)),
        {
          issuer,
          apply: async (command) => {
            applied.push(command)
            return { kind: 'accepted', status: 'applied' }
          },
        },
      )
      expect(response.status).toBe(200)
      expect(applied[0]?.securityAction).toBe('observe_only')
    },
  )

  it('A3: maps password reset user.updated to revoke_interactive_credentials', async () => {
    const applied: ClerkSecurityObservation[] = []
    const response = await handleClerkSecurityWebhookRequest(
      await verifiedClerkWebhook(request('delivery_password_reset'), async () => ({
        type: 'user.updated',
        object: 'event',
        data: {
          id: 'user_owner_1',
          updated_at: 5_000,
          password_last_updated_at: 5_000,
        },
      })),
      {
        issuer,
        apply: async (command) => {
          applied.push(command)
          return { kind: 'accepted', status: 'applied' }
        },
      },
    )
    expect(response.status).toBe(200)
    expect(applied[0]?.securityAction).toBe('revoke_interactive_credentials')
  })

  it('A4: maps profile-only user.updated to observe_only', async () => {
    const applied: ClerkSecurityObservation[] = []
    const response = await handleClerkSecurityWebhookRequest(
      await verifiedClerkWebhook(request('delivery_profile_edit'), async () => ({
        type: 'user.updated',
        object: 'event',
        data: {
          id: 'user_owner_1',
          updated_at: 6_000,
          two_factor_enabled: true,
        },
      })),
      {
        issuer,
        apply: async (command) => {
          applied.push(command)
          return { kind: 'accepted', status: 'applied' }
        },
      },
    )
    expect(response.status).toBe(200)
    expect(applied[0]?.securityAction).toBe('observe_only')
  })

  describe('W-06 profile display name projection', () => {
    it('P1: maps first and last name to profileDisplayName with observe_only', async () => {
      const applied: ClerkSecurityObservation[] = []
      const response = await handleClerkSecurityWebhookRequest(
        await verifiedClerkWebhook(request('delivery_w06_p1'), async () => userUpdatedEvent({
          first_name: 'Ada',
          last_name: 'Lovelace',
        })),
        {
          issuer,
          apply: async (command) => {
            applied.push(command)
            return { kind: 'accepted', status: 'applied' }
          },
        },
      )
      expect(response.status).toBe(200)
      expect(applied[0]?.securityAction).toBe('observe_only')
      expect(applied[0]?.profileDisplayName).toBe('Ada Lovelace')
    })

    it('P2: falls back to username when names are absent', async () => {
      const applied: ClerkSecurityObservation[] = []
      const response = await handleClerkSecurityWebhookRequest(
        await verifiedClerkWebhook(request('delivery_w06_p2'), async () => userUpdatedEvent({
          first_name: null,
          last_name: '',
          username: 'ada',
        })),
        {
          issuer,
          apply: async (command) => {
            applied.push(command)
            return { kind: 'accepted', status: 'applied' }
          },
        },
      )
      expect(response.status).toBe(200)
      expect(applied[0]?.profileDisplayName).toBe('ada')
    })

    it('P3: omits profileDisplayName for avatar-only updates', async () => {
      const applied: ClerkSecurityObservation[] = []
      const response = await handleClerkSecurityWebhookRequest(
        await verifiedClerkWebhook(request('delivery_w06_p3'), async () => userUpdatedEvent({
          has_image: true,
          image_url: 'https://img.clerk.com/secret-avatar.png',
        })),
        {
          issuer,
          apply: async (command) => {
            applied.push(command)
            return { kind: 'accepted', status: 'applied' }
          },
        },
      )
      expect(response.status).toBe(200)
      expect(applied[0]?.profileDisplayName).toBeUndefined()
      expect(JSON.stringify(applied[0])).not.toContain('secret-avatar')
    })

    it('P4: keeps display name and never forwards plaintext email', async () => {
      const applied: ClerkSecurityObservation[] = []
      const response = await handleClerkSecurityWebhookRequest(
        await verifiedClerkWebhook(request('delivery_w06_p4'), async () => userUpdatedEvent({
          first_name: 'Ada',
          last_name: 'Lovelace',
          email_addresses: [{ email_address: 'ada.lovelace@example.test' }],
        })),
        {
          issuer,
          apply: async (command) => {
            applied.push(command)
            return { kind: 'accepted', status: 'applied' }
          },
        },
      )
      expect(response.status).toBe(200)
      expect(applied[0]?.profileDisplayName).toBe('Ada Lovelace')
      expect(JSON.stringify(applied[0])).not.toContain('ada.lovelace@example.test')
    })

    it.each([
      ['overlong name', 'A'.repeat(201)],
      ['control character', 'Ada\u0007Lovelace'],
    ])('P5: rejects unsafe display name (%s) but accepts delivery', async (_label, firstName) => {
      const applied: ClerkSecurityObservation[] = []
      const response = await handleClerkSecurityWebhookRequest(
        await verifiedClerkWebhook(request(`delivery_w06_p5_${_label}`), async () => userUpdatedEvent({
          first_name: firstName,
          last_name: 'Lovelace',
        })),
        {
          issuer,
          apply: async (command) => {
            applied.push(command)
            return { kind: 'accepted', status: 'applied' }
          },
        },
      )
      expect(response.status).toBe(200)
      expect(applied[0]?.profileDisplayName).toBeUndefined()
    })

    it('P6: password reset still projects profileDisplayName alongside revocation', async () => {
      const applied: ClerkSecurityObservation[] = []
      const response = await handleClerkSecurityWebhookRequest(
        await verifiedClerkWebhook(request('delivery_w06_p6'), async () => userUpdatedEvent({
          updated_at: 5_000,
          password_last_updated_at: 5_000,
          first_name: 'Ada',
          last_name: 'Lovelace',
        })),
        {
          issuer,
          apply: async (command) => {
            applied.push(command)
            return { kind: 'accepted', status: 'applied' }
          },
        },
      )
      expect(response.status).toBe(200)
      expect(applied[0]?.securityAction).toBe('revoke_interactive_credentials')
      expect(applied[0]?.profileDisplayName).toBe('Ada Lovelace')
    })
  })

  it('returns a retryable response when persistence is unavailable', async () => {
    const response = await handleClerkSecurityWebhookRequest(
      await verifiedClerkWebhook(request('delivery_6'), async () => sessionEvent('session.revoked')),
      {
        issuer,
        apply: async () => { throw new Error('private persistence failure') },
      },
    )
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

function userUpdatedEvent(data: Record<string, unknown>) {
  return {
    type: 'user.updated',
    object: 'event',
    data: {
      id: 'user_owner_1',
      updated_at: 8_000,
      ...data,
    },
  }
}
