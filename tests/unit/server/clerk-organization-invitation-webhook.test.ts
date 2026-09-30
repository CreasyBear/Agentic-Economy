import { describe, expect, it, vi } from 'vitest'

import { handleClerkOrganizationInvitationWebhookRequest } from '@/lib/server/clerk-organization-invitation-webhook'
import type { OrganizationInvitationCreatedObservation } from '@/modules/workspace-invitation/organization-invitation-observation'
import { handleClerkWebhookRequest } from '@/routes/api.clerk.webhook'
import { verifiedClerkWebhook } from '../../helpers/clerk-webhook'

type OrganizationInvitationRevokedObservation = OrganizationInvitationCreatedObservation
type OrganizationInvitationObservationResult = Readonly<
  | { kind: 'accepted'; status: 'applied' | 'replayed' | 'ignored' }
  | { kind: 'refused'; code: 'authority_conflict' }
>

type InvitationWebhookDependencies = Parameters<
  typeof handleClerkOrganizationInvitationWebhookRequest
>[1] & Readonly<{
  applyRevoked?: (
    command: OrganizationInvitationRevokedObservation,
  ) => Promise<OrganizationInvitationObservationResult>
}>

const issuer = 'https://clerk.example.test'
const CLERK_ORG_ID = 'org_test_clerk_invitation_webhook'
const INVITATION_ID = 'orginv_clerk_sensitive_alpha'
const INVITEE_EMAIL = 'invitee@example.test'
const SENSITIVE_DELIVERY_REF = 'delivery_sensitive_svix_ref_01'

