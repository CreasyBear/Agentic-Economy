import { canonicalDigest, isCanonicalDigest } from '@/modules/common/canonical-digest'
import { uniqueSorted } from '@/modules/common/unique-sorted'

import { boundedTrimmed, MAX_CONTEXT_VALUE_LENGTH, MAX_EVIDENCE_REF_LENGTH } from '../shared'
import {
  isProviderConnectionCredentialRef,
  PROVIDER_CONNECTION_CLEANUP_WORK_KINDS,
  PROVIDER_CONNECTION_LIFECYCLES,
  type ProviderConnection,
  type ProviderConnectionRefusalCode,
} from './types'

type CanonicalConnectionProjectionSource = Readonly<{
  connectionRef: string
  owningAccountRef: string
  installedByPrincipalRef: string
  secretRef?: string
  lifecycle: 'active' | 'revoked' | 'deleted'
  generation: number
  externalState?: Readonly<{ kind: 'known' | 'unknown'; value: string }>
  installAction: Readonly<{ grantRef: string; grantGeneration: number }>
  action?: Readonly<{ grantRef: string; grantGeneration: number }>
}>

type CanonicalLeaseProjectionSource = Readonly<{
  leaseRef: string
  connectionRef: string
  connectionGeneration: number
  owningAccountRef: string
  activeAccountRef: string
  actorPrincipalRef: string
  grantRef: string
  grantGeneration: number
}>

type LegacyLeaseProjection = Readonly<{
  canonicalLeaseRef?: string
  canonicalConnectionRef?: string
  canonicalConnectionGeneration?: number
  owningAccountRef?: string
  activeAccountRef?: string
  actorPrincipalRef?: string
  grantRef?: string
  grantGeneration?: number
  state?: string
}>

const VALID_LIFECYCLES = new Set<string>(PROVIDER_CONNECTION_LIFECYCLES)

/**
 * Adds the canonical provenance fields to a legacy compatibility row. The
 * canonical Connection is the only source for these values.
 */
export function canonicalProviderConnectionProjection(
  legacy: ProviderConnection,
  canonical: CanonicalConnectionProjectionSource,
): ProviderConnection {
  const authority = canonical.action ?? canonical.installAction
  return Object.freeze({
    ...legacy,
    canonicalConnectionRef: canonical.connectionRef,
    owningAccountRef: canonical.owningAccountRef,
    installedByPrincipalRef: canonical.installedByPrincipalRef,
    authorityGrantRef: authority.grantRef,
    authorityGrantGeneration: authority.grantGeneration,
    canonicalConnectionGeneration: canonical.generation,
    ...(canonical.secretRef === undefined ? {} : { secretRef: canonical.secretRef }),
  })
}

/** Exact provenance match, including terminal/unknown states used by cleanup. */
export function canonicalProviderConnectionProjectionMatches(
  legacy: ProviderConnection,
  canonical: CanonicalConnectionProjectionSource,
): boolean {
  const authority = canonical.action ?? canonical.installAction
  const expectedSecretRef = canonical.secretRef
  return legacy.canonicalConnectionRef === canonical.connectionRef
    && legacy.owningAccountRef === canonical.owningAccountRef
    && legacy.installedByPrincipalRef === canonical.installedByPrincipalRef
    && legacy.authorityGrantRef === authority.grantRef
    && legacy.authorityGrantGeneration === authority.grantGeneration
    && legacy.canonicalConnectionGeneration === canonical.generation
    && legacy.secretRef === expectedSecretRef
    && legacy.credentialRef === (expectedSecretRef ?? null)
}

/** A legacy row can authorize only while it exactly projects a usable Connection. */
export function canonicalProviderConnectionProjectionIsCurrent(
  legacy: ProviderConnection,
  canonical: CanonicalConnectionProjectionSource,
): boolean {
  const externalReady = canonical.externalState === undefined
    || (canonical.externalState.kind === 'known' && canonical.externalState.value === 'ready')
  return canonicalProviderConnectionProjectionMatches(legacy, canonical)
    && canonical.lifecycle === 'active'
    && externalReady
    && legacy.lifecycle === 'active'
}

/** Exact, generation-bound compatibility proof for a canonical lease. */
export function canonicalProviderLeaseProjectionIsCurrent(
  legacy: LegacyLeaseProjection,
  canonicalLease: CanonicalLeaseProjectionSource,
  canonicalConnection: CanonicalConnectionProjectionSource,
): boolean {
  return canonicalConnection.lifecycle === 'active'
    && canonicalConnection.generation === canonicalLease.connectionGeneration
    && legacy.canonicalLeaseRef === canonicalLease.leaseRef
    && legacy.canonicalConnectionRef === canonicalLease.connectionRef
    && legacy.canonicalConnectionGeneration === canonicalLease.connectionGeneration
    && legacy.owningAccountRef === canonicalLease.owningAccountRef
    && legacy.activeAccountRef === canonicalLease.activeAccountRef
    && legacy.actorPrincipalRef === canonicalLease.actorPrincipalRef
    && legacy.grantRef === canonicalLease.grantRef
    && legacy.grantGeneration === canonicalLease.grantGeneration
    && (legacy.state === undefined || legacy.state === 'active')
}

