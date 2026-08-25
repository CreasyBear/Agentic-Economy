import { canonicalDigest, isCanonicalDigest } from '@/modules/common/canonical-digest'
import { uniqueSorted } from '@/modules/common/unique-sorted'

import { validPublicHttpsEndpoint } from '../transport-adapters'
import {
  applied,
  expectedAuthorityIsCurrent,
  isProviderConnectionAuthorityCurrent,
  normalizeEvidenceRefs,
  normalizeReasonCode,
  normalizeValues,
  refusal,
  replayResult,
  stateIntegrity,
  validIdentity,
  validGeneration,
  validTimestamp,
  withAuthorityDigest,
} from './shared'
import {
  COMMAND_KINDS,
  isProviderConnectionCredentialRef,
  PROVIDER_CONNECTION_CLEANUP_OUTCOMES,
  type AuthorityCommandFields,
  type BeginProviderConnectionRevocationCommand,
  type CommandKind,
  type CreateProviderConnectionCommand,
  type CreateX402ProviderConnectionCommand,
  type ProviderConnection,
  type ProviderConnectionAuthorityValidation,
  type ProviderConnectionCleanupOutcome,
  type ProviderConnectionCommandResult,
  type ProviderConnectionCredentialResolution,
  type ProviderConnectionRefusalCode,
  type ReauthorizeProviderConnectionCommand,
  type RecordProviderConnectionCleanupResultCommand,
} from './types'

type NormalizedAuthorityCommand = Omit<AuthorityCommandFields, 'requestedScopes' | 'grantedScopes' | 'requestedResources' | 'grantedResources' | 'evidenceRefs'> & Readonly<{
  requestedScopes: readonly string[]
  grantedScopes: readonly string[]
  requestedResources: readonly string[]
  grantedResources: readonly string[]
  evidenceRefs: readonly string[]
  commandId: string
}>

