import { canonicalDigest } from '@/modules/common/canonical-digest'

function canonicalUuidHex(material: Readonly<Record<string, string>>): string {
  const digest = canonicalDigest(material as never).slice('sha256:'.length, 'sha256:'.length + 32)
  return `${digest.slice(0, 12)}4${digest.slice(13, 16)}8${digest.slice(17)}`
}

export function issuedAgentGrantRef(ownerSubject: string, issuanceKey: string): string {
  return `grt_${canonicalUuidHex({ format: 'issued-agent-grant:v1', ownerSubject, issuanceKey })}`
}

export function issuedAgentCanonicalRefs(credentialId: string, grantRef: string): Readonly<{
  principalRef: string
  bindingRef: string
  credentialRef: string
  membershipRef: string
  delegationUuid: string
}> {
  const hex = canonicalUuidHex({ format: 'issued-agent-identity:v1', credentialId, grantRef })
  const grantHex = grantRef.slice('grt_'.length)
  return {
    principalRef: `prn_${hex}`,
    bindingRef: `eib_${hex}`,
    credentialRef: `crd_${hex}`,
    membershipRef: `mem_${hex}`,
    delegationUuid: `${grantHex.slice(0, 8)}-${grantHex.slice(8, 12)}-${grantHex.slice(12, 16)}-${grantHex.slice(16, 20)}-${grantHex.slice(20)}`,
  }
}
