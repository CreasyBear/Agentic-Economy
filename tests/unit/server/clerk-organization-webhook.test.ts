import { describe, expect, it, vi } from 'vitest'

import { handleClerkOrganizationWebhookRequest } from '@/lib/server/clerk-organization-webhook'
import type { OrganizationProvisioningCommand } from '@/lib/server/clerk-organization-webhook'
import { handleClerkWebhookRequest } from '@/routes/api.clerk.webhook'
import { verifiedClerkWebhook } from '../../helpers/clerk-webhook'

const issuer = 'https://clerk.example.test'
const CLERK_ORG_ID = 'org_test_clerk_organization_webhook'
const CREATOR_USER_ID = 'user_clerk_organization_creator'

describe('Clerk organization-created webhook', () => {
  it('routes a verified organization.created event to provisioning once with the signed creator', async () => {
    const provision = createProvisionSpy()
    const response = await handleClerkWebhookRequest(request('delivery_organization_created'), {
      issuer,
      verify: async () => organizationCreatedEvent(),
      provision,
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ kind: 'accepted', status: 'created' })
    expect(provision).toHaveBeenCalledTimes(1)
    expect(provision).toHaveBeenCalledWith(expect.objectContaining({
      clerkOrgId: CLERK_ORG_ID,
      displayName: 'Northwind Research',
      creatorTokenIdentifier: `${issuer}|${CREATOR_USER_ID}`,
    }))
    const command = provision.mock.calls[0]?.[0]
    expect(command?.correlationRef).toMatch(/^sha256:[0-9a-f]{64}$/u)
    expect(command?.correlationRef).not.toContain('delivery_organization_created')
  })

  it('returns 503 with Retry-After when the signed creator has not bound an identity', async () => {
    const response = await handleClerkOrganizationWebhookRequest(
      await verifiedClerkWebhook(request('delivery_creator_missing_binding'), async () => organizationCreatedEvent()),
      {
        issuer,
        provision: async () => ({ kind: 'refused', code: 'creator_binding_missing' }),
      },
    )

    expect(response.status).toBe(503)
    expect(response.headers.get('Retry-After')).toBe('5')
  })

  it('returns 409 when created_by is absent', async () => {
    const provision = createProvisionSpy()
    const response = await handleClerkOrganizationWebhookRequest(
      await verifiedClerkWebhook(request('delivery_without_creator'), async () => organizationCreatedEvent({ created_by: undefined })),
      { issuer, provision },
    )

    expect(response.status).toBe(409)
    expect(provision).not.toHaveBeenCalled()
  })

  it('returns 400 without provisioning when signature verification fails', async () => {
    const provision = createProvisionSpy()
    const response = await handleClerkWebhookRequest(request('delivery_bad_signature'), {
      issuer,
      verify: async () => { throw new Error('whsec_private') },
      provision,
    })

    expect(response.status).toBe(400)
    expect(await response.text()).not.toContain('whsec_private')
    expect(provision).not.toHaveBeenCalled()
  })

  it.each([
    'creator_principal_inactive',
    'authority_conflict',
    'clerk_org_id_invalid',
  ] as const)('returns 409 for provisioning refusal %s', async (code) => {
    const response = await handleClerkOrganizationWebhookRequest(
      await verifiedClerkWebhook(request(`delivery_${code}`), async () => organizationCreatedEvent()),
      {
        issuer,
        provision: async () => ({ kind: 'refused', code }),
      },
    )

    expect(response.status).toBe(409)
  })

  it('acknowledges a closed workspace without provisioning it again', async () => {
    const response = await handleClerkOrganizationWebhookRequest(
      await verifiedClerkWebhook(request('delivery_workspace_closed'), async () => organizationCreatedEvent()),
      {
        issuer,
        provision: async () => ({ kind: 'refused', code: 'workspace_closed' }),
      },
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ kind: 'accepted', status: 'ignored' })
  })

  it('returns retryable 503 for unexpected provisioning failures', async () => {
    const response = await handleClerkOrganizationWebhookRequest(
      await verifiedClerkWebhook(request('delivery_provision_unavailable'), async () => organizationCreatedEvent()),
      {
        issuer,
        provision: async () => { throw new Error('unavailable') },
      },
    )

    expect(response.status).toBe(503)
    expect(response.headers.get('Retry-After')).toBe('5')
  })

  it('ignores other event types without provisioning', async () => {
    const provision = createProvisionSpy()
    const response = await handleClerkOrganizationWebhookRequest(
      await verifiedClerkWebhook(request('delivery_other_event'), async () => ({
        type: 'organization.updated',
        object: 'event',
        data: { id: CLERK_ORG_ID, name: 'Northwind Research' },
      })),
      { issuer, provision },
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ kind: 'accepted', status: 'ignored' })
    expect(provision).not.toHaveBeenCalled()
  })
})
function createProvisionSpy() {
  return vi.fn(async (command: OrganizationProvisioningCommand) => ({
    kind: 'created' as const,
    accountRef: `acc_${command.clerkOrgId}`,
    ownershipRef: `ownership:${command.clerkOrgId}`,
    bindingRef: `binding:${command.clerkOrgId}`,
  }))
}


function organizationCreatedEvent(data: Record<string, unknown> = {}) {
  return {
    type: 'organization.created',
    object: 'event',
    data: {
      id: CLERK_ORG_ID,
      name: 'Northwind Research',
      created_by: CREATOR_USER_ID,
      ...data,
    },
  }
}

function request(deliveryRef: string): Request {
  const body = JSON.stringify(organizationCreatedEvent())
  return new Request('https://aecon.example.test/api/clerk/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': String(new TextEncoder().encode(body).byteLength),
      'svix-id': deliveryRef,
      'svix-timestamp': '1000',
      'svix-signature': 'v1,test',
    },
    body,
  })
}
