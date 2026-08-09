import { canonicalDigest, isCanonicalDigest } from '@/modules/common/canonical-digest'
import { uniqueSorted } from '@/modules/common/unique-sorted'

import { boundedTrimmed, MAX_CONTEXT_VALUE_LENGTH, MAX_EVIDENCE_REF_LENGTH } from './internal/shared'

export const PROVIDER_CONNECTION_LIFECYCLES = [
  'active',
  'reauthorization_required',
  'revocation_pending',
  'revoked',
  'cleanup_required',
] as const
export type ProviderConnectionLifecycle = (typeof PROVIDER_CONNECTION_LIFECYCLES)[number]

export const PROVIDER_CONNECTION_REFUSAL_CODES = [
  'invalid_identity', 'invalid_time', 'invalid_scope', 'invalid_resource',
  'invalid_generation', 'invalid_digest', 'invalid_transition', 'command_identity_conflict',
] as const
export type ProviderConnectionRefusalCode = (typeof PROVIDER_CONNECTION_REFUSAL_CODES)[number]

export const PROVIDER_CONNECTION_CLEANUP_OUTCOMES = ['succeeded', 'failed'] as const
export type ProviderConnectionCleanupOutcome = (typeof PROVIDER_CONNECTION_CLEANUP_OUTCOMES)[number]

const PRIVATE_CREDENTIAL_REF = /^env:[A-Z][A-Z0-9_]{1,199}$/

export function isProviderConnectionCredentialRef(value: unknown): value is string {
  return typeof value === 'string' && PRIVATE_CREDENTIAL_REF.test(value)
}

export type ProviderConnection = Readonly<{
  connectionRef: string
  businessId: string
  providerRef: string
  providerAccountRef: string
  adapterId: string
  credentialRef: string | null
  grantedScopes: readonly string[]
  grantedResources: readonly string[]
  authorityGeneration: number
  authorityDigest: string
  lifecycle: ProviderConnectionLifecycle
  observedAt: number
  expiresAt?: number
  revokedAt?: number
  reasonCode?: string
  evidenceRefs: readonly string[]
  createdAt: number
  updatedAt: number
  lastCommandId?: string
  lastCommandDigest?: string
}>

type AuthorityCommandFields = Readonly<{
  connectionRef: string
  businessId: string
  providerRef: string
  providerAccountRef: string
  adapterId: string
  credentialRef: string | null
  requestedScopes: readonly string[]
  grantedScopes: readonly string[]
  requestedResources: readonly string[]
  grantedResources: readonly string[]
  expiresAt?: number
  reasonCode?: string
  evidenceRefs: readonly string[]
}>
export type CreateProviderConnectionCommand = AuthorityCommandFields & Readonly<{ commandId: string }>
export type ReauthorizeProviderConnectionCommand = AuthorityCommandFields & Readonly<{
  commandId: string
  expectedAuthorityGeneration: number
  expectedAuthorityDigest: string
}>
export type BeginProviderConnectionRevocationCommand = Readonly<{
  commandId: string
  expectedAuthorityGeneration: number
  expectedAuthorityDigest: string
  reasonCode?: string
  evidenceRefs: readonly string[]
}>
export type RecordProviderConnectionCleanupResultCommand = Readonly<{
  commandId: string
  expectedAuthorityGeneration: number
  expectedAuthorityDigest: string
  outcome: ProviderConnectionCleanupOutcome
  reasonCode?: string
  evidenceRefs: readonly string[]
}>

export type ProviderConnectionCommandResult =
  | Readonly<{ kind: 'applied'; connection: ProviderConnection; commandDigest: string }>
  | Readonly<{ kind: 'duplicate'; connection: ProviderConnection; commandDigest: string }>
  | Readonly<{ kind: 'refused'; code: ProviderConnectionRefusalCode }>
export type ProviderConnectionPublicProjection = Readonly<{
  lifecycle: ProviderConnectionLifecycle
  available: boolean
  reasonCode: string | null
}>
export type ProviderConnectionCredentialResolution =
  | Readonly<{ kind: 'resolved'; credentialRef: string }>
  | Readonly<{ kind: 'unavailable'; reason: 'not_found' | 'inactive' | 'stale_generation' | 'expired' | 'digest_mismatch' | 'credential_unavailable' }>

const COMMAND_KINDS = {
  create: 'create', reauthorize: 'reauthorize', beginRevocation: 'begin_revocation', recordCleanupResult: 'record_cleanup_result',
} as const
type CommandKind = (typeof COMMAND_KINDS)[keyof typeof COMMAND_KINDS]
const VALID_LIFECYCLES = new Set<string>(PROVIDER_CONNECTION_LIFECYCLES)

