import { canonicalDigest } from '@/modules/common/canonical-digest'

function canonicalUuidHex(material: Readonly<Record<string, string>>): string {
  const digest = canonicalDigest(material as never).slice('sha256:'.length, 'sha256:'.length + 32)
  return `${digest.slice(0, 12)}4${digest.slice(13, 16)}8${digest.slice(17)}`
}

export function issuedAgentGrantRef(ownerSubject: string, issuanceKey: string): string {
  return `grt_${canonicalUuidHex({ format: 'issued-agent-grant:v1', ownerSubject, issuanceKey })}`
}

export function issuedAgentCanonicalRefs(input: Readonly<{
  ownerAccountRef: string
  issuanceKey: string
  credentialId: string
  generation: number
  grantRef: string
}>): Readonly<{
  principalRef: string
  bindingRef: string
  credentialRef: string
  membershipRef: string
  delegationUuid: string
}> {
  const principalHex = canonicalUuidHex({
    format: 'issued-agent-principal:v2',
    ownerAccountRef: input.ownerAccountRef,
    issuanceKey: input.issuanceKey,
  })
  const bindingHex = canonicalUuidHex({
    format: 'issued-agent-binding:v2',
    principalRef: `prn_${principalHex}`,
    credentialId: input.credentialId,
    generation: String(input.generation),
  })
  const credentialHex = canonicalUuidHex({
    format: 'issued-agent-credential:v2',
    principalRef: `prn_${principalHex}`,
    credentialId: input.credentialId,
    generation: String(input.generation),
  })
  const membershipHex = canonicalUuidHex({
    format: 'issued-agent-membership:v2',
    ownerAccountRef: input.ownerAccountRef,
    principalRef: `prn_${principalHex}`,
  })
  const delegationHex = input.grantRef.slice('grt_'.length)
  return {
    principalRef: `prn_${principalHex}`,
    bindingRef: `eib_${bindingHex}`,
    credentialRef: `crd_${credentialHex}`,
    membershipRef: `mem_${membershipHex}`,
    delegationUuid: `${delegationHex.slice(0, 8)}-${delegationHex.slice(8, 12)}-${delegationHex.slice(12, 16)}-${delegationHex.slice(16, 20)}-${delegationHex.slice(20)}`,
  }
}