function normalizeAuthorityCommand(command: AuthorityCommandFields & Readonly<{ commandId: string }>, now: number):
  | Readonly<{ kind: 'ok'; command: NormalizedAuthorityCommand }>
  | Readonly<{ kind: 'refused'; code: ProviderConnectionRefusalCode }> {
  if (!validTimestamp(now)) return { kind: 'refused', code: 'invalid_time' }
  if (!validIdentity(command.commandId) || !validIdentity(command.connectionRef) || !validIdentity(command.businessId)
    || !validIdentity(command.providerRef) || !validIdentity(command.providerAccountRef) || !validIdentity(command.adapterId)) return { kind: 'refused', code: 'invalid_identity' }
  if (command.credentialRef !== null && !isProviderConnectionCredentialRef(command.credentialRef)) return { kind: 'refused', code: 'invalid_identity' }
  const requestedScopes = normalizeValues(command.requestedScopes, 'invalid_scope')
  const grantedScopes = normalizeValues(command.grantedScopes, 'invalid_scope')
  const requestedResources = normalizeValues(command.requestedResources, 'invalid_resource')
  const grantedResources = normalizeValues(command.grantedResources, 'invalid_resource')
  if (requestedScopes.kind === 'refused') return requestedScopes
  if (grantedScopes.kind === 'refused') return grantedScopes
  if (requestedResources.kind === 'refused') return requestedResources
  if (grantedResources.kind === 'refused') return grantedResources
  if (grantedScopes.values.some((scope) => !requestedScopes.values.includes(scope))) return { kind: 'refused', code: 'invalid_scope' }
  if (grantedResources.values.some((resource) => !requestedResources.values.includes(resource))) return { kind: 'refused', code: 'invalid_resource' }
  if (command.expiresAt !== undefined && (!validTimestamp(command.expiresAt) || command.expiresAt <= now)) return { kind: 'refused', code: 'invalid_time' }
  const reasonCode = normalizeReasonCode(command.reasonCode)
  if (reasonCode.kind === 'refused') return reasonCode
  const evidenceRefs = normalizeEvidenceRefs(command.evidenceRefs)
  if (evidenceRefs.kind === 'refused') return evidenceRefs
  return { kind: 'ok', command: {
    commandId: command.commandId, connectionRef: command.connectionRef, businessId: command.businessId,
    providerRef: command.providerRef, providerAccountRef: command.providerAccountRef, adapterId: command.adapterId,
    credentialRef: command.credentialRef, requestedScopes: requestedScopes.values, grantedScopes: grantedScopes.values,
    requestedResources: requestedResources.values, grantedResources: grantedResources.values,
    ...(command.expiresAt === undefined ? {} : { expiresAt: command.expiresAt }),
    ...(reasonCode.value === undefined ? {} : { reasonCode: reasonCode.value }), evidenceRefs: evidenceRefs.values,
  } }
}
function normalizeCommandContext(command: Readonly<{ commandId: string; reasonCode?: string; evidenceRefs: readonly string[] }>):
  | Readonly<{ kind: 'ok'; commandId: string; reasonCode?: string; evidenceRefs: readonly string[] }>
  | Readonly<{ kind: 'refused'; code: ProviderConnectionRefusalCode }> {
  if (!validIdentity(command.commandId)) return { kind: 'refused', code: 'invalid_identity' }
  const reasonCode = normalizeReasonCode(command.reasonCode)
  if (reasonCode.kind === 'refused') return reasonCode
  const evidenceRefs = normalizeEvidenceRefs(command.evidenceRefs)
  if (evidenceRefs.kind === 'refused') return evidenceRefs
  return { kind: 'ok', commandId: command.commandId, ...(reasonCode.value === undefined ? {} : { reasonCode: reasonCode.value }), evidenceRefs: evidenceRefs.values }
}
function normalizeCleanupCommand(command: RecordProviderConnectionCleanupResultCommand):
  | Readonly<{
      kind: 'ok'
      commandId: string
      cleanupAttempt: number
      workId: string
      requestDigest: string
      outcome: ProviderConnectionCleanupOutcome
      responseDigest?: string
      reasonCode?: string
      evidenceRefs: readonly string[]
    }>
  | Readonly<{ kind: 'refused'; code: ProviderConnectionRefusalCode }> {
  if (!Number.isSafeInteger(command.cleanupAttempt) || command.cleanupAttempt < 1) {
    return { kind: 'refused', code: 'invalid_transition' }
  }
  if (!validIdentity(command.commandId) || !validIdentity(command.workId)) {
    return { kind: 'refused', code: 'invalid_identity' }
  }
  if (!isCanonicalDigest(command.requestDigest)) return { kind: 'refused', code: 'invalid_digest' }
  if (!PROVIDER_CONNECTION_CLEANUP_OUTCOMES.includes(command.outcome)) return { kind: 'refused', code: 'invalid_transition' }
  if (command.responseDigest !== undefined && !isCanonicalDigest(command.responseDigest)) return { kind: 'refused', code: 'invalid_digest' }
  const reasonCode = normalizeReasonCode(command.reasonCode)
  if (reasonCode.kind === 'refused') return reasonCode
  const evidenceRefs = normalizeEvidenceRefs(command.evidenceRefs)
  if (evidenceRefs.kind === 'refused') return evidenceRefs
  return {
    kind: 'ok',
    commandId: command.commandId,
    cleanupAttempt: command.cleanupAttempt,
    workId: command.workId,
    requestDigest: command.requestDigest,
    outcome: command.outcome,
    ...(command.responseDigest === undefined ? {} : { responseDigest: command.responseDigest }),
    ...(reasonCode.value === undefined ? {} : { reasonCode: reasonCode.value }),
    evidenceRefs: evidenceRefs.values,
  }
}
function commandMaterial(kind: CommandKind, command: object): unknown {
  return { kind, ...Object.fromEntries(Object.entries(command).filter(([, value]) => value !== undefined)) }
}
export function providerConnectionCommandDigest(kind: CommandKind, command: object): string {
  return canonicalDigest(commandMaterial(kind, command))
}

export function providerConnectionRevocationRef(input: Readonly<{
  connectionRef: string
  expectedAuthorityGeneration: number
  expectedAuthorityDigest: string
  adapterId: string
}>): string {
  return `provider-revocation:v1:${canonicalDigest(input)}`
}

export function providerConnectionCleanupRequestDigest(input: Readonly<{
  revocationRef: string
  cleanupAttempt: number
  connectionRef: string
  expectedAuthorityGeneration: number
  expectedAuthorityDigest: string
  adapterId: string
}>): string {
  return canonicalDigest(input)
}

export function providerConnectionCleanupCommandId(revocationRef: string, cleanupAttempt: number): string {
  return `provider-cleanup:v1:${canonicalDigest({ revocationRef, cleanupAttempt })}`
}

