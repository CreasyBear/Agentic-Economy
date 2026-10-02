import { describe, expect, it, vi } from 'vitest'
import { verifiedClerkWebhook } from '../../helpers/clerk-webhook'

import { handleClerkOrganizationMembershipWebhookRequest } from '@/lib/server/clerk-organization-membership-webhook'
import type {
  OrganizationMembershipCreatedObservation,
  OrganizationMembershipCreatedObservationResult,
} from '@/modules/workspace-membership/organization-membership-observation'

type OrganizationMembershipUpdatedObservation = OrganizationMembershipCreatedObservation
type OrganizationMembershipUpdatedObservationResult = OrganizationMembershipCreatedObservationResult
type OrganizationMembershipDeletedObservation = OrganizationMembershipCreatedObservation
type OrganizationMembershipObservationResult = OrganizationMembershipCreatedObservationResult

type MembershipWebhookDependencies = Parameters<
  typeof handleClerkOrganizationMembershipWebhookRequest
>[1] & Readonly<{
  applyUpdated?: (
    command: OrganizationMembershipUpdatedObservation,
  ) => Promise<OrganizationMembershipUpdatedObservationResult>
  applyDeleted?: (
    command: OrganizationMembershipDeletedObservation,
  ) => Promise<OrganizationMembershipObservationResult>
}>
import { handleClerkWebhookRequest } from '@/routes/api.clerk.webhook'

const issuer = 'https://clerk.example.test'
const CLERK_ORG_ID = 'org_test_clerk_membership_webhook'
const MEMBERSHIP_ID = 'orgmem_clerk_sensitive_alpha'
const MEMBERSHIP_ID_BETA = 'orgmem_clerk_sensitive_beta'
const INVITEE_USER_ID = 'user_invitee_webhook_01'
const SENSITIVE_DELIVERY_REF = 'delivery_sensitive_svix_membership_01'

