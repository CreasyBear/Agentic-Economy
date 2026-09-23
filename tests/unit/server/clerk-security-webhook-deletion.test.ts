import { describe, expect, it, vi } from 'vitest'

import { handleClerkSecurityWebhookRequest } from '@/lib/server/clerk-security-webhook'
import type { ClerkSecurityObservation } from '@/modules/security/account-security'

const issuer = 'https://clerk.example.test'

describe('Clerk security webhook user.deleted (W-09)', () => {
  it('D1: maps user.deleted to retire_personal_account with envelope observedAt', async () => {
    const applied: ClerkSecurityObservation[] = []
    const response = await handleClerkSecurityWebhookRequest(request('delivery_d1', sensitiveBody()), {
      issuer,
      verify: async () => userDeletedEvent(),
      apply: async (command) => {
        applied.push(command)
        return { kind: 'accepted', status: 'applied', eventRef: 'audit:clerk:deleted' }
      },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      kind: 'accepted',
      status: 'applied',
      eventRef: 'audit:clerk:deleted',
    })
    expect(applied).toHaveLength(1)
    expect(applied[0]).toMatchObject({
      eventType: 'user.deleted',
      securityAction: 'retire_personal_account',
      observedAt: 9_000,
      providerIdentifier: `${issuer}|user_owner_1`,
    })
  })

  it('D2: serialized command contains no sensitive tokens, raw email, or raw svix-id', async () => {
    const applied: ClerkSecurityObservation[] = []
    await handleClerkSecurityWebhookRequest(request('delivery_d2_sensitive', sensitiveBody()), {
      issuer,
      verify: async () => userDeletedEvent({
        data: {
          id: 'user_owner_1',
          deleted: true,
          email_addresses: [{ email_address: 'owner@example.test' }],
        },
      }),
      apply: async (command) => {
        applied.push(command)
        return { kind: 'accepted', status: 'applied' }
      },
    })

    const serialized = JSON.stringify(applied[0])
    expect(serialized).not.toContain('delivery_d2_sensitive')
    expect(serialized).not.toContain('Bearer private-session-token')
    expect(serialized).not.toContain('owner@example.test')
  })

  it('D3: Clerk subject is data.id', async () => {
    const applied: ClerkSecurityObservation[] = []
    await handleClerkSecurityWebhookRequest(request('delivery_d3'), {
      issuer,
      verify: async () => userDeletedEvent({ data: { id: 'user_subject_abc', deleted: true } }),
      apply: async (command) => {
        applied.push(command)
        return { kind: 'accepted', status: 'applied' }
      },
    })

    expect(applied[0]?.providerIdentifier).toBe(`${issuer}|user_subject_abc`)
  })

  it('D4: observedAt comes from envelope timestamp', async () => {
    const applied: ClerkSecurityObservation[] = []
    await handleClerkSecurityWebhookRequest(request('delivery_d4'), {
      issuer,
      verify: async () => userDeletedEvent({ timestamp: 12_345 }),
      apply: async (command) => {
        applied.push(command)
        return { kind: 'accepted', status: 'applied' }
      },
    })

    expect(applied[0]?.observedAt).toBe(12_345)
  })

  it('D5: missing envelope timestamp returns 400 without apply', async () => {
    const apply = vi.fn()
    const response = await handleClerkSecurityWebhookRequest(request('delivery_d5'), {
      issuer,
      verify: async () => userDeletedEvent({ omitTimestamp: true }),
      apply,
    })

    expect(response.status).toBe(400)
    expect(apply).not.toHaveBeenCalled()
  })

  it('D6: deleted !== true returns 400 without apply', async () => {
    const apply = vi.fn()
    const response = await handleClerkSecurityWebhookRequest(request('delivery_d6'), {
      issuer,
      verify: async () => userDeletedEvent({ data: { id: 'user_owner_1', deleted: false } }),
      apply,
    })

    expect(response.status).toBe(400)
    expect(apply).not.toHaveBeenCalled()
  })

  it('D7: missing data.id returns 400 without apply', async () => {
    const apply = vi.fn()
    const response = await handleClerkSecurityWebhookRequest(request('delivery_d7'), {
      issuer,
      verify: async () => userDeletedEvent({ data: { deleted: true } }),
      apply,
    })

    expect(response.status).toBe(400)
    expect(apply).not.toHaveBeenCalled()
  })

  it('D8: user.deleted is recognized and not ignored', async () => {
    const apply = vi.fn(async () => ({ kind: 'accepted' as const, status: 'applied' as const }))
    const response = await handleClerkSecurityWebhookRequest(request('delivery_d8'), {
      issuer,
      verify: async () => userDeletedEvent(),
      apply,
    })

    expect(response.status).toBe(200)
    expect(await response.json()).not.toEqual({ kind: 'accepted', status: 'ignored' })
    expect(apply).toHaveBeenCalledTimes(1)
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

function sensitiveBody(): string {
  return JSON.stringify({
    email: 'owner@example.test',
    token: 'Bearer private-session-token',
  })
}

function userDeletedEvent(input: Readonly<{
  timestamp?: number
  omitTimestamp?: boolean
  data?: Record<string, unknown>
}> = {}): Readonly<{
  type: string
  object: string
  data: unknown
  event_attributes?: unknown
  timestamp?: number
}> {
  const event: {
    type: string
    object: string
    data: unknown
    event_attributes?: unknown
    timestamp?: number
  } = {
    type: 'user.deleted',
    object: 'event',
    data: input.data ?? {
      id: 'user_owner_1',
      deleted: true,
    },
  }
  if (input.omitTimestamp !== true) {
    event.timestamp = input.timestamp ?? 9_000
  }
  return event
}