export function isCanonicalCredentiallessX402ProviderConnection(
  connection: Pick<ProviderConnection, 'adapterId' | 'credentialRef' | 'providerRef' | 'providerAccountRef' | 'grantedScopes' | 'grantedResources'>,
): boolean {
  if (
    connection.adapterId !== 'x402-fetch:v2'
    || connection.credentialRef !== null
    || connection.grantedScopes.length !== 0
    || !connection.providerRef.startsWith('provider:x402:')
    || !connection.providerAccountRef.startsWith('x402:')
    || connection.grantedResources.length !== 1
  ) return false
  const resource = validPublicHttpsEndpoint(connection.providerAccountRef.slice(5))
  return resource !== undefined
    && resource.hash === ''
    && connection.grantedResources[0] === resource.toString()
}

export function createProviderConnection(command: CreateProviderConnectionCommand, now: number, existing?: ProviderConnection): ProviderConnectionCommandResult {
  const normalized = normalizeAuthorityCommand(command, now)
  if (normalized.kind === 'refused') return normalized
  const commandDigest = providerConnectionCommandDigest(COMMAND_KINDS.create, normalized.command)
  const replay = replayResult(existing, normalized.command.commandId, commandDigest)
  if (replay !== null) return replay
  if (existing !== undefined) return refusal('invalid_transition')
  const connection = withAuthorityDigest({
    connectionRef: normalized.command.connectionRef,
    businessId: normalized.command.businessId,
    providerRef: normalized.command.providerRef,
    providerAccountRef: normalized.command.providerAccountRef,
    adapterId: normalized.command.adapterId,
    credentialRef: normalized.command.credentialRef,
    grantedScopes: normalized.command.grantedScopes,
    grantedResources: normalized.command.grantedResources,
    authorityGeneration: 1,
    lifecycle: 'active',
    observedAt: now,
    ...(normalized.command.expiresAt === undefined ? {} : { expiresAt: normalized.command.expiresAt }),
    ...(normalized.command.reasonCode === undefined ? {} : { reasonCode: normalized.command.reasonCode }),
    evidenceRefs: normalized.command.evidenceRefs,
    createdAt: now,
    updatedAt: now,
  })
  return applied(connection, normalized.command.commandId, commandDigest)
}

export function createX402ProviderConnection(
  command: CreateX402ProviderConnectionCommand,
  now: number,
  existing?: ProviderConnection,
): ProviderConnectionCommandResult {
  const resourceUrl = validPublicHttpsEndpoint(command.resourceUrl)
  if (resourceUrl === undefined || resourceUrl.hash !== '') return refusal('invalid_resource')
  return createProviderConnection({
    commandId: command.commandId,
    connectionRef: command.connectionRef,
    businessId: command.businessId,
    providerRef: command.providerRef,
    providerAccountRef: command.providerAccountRef,
    adapterId: 'x402-fetch:v2',
    credentialRef: null,
    requestedScopes: [],
    grantedScopes: [],
    requestedResources: [resourceUrl.toString()],
    grantedResources: [resourceUrl.toString()],
    ...(command.expiresAt === undefined ? {} : { expiresAt: command.expiresAt }),
    evidenceRefs: command.evidenceRefs,
  }, now, existing)
}

export function reauthorizeProviderConnection(current: ProviderConnection | undefined, command: ReauthorizeProviderConnectionCommand, now: number): ProviderConnectionCommandResult {
  const normalized = normalizeAuthorityCommand(command, now)
  if (normalized.kind === 'refused') return normalized
  const commandDigest = providerConnectionCommandDigest(COMMAND_KINDS.reauthorize, {
    ...normalized.command,
    expectedAuthorityGeneration: command.expectedAuthorityGeneration,
    expectedAuthorityDigest: command.expectedAuthorityDigest,
  })
  if (current === undefined) return refusal('invalid_transition')
  const replay = replayResult(current, normalized.command.commandId, commandDigest)
  if (replay !== null) return replay
  const integrity = stateIntegrity(current, now)
  if (integrity !== null) return refusal(integrity)
  const expected = expectedAuthorityIsCurrent(current, command.expectedAuthorityGeneration, command.expectedAuthorityDigest)
  if (expected !== null) return refusal(expected)
  if (normalized.command.connectionRef !== current.connectionRef
    || normalized.command.businessId !== current.businessId
    || normalized.command.providerRef !== current.providerRef
    || normalized.command.providerAccountRef !== current.providerAccountRef
    || normalized.command.adapterId !== current.adapterId) return refusal('invalid_identity')
  if (current.lifecycle !== 'active' && current.lifecycle !== 'reauthorization_required') return refusal('invalid_transition')
  if (current.authorityGeneration === Number.MAX_SAFE_INTEGER) return refusal('invalid_generation')
  const { revokedAt: _revokedAt, reasonCode: _oldReasonCode, expiresAt: _oldExpiresAt, ...base } = current
  const next = withAuthorityDigest({
    ...base,
    credentialRef: normalized.command.credentialRef,
    grantedScopes: normalized.command.grantedScopes,
    grantedResources: normalized.command.grantedResources,
    authorityGeneration: current.authorityGeneration + 1,
    lifecycle: 'active',
    observedAt: now,
    ...(normalized.command.expiresAt === undefined ? {} : { expiresAt: normalized.command.expiresAt }),
    ...(normalized.command.reasonCode === undefined ? {} : { reasonCode: normalized.command.reasonCode }),
    evidenceRefs: uniqueSorted([...current.evidenceRefs, ...normalized.command.evidenceRefs]),
    updatedAt: now,
  })
  return applied(next, normalized.command.commandId, commandDigest)
}