type NormalizedAuthorityCommand = Omit<AuthorityCommandFields, 'requestedScopes' | 'grantedScopes' | 'requestedResources' | 'grantedResources' | 'evidenceRefs'> & Readonly<{
  requestedScopes: readonly string[]
  grantedScopes: readonly string[]
  requestedResources: readonly string[]
  grantedResources: readonly string[]
  evidenceRefs: readonly string[]
  commandId: string
}>

function refusal(code: ProviderConnectionRefusalCode): ProviderConnectionCommandResult { return { kind: 'refused', code } }
function validTimestamp(value: number): boolean { return Number.isSafeInteger(value) && value >= 0 }
function validGeneration(value: number): boolean { return Number.isSafeInteger(value) && value >= 1 }
function validIdentity(value: unknown, maximumLength = MAX_CONTEXT_VALUE_LENGTH): value is string {
  return typeof value === 'string' && boundedTrimmed(value, maximumLength)
}
function normalizeValues(values: readonly string[], code: 'invalid_scope' | 'invalid_resource'):
  | Readonly<{ kind: 'ok'; values: readonly string[] }>
  | Readonly<{ kind: 'refused'; code: ProviderConnectionRefusalCode }> {
  if (!Array.isArray(values) || values.some((value) => !validIdentity(value))) return { kind: 'refused', code }
  return { kind: 'ok', values: uniqueSorted(values) }
}
function normalizeEvidenceRefs(values: readonly string[]):
  | Readonly<{ kind: 'ok'; values: readonly string[] }>
  | Readonly<{ kind: 'refused'; code: ProviderConnectionRefusalCode }> {
  if (!Array.isArray(values) || values.some((value) => !validIdentity(value, MAX_EVIDENCE_REF_LENGTH))) return { kind: 'refused', code: 'invalid_identity' }
  return { kind: 'ok', values: uniqueSorted(values) }
}
function normalizeReasonCode(value: string | undefined):
  | Readonly<{ kind: 'ok'; value?: string }>
  | Readonly<{ kind: 'refused'; code: ProviderConnectionRefusalCode }> {
  if (value !== undefined && !validIdentity(value)) return { kind: 'refused', code: 'invalid_identity' }
  return { kind: 'ok', ...(value === undefined ? {} : { value }) }
}
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
function commandMaterial(kind: CommandKind, command: object): unknown {
  return { kind, ...Object.fromEntries(Object.entries(command).filter(([, value]) => value !== undefined)) }
}
export function providerConnectionCommandDigest(kind: CommandKind, command: object): string {
  return canonicalDigest(commandMaterial(kind, command))
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
function stateIntegrity(current: ProviderConnection, now: number): ProviderConnectionRefusalCode | null {
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
  if (current.evidenceRefs.some((ref) => !validIdentity(ref, MAX_EVIDENCE_REF_LENGTH))) return 'invalid_identity'
  if ((current.lifecycle === 'active' || current.lifecycle === 'reauthorization_required') && current.revokedAt !== undefined) return 'invalid_transition'
  if ((current.lifecycle === 'revocation_pending' || current.lifecycle === 'cleanup_required' || current.lifecycle === 'revoked') && current.revokedAt === undefined) return 'invalid_transition'
  return null
}
function expectedAuthorityIsCurrent(current: ProviderConnection, expectedGeneration: number, expectedDigest: string): ProviderConnectionRefusalCode | null {
  if (!validGeneration(expectedGeneration) || expectedGeneration !== current.authorityGeneration) return 'invalid_generation'
  if (!isCanonicalDigest(expectedDigest) || expectedDigest !== current.authorityDigest) return 'invalid_digest'
  return null
}
function replayResult(current: ProviderConnection | undefined, commandId: string, commandDigest: string): ProviderConnectionCommandResult | null {
  if (current?.lastCommandId !== commandId) return null
  if (current.lastCommandDigest !== commandDigest) return refusal('command_identity_conflict')
  return { kind: 'duplicate', connection: current, commandDigest }
}
function applied(connection: ProviderConnection, commandId: string, commandDigest: string): ProviderConnectionCommandResult {
  return { kind: 'applied', commandDigest, connection: { ...connection, lastCommandId: commandId, lastCommandDigest: commandDigest } }
}
function withAuthorityDigest(connection: Omit<ProviderConnection, 'authorityDigest'>): ProviderConnection {
  return { ...connection, authorityDigest: providerConnectionAuthorityDigest(connection) }
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
  const next = withAuthorityDigest({
    ...current,
    lifecycle: 'revocation_pending',
    observedAt: now,
    revokedAt: now,
    ...(context.reasonCode === undefined ? {} : { reasonCode: context.reasonCode }),
    evidenceRefs: uniqueSorted([...current.evidenceRefs, ...context.evidenceRefs]),
    updatedAt: now,
  })
  return applied(next, context.commandId, commandDigest)
}

export function recordProviderConnectionCleanupResult(current: ProviderConnection | undefined, command: RecordProviderConnectionCleanupResultCommand, now: number): ProviderConnectionCommandResult {
  const context = normalizeCommandContext(command)
  if (context.kind === 'refused') return context
  if (!PROVIDER_CONNECTION_CLEANUP_OUTCOMES.includes(command.outcome)) return refusal('invalid_transition')
  const commandDigest = providerConnectionCommandDigest(COMMAND_KINDS.recordCleanupResult, {
    commandId: context.commandId,
    ...(context.reasonCode === undefined ? {} : { reasonCode: context.reasonCode }),
    evidenceRefs: context.evidenceRefs,
    expectedAuthorityGeneration: command.expectedAuthorityGeneration,
    expectedAuthorityDigest: command.expectedAuthorityDigest,
    outcome: command.outcome,
  })
  if (current === undefined) return refusal('invalid_transition')
  const replay = replayResult(current, context.commandId, commandDigest)
  if (replay !== null) return replay
  const integrity = stateIntegrity(current, now)
  if (integrity !== null) return refusal(integrity)
  const expected = expectedAuthorityIsCurrent(current, command.expectedAuthorityGeneration, command.expectedAuthorityDigest)
  if (expected !== null) return refusal(expected)
  if (current.lifecycle !== 'revocation_pending' && current.lifecycle !== 'cleanup_required') return refusal('invalid_transition')
  const common = {
    ...current,
    observedAt: now,
    evidenceRefs: uniqueSorted([...current.evidenceRefs, ...context.evidenceRefs]),
    updatedAt: now,
  }
  if (command.outcome === 'failed') {
    return applied({
      ...common,
      lifecycle: 'cleanup_required',
      ...(context.reasonCode === undefined ? {} : { reasonCode: context.reasonCode }),
    }, context.commandId, commandDigest)
  }
  const { lastCommandId: _lastCommandId, lastCommandDigest: _lastCommandDigest, ...withoutReceipt } = common
  return applied(withAuthorityDigest({
    ...withoutReceipt,
    credentialRef: null,
    lifecycle: 'revoked',
    revokedAt: current.revokedAt ?? now,
    ...(context.reasonCode === undefined ? {} : { reasonCode: context.reasonCode }),
  }), context.commandId, commandDigest)
}

export function projectProviderConnectionPublic(connection: ProviderConnection): ProviderConnectionPublicProjection {
  return {
    lifecycle: connection.lifecycle,
    available: connection.lifecycle === 'active' && (connection.expiresAt === undefined || connection.expiresAt > connection.observedAt),
    reasonCode: connection.reasonCode ?? null,
  }
}

export function resolveProviderConnectionCredentialRef(connection: ProviderConnection | undefined, expectedAuthorityGeneration: number, expectedAuthorityDigest: string, now: number): ProviderConnectionCredentialResolution {
  if (connection === undefined) return { kind: 'unavailable', reason: 'not_found' }
  if (connection.lifecycle !== 'active') return { kind: 'unavailable', reason: 'inactive' }
  if (!isProviderConnectionAuthorityCurrent(connection)) return { kind: 'unavailable', reason: 'digest_mismatch' }
  if (!validGeneration(expectedAuthorityGeneration) || expectedAuthorityGeneration !== connection.authorityGeneration) return { kind: 'unavailable', reason: 'stale_generation' }
  if (!isCanonicalDigest(expectedAuthorityDigest) || expectedAuthorityDigest !== connection.authorityDigest) return { kind: 'unavailable', reason: 'digest_mismatch' }
  if (!validTimestamp(now) || (connection.expiresAt !== undefined && connection.expiresAt <= now)) return { kind: 'unavailable', reason: 'expired' }
  if (connection.credentialRef === null || !isProviderConnectionCredentialRef(connection.credentialRef)) return { kind: 'unavailable', reason: 'credential_unavailable' }
  return { kind: 'resolved', credentialRef: connection.credentialRef }
}

export type { AuthorityCommandFields, CommandKind }