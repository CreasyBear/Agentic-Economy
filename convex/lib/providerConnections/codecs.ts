import type { Id } from '../../_generated/dataModel'
import type {
  ProviderConnection,
  ProviderConnectionCommandResult,
  ProviderConnectionInvocationLease,
} from '../../../src/modules/capability-supply/provider-connection'
import type {
  ProviderConnectionLeaseRow,
  ProviderConnectionRow,
} from './contracts'

export function toDomain(row: ProviderConnectionRow): ProviderConnection {
  return row
}

function optionalConnectionFields(connection: ProviderConnection) {
  return Object.fromEntries(Object.entries({
    canonicalConnectionRef: connection.canonicalConnectionRef,
    owningAccountRef: connection.owningAccountRef,
    installedByPrincipalRef: connection.installedByPrincipalRef,
    authorityGrantRef: connection.authorityGrantRef,
    authorityGrantGeneration: connection.authorityGrantGeneration,
    canonicalConnectionGeneration: connection.canonicalConnectionGeneration,
    secretRef: connection.secretRef,
    expiresAt: connection.expiresAt,
    revocationRef: connection.revocationRef,
    cleanupAttempt: connection.cleanupAttempt,
    cleanupWorkId: connection.cleanupWorkId,
    cleanupWorkKind: connection.cleanupWorkKind,
    cleanupCommandId: connection.cleanupCommandId,
    cleanupRequestDigest: connection.cleanupRequestDigest,
    cleanupCallbackGraceUntil: connection.cleanupCallbackGraceUntil,
    revokedAt: connection.revokedAt,
    reasonCode: connection.reasonCode,
  }).filter(([, value]) => value !== undefined))
}

export function toRow(
  connection: ProviderConnection,
  _commandId: string,
  _commandDigest: string,
): ProviderConnectionRow {
  if (connection.lastCommandId === undefined || connection.lastCommandDigest === undefined) {
    throw new Error('provider_connection_command_receipt_missing')
  }
  return {
    connectionRef: connection.connectionRef,
    ...optionalConnectionFields(connection),
    businessId: connection.businessId as Id<'businesses'>,
    providerRef: connection.providerRef,
    providerAccountRef: connection.providerAccountRef,
    adapterId: connection.adapterId,
    credentialRef: connection.credentialRef,
    grantedScopes: [...connection.grantedScopes],
    grantedResources: [...connection.grantedResources],
    authorityGeneration: connection.authorityGeneration,
    authorityDigest: connection.authorityDigest,
    lifecycle: connection.lifecycle,
    observedAt: connection.observedAt,
    evidenceRefs: [...connection.evidenceRefs],
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
    lastCommandId: connection.lastCommandId,
    lastCommandDigest: connection.lastCommandDigest,
  }
}

export function projectCommandResult(result: ProviderConnectionCommandResult) {
  if (result.kind === 'refused') return result
  const connection = toRow(result.connection, result.connection.lastCommandId ?? '', result.commandDigest)
  return result.kind === 'applied'
    ? { kind: 'applied' as const, connection, commandDigest: result.commandDigest }
    : { kind: 'duplicate' as const, connection, commandDigest: result.commandDigest }
}

export function toLeaseDomain(row: ProviderConnectionLeaseRow): ProviderConnectionInvocationLease {
  return row
}

function optionalLeaseFields(lease: ProviderConnectionInvocationLease) {
  return Object.fromEntries(Object.entries({
    canonicalLeaseRef: lease.canonicalLeaseRef,
    canonicalConnectionRef: lease.canonicalConnectionRef,
    canonicalConnectionGeneration: lease.canonicalConnectionGeneration,
    owningAccountRef: lease.owningAccountRef,
    activeAccountRef: lease.activeAccountRef,
    actorPrincipalRef: lease.actorPrincipalRef,
    grantRef: lease.grantRef,
    grantGeneration: lease.grantGeneration,
    readinessDigest: lease.readinessDigest,
    consumedAt: lease.consumedAt,
    invalidatedAt: lease.invalidatedAt,
  }).filter(([, value]) => value !== undefined))
}

export function toLeaseRow(
  lease: ProviderConnectionInvocationLease,
  _commandId: string,
  _commandDigest: string,
): ProviderConnectionLeaseRow {
  if (lease.lastCommandId === undefined || lease.lastCommandDigest === undefined) {
    throw new Error('provider_connection_lease_command_receipt_missing')
  }
  return {
    leaseRef: lease.leaseRef,
    ...optionalLeaseFields(lease),
    invocationRef: lease.invocationRef,
    operationRef: lease.operationRef,
    connectionRef: lease.connectionRef,
    providerRef: lease.providerRef,
    providerAccountRef: lease.providerAccountRef,
    adapterId: lease.adapterId,
    authorityGeneration: lease.authorityGeneration,
    authorityDigest: lease.authorityDigest,
    grantedScopes: [...lease.grantedScopes],
    grantedResources: [...lease.grantedResources],
    approvalDecisionRef: lease.approvalDecisionRef,
    approvalDecisionDigest: lease.approvalDecisionDigest,
    readinessValidUntil: lease.readinessValidUntil,
    state: lease.state,
    issuedAt: lease.issuedAt,
    expiresAt: lease.expiresAt,
    evidenceRefs: [...lease.evidenceRefs],
    createdAt: lease.createdAt,
    updatedAt: lease.updatedAt,
    lastCommandId: lease.lastCommandId,
    lastCommandDigest: lease.lastCommandDigest,
  }
}

