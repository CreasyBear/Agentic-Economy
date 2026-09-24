import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import type { CanonicalProviderConsequenceTicket } from './call-worker/jitProviderConsequence'

export function providerConsequenceTicketClaimsDigest(
  ticket: CanonicalProviderConsequenceTicket,
): string {
  const { callRef, toolRef, ...historicalTicket } = ticket
  return canonicalDigest({
    kind: 'provider-consequence-ticket-claims:v1',
    ticket: {
      ...historicalTicket,
      invocationRef: callRef,
      operationRef: toolRef,
      grantedScopes: [...historicalTicket.grantedScopes],
      grantedResources: [...historicalTicket.grantedResources],
      secret: { ...historicalTicket.secret },
      ...(historicalTicket.paymentSecret === undefined
        ? {}
        : { paymentSecret: { ...historicalTicket.paymentSecret } }),
    },
  } as StableHashValue)
}