export function canonicalProviderLeaseProjection<Lease extends object>(
  legacy: Lease,
  canonical: CanonicalLeaseProjectionSource,
): Lease & Required<LegacyLeaseProjection> {
  return Object.freeze({
    ...legacy,
    canonicalLeaseRef: canonical.leaseRef,
    canonicalConnectionRef: canonical.connectionRef,
    canonicalConnectionGeneration: canonical.connectionGeneration,
    owningAccountRef: canonical.owningAccountRef,
    activeAccountRef: canonical.activeAccountRef,
    actorPrincipalRef: canonical.actorPrincipalRef,
    grantRef: canonical.grantRef,
    grantGeneration: canonical.grantGeneration,
  }) as Lease & Required<LegacyLeaseProjection>
}

export function refusal(code: ProviderConnectionRefusalCode): Readonly<{ kind: 'refused'; code: ProviderConnectionRefusalCode }> {
  return { kind: 'refused', code }
}
export function validTimestamp(value: number): boolean { return Number.isSafeInteger(value) && value >= 0 }
export function validGeneration(value: number): boolean { return Number.isSafeInteger(value) && value >= 1 }
export function validIdentity(value: unknown, maximumLength = MAX_CONTEXT_VALUE_LENGTH): value is string {
  return typeof value === 'string' && boundedTrimmed(value, maximumLength)
}
export function normalizeValues(values: readonly string[], code: 'invalid_scope' | 'invalid_resource'):
  | Readonly<{ kind: 'ok'; values: readonly string[] }>
  | Readonly<{ kind: 'refused'; code: ProviderConnectionRefusalCode }> {
  if (!Array.isArray(values) || values.some((value) => !validIdentity(value))) return { kind: 'refused', code }
  return { kind: 'ok', values: uniqueSorted(values) }
}
export function normalizeEvidenceRefs(values: readonly string[]):
  | Readonly<{ kind: 'ok'; values: readonly string[] }>
  | Readonly<{ kind: 'refused'; code: ProviderConnectionRefusalCode }> {
  if (!Array.isArray(values) || values.some((value) => !validIdentity(value, MAX_EVIDENCE_REF_LENGTH))) return { kind: 'refused', code: 'invalid_identity' }
  return { kind: 'ok', values: uniqueSorted(values) }
}
export function normalizeReasonCode(value: string | undefined):
  | Readonly<{ kind: 'ok'; value?: string }>
  | Readonly<{ kind: 'refused'; code: ProviderConnectionRefusalCode }> {
  if (value !== undefined && !validIdentity(value)) return { kind: 'refused', code: 'invalid_identity' }
  return { kind: 'ok', ...(value === undefined ? {} : { value }) }
}

