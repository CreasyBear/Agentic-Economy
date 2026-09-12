import { formatRelativeTime, formatTimestamp } from '@/lib/ui/format-time'
import { degrade } from '@/lib/observability/degrade'
import type { OwnerProviderConnection } from '@/modules/capability-supply/supply-funnel.functions'
import type { OwnerToolsX402ConnectionIntent } from '@/lib/operator/supply-compatibility'

export type X402HandoffIdentity = Readonly<{
  draft: string
  resourceUrl: string
  method: 'GET' | 'POST'
  environment: 'sandbox' | 'production'
}>

export type PendingX402Return = Readonly<{
  draft: string
  connection: string
  environment: 'sandbox' | 'production'
  handoff: X402HandoffIdentity
}>

export function providerConnectionResource(connection: OwnerProviderConnection): string {
  return connection.grantedResources[0] ?? connection.providerAccountRef
}

export function matchesX402Handoff(
  connection: OwnerProviderConnection,
  handoff: OwnerToolsX402ConnectionIntent,
): boolean {
  return connection.adapterId === 'x402-fetch:v2'
    && connection.grantedResources.length === 1
    && canonicalResourceUrl(connection.grantedResources[0] ?? '') === canonicalResourceUrl(handoff.resourceUrl)
    && connection.x402Method === handoff.method
    && (connection.sourceEnvironment === undefined || connection.sourceEnvironment === handoff.environment)
}

export function canonicalResourceUrl(resourceUrl: string): string {
  try {
    return new URL(resourceUrl).toString()
  } catch (cause) {
    return degrade(cause, resourceUrl, { site: 'canonicalResourceUrl', reason: 'invalid_response' })
  }
}

export function sameX402Handoff(
  left: X402HandoffIdentity | undefined,
  right: X402HandoffIdentity | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right
  return left.draft === right.draft
    && left.resourceUrl === right.resourceUrl
    && left.method === right.method
    && left.environment === right.environment
}

export function providerConnectionStatus(connection: OwnerProviderConnection): string {
  switch (connection.lifecycle) {
    case 'active':
      return connection.available ? 'Connection active' : 'Connection authority expired'
    case 'reauthorization_required':
      return 'Reconnect required'
    case 'revocation_pending':
      return 'Revocation in progress'
    case 'cleanup_required':
      return 'Cleanup required'
    case 'revoked':
      return 'Revoked'
    default: {
      const exhaustive: never = connection.lifecycle
      return exhaustive
    }
  }
}

export function providerConnectionHealth(connection: OwnerProviderConnection): string {
  if (connection.healthStatus === undefined || connection.healthCheckedAt === undefined) {
    return 'Connection health not checked yet'
  }
  const observed = `${formatRelativeTime(connection.healthCheckedAt)} · ${formatTimestamp(connection.healthCheckedAt)}`
  if (connection.healthStatus === 'healthy') {
    return `Healthy unpaid x402 challenge observed ${observed}; payee ${connection.healthSubject ?? 'not recorded'}`
  }
  return `Health needs attention (${connection.healthReasonCode ?? 'unavailable'}) · checked ${observed}`
}

export function connectionRefusalCopy(code: string, correlationRef?: string): string {
  if (code === 'security_control_unavailable') {
    return `The security control is unavailable, so no provider authority was changed.${correlationRef === undefined ? '' : ` Reference ${correlationRef}.`}`
  }
  if (code === 'reauthentication_required' || code === 'proof_stale') return 'Verify your identity again before changing this provider authority.'
  if (code === 'proof_replayed' || code === 'command_changed') return 'The verified command no longer matches this change. Review the connection and verify again.'
  if (code === 'rate_limited') return 'Too many provider-authority changes were attempted. Wait, then reload the current connection before trying again.'
  if (code === 'claim_invalid' || code === 'invalid_identity') return 'The payee claim expired or no longer matches this provider and endpoint. Inspect it and sign again.'
  if (code === 'inspection_ambiguous') return 'The endpoint now exposes more than one supported payment lane. Make one Base USDC exact lane unambiguous, then inspect again.'
  if (code === 'inspection_unsupported') return 'The endpoint no longer exposes AE’s supported Base USDC exact payment lane.'
  if (code.startsWith('inspection_')) return 'The live x402 challenge changed or is no longer valid. Inspect the endpoint again.'
  if (code === 'connection_resource_conflict') return 'This x402 endpoint is already connected to another provider.'
  if (code === 'credential_resource_conflict') return 'This endpoint is already connected with a different authority method.'
  if (code === 'authentication_required' || code === 'authorization_denied') return 'Sign in as the provider owner and try again.'
  if (code === 'authority_conflict') return 'This connection changed in another session. Reload and try again.'
  if (code === 'invalid_resource') return 'Enter a public HTTPS x402 resource URL.'
  return 'The provider connection could not be updated. Reload and try again.'
}

export function connectionRefFromHash(): string | undefined {
  try {
    const targetId = decodeURIComponent(window.location.hash.replace(/^#/, ''))
    return targetId.startsWith('provider-connection-')
      ? targetId.slice('provider-connection-'.length)
      : undefined
  } catch (cause) {
    return degrade(cause, undefined, { site: 'connectionRefFromHash', reason: 'invalid_response' })
  }
}
