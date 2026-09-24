import type { PublicToolDescriptor } from '@/modules/capability-supply/public'
import { projectToolHealth } from '@/modules/capability-supply/tool-health'

export function projectToolChoiceEvidence(tool: PublicToolDescriptor) {
  const health = projectToolHealth(tool.availability, Date.now())
  const paymentNetwork = tool.payment?.network
  const network = paymentNetwork === 'eip155:8453'
    ? 'mainnet' as const
    : paymentNetwork === 'eip155:84532' || paymentNetwork === 'eip155:11155111'
      ? 'testnet' as const
      : 'unknown' as const
  return {
    ...health,
    verification: health.healthStatus === 'operational' ? 'verified' as const : 'not_verified' as const,
    network,
    claimSource: tool.provenance.publisher === 'provider_owned' ? 'provider' as const : 'listing' as const,
    readiness: health.healthStatus === 'operational' && tool.availability.posture === 'routeable'
      ? 'ready' as const
      : health.healthStatus === 'unverified' ? 'unverified' as const : 'unavailable' as const,
  }
}

export function isProductionToolChoice(tool: PublicToolDescriptor): boolean {
  const evidence = projectToolChoiceEvidence(tool)
  return evidence.network !== 'testnet' && evidence.healthStatus !== 'degraded'
}