describe('Clerk organization invitation webhook (W-16)', () => {
  describe('handleClerkOrganizationInvitationWebhookRequest', () => {
    it('H1: verified organizationInvitation.created applies one redacted command', async () => {
      const applied: OrganizationInvitationCreatedObservation[] = []
      const incoming = request(SENSITIVE_DELIVERY_REF, sensitiveBody())
      const webhook = await verifiedClerkWebhook(incoming, async (verifiedRequest) => {
        expect(verifiedRequest).toBe(incoming)
        expect(await verifiedRequest.text()).toBe(sensitiveBody())
        expect(verifiedRequest.headers.get('svix-id')).toBe(SENSITIVE_DELIVERY_REF)
        return invitationCreatedEvent()
      })
      const response = await handleClerkOrganizationInvitationWebhookRequest(webhook, {
        apply: async (command) => {
          applied.push(command)
          return { kind: 'accepted', status: 'applied' }
        },
      })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ kind: 'accepted', status: 'applied' })
      expect(applied).toHaveLength(1)
      expect(applied[0]).toMatchObject({
        clerkOrgId: CLERK_ORG_ID,
        role: 'org:admin',
        observedAt: 3_000,
      })
    })

    it('H2: command hashes match sha256 digest pattern', async () => {
      const applied: OrganizationInvitationCreatedObservation[] = []
      await handleClerkOrganizationInvitationWebhookRequest(
        await verifiedClerkWebhook(request('delivery_h2'), async () => invitationCreatedEvent()),
        {
          apply: async (command) => {
            applied.push(command)
            return { kind: 'accepted', status: 'applied' }
          },
        },
      )

      expect(applied[0]?.deliveryRefHash).toMatch(/^sha256:[0-9a-f]{64}$/u)
      expect(applied[0]?.invitationRefHash).toMatch(/^sha256:[0-9a-f]{64}$/u)
      expect(applied[0]?.emailHash).toMatch(/^sha256:[0-9a-f]{64}$/u)
    })

    it('H3: serialized command contains no sensitive invitation material', async () => {
      const applied: OrganizationInvitationCreatedObservation[] = []
      await handleClerkOrganizationInvitationWebhookRequest(
        await verifiedClerkWebhook(request(SENSITIVE_DELIVERY_REF, sensitiveBody()), async () => invitationCreatedEvent()),
        {
          apply: async (command) => {
            applied.push(command)
            return { kind: 'accepted', status: 'applied' }
          },
        },
      )
      const serialized = JSON.stringify(applied[0])
      expect(serialized).not.toContain(INVITEE_EMAIL)
      expect(serialized).not.toContain(SENSITIVE_DELIVERY_REF)
      expect(serialized).not.toContain(INVITATION_ID)
      expect(serialized).not.toContain('accept-invitation')
      expect(serialized).not.toContain('token=')
      expect(serialized).not.toContain('private_metadata')
      expect(serialized).not.toContain('198.51.100.42')
      expect(serialized).not.toContain('Mozilla/Secret')
    })

    it('H4: same invitation id yields stable invitationRefHash and different emails yield different emailHash', async () => {
      const commands: OrganizationInvitationCreatedObservation[] = []
      for (const [index, email] of [
        'first@example.test',
        'second@example.test',
      ].entries()) {
        const response = await handleClerkOrganizationInvitationWebhookRequest(
          await verifiedClerkWebhook(request(`delivery_h4_${index}`), async () => invitationCreatedEvent({
            data: { email_address: email },
          })),
          {
            apply: async (command) => {
              commands.push(command)
              return { kind: 'accepted', status: 'applied' }
            },
          },
        )
        expect(response.status).toBe(200)
      }

      expect(new Set(commands.map((command) => command.invitationRefHash)).size).toBe(1)
      expect(new Set(commands.map((command) => command.emailHash)).size).toBe(2)
    })

    it('H5: email casing and whitespace normalize to the same emailHash', async () => {
      const commands: OrganizationInvitationCreatedObservation[] = []
      for (const [index, email] of [
        '  Invitee@Example.TEST  ',
        'invitee@example.test',
        'INVITEE@EXAMPLE.TEST',
      ].entries()) {
        const response = await handleClerkOrganizationInvitationWebhookRequest(
          await verifiedClerkWebhook(request(`delivery_h5_${index}`), async () => invitationCreatedEvent({
            data: { email_address: email },
          })),
          {
            apply: async (command) => {
              commands.push(command)
              return { kind: 'accepted', status: 'applied' }
            },
          },
        )
        expect(response.status).toBe(200)
      }

      expect(new Set(commands.map((command) => command.emailHash)).size).toBe(1)
    })

    it('H6: invalid role returns 400 problem', async () => {
      const apply = vi.fn()
      const response = await handleClerkOrganizationInvitationWebhookRequest(
        await verifiedClerkWebhook(request('delivery_h6'), async () => invitationCreatedEvent({
          data: { role: 'org:custom_role' },
        })),
        { apply },
      )

      expect(response.status).toBe(400)
      expect(apply).not.toHaveBeenCalled()
    })

    it.each([
      ['missing', null],
      ['empty', ''],
      ['too long', 'x'.repeat(301)],
    ] as const)('H7: invalid svix-id (%s) returns 400 problem', async (_label, svixId) => {
      const apply = vi.fn()
      const response = await handleClerkOrganizationInvitationWebhookRequest(
        await verifiedClerkWebhook(request('delivery_h7', '{}', svixId), async () => invitationCreatedEvent()),
        { apply },
      )

      expect(response.status).toBe(400)
      expect(apply).not.toHaveBeenCalled()
    })

    it.each([
      ['id', { id: undefined }],
      ['organization_id', { organization_id: undefined }],
      ['email_address', { email_address: undefined }],
      ['created_at', { created_at: undefined }],
    ] as const)('H8: missing %s returns 400 problem', async (_field, patch) => {
      const apply = vi.fn()
      const response = await handleClerkOrganizationInvitationWebhookRequest(
        await verifiedClerkWebhook(request('delivery_h8'), async () => invitationCreatedEvent({
          data: patch,
        })),
        { apply },
      )

      expect(response.status).toBe(400)
      expect(apply).not.toHaveBeenCalled()
    })

    it('H9: non-pending status returns 400 problem', async () => {
      const apply = vi.fn()
      const response = await handleClerkOrganizationInvitationWebhookRequest(
        await verifiedClerkWebhook(request('delivery_h9'), async () => invitationCreatedEvent({
          data: { status: 'accepted' },
        })),
        { apply },
      )
      expect(response.status).toBe(400)
      expect(apply).not.toHaveBeenCalled()
    })


    it('H12: organizationInvitation.accepted returns ignored without applying', async () => {
      const apply = vi.fn()
      const response = await handleClerkOrganizationInvitationWebhookRequest(
        await verifiedClerkWebhook(request('delivery_h12_accepted'), async () => ({
          type: 'organizationInvitation.accepted',
          object: 'event',
          data: invitationCreatedEvent().data,
        })),
        { apply },
      )

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ kind: 'accepted', status: 'ignored' })
      expect(apply).not.toHaveBeenCalled()
    })

    it('H15: organizationInvitation.revoked with status revoked calls applyRevoked', async () => {
      const applied: OrganizationInvitationRevokedObservation[] = []
      const incoming = request(SENSITIVE_DELIVERY_REF, sensitiveBody())
      const webhook = await verifiedClerkWebhook(incoming, async (verifiedRequest) => {
        expect(verifiedRequest).toBe(incoming)
        expect(await verifiedRequest.text()).toBe(sensitiveBody())
        expect(verifiedRequest.headers.get('svix-id')).toBe(SENSITIVE_DELIVERY_REF)
        return invitationRevokedEvent({ data: { updated_at: 4_500 } })
      })
      const response = await handleClerkOrganizationInvitationWebhookRequest(webhook, {
        applyRevoked: async (command) => {
          applied.push(command)
          return { kind: 'accepted', status: 'applied' }
        },
      } satisfies InvitationWebhookDependencies)

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ kind: 'accepted', status: 'applied' })
      expect(applied).toHaveLength(1)
      expect(applied[0]).toMatchObject({
        clerkOrgId: CLERK_ORG_ID,
        role: 'org:admin',
        observedAt: 4_500,
      })
    })

    it('H16: serialized revoked command contains no sensitive invitation material', async () => {
      const applied: OrganizationInvitationRevokedObservation[] = []
      await handleClerkOrganizationInvitationWebhookRequest(
        await verifiedClerkWebhook(request(SENSITIVE_DELIVERY_REF, sensitiveBody()), async () => invitationRevokedEvent()),
        {
          applyRevoked: async (command) => {
            applied.push(command)
            return { kind: 'accepted', status: 'applied' }
          },
        } satisfies InvitationWebhookDependencies,
      )

      const serialized = JSON.stringify(applied[0])
      expect(serialized).not.toContain(INVITEE_EMAIL)
      expect(serialized).not.toContain(SENSITIVE_DELIVERY_REF)
      expect(serialized).not.toContain(INVITATION_ID)
      expect(serialized).not.toContain('orginv_')
      expect(serialized).not.toContain('accept-invitation')
      expect(serialized).not.toContain('token=')
      expect(serialized).not.toContain('private_metadata')
      expect(serialized).not.toContain('http')
    })

    it('H17: revoked invitation with non-revoked status returns 400 without calling applier', async () => {
      const applyRevoked = vi.fn()
      const response = await handleClerkOrganizationInvitationWebhookRequest(
        await verifiedClerkWebhook(request('delivery_h17'), async () => invitationRevokedEvent({ data: { status: 'pending' } })),
        { applyRevoked } satisfies InvitationWebhookDependencies,
      )

      expect(response.status).toBe(400)
      expect(applyRevoked).not.toHaveBeenCalled()
    })

    it('H18: revoked invitation missing updated_at returns 400 without calling applier', async () => {
      const applyRevoked = vi.fn()
      const response = await handleClerkOrganizationInvitationWebhookRequest(
        await verifiedClerkWebhook(request('delivery_h18'), async () => invitationRevokedEvent({ data: { updated_at: undefined } })),
        { applyRevoked } satisfies InvitationWebhookDependencies,
      )

      expect(response.status).toBe(400)
      expect(applyRevoked).not.toHaveBeenCalled()
    })

    it('H14: applier failure returns 503 with Retry-After and no cause leak', async () => {
      const response = await handleClerkOrganizationInvitationWebhookRequest(
        await verifiedClerkWebhook(request('delivery_h14'), async () => invitationCreatedEvent()),
        { apply: async () => { throw new Error('private persistence failure') } },
      )

      expect(response.status).toBe(503)
      expect(response.headers.get('Retry-After')).toBe('5')
      expect(await response.text()).not.toContain('private persistence failure')
    })
  })

  describe('handleClerkWebhookRequest', () => {
    it.each(['session.removed', 'organization.updated'] as const)(
      'H13: verified unsupported %s returns ignored without applying invitation command',
      async (type) => {
        const apply = vi.fn()
        const response = await handleClerkWebhookRequest(
          request(`delivery_h13_${type}`),
          {
            issuer,
            verify: async () => ({ type, object: 'event', data: {} }),
            apply,
          },
        )

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ kind: 'accepted', status: 'ignored' })
        expect(apply).not.toHaveBeenCalled()
      },
    )
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
    email: INVITEE_EMAIL,
    token: 'Bearer private-invitation-token',
  })
}

function invitationCreatedEvent(overrides: Readonly<{
  data?: Record<string, unknown>
}> = {}) {
  return {
    type: 'organizationInvitation.created',
    object: 'event',
    data: {
      id: INVITATION_ID,
      organization_id: CLERK_ORG_ID,
      email_address: INVITEE_EMAIL,
      role: 'org:admin',
      status: 'pending',
      created_at: 3_000,
      updated_at: 3_000,
      url: 'https://accounts.example.test/accept-invitation?token=super_secret_token_value',
      private_metadata: { internal: 'secret' },
      ...overrides.data,
    },
    event_attributes: {
      http_request: { client_ip: '198.51.100.42', user_agent: 'Mozilla/Secret' },
    },
  }
}

function invitationRevokedEvent(overrides: Readonly<{
  data?: Record<string, unknown>
}> = {}) {
  const created = invitationCreatedEvent({
    data: {
      status: 'revoked',
      updated_at: 3_000,
      ...overrides.data,
    },
  })
  return {
    ...created,
    type: 'organizationInvitation.revoked',
  }
}