export function providerConnectionAuthorityDigest(connection: Pick<ProviderConnection, 'connectionRef' | 'businessId' | 'providerRef' | 'providerAccountRef' | 'adapterId' | 'credentialRef' | 'grantedScopes' | 'grantedResources' | 'authorityGeneration' | 'expiresAt'>): string {
  return canonicalDigest({
    connectionRef: connection.connectionRef, businessId: connection.businessId, providerRef: connection.providerRef,
    providerAccountRef: connection.providerAccountRef, adapterId: connection.adapterId, credentialRef: connection.credentialRef,
    grantedScopes: uniqueSorted(connection.grantedScopes), grantedResources: uniqueSorted(connection.grantedResources),
    authorityGeneration: connection.authorityGeneration, expiresAt: connection.expiresAt ?? null,
  })
}
export function isProviderConnectionAuthorityCurrent(connection: ProviderConnection): boolean {
  return isCanonicalDigest(connection.authorityDigest) && connection.authorityDigest === providerConnectionAuthorityDigest(connection)
}
export function stateIntegrity(current: ProviderConnection, now: number): ProviderConnectionRefusalCode | null {
  if (!validTimestamp(now) || !validTimestamp(current.observedAt) || !validTimestamp(current.createdAt) || !validTimestamp(current.updatedAt)
    || current.createdAt > current.updatedAt || current.observedAt > current.updatedAt || now < current.updatedAt) return 'invalid_time'
  if (!validIdentity(current.connectionRef) || !validIdentity(current.businessId) || !validIdentity(current.providerRef)
    || !validIdentity(current.providerAccountRef) || !validIdentity(current.adapterId)
    || (current.credentialRef !== null && !isProviderConnectionCredentialRef(current.credentialRef))) return 'invalid_identity'
  if (!VALID_LIFECYCLES.has(current.lifecycle)) return 'invalid_transition'
  if (!validGeneration(current.authorityGeneration)) return 'invalid_generation'
  if (!isCanonicalDigest(current.authorityDigest) || current.authorityDigest !== providerConnectionAuthorityDigest(current)) return 'invalid_digest'
  if (current.grantedScopes.some((scope) => !validIdentity(scope)) || uniqueSorted(current.grantedScopes).join('\u0000') !== current.grantedScopes.join('\u0000')) return 'invalid_scope'
  if (current.grantedResources.some((resource) => !validIdentity(resource)) || uniqueSorted(current.grantedResources).join('\u0000') !== current.grantedResources.join('\u0000')) return 'invalid_resource'
  if (current.expiresAt !== undefined && !validTimestamp(current.expiresAt)) return 'invalid_time'
  if (current.revokedAt !== undefined && (!validTimestamp(current.revokedAt) || current.revokedAt < current.createdAt || current.revokedAt > current.updatedAt)) return 'invalid_time'
  if (current.reasonCode !== undefined && !validIdentity(current.reasonCode)) return 'invalid_identity'
  if (current.revocationRef !== undefined && !validIdentity(current.revocationRef)) return 'invalid_identity'
  if (current.cleanupAttempt !== undefined && (!Number.isSafeInteger(current.cleanupAttempt) || current.cleanupAttempt < 0)) return 'invalid_transition'
  if (current.cleanupWorkId !== undefined && !validIdentity(current.cleanupWorkId)) return 'invalid_identity'
  if (current.cleanupWorkKind !== undefined && !PROVIDER_CONNECTION_CLEANUP_WORK_KINDS.includes(current.cleanupWorkKind)) return 'invalid_transition'
  if (current.cleanupCommandId !== undefined && !validIdentity(current.cleanupCommandId)) return 'invalid_identity'
  if (current.cleanupRequestDigest !== undefined && !isCanonicalDigest(current.cleanupRequestDigest)) return 'invalid_digest'
  if (current.cleanupCallbackGraceUntil !== undefined && !validTimestamp(current.cleanupCallbackGraceUntil)) return 'invalid_time'
  if (
    current.cleanupWorkId === undefined
    && (current.cleanupWorkKind !== undefined || current.cleanupCommandId !== undefined || current.cleanupRequestDigest !== undefined)
  ) return 'invalid_transition'
  if (current.evidenceRefs.some((ref) => !validIdentity(ref, MAX_EVIDENCE_REF_LENGTH))) return 'invalid_identity'
  if ((current.lifecycle === 'active' || current.lifecycle === 'reauthorization_required') && current.revokedAt !== undefined) return 'invalid_transition'
  if ((current.lifecycle === 'revocation_pending' || current.lifecycle === 'cleanup_required' || current.lifecycle === 'revoked') && current.revokedAt === undefined) return 'invalid_transition'
  return null
}
export function expectedAuthorityIsCurrent(current: ProviderConnection, expectedGeneration: number, expectedDigest: string): ProviderConnectionRefusalCode | null {
  if (!validGeneration(expectedGeneration) || expectedGeneration !== current.authorityGeneration) return 'invalid_generation'
  if (!isCanonicalDigest(expectedDigest) || expectedDigest !== current.authorityDigest) return 'invalid_digest'
  return null
}
export function replayResult(current: ProviderConnection | undefined, commandId: string, commandDigest: string):
  | Readonly<{ kind: 'duplicate'; connection: ProviderConnection; commandDigest: string }>
  | Readonly<{ kind: 'refused'; code: ProviderConnectionRefusalCode }>
  | null {
  if (current?.lastCommandId !== commandId) return null
  if (current.lastCommandDigest !== commandDigest) return refusal('command_identity_conflict')
  return { kind: 'duplicate', connection: current, commandDigest }
}
export function applied(connection: ProviderConnection, commandId: string, commandDigest: string): Readonly<{
  kind: 'applied'
  connection: ProviderConnection
  commandDigest: string
}> {
  return { kind: 'applied', commandDigest, connection: { ...connection, lastCommandId: commandId, lastCommandDigest: commandDigest } }
}
export function withAuthorityDigest(connection: Omit<ProviderConnection, 'authorityDigest'>): ProviderConnection {
  return { ...connection, authorityDigest: providerConnectionAuthorityDigest(connection) }
}
