import {
  verifyClerkWebhookRequest,
  type ClerkWebhookVerifier,
  type VerifiedClerkWebhook,
} from '@/lib/server/clerk-webhook-core'

/** Verifies a test request through the shared core exactly as the route does, for adapter unit tests. */
export async function verifiedClerkWebhook(
  request: Request,
  verify?: ClerkWebhookVerifier,
): Promise<VerifiedClerkWebhook> {
  const result = await verifyClerkWebhookRequest(request, verify)
  if (result.kind === 'rejected') throw new Error(`test webhook rejected with status ${result.response.status}`)
  return result.webhook
}