export function beginProviderConnectionRevocation(current: ProviderConnection | undefined, command: BeginProviderConnectionRevocationCommand, now: number): ProviderConnectionCommandResult {
  const context = normalizeCommandContext(command)
  if (context.kind === 'refused') return context
  const commandDigest = providerConnectionCommandDigest(COMMAND_KINDS.beginRevocation, {
    commandId: context.commandId,
    ...(context.reasonCode === undefined ? {} : { reasonCode: context.reasonCode }),
    evidenceRefs: context.evidenceRefs,
    expectedAuthorityGeneration: command.expectedAuthorityGeneration,
    expectedAuthorityDigest: command.expectedAuthorityDigest,
  })
  if (current === undefined) return refusal('invalid_transition')
  const replay = replayResult(current, context.commandId, commandDigest)
  if (replay !== null) return replay
  const integrity = stateIntegrity(current, now)
  if (integrity !== null) return refusal(integrity)
  const expected = expectedAuthorityIsCurrent(current, command.expectedAuthorityGeneration, command.expectedAuthorityDigest)
  if (expected !== null) return refusal(expected)
  if (current.lifecycle !== 'active' && current.lifecycle !== 'reauthorization_required') return refusal('invalid_transition')
  const revocationRef = providerConnectionRevocationRef({
    connectionRef: current.connectionRef,
    expectedAuthorityGeneration: command.expectedAuthorityGeneration,
    expectedAuthorityDigest: command.expectedAuthorityDigest,
    adapterId: current.adapterId,
  })
  const {
    cleanupWorkId: _cleanupWorkId,
    cleanupWorkKind: _cleanupWorkKind,
    cleanupCommandId: _cleanupCommandId,
    cleanupRequestDigest: _cleanupRequestDigest,
    cleanupCallbackGraceUntil: _cleanupCallbackGraceUntil,
    ...withoutCleanup
  } = current
  const next = withAuthorityDigest({
    ...withoutCleanup,
    lifecycle: 'revocation_pending',
    observedAt: now,
    revokedAt: now,
    revocationRef,
    cleanupAttempt: current.cleanupAttempt ?? 0,
    ...(context.reasonCode === undefined ? {} : { reasonCode: context.reasonCode }),
    evidenceRefs: uniqueSorted([...current.evidenceRefs, ...context.evidenceRefs]),
    updatedAt: now,
  })
  return applied(next, context.commandId, commandDigest)
}