describe('Clerk organization membership webhook (W-17)', () => {
  describe('handleClerkOrganizationMembershipWebhookRequest', () => {
    it('H1: verified organizationMembership.created applies one redacted command', async () => {
      const applied: OrganizationMembershipCreatedObservation[] = []
      const incoming = request(SENSITIVE_DELIVERY_REF, sensitiveBody())
      const response = await handleClerkOrganizationMembershipWebhookRequest(await verifiedClerkWebhook(incoming, async (verifiedRequest) => {
        expect(await verifiedRequest.text()).toBe(sensitiveBody())
        expect(verifiedRequest.headers.get('svix-id')).toBe(SENSITIVE_DELIVERY_REF)
        return membershipCreatedEvent()
      }), { issuer, apply: async (command) => {
        applied.push(command)
        return { kind: 'accepted', status: 'applied' }
      }, })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ kind: 'accepted', status: 'applied' })
      expect(applied).toHaveLength(1)
      expect(applied[0]).toMatchObject({
        clerkOrgId: CLERK_ORG_ID,
        providerIdentifier: `${issuer}|${INVITEE_USER_ID}`,
        role: 'org:admin',
        observedAt: 3_000,
      })
    })

    it('H2: command hashes match sha256 digest pattern', async () => {
      const applied: OrganizationMembershipCreatedObservation[] = []
      await handleClerkOrganizationMembershipWebhookRequest(await verifiedClerkWebhook(request('delivery_h2'), async () => membershipCreatedEvent()), { issuer, apply: async (command) => {
        applied.push(command)
        return { kind: 'accepted', status: 'applied' }
      }, })

      expect(applied[0]?.deliveryRefHash).toMatch(/^sha256:[0-9a-f]{64}$/u)
      expect(applied[0]?.membershipRefHash).toMatch(/^sha256:[0-9a-f]{64}$/u)
    })

    it('H3: serialized command contains no sensitive membership material', async () => {
      const applied: OrganizationMembershipCreatedObservation[] = []
      await handleClerkOrganizationMembershipWebhookRequest(await verifiedClerkWebhook(request(SENSITIVE_DELIVERY_REF, sensitiveBody()), async () => membershipCreatedEvent()), { issuer, apply: async (command) => {
        applied.push(command)
        return { kind: 'accepted', status: 'applied' }
      }, })

      const serialized = JSON.stringify(applied[0])
      expect(serialized).not.toContain('invitee@example.test')
      expect(serialized).not.toContain(SENSITIVE_DELIVERY_REF)
      expect(serialized).not.toContain(MEMBERSHIP_ID)
      expect(serialized).not.toContain('Secret')
      expect(serialized).not.toContain('Invitee')
      expect(serialized).not.toContain('avatar.png')
      expect(serialized).not.toContain('private_metadata')
      expect(serialized).not.toContain('198.51.100.42')
      expect(serialized).not.toContain('Mozilla/Secret')
    })

    it('H4: same orgmem id yields stable membershipRefHash and different ids yield different hashes', async () => {
      const commands: OrganizationMembershipCreatedObservation[] = []
      for (const [index, id] of [
        MEMBERSHIP_ID,
        MEMBERSHIP_ID_BETA,
      ].entries()) {
        const response = await handleClerkOrganizationMembershipWebhookRequest(await verifiedClerkWebhook(request(`delivery_h4_${index}`), async () => membershipCreatedEvent({ data: { id } })), { issuer, apply: async (command) => {
          commands.push(command)
          return { kind: 'accepted', status: 'applied' }
        }, })
        expect(response.status).toBe(200)
      }

      expect(new Set(commands.map((command) => command.membershipRefHash)).size).toBe(2)
      const sameIdCommands: OrganizationMembershipCreatedObservation[] = []
      for (const index of [0, 1]) {
        await handleClerkOrganizationMembershipWebhookRequest(await verifiedClerkWebhook(request(`delivery_h4_same_${index}`), async () => membershipCreatedEvent({ data: { id: MEMBERSHIP_ID } })), { issuer, apply: async (command) => {
          sameIdCommands.push(command)
          return { kind: 'accepted', status: 'applied' }
        }, })
      }
      expect(new Set(sameIdCommands.map((command) => command.membershipRefHash)).size).toBe(1)
    })

    it('H5: providerIdentifier equals issuer pipe user_id never raw user_id alone', async () => {
      const applied: OrganizationMembershipCreatedObservation[] = []
      await handleClerkOrganizationMembershipWebhookRequest(await verifiedClerkWebhook(request('delivery_h5'), async () => membershipCreatedEvent()), { issuer, apply: async (command) => {
        applied.push(command)
        return { kind: 'accepted', status: 'applied' }
      }, })

      expect(applied[0]?.providerIdentifier).toBe(`${issuer}|${INVITEE_USER_ID}`)
      expect(applied[0]?.providerIdentifier).not.toBe(INVITEE_USER_ID)
    })

    it('H6: invalid role returns 400 problem', async () => {
      const apply = vi.fn()
      const response = await handleClerkOrganizationMembershipWebhookRequest(await verifiedClerkWebhook(request('delivery_h6'), async () => membershipCreatedEvent({
        data: { role: 'org:custom_role' },
      })), { issuer, apply, })

      expect(response.status).toBe(400)
      expect(apply).not.toHaveBeenCalled()
    })


    it.each([
      ['id', { id: undefined }],
      ['organization.id', { organization: { id: undefined } }],
      ['public_user_data.user_id', { public_user_data: { user_id: undefined } }],
      ['created_at', { created_at: undefined }],
    ] as const)('H8: missing %s returns 400 problem', async (_field, patch) => {
      const apply = vi.fn()
      const response = await handleClerkOrganizationMembershipWebhookRequest(await verifiedClerkWebhook(request('delivery_h8'), async () => membershipCreatedEvent({
        data: patch,
      })), { issuer, apply, })

      expect(response.status).toBe(400)
      expect(apply).not.toHaveBeenCalled()
    })

    it.each([
      ['id', { id: 'bad_membership_ref' }],
      ['organization.id', { organization: { id: 'bad_org_ref' } }],
      ['public_user_data.user_id', { public_user_data: { user_id: 'bad_user_ref' } }],
    ] as const)('H9: invalid %s prefix returns 400 problem', async (_field, patch) => {
      const apply = vi.fn()
      const response = await handleClerkOrganizationMembershipWebhookRequest(await verifiedClerkWebhook(request('delivery_h9'), async () => membershipCreatedEvent({
        data: patch,
      })), { issuer, apply, })

      expect(response.status).toBe(400)
      expect(apply).not.toHaveBeenCalled()
    })



    it('H12: verified organizationMembership.deleted applies one redacted command via applyDeleted', async () => {
      const applied: OrganizationMembershipDeletedObservation[] = []
      const incoming = request(SENSITIVE_DELIVERY_REF, sensitiveBody())
      const response = await handleClerkOrganizationMembershipWebhookRequest(await verifiedClerkWebhook(incoming, async (verifiedRequest) => {
        expect(await verifiedRequest.text()).toBe(sensitiveBody())
        expect(verifiedRequest.headers.get('svix-id')).toBe(SENSITIVE_DELIVERY_REF)
        return membershipDeletedEvent({ data: { updated_at: 4_500 } })
      }), { issuer, applyDeleted: async (command) => {
        applied.push(command)
        return { kind: 'accepted', status: 'applied' }
      }, } satisfies MembershipWebhookDependencies)

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ kind: 'accepted', status: 'applied' })
      expect(applied).toHaveLength(1)
      expect(applied[0]).toMatchObject({
        clerkOrgId: CLERK_ORG_ID,
        providerIdentifier: `${issuer}|${INVITEE_USER_ID}`,
        role: 'org:admin',
        observedAt: 4_500,
      })
    })

    it('H14: applier failure returns 503 with Retry-After and no cause leak', async () => {
      const response = await handleClerkOrganizationMembershipWebhookRequest(await verifiedClerkWebhook(request('delivery_h14'), async () => membershipCreatedEvent()), { issuer, apply: async () => { throw new Error('private persistence failure') }, })

      expect(response.status).toBe(503)
      expect(response.headers.get('Retry-After')).toBe('5')
      expect(await response.text()).not.toContain('private persistence failure')
    })

    it('H15: missing identity binding refusal returns 503 with Retry-After', async () => {
      const response = await handleClerkOrganizationMembershipWebhookRequest(await verifiedClerkWebhook(request('delivery_h15'), async () => membershipCreatedEvent()), { issuer, apply: async () => ({ kind: 'refused', code: 'identity_binding_missing' }), })

      expect(response.status).toBe(503)
      expect(response.headers.get('Retry-After')).toBe('5')
    })
    it('H29: unbound membership for a newly created organization returns 503 with Retry-After 60', async () => {
      const now = Date.UTC(2026, 8, 30, 12)
      vi.useFakeTimers()
      vi.setSystemTime(now)
      try {
        const webhook = await verifiedClerkWebhook(request('delivery_h29'), async () =>
          membershipCreatedEvent({
            data: { organization: { created_at: now - 60 * 60 * 1000 } },
          }),
        )
        const response = await handleClerkOrganizationMembershipWebhookRequest(webhook, {
          issuer,
          apply: async () => ({ kind: 'refused', code: 'organization_unbound' }),
        })

        expect(response.status).toBe(503)
        expect(response.headers.get('Retry-After')).toBe('60')
      } finally {
        vi.useRealTimers()
      }
    })

    it('H30: unbound membership for an old organization is acknowledged as ignored', async () => {
      const now = Date.UTC(2026, 8, 30, 12)
      vi.useFakeTimers()
      vi.setSystemTime(now)
      try {
        const webhook = await verifiedClerkWebhook(request('delivery_h30'), async () =>
          membershipCreatedEvent({
            data: { organization: { created_at: now - 7 * 60 * 60 * 1000 } },
          }),
        )
        const response = await handleClerkOrganizationMembershipWebhookRequest(webhook, {
          issuer,
          apply: async () => ({ kind: 'refused', code: 'organization_unbound' }),
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({ status: 'ignored' })
      } finally {
        vi.useRealTimers()
      }
    })

    it('H31: an unbound organization event is applied after the dependency accepts it', async () => {
      const now = Date.UTC(2026, 8, 30, 12)
      vi.useFakeTimers()
      vi.setSystemTime(now)
      try {
        const webhook = await verifiedClerkWebhook(request('delivery_h31'), async () =>
          membershipCreatedEvent({
            data: { organization: { created_at: now - 60 * 60 * 1000 } },
          }),
        )
        const apply = vi.fn()
          .mockResolvedValueOnce({ kind: 'refused', code: 'organization_unbound' })
          .mockResolvedValueOnce({ kind: 'accepted', status: 'applied' })

        const firstResponse = await handleClerkOrganizationMembershipWebhookRequest(webhook, { issuer, apply })
        expect(firstResponse.status).toBe(503)
        expect(firstResponse.headers.get('Retry-After')).toBe('60')

        const retryResponse = await handleClerkOrganizationMembershipWebhookRequest(webhook, { issuer, apply })
        expect(retryResponse.status).toBe(200)
        expect(await retryResponse.json()).toEqual({ kind: 'accepted', status: 'applied' })
        expect(apply).toHaveBeenCalledTimes(2)
      } finally {
        vi.useRealTimers()
      }
    })


    it('H16: verified organizationMembership.updated applies one redacted command', async () => {
      const applied: OrganizationMembershipUpdatedObservation[] = []
      const incoming = request(SENSITIVE_DELIVERY_REF, sensitiveBody())
      const response = await handleClerkOrganizationMembershipWebhookRequest(await verifiedClerkWebhook(incoming, async (verifiedRequest) => {
        expect(await verifiedRequest.text()).toBe(sensitiveBody())
        expect(verifiedRequest.headers.get('svix-id')).toBe(SENSITIVE_DELIVERY_REF)
        return membershipUpdatedEvent({ data: { updated_at: 4_000, role: 'org:admin' } })
      }), { issuer, applyUpdated: async (command) => {
        applied.push(command)
        return { kind: 'accepted', status: 'applied' }
      }, } satisfies MembershipWebhookDependencies)

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ kind: 'accepted', status: 'applied' })
      expect(applied).toHaveLength(1)
      expect(applied[0]).toMatchObject({
        clerkOrgId: CLERK_ORG_ID,
        providerIdentifier: `${issuer}|${INVITEE_USER_ID}`,
        role: 'org:admin',
        observedAt: 4_000,
      })
      expect(applied[0]?.deliveryRefHash).toMatch(/^sha256:[0-9a-f]{64}$/u)
      expect(applied[0]?.membershipRefHash).toMatch(/^sha256:[0-9a-f]{64}$/u)
    })

    it('H17: serialized updated command contains no sensitive membership material', async () => {
      const applied: OrganizationMembershipUpdatedObservation[] = []
      await handleClerkOrganizationMembershipWebhookRequest(await verifiedClerkWebhook(request(SENSITIVE_DELIVERY_REF, sensitiveBody()), async () => membershipUpdatedEvent()), { issuer, applyUpdated: async (command) => {
        applied.push(command)
        return { kind: 'accepted', status: 'applied' }
      }, } satisfies MembershipWebhookDependencies)

      const serialized = JSON.stringify(applied[0])
      expect(serialized).not.toContain('invitee@example.test')
      expect(serialized).not.toContain(SENSITIVE_DELIVERY_REF)
      expect(serialized).not.toContain(MEMBERSHIP_ID)
      expect(serialized).not.toContain('Secret')
      expect(serialized).not.toContain('Invitee')
      expect(serialized).not.toContain('avatar.png')
      expect(serialized).not.toContain('private_metadata')
      expect(serialized).not.toContain('198.51.100.42')
      expect(serialized).not.toContain('Mozilla/Secret')
    })

    it('H18: invalid updated role returns 400 problem', async () => {
      const applyUpdated = vi.fn()
      const response = await handleClerkOrganizationMembershipWebhookRequest(await verifiedClerkWebhook(request('delivery_h18'), async () => membershipUpdatedEvent({
        data: { role: 'org:custom_role' },
      })), { issuer, applyUpdated, } satisfies MembershipWebhookDependencies)

      expect(response.status).toBe(400)
      expect(applyUpdated).not.toHaveBeenCalled()
    })

    it.each([
      ['missing', undefined],
      ['non-integer', 3.5],
      ['negative', -1],
    ] as const)('H19: invalid updated_at (%s) returns 400 problem', async (_label, updatedAt) => {
      const applyUpdated = vi.fn()
      const response = await handleClerkOrganizationMembershipWebhookRequest(await verifiedClerkWebhook(request('delivery_h19'), async () => membershipUpdatedEvent({
        data: { updated_at: updatedAt },
      })), { issuer, applyUpdated, } satisfies MembershipWebhookDependencies)

      expect(response.status).toBe(400)
      expect(applyUpdated).not.toHaveBeenCalled()
    })

    it.each([
      ['id', { id: undefined }],
      ['organization.id', { organization: { id: undefined } }],
      ['public_user_data.user_id', { public_user_data: { user_id: undefined } }],
    ] as const)('H20: missing %s on updated returns 400 problem', async (_field, patch) => {
      const applyUpdated = vi.fn()
      const response = await handleClerkOrganizationMembershipWebhookRequest(await verifiedClerkWebhook(request('delivery_h20'), async () => membershipUpdatedEvent({ data: patch })), { issuer, applyUpdated, } satisfies MembershipWebhookDependencies)

      expect(response.status).toBe(400)
      expect(applyUpdated).not.toHaveBeenCalled()
    })

    it.each([
      ['id', { id: 'bad_membership_ref' }],
      ['organization.id', { organization: { id: 'bad_org_ref' } }],
      ['public_user_data.user_id', { public_user_data: { user_id: 'bad_user_ref' } }],
    ] as const)('H20: invalid %s prefix on updated returns 400 problem', async (_field, patch) => {
      const applyUpdated = vi.fn()
      const response = await handleClerkOrganizationMembershipWebhookRequest(await verifiedClerkWebhook(request('delivery_h20_prefix'), async () => membershipUpdatedEvent({ data: patch })), { issuer, applyUpdated, } satisfies MembershipWebhookDependencies)

      expect(response.status).toBe(400)
      expect(applyUpdated).not.toHaveBeenCalled()
    })

    it('H21: organizationMembership.deleted does not call apply or applyUpdated', async () => {
      const apply = vi.fn()
      const applyUpdated = vi.fn()
      const applyDeleted = vi.fn(async () => ({ kind: 'accepted' as const, status: 'applied' as const }))
      await handleClerkOrganizationMembershipWebhookRequest(await verifiedClerkWebhook(request('delivery_h21'), async () => membershipDeletedEvent()), { issuer, apply,
      applyUpdated,
      applyDeleted, } satisfies MembershipWebhookDependencies)

      expect(apply).not.toHaveBeenCalled()
      expect(applyUpdated).not.toHaveBeenCalled()
      expect(applyDeleted).toHaveBeenCalledTimes(1)
    })

    it('H24: serialized deleted command contains no sensitive membership material', async () => {
      const applied: OrganizationMembershipDeletedObservation[] = []
      await handleClerkOrganizationMembershipWebhookRequest(await verifiedClerkWebhook(request(SENSITIVE_DELIVERY_REF, sensitiveBody()), async () => membershipDeletedEvent()), { issuer, applyDeleted: async (command) => {
        applied.push(command)
        return { kind: 'accepted', status: 'applied' }
      }, } satisfies MembershipWebhookDependencies)

      const serialized = JSON.stringify(applied[0])
      expect(serialized).not.toContain('invitee@example.test')
      expect(serialized).not.toContain(SENSITIVE_DELIVERY_REF)
      expect(serialized).not.toContain(MEMBERSHIP_ID)
      expect(serialized).not.toContain('Secret')
      expect(serialized).not.toContain('Invitee')
      expect(serialized).not.toContain('avatar.png')
      expect(serialized).not.toContain('private_metadata')
      expect(serialized).not.toContain('198.51.100.42')
      expect(serialized).not.toContain('Mozilla/Secret')
    })

    it('H25: deleted command hashes match sha256 digest pattern and providerIdentifier is issuer pipe user_id', async () => {
      const applied: OrganizationMembershipDeletedObservation[] = []
      await handleClerkOrganizationMembershipWebhookRequest(await verifiedClerkWebhook(request('delivery_h25'), async () => membershipDeletedEvent()), { issuer, applyDeleted: async (command) => {
        applied.push(command)
        return { kind: 'accepted', status: 'applied' }
      }, } satisfies MembershipWebhookDependencies)

      expect(applied[0]?.deliveryRefHash).toMatch(/^sha256:[0-9a-f]{64}$/u)
      expect(applied[0]?.membershipRefHash).toMatch(/^sha256:[0-9a-f]{64}$/u)
      expect(applied[0]?.providerIdentifier).toBe(`${issuer}|${INVITEE_USER_ID}`)
      expect(applied[0]?.providerIdentifier).not.toBe(INVITEE_USER_ID)
    })

    it.each([
      ['missing updated_at', { updated_at: undefined }],
      ['non-integer updated_at', { updated_at: 3.5 }],
      ['negative updated_at', { updated_at: -1 }],
      ['bad membership id', { id: 'bad_membership_ref' }],
      ['bad organization id', { organization: { id: 'bad_org_ref' } }],
      ['bad user id', { public_user_data: { user_id: 'bad_user_ref' } }],
    ] as const)('H26: deleted invalid field (%s) returns 400 without calling applier', async (_label, patch) => {
      const applyDeleted = vi.fn()
      const response = await handleClerkOrganizationMembershipWebhookRequest(await verifiedClerkWebhook(request('delivery_h26'), async () => membershipDeletedEvent({ data: patch })), { issuer, applyDeleted, } satisfies MembershipWebhookDependencies)

      expect(response.status).toBe(400)
      expect(applyDeleted).not.toHaveBeenCalled()
    })

    it('H27: identity_binding_missing on deleted returns 503 with Retry-After', async () => {
      const response = await handleClerkOrganizationMembershipWebhookRequest(await verifiedClerkWebhook(request('delivery_h27'), async () => membershipDeletedEvent()), { issuer, applyDeleted: async () => ({ kind: 'refused', code: 'identity_binding_missing' }), } satisfies MembershipWebhookDependencies)

      expect(response.status).toBe(503)
      expect(response.headers.get('Retry-After')).toBe('5')
    })

    it('H28: deleted tombstone without org or user returns 400 without calling applier', async () => {
      const applyDeleted = vi.fn()
      const response = await handleClerkOrganizationMembershipWebhookRequest(await verifiedClerkWebhook(request('delivery_h28'), async () => ({
        type: 'organizationMembership.deleted',
        object: 'event',
        data: {
          id: MEMBERSHIP_ID,
          deleted: true,
        },
      })), { issuer, applyDeleted, } satisfies MembershipWebhookDependencies)

      expect(response.status).toBe(400)
      expect(applyDeleted).not.toHaveBeenCalled()
    })

    it('H23: identity_binding_missing on updated returns 503 with Retry-After', async () => {
      const response = await handleClerkOrganizationMembershipWebhookRequest(await verifiedClerkWebhook(request('delivery_h23'), async () => membershipUpdatedEvent()), { issuer, applyUpdated: async () => ({ kind: 'refused', code: 'identity_binding_missing' }), } satisfies MembershipWebhookDependencies)

      expect(response.status).toBe(503)
      expect(response.headers.get('Retry-After')).toBe('5')
    })
  })

  describe('handleClerkWebhookRequest', () => {
    it('H13: verified organizationMembership.created dispatches to membership handler', async () => {
      const applied: OrganizationMembershipCreatedObservation[] = []
      const response = await handleClerkWebhookRequest(request('delivery_h13_membership'), {
        issuer,
        verify: async () => membershipCreatedEvent(),
        apply: async (command) => {
          applied.push(command as OrganizationMembershipCreatedObservation)
          return { kind: 'accepted', status: 'applied' }
        },
      })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ kind: 'accepted', status: 'applied' })
      expect(applied).toHaveLength(1)
      expect(applied[0]).toMatchObject({
        clerkOrgId: CLERK_ORG_ID,
        providerIdentifier: `${issuer}|${INVITEE_USER_ID}`,
      })
    })

    it('H22: verified organizationMembership.updated dispatches to updated membership applier', async () => {
      const applied: OrganizationMembershipUpdatedObservation[] = []
      const response = await handleClerkWebhookRequest(request('delivery_h22_membership_updated'), {
        issuer,
        verify: async () => membershipUpdatedEvent({ data: { role: 'org:admin', updated_at: 5_000 } }),
        applyUpdated: async (command) => {
          applied.push(command)
          return { kind: 'accepted', status: 'applied' }
        },
      })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ kind: 'accepted', status: 'applied' })
      expect(applied).toHaveLength(1)
      expect(applied[0]).toMatchObject({
        clerkOrgId: CLERK_ORG_ID,
        providerIdentifier: `${issuer}|${INVITEE_USER_ID}`,
        role: 'org:admin',
        observedAt: 5_000,
      })
    })
  })
})

