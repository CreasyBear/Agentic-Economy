import { createFileRoute } from '@tanstack/react-router'

import {
  clerkWebhookFailureResponse,
  verifyClerkWebhookRequest,
  type ClerkWebhookVerifier,
  type VerifiedClerkWebhook,
} from '@/lib/server/clerk-webhook-core'
import { handleClerkOrganizationInvitationWebhookRequest } from '@/lib/server/clerk-organization-invitation-webhook'
import { handleClerkOrganizationMembershipWebhookRequest } from '@/lib/server/clerk-organization-membership-webhook'
import { handleClerkOrganizationWebhookRequest } from '@/lib/server/clerk-organization-webhook'
import { handleClerkSecurityWebhookRequest } from '@/lib/server/clerk-security-webhook'
import { methodNotAllowed } from '@/lib/server/method-guard'
import { isRecord } from '@/modules/common/is-record'

export const Route = createFileRoute('/api/clerk/webhook')({
  server: {
    handlers: {
      POST: ({ request }) => handleClerkWebhookRequest(request),
      GET: () => methodNotAllowed(['POST']),
      PUT: () => methodNotAllowed(['POST']),
      PATCH: () => methodNotAllowed(['POST']),
      DELETE: () => methodNotAllowed(['POST']),
      HEAD: () => methodNotAllowed(['POST']),
      OPTIONS: () => methodNotAllowed(['POST']),
      TRACE: () => methodNotAllowed(['POST']),
      CONNECT: () => methodNotAllowed(['POST']),
    },
  },
})

type ClerkWebhookRouteDependencies = Readonly<{ verify?: ClerkWebhookVerifier }>
  & NonNullable<Parameters<typeof handleClerkSecurityWebhookRequest>[1]>
  & NonNullable<Parameters<typeof handleClerkOrganizationInvitationWebhookRequest>[1]>
  & NonNullable<Parameters<typeof handleClerkOrganizationMembershipWebhookRequest>[1]>
  & NonNullable<Parameters<typeof handleClerkOrganizationWebhookRequest>[1]>

export async function handleClerkWebhookRequest(
  request: Request,
  dependencies: ClerkWebhookRouteDependencies = {},
): Promise<Response> {
  const verification = await verifyClerkWebhookRequest(request, dependencies.verify)
  if (verification.kind === 'rejected') return verification.response

  const webhook = verification.webhook
  const eventType = verifiedEventType(webhook)
  if (eventType === 'organization.created') {
    return handleWebhookHandler(
      () => handleClerkOrganizationWebhookRequest(webhook, dependencies),
      'handleClerkOrganizationWebhookRequest',
      'workspace_provisioning_unavailable',
    )
  }
  if (
    eventType === 'organizationMembership.created'
    || eventType === 'organizationMembership.updated'
    || eventType === 'organizationMembership.deleted'
  ) {
    return handleWebhookHandler(
      () => handleClerkOrganizationMembershipWebhookRequest(webhook, dependencies),
      'handleClerkOrganizationMembershipWebhookRequest',
      'workspace_membership_unavailable',
    )
  }
  if (
    eventType === 'organizationInvitation.created'
    || eventType === 'organizationInvitation.revoked'
  ) {
    return handleWebhookHandler(
      () => handleClerkOrganizationInvitationWebhookRequest(webhook, dependencies),
      'handleClerkOrganizationInvitationWebhookRequest',
      'workspace_invitation_unavailable',
    )
  }
  return handleWebhookHandler(
    () => handleClerkSecurityWebhookRequest(webhook, dependencies),
    'handleClerkSecurityWebhookRequest',
    'security_history_unavailable',
  )
}

async function handleWebhookHandler(
  handler: () => Promise<Response>,
  site: string,
  code: string,
): Promise<Response> {
  try {
    return await handler()
  } catch (cause) {
    return clerkWebhookFailureResponse(cause, site, code)
  }
}

function verifiedEventType(webhook: VerifiedClerkWebhook): string | undefined {
  return isRecord(webhook.event) && typeof webhook.event.type === 'string'
    ? webhook.event.type
    : undefined
}