export function recordProviderConnectionCleanupResult(current: ProviderConnection | undefined, command: RecordProviderConnectionCleanupResultCommand, now: number): ProviderConnectionCommandResult {
  const normalized = normalizeCleanupCommand(command)
  if (normalized.kind === 'refused') return normalized
  const commandDigest = providerConnectionCommandDigest(COMMAND_KINDS.recordCleanupResult, {
    commandId: normalized.commandId,
    cleanupAttempt: normalized.cleanupAttempt,
    workId: normalized.workId,
    requestDigest: normalized.requestDigest,
    ...(normalized.responseDigest === undefined ? {} : { responseDigest: normalized.responseDigest }),
    ...(normalized.reasonCode === undefined ? {} : { reasonCode: normalized.reasonCode }),
    evidenceRefs: normalized.evidenceRefs,
    expectedAuthorityGeneration: command.expectedAuthorityGeneration,
    expectedAuthorityDigest: command.expectedAuthorityDigest,
    outcome: normalized.outcome,
  })
  if (current === undefined) return refusal('invalid_transition')
  const replay = replayResult(current, normalized.commandId, commandDigest)
  if (replay !== null) return replay
  const integrity = stateIntegrity(current, now)
  if (integrity !== null) return refusal(integrity)
  const expected = expectedAuthorityIsCurrent(current, command.expectedAuthorityGeneration, command.expectedAuthorityDigest)
  if (expected !== null) return refusal(expected)
  if (current.lifecycle !== 'revocation_pending' && current.lifecycle !== 'cleanup_required') return refusal('invalid_transition')
  if (
    current.cleanupAttempt !== normalized.cleanupAttempt
    || current.cleanupWorkId !== normalized.workId
    || current.cleanupCommandId !== normalized.commandId
    || current.cleanupRequestDigest !== normalized.requestDigest
  ) return refusal('invalid_transition')
  if (
    normalized.outcome === 'revoked'
    || normalized.outcome === 'already_revoked'
    || (normalized.outcome === 'detached' && !isCanonicalCredentiallessX402ProviderConnection(current))
  ) return refusal('invalid_transition')
  const {
    cleanupWorkId: _cleanupWorkId,
    cleanupWorkKind: _cleanupWorkKind,
    cleanupCommandId: _cleanupCommandId,
    cleanupRequestDigest: _cleanupRequestDigest,
    ...withoutCleanup
  } = current
  const common = {
    ...withoutCleanup,
    observedAt: now,
    evidenceRefs: uniqueSorted([...current.evidenceRefs, ...normalized.evidenceRefs]),
    cleanupCallbackGraceUntil: now + 10_000,
    updatedAt: now,
  }
  if (normalized.outcome !== 'detached') {
    return applied({
      ...common,
      lifecycle: 'cleanup_required',
      ...(normalized.reasonCode === undefined ? {} : { reasonCode: normalized.reasonCode }),
    }, normalized.commandId, commandDigest)
  }
  const { lastCommandId: _lastCommandId, lastCommandDigest: _lastCommandDigest, ...withoutReceipt } = common
  return applied(withAuthorityDigest({
    ...withoutReceipt,
    credentialRef: null,
    lifecycle: 'revoked',
    revokedAt: current.revokedAt ?? now,
    ...(normalized.reasonCode === undefined ? {} : { reasonCode: normalized.reasonCode }),
  }), normalized.commandId, commandDigest)
}

export function validateProviderConnectionAuthority(
  connection: ProviderConnection | undefined,
  expectedAuthorityGeneration: number,
  expectedAuthorityDigest: string,
  now: number,
): ProviderConnectionAuthorityValidation {
  if (connection === undefined) return { kind: 'unavailable', reason: 'not_found' }
  if (connection.lifecycle !== 'active') return { kind: 'unavailable', reason: 'inactive' }
  if (!isProviderConnectionAuthorityCurrent(connection)) return { kind: 'unavailable', reason: 'digest_mismatch' }
  if (!validGeneration(expectedAuthorityGeneration) || expectedAuthorityGeneration !== connection.authorityGeneration) {
    return { kind: 'unavailable', reason: 'stale_generation' }
  }
  if (!isCanonicalDigest(expectedAuthorityDigest) || expectedAuthorityDigest !== connection.authorityDigest) {
    return { kind: 'unavailable', reason: 'digest_mismatch' }
  }
  if (!validTimestamp(now) || (connection.expiresAt !== undefined && connection.expiresAt <= now)) {
    return { kind: 'unavailable', reason: 'expired' }
  }
  return { kind: 'valid' }
}

export function resolveProviderConnectionCredentialRef(connection: ProviderConnection | undefined, expectedAuthorityGeneration: number, expectedAuthorityDigest: string, now: number): ProviderConnectionCredentialResolution {
  const validation = validateProviderConnectionAuthority(connection, expectedAuthorityGeneration, expectedAuthorityDigest, now)
  if (validation.kind === 'unavailable') return validation
  if (connection?.credentialRef === null || connection === undefined || !isProviderConnectionCredentialRef(connection.credentialRef)) {
    return { kind: 'unavailable', reason: 'credential_unavailable' }
  }
  return { kind: 'resolved', credentialRef: connection.credentialRef }
}
