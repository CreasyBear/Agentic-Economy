import { createFileRoute } from '@tanstack/react-router'
import { verifyWebhook } from '@clerk/tanstack-react-start/webhooks'

import { handleClerkOrganizationInvitationWebhookRequest } from '@/lib/server/clerk-organization-invitation-webhook'
import { handleClerkOrganizationMembershipWebhookRequest } from '@/lib/server/clerk-organization-membership-webhook'
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

export async function handleClerkWebhookRequest(
  request: Request,
  dependencies: Parameters<typeof handleClerkSecurityWebhookRequest>[1] &
    Parameters<typeof handleClerkOrganizationInvitationWebhookRequest>[1] &
    Parameters<typeof handleClerkOrganizationMembershipWebhookRequest>[1] = {},
): Promise<Response> {
  try {
    const verified = await (dependencies.verify ?? verifyWebhook)(request.clone())
    if (isRecord(verified) && typeof verified.type === 'string') {
      if (verified.type.startsWith('organizationMembership.')) {
        return await handleClerkOrganizationMembershipWebhookRequest(request, dependencies)
      }
      if (verified.type.startsWith('organizationInvitation.')) {
        return await handleClerkOrganizationInvitationWebhookRequest(request, dependencies)
      }
    }
  } catch (cause) {
    void cause
    // Route through the security handler so verification failures share one response shape.
  }
  return await handleClerkSecurityWebhookRequest(request, dependencies)
}