function request(
  deliveryRef: string,
  body = '{}',
  svixId: string | null = deliveryRef,
): Request {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'svix-timestamp': '1000',
    'svix-signature': 'v1,test',
    'content-length': String(new TextEncoder().encode(body).byteLength),
  }
  if (svixId !== null) headers['svix-id'] = svixId
  return new Request('http://localhost/api/clerk/webhook', {
    method: 'POST',
    body,
    headers,
  })
}

function sensitiveBody(): string {
  return JSON.stringify({
    email: 'invitee@example.test',
    token: 'Bearer private-membership-token',
  })
}

function membershipUpdatedEvent(overrides: Readonly<{
  data?: Record<string, unknown>
}> = {}) {
  const created = membershipCreatedEvent(overrides)
  return {
    ...created,
    type: 'organizationMembership.updated',
  }
}

function membershipDeletedEvent(overrides: Readonly<{
  data?: Record<string, unknown>
}> = {}) {
  const updated = membershipUpdatedEvent(overrides)
  return {
    ...updated,
    type: 'organizationMembership.deleted',
  }
}

function membershipCreatedEvent(overrides: Readonly<{
  data?: Record<string, unknown>
}> = {}) {
  const baseData = {
    id: MEMBERSHIP_ID,
    organization: { id: CLERK_ORG_ID, created_at: 3_000 },
    public_user_data: {
      user_id: INVITEE_USER_ID,
      first_name: 'Secret',
      last_name: 'Invitee',
      image_url: 'https://example.test/avatar.png',
      identifier: 'invitee@example.test',
    },
    role: 'org:admin',
    created_at: 3_000,
    updated_at: 3_000,
    private_metadata: { internal: 'secret' },
  }
  const patch = overrides.data ?? {}
  const publicUserData = isRecord(patch.public_user_data)
    ? { ...baseData.public_user_data, ...patch.public_user_data }
    : patch.public_user_data === undefined
      ? baseData.public_user_data
      : patch.public_user_data
  const organization = isRecord(patch.organization)
    ? { ...baseData.organization, ...patch.organization }
    : patch.organization === undefined
      ? baseData.organization
      : patch.organization

  const { public_user_data: _public, organization: _org, ...restPatch } = patch

  return {
    type: 'organizationMembership.created',
    object: 'event',
    data: {
      ...baseData,
      ...restPatch,
      organization,
      public_user_data: publicUserData,
    },
    event_attributes: {
      http_request: { client_ip: '198.51.100.42', user_agent: 'Mozilla/Secret' },
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
