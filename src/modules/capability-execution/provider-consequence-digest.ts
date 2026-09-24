import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
export type CanonicalProviderConsequenceTicket = Readonly<{
  version: 'provider-consequence:v1'
  ticketRef: string
  effectRef: string
  requestDigest: string
  invocationDigest: string
  issuedAt: number
  expiresAt: number
  callRef: string
  toolRef: string
  leaseRef: string
  connectionRef: string
  authorityGeneration: number
  providerRef: string
  adapterId: string
  authorityDigest: string
  grantedScopes: readonly string[]
  grantedResources: readonly string[]
  readinessValidUntil: number
  readinessDigest?: string
  owningAccountRef: string
  activeAccountRef: string
  actorPrincipalRef: string
  grantRef: string
  grantGeneration: number
  secret: Readonly<{
    secretRef: string
    activeGeneration: string
    pointerRevision: number
  }>
  /** Distinct platform-scoped payer credential for provider-direct x402. */
  paymentSecret?: Readonly<{
    secretRef: string
    activeGeneration: string
    pointerRevision: number
  }>
}>

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
