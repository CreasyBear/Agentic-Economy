import type { ConnectAccountEvidence } from './ports'
import type { StripeAccountUpdatedWebhookEvent } from './stripe-webhook'

type Binding = Readonly<{
  businessId: string
  currency: string
  exponent: number
  stripeAccountId: string
  version?: number
  lastStripeEventId?: string
}>

export function connectWebhookCommand(
  binding: Binding,
  event: StripeAccountUpdatedWebhookEvent,
  evidence: ConnectAccountEvidence,
) {
  return {
    businessId: binding.businessId,
    currency: binding.currency,
    exponent: binding.exponent,
    event,
    readback: {
      detailsSubmitted: evidence.detailsSubmitted,
      recipientCapabilityActive: evidence.recipientCapabilityActive,
      restricted: evidence.restricted,
      requirementsDigest: evidence.requirementsDigest,
      providerObjectDigest: evidence.providerObjectDigest,
      ...(evidence.providerObjectVersion === undefined
        ? {}
        : { providerObjectVersion: evidence.providerObjectVersion }),
      observedAt: evidence.observedAt,
    },
    ...(binding.version === undefined ? {} : { expectedVersion: binding.version }),
  }
}

export function connectWebhookAppliedStatus(binding: Binding, event: StripeAccountUpdatedWebhookEvent) {
  return binding.lastStripeEventId === event.stripeEventId ? 'replayed' as const : 'applied' as const
}
