import { afterEach, expect, it, vi } from 'vitest'

import { setPublicSourceTransportForTests, type ConvexSourceTransport } from '@/lib/server/convex-source'
import { createInteractiveAuthorityBackend } from '../../helpers/interactive-authority-runtime'
import { handleClerkWebhookRequest } from '@/routes/api.clerk.webhook'

const issuer = 'https://clerk.example.test'

afterEach(() => vi.unstubAllEnvs())

it('routes Clerk invitation and membership observations through the webhook router', async () => {
  vi.stubEnv('AE_CONVEX_SERVER_FUNCTION_TOKEN', 'clerk-observation-routing-test-key-material')
  const backend = createInteractiveAuthorityBackend()
  const restore = setPublicSourceTransportForTests({
    query: backend.query as ConvexSourceTransport['query'],
    mutation: backend.mutation as ConvexSourceTransport['mutation'],
    action: backend.action as ConvexSourceTransport['action'],
  })

  try {
    for (const [index, event] of observationEvents().entries()) {
      const response = await handleClerkWebhookRequest(request(`delivery_observation_${index}`), {
        issuer,
        verify: async () => event,
      })
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ kind: 'accepted', status: 'ignored' })
    }
  } finally {
    restore()
  }
})

it('verifies exactly once before dispatching an observation handler', async () => {
  const verify = vi.fn(async () => membershipCreatedEvent())
  const apply = vi.fn(async () => ({ kind: 'accepted' as const, status: 'applied' as const }))

  const response = await handleClerkWebhookRequest(request('delivery_verify_once'), {
    issuer,
    verify,
    apply,
  })

  expect(response.status).toBe(200)
  expect(verify).toHaveBeenCalledTimes(1)
  expect(apply).toHaveBeenCalledTimes(1)
})

it.each([
  ['organization', organizationCreatedEvent(), { provision: async () => { throw new Error('provision unavailable') } }],
  ['membership', membershipCreatedEvent(), { apply: async () => { throw new Error('membership unavailable') } }],
  ['invitation', invitationCreatedEvent(), { apply: async () => { throw new Error('invitation unavailable') } }],
] as const)('returns 503 when the %s handler dependency throws', async (_name, event, dependencies) => {
  const response = await handleClerkWebhookRequest(request(`delivery_throw_${_name}`), {
    issuer,
    verify: async () => event,
    ...dependencies,
  })

  expect(response.status).toBe(503)
  expect(response.headers.get('Retry-After')).toBe('5')
})

it('sends an event type not owned by an organization handler to the security handler', async () => {
  const apply = vi.fn(async () => ({
    kind: 'accepted' as const,
    status: 'applied' as const,
    eventRef: 'security-observation:session-created',
  }))
  const response = await handleClerkWebhookRequest(request('delivery_security_fallback'), {
    issuer,
    verify: async () => sessionCreatedEvent(),
    apply,
  })

  expect(response.status).toBe(200)
  expect(apply).toHaveBeenCalledTimes(1)
  expect(apply).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'session.created' }))
})

it('rejects an invalid signature without invoking any observation handler', async () => {
  const provision = vi.fn()
  const apply = vi.fn()
  const applyRevoked = vi.fn()
  const verify = vi.fn(async () => { throw new Error('invalid signature') })

  const response = await handleClerkWebhookRequest(request('delivery_bad_signature'), {
    issuer,
    verify,
    provision,
    apply,
    applyRevoked,
  })

  expect(response.status).toBe(400)
  expect(verify).toHaveBeenCalledTimes(1)
  expect(provision).not.toHaveBeenCalled()
  expect(apply).not.toHaveBeenCalled()
  expect(applyRevoked).not.toHaveBeenCalled()
})

function request(deliveryRef: string): Request {
  const body = '{}'
  return new Request('https://aecon.example.test/api/clerk/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': String(new TextEncoder().encode(body).byteLength),
      'svix-id': deliveryRef,
    },
    body,
  })
}

function observationEvents() {
  return [
    invitationCreatedEvent(),
    { ...invitationCreatedEvent(), type: 'organizationInvitation.revoked', data: { ...invitationCreatedEvent().data, status: 'revoked' } },
    membershipCreatedEvent(),
    { ...membershipCreatedEvent(), type: 'organizationMembership.updated', data: { ...membershipCreatedEvent().data, updated_at: 2_000 } },
    { ...membershipCreatedEvent(), type: 'organizationMembership.deleted', data: { ...membershipCreatedEvent().data, updated_at: 2_000 } },
  ]
}

function organizationCreatedEvent() {
  return {
    type: 'organization.created',
    object: 'event',
    data: { id: 'org_observation_routing', name: 'Observation Test Business', created_by: 'user_owner_observation' },
  }
}

function membershipCreatedEvent() {
  return {
    type: 'organizationMembership.created',
    object: 'event',
    data: {
      id: 'orgmem_observation_routing',
      organization: { id: 'org_unknown_observation_routing', created_at: 1 },
      public_user_data: { user_id: 'user_observation_routing' },
      role: 'org:member',
      created_at: 1,
    },
  }
}

function invitationCreatedEvent() {
  return {
    type: 'organizationInvitation.created',
    object: 'event',
    data: {
      id: 'orginv_observation_routing',
      organization_id: 'org_unknown_observation_routing',
      email_address: 'invitee@example.test',
      role: 'org:member',
      status: 'pending',
      created_at: 1,
      updated_at: 1,
    },
  }
}

function sessionCreatedEvent() {
  return {
    type: 'session.created',
    object: 'event',
    data: {
      id: 'session_observation_routing',
      user_id: 'user_observation_routing',
      created_at: 1_000,
      updated_at: 1_000,
    },
  }
}
