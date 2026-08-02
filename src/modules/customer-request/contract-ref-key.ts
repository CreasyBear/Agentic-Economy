import type { CapabilityContractRef } from '@/modules/capability-contract/public'

export function exactContractRefKey(ref: CapabilityContractRef): string {
  return `${ref.capabilityId}\u0000${ref.version}\u0000${ref.contractDigest}`
}
