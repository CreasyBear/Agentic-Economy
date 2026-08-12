import { canonicalDigest, isCanonicalDigest } from '@/modules/common/canonical-digest'
import { uniqueSorted } from '@/modules/common/unique-sorted'

import { validPublicHttpsEndpoint } from './internal/transport-adapters'
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

export const PROVIDER_CONNECTION_CLEANUP_OUTCOMES = [
  'detached', 'revoked', 'already_revoked', 'unsupported', 'provider_refused', 'outcome_unknown',
] as const
export type ProviderConnectionCleanupOutcome = (typeof PROVIDER_CONNECTION_CLEANUP_OUTCOMES)[number]

export const PROVIDER_CONNECTION_CLEANUP_WORK_KINDS = ['lease_drain', 'cleanup'] as const
export type ProviderConnectionCleanupWorkKind = (typeof PROVIDER_CONNECTION_CLEANUP_WORK_KINDS)[number]

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
  revocationRef?: string
  cleanupAttempt?: number
  cleanupWorkId?: string
  cleanupWorkKind?: ProviderConnectionCleanupWorkKind
  cleanupCommandId?: string
  cleanupRequestDigest?: string
  cleanupCallbackGraceUntil?: number
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
  cleanupAttempt: number
  workId: string
  requestDigest: string
  outcome: ProviderConnectionCleanupOutcome
  responseDigest?: string
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

export type ProviderConnectionAuthorityValidation =
  | Readonly<{ kind: 'valid' }>
  | Readonly<{
      kind: 'unavailable'
      reason: Exclude<ProviderConnectionCredentialResolution, Readonly<{ kind: 'resolved' }>>['reason']
    }>
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
export type CreateX402ProviderConnectionCommand = Readonly<{
  commandId: string
  connectionRef: string
  businessId: string
  providerRef: string
  providerAccountRef: string
  resourceUrl: string
  evidenceRefs: readonly string[]
  expiresAt?: number
}>

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

export function projectProviderConnectionPublic(connection: ProviderConnection, now: number): ProviderConnectionPublicProjection {
  return {
    lifecycle: connection.lifecycle,
    available: validTimestamp(now) && connection.lifecycle === 'active' && (connection.expiresAt === undefined || connection.expiresAt > now),
    reasonCode: connection.reasonCode ?? null,
  }
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

export type { AuthorityCommandFields, CommandKind }
export const PROVIDER_CONNECTION_LEASE_STATES = ['active', 'consumed', 'expired', 'invalidated'] as const
export type ProviderConnectionLeaseState = (typeof PROVIDER_CONNECTION_LEASE_STATES)[number]

export const PROVIDER_CONNECTION_LEASE_REFUSAL_CODES = [
  'invalid_identity',
  'invalid_time',
  'invalid_generation',
  'invalid_digest',
  'invalid_scope',
  'invalid_resource',
  'invalid_lease',
  'invalid_transition',
  'connection_not_found',
  'connection_not_active',
  'connection_expired',
  'approval_missing',
  'approval_refused',
  'approval_stale',
  'approval_scope_mismatch',
  'approval_resource_mismatch',
  'readiness_expired',
  'readiness_mismatch',
  'lease_not_found',
  'lease_inactive',
  'lease_expired',
  'lease_generation_stale',
  'lease_digest_stale',
  'lease_scope_mismatch',
  'lease_resource_mismatch',
  'lease_identity_mismatch',
  'lease_not_expired',
  'command_identity_conflict',
] as const
export type ProviderConnectionLeaseRefusalCode = (typeof PROVIDER_CONNECTION_LEASE_REFUSAL_CODES)[number]

export type ProviderConnectionLeaseApproval = Readonly<{
  decisionRef: string
  decisionDigest: string
  providerRef: string
  providerAccountRef: string
  connectionRef: string
  authorityGeneration: number
  connectionAuthorityDigest: string
  decision: 'granted' | 'refused' | 'partial'
  grantedScopes: readonly string[]
  grantedResources: readonly string[]
}>

export type ProviderConnectionInvocationLease = Readonly<{
  leaseRef: string
  invocationRef: string
  operationRef: string
  connectionRef: string
  providerRef: string
  providerAccountRef: string
  adapterId: string
  authorityGeneration: number
  authorityDigest: string
  grantedScopes: readonly string[]
  grantedResources: readonly string[]
  approvalDecisionRef: string
  approvalDecisionDigest: string
  readinessValidUntil: number
  readinessDigest?: string
  state: ProviderConnectionLeaseState
  issuedAt: number
  expiresAt: number
  consumedAt?: number
  invalidatedAt?: number
  evidenceRefs: readonly string[]
  createdAt: number
  updatedAt: number
  lastCommandId?: string
  lastCommandDigest?: string
}>

export type ProviderConnectionLeaseAuthoritySnapshot = Readonly<{
  leaseRef: string
  invocationRef: string
  operationRef: string
  connectionRef: string
  providerRef: string
  providerAccountRef: string
  adapterId: string
  authorityGeneration: number
  authorityDigest: string
  grantedScopes: readonly string[]
  grantedResources: readonly string[]
  readinessValidUntil: number
  readinessDigest?: string
}>

export type IssueProviderConnectionLeaseCommand = Readonly<{
  commandId: string
  leaseRef: string
  invocationRef: string
  operationRef: string
  connectionRef: string
  providerRef: string
  providerAccountRef: string
  adapterId: string
  expectedAuthorityGeneration: number
  expectedAuthorityDigest: string
  requestedScopes: readonly string[]
  grantedScopes: readonly string[]
  requestedResources: readonly string[]
  grantedResources: readonly string[]
  approval: ProviderConnectionLeaseApproval
  readinessValidUntil: number
  readinessDigest?: string
  leaseMs: number
  evidenceRefs: readonly string[]
}>

export type ConsumeProviderConnectionLeaseCommand = Readonly<{
  commandId: string
  leaseRef: string
  expectedAuthorityGeneration: number
  expectedAuthorityDigest: string
  readinessValidUntil: number
  readinessDigest?: string
  evidenceRefs: readonly string[]
}>

export type ExpireProviderConnectionLeaseCommand = Readonly<{
  commandId: string
  leaseRef: string
  evidenceRefs: readonly string[]
}>

export type InvalidateProviderConnectionLeaseCommand = Readonly<{
  commandId: string
  leaseRef: string
  reasonCode: 'generation_changed' | 'revocation_started' | 'readiness_expired' | 'invocation_aborted'
  evidenceRefs: readonly string[]
}>

export type ProviderConnectionLeaseCommandResult =
  | Readonly<{ kind: 'applied'; lease: ProviderConnectionInvocationLease; commandDigest: string }>
  | Readonly<{ kind: 'duplicate'; lease: ProviderConnectionInvocationLease; commandDigest: string }>
  | Readonly<{ kind: 'refused'; code: ProviderConnectionLeaseRefusalCode }>

export type ProviderConnectionLeaseCredentialResolution =
  | Readonly<{ kind: 'resolved'; credentialRef: string }>
  | Readonly<{
      kind: 'unavailable'
      reason:
        | 'lease_not_found'
        | 'lease_inactive'
        | 'lease_expired'
        | 'lease_generation_stale'
        | 'lease_digest_stale'
        | 'lease_scope_mismatch'
        | 'lease_resource_mismatch'
        | 'lease_identity_mismatch'
        | 'connection_not_found'
        | 'connection_inactive'
        | 'connection_expired'
        | 'readiness_expired'
        | 'readiness_mismatch'
        | 'credential_unavailable'
    }>
export type ProviderConnectionLeaseAuthorityValidation =
  | Readonly<{ kind: 'valid' }>
  | Readonly<{
      kind: 'unavailable'
      reason: Exclude<ProviderConnectionLeaseCredentialResolution, Readonly<{ kind: 'resolved' }>>['reason']
    }>

const PROVIDER_CONNECTION_LEASE_MIN_MS = 100
const PROVIDER_CONNECTION_LEASE_MAX_MS = 120_000
const LEASE_COMMAND_KINDS = {
  issue: 'issue_lease',
  consume: 'consume_lease',
  expire: 'expire_lease',
  invalidate: 'invalidate_lease',
} as const
type LeaseCommandKind = (typeof LEASE_COMMAND_KINDS)[keyof typeof LEASE_COMMAND_KINDS]

function leaseRefusal(code: ProviderConnectionLeaseRefusalCode): ProviderConnectionLeaseCommandResult {
  return { kind: 'refused', code }
}

function leaseCommandDigest(kind: LeaseCommandKind, command: object): string {
  return canonicalDigest({ kind, ...Object.fromEntries(Object.entries(command).filter(([, value]) => value !== undefined)) })
}

function leaseReceipt(
  lease: ProviderConnectionInvocationLease,
  commandId: string,
  commandDigest: string,
): ProviderConnectionInvocationLease {
  return { ...lease, lastCommandId: commandId, lastCommandDigest: commandDigest }
}

function leaseReplay(
  current: ProviderConnectionInvocationLease | undefined,
  commandId: string,
  commandDigest: string,
): ProviderConnectionLeaseCommandResult | null {
  if (current === undefined || current.lastCommandId !== commandId) return null
  if (current.lastCommandDigest !== commandDigest) return leaseRefusal('command_identity_conflict')
  return { kind: 'duplicate', lease: current, commandDigest }
}

function leaseIdentity(value: unknown): value is string {
  return validIdentity(value)
}

function normalizeLeaseApproval(
  approval: ProviderConnectionLeaseApproval | undefined,
): ProviderConnectionLeaseApproval | ProviderConnectionLeaseRefusalCode {
  if (approval === undefined || typeof approval !== 'object'
    || !leaseIdentity(approval.decisionRef) || !isCanonicalDigest(approval.decisionDigest)
    || !leaseIdentity(approval.providerRef) || !leaseIdentity(approval.providerAccountRef)
    || !leaseIdentity(approval.connectionRef) || !validGeneration(approval.authorityGeneration)
    || !isCanonicalDigest(approval.connectionAuthorityDigest)
    || !['granted', 'refused', 'partial'].includes(approval.decision)) return 'approval_stale'
  const scopes = normalizeValues(approval.grantedScopes, 'invalid_scope')
  const resources = normalizeValues(approval.grantedResources, 'invalid_resource')
  if (scopes.kind === 'refused') return scopes.code
  if (resources.kind === 'refused') return resources.code
  return {
    ...approval,
    grantedScopes: scopes.values,
    grantedResources: resources.values,
  }
}

function normalizeLeaseIssueCommand(
  command: IssueProviderConnectionLeaseCommand,
  now: number,
): { kind: 'ok'; command: IssueProviderConnectionLeaseCommand } | { kind: 'refused'; code: ProviderConnectionLeaseRefusalCode } {
  if (!validTimestamp(now)) return { kind: 'refused', code: 'invalid_time' }
  if (!leaseIdentity(command.commandId) || !leaseIdentity(command.leaseRef)
    || !leaseIdentity(command.invocationRef) || !leaseIdentity(command.operationRef)
    || !leaseIdentity(command.connectionRef) || !leaseIdentity(command.providerRef)
    || !leaseIdentity(command.providerAccountRef) || !leaseIdentity(command.adapterId)) {
    return { kind: 'refused', code: 'invalid_identity' }
  }
  if (!validGeneration(command.expectedAuthorityGeneration)
    || !isCanonicalDigest(command.expectedAuthorityDigest)) {
    return { kind: 'refused', code: 'invalid_generation' }
  }
  if (!Number.isSafeInteger(command.leaseMs)
    || command.leaseMs < PROVIDER_CONNECTION_LEASE_MIN_MS
    || command.leaseMs > PROVIDER_CONNECTION_LEASE_MAX_MS) {
    return { kind: 'refused', code: 'invalid_time' }
  }
  if (!validTimestamp(command.readinessValidUntil) || command.readinessValidUntil <= now) {
    return { kind: 'refused', code: 'readiness_expired' }
  }
  if (command.readinessDigest !== undefined && !isCanonicalDigest(command.readinessDigest)) {
    return { kind: 'refused', code: 'invalid_digest' }
  }
  const requestedScopes = normalizeValues(command.requestedScopes, 'invalid_scope')
  const grantedScopes = normalizeValues(command.grantedScopes, 'invalid_scope')
  const requestedResources = normalizeValues(command.requestedResources, 'invalid_resource')
  const grantedResources = normalizeValues(command.grantedResources, 'invalid_resource')
  const evidenceRefs = normalizeEvidenceRefs(command.evidenceRefs)
  if (requestedScopes.kind === 'refused') return requestedScopes
  if (grantedScopes.kind === 'refused') return grantedScopes
  if (requestedResources.kind === 'refused') return requestedResources
  if (grantedResources.kind === 'refused') return grantedResources
  if (evidenceRefs.kind === 'refused') return evidenceRefs
  if (grantedScopes.values.some((scope) => !requestedScopes.values.includes(scope))) return { kind: 'refused', code: 'invalid_scope' }
  if (grantedResources.values.some((resource) => !requestedResources.values.includes(resource))) return { kind: 'refused', code: 'invalid_resource' }
  const approval = normalizeLeaseApproval(command.approval)
  if (typeof approval === 'string') return { kind: 'refused', code: approval }
  return {
    kind: 'ok',
    command: {
      ...command,
      requestedScopes: requestedScopes.values,
      grantedScopes: grantedScopes.values,
      requestedResources: requestedResources.values,
      grantedResources: grantedResources.values,
      approval,
      evidenceRefs: evidenceRefs.values,
    },
  }
}

function leaseApprovalRefusal(
  command: IssueProviderConnectionLeaseCommand,
  approval: ProviderConnectionLeaseApproval,
  current: ProviderConnection,
): ProviderConnectionLeaseRefusalCode | null {
  if (approval.decision === 'refused') return 'approval_refused'
  if (approval.connectionRef !== current.connectionRef
    || approval.providerRef !== current.providerRef
    || approval.providerAccountRef !== current.providerAccountRef
    || approval.authorityGeneration !== current.authorityGeneration
    || approval.connectionAuthorityDigest !== current.authorityDigest) return 'approval_stale'
  if (command.connectionRef !== current.connectionRef
    || command.providerRef !== current.providerRef
    || command.providerAccountRef !== current.providerAccountRef
    || command.adapterId !== current.adapterId) return 'lease_identity_mismatch'
  if (command.grantedScopes.some((scope) => !current.grantedScopes.includes(scope)
    || !approval.grantedScopes.includes(scope))) return 'approval_scope_mismatch'
  if (command.grantedResources.some((resource) => !current.grantedResources.includes(resource)
    || !approval.grantedResources.includes(resource))) return 'approval_resource_mismatch'
  return null
}
function leaseApprovalCurrentRefusal(
  lease: ProviderConnectionInvocationLease,
  approval: ProviderConnectionLeaseApproval | null,
): ProviderConnectionLeaseRefusalCode | null {
  if (approval === null) return 'approval_missing'
  if (approval.decisionRef !== lease.approvalDecisionRef
    || approval.decisionDigest !== lease.approvalDecisionDigest
    || approval.decision === 'refused'
    || approval.connectionRef !== lease.connectionRef
    || approval.providerRef !== lease.providerRef
    || approval.providerAccountRef !== lease.providerAccountRef
    || approval.authorityGeneration !== lease.authorityGeneration
    || approval.connectionAuthorityDigest !== lease.authorityDigest) return 'approval_stale'
  if (lease.grantedScopes.some((scope) => !approval.grantedScopes.includes(scope))) return 'approval_scope_mismatch'
  if (lease.grantedResources.some((resource) => !approval.grantedResources.includes(resource))) return 'approval_resource_mismatch'
  return null
}


function leaseCurrentRefusal(
  lease: ProviderConnectionInvocationLease,
  current: ProviderConnection | undefined,
  expected: ProviderConnectionLeaseAuthoritySnapshot,
  now: number,
): ProviderConnectionLeaseRefusalCode | null {
  if (!validTimestamp(now)) return 'invalid_time'
  if (!leaseIdentity(expected.leaseRef) || expected.leaseRef !== lease.leaseRef
    || expected.invocationRef !== lease.invocationRef
    || expected.operationRef !== lease.operationRef
    || expected.connectionRef !== lease.connectionRef
    || expected.providerRef !== lease.providerRef
    || expected.providerAccountRef !== lease.providerAccountRef
    || expected.adapterId !== lease.adapterId) return 'lease_identity_mismatch'
  if (lease.state !== 'active') return lease.state === 'expired' ? 'lease_expired' : 'lease_inactive'
  if (lease.expiresAt <= now) return 'lease_expired'
  if (current === undefined) return 'connection_not_found'
  if (current.lifecycle !== 'active') return 'connection_not_active'
  if (current.expiresAt !== undefined && current.expiresAt <= now) return 'connection_expired'
  if (!isProviderConnectionAuthorityCurrent(current)) return 'lease_digest_stale'
  if (current.authorityGeneration !== lease.authorityGeneration
    || current.authorityGeneration !== expected.authorityGeneration) return 'lease_generation_stale'
  if (current.authorityDigest !== lease.authorityDigest
    || current.authorityDigest !== expected.authorityDigest) return 'lease_digest_stale'
  if (current.providerRef !== lease.providerRef || current.providerAccountRef !== lease.providerAccountRef
    || current.adapterId !== lease.adapterId) return 'lease_identity_mismatch'
  if (uniqueSorted(current.grantedScopes).join('\u0000') !== uniqueSorted(lease.grantedScopes).join('\u0000')
    || uniqueSorted(current.grantedScopes).join('\u0000') !== uniqueSorted(expected.grantedScopes).join('\u0000')) return 'lease_scope_mismatch'
  if (uniqueSorted(current.grantedResources).join('\u0000') !== uniqueSorted(lease.grantedResources).join('\u0000')
    || uniqueSorted(current.grantedResources).join('\u0000') !== uniqueSorted(expected.grantedResources).join('\u0000')) return 'lease_resource_mismatch'
  if (!validTimestamp(expected.readinessValidUntil) || expected.readinessValidUntil <= now
    || lease.readinessValidUntil !== expected.readinessValidUntil) return 'readiness_expired'
  if (lease.readinessDigest !== expected.readinessDigest) return 'readiness_mismatch'
  return null
}

function leaseExpectedSnapshot(
  lease: ProviderConnectionInvocationLease,
  command: ConsumeProviderConnectionLeaseCommand,
): ProviderConnectionLeaseAuthoritySnapshot {
  return {
    leaseRef: lease.leaseRef,
    invocationRef: lease.invocationRef,
    operationRef: lease.operationRef,
    connectionRef: lease.connectionRef,
    providerRef: lease.providerRef,
    providerAccountRef: lease.providerAccountRef,
    adapterId: lease.adapterId,
    authorityGeneration: command.expectedAuthorityGeneration,
    authorityDigest: command.expectedAuthorityDigest,
    grantedScopes: lease.grantedScopes,
    grantedResources: lease.grantedResources,
    readinessValidUntil: command.readinessValidUntil,
    ...(command.readinessDigest === undefined ? {} : { readinessDigest: command.readinessDigest }),
  }
}

export function providerConnectionLeaseAuthoritySnapshot(
  lease: ProviderConnectionInvocationLease,
): ProviderConnectionLeaseAuthoritySnapshot {
  return {
    leaseRef: lease.leaseRef,
    invocationRef: lease.invocationRef,
    operationRef: lease.operationRef,
    connectionRef: lease.connectionRef,
    providerRef: lease.providerRef,
    providerAccountRef: lease.providerAccountRef,
    adapterId: lease.adapterId,
    authorityGeneration: lease.authorityGeneration,
    authorityDigest: lease.authorityDigest,
    grantedScopes: uniqueSorted(lease.grantedScopes),
    grantedResources: uniqueSorted(lease.grantedResources),
    readinessValidUntil: lease.readinessValidUntil,
    ...(lease.readinessDigest === undefined ? {} : { readinessDigest: lease.readinessDigest }),
  }
}

export function issueProviderConnectionLease(
  current: ProviderConnection | undefined,
  command: IssueProviderConnectionLeaseCommand,
  now: number,
  existing?: ProviderConnectionInvocationLease,
): ProviderConnectionLeaseCommandResult {
  const normalized = normalizeLeaseIssueCommand(command, now)
  if (normalized.kind === 'refused') return normalized
  const commandDigest = leaseCommandDigest(LEASE_COMMAND_KINDS.issue, normalized.command)
  const replay = leaseReplay(existing, normalized.command.commandId, commandDigest)
  if (replay !== null) return replay
  if (existing !== undefined) return leaseRefusal('invalid_lease')
  if (current === undefined) return leaseRefusal('connection_not_found')
  const integrity = stateIntegrity(current, now)
  if (integrity !== null) return leaseRefusal(integrity)
  if (current.lifecycle !== 'active') return leaseRefusal('connection_not_active')
  if (current.expiresAt !== undefined && current.expiresAt <= now) return leaseRefusal('connection_expired')
  if (current.authorityGeneration !== normalized.command.expectedAuthorityGeneration) return leaseRefusal('invalid_generation')
  if (current.authorityDigest !== normalized.command.expectedAuthorityDigest) return leaseRefusal('invalid_digest')
  const approvalError = leaseApprovalRefusal(normalized.command, normalized.command.approval, current)
  if (approvalError !== null) return leaseRefusal(approvalError)
  const expiresAt = now + normalized.command.leaseMs
  if (current.expiresAt !== undefined && expiresAt > current.expiresAt) return leaseRefusal('invalid_time')
  const lease: ProviderConnectionInvocationLease = {
    leaseRef: normalized.command.leaseRef,
    invocationRef: normalized.command.invocationRef,
    operationRef: normalized.command.operationRef,
    connectionRef: current.connectionRef,
    providerRef: current.providerRef,
    providerAccountRef: current.providerAccountRef,
    adapterId: current.adapterId,
    authorityGeneration: current.authorityGeneration,
    authorityDigest: current.authorityDigest,
    grantedScopes: normalized.command.grantedScopes,
    grantedResources: normalized.command.grantedResources,
    approvalDecisionRef: normalized.command.approval.decisionRef,
    approvalDecisionDigest: normalized.command.approval.decisionDigest,
    readinessValidUntil: normalized.command.readinessValidUntil,
    ...(normalized.command.readinessDigest === undefined ? {} : { readinessDigest: normalized.command.readinessDigest }),
    state: 'active',
    issuedAt: now,
    expiresAt,
    evidenceRefs: normalized.command.evidenceRefs,
    createdAt: now,
    updatedAt: now,
  }
  return { kind: 'applied', lease: leaseReceipt(lease, normalized.command.commandId, commandDigest), commandDigest }
}

type ProviderConnectionLeaseUnavailableReason = Exclude<
  ProviderConnectionLeaseCredentialResolution,
  Readonly<{ kind: 'resolved' }>
>['reason']

function leaseCredentialFailureReason(
  refusal: ProviderConnectionLeaseRefusalCode,
): ProviderConnectionLeaseUnavailableReason {
  switch (refusal) {
    case 'connection_not_found': return 'connection_not_found'
    case 'connection_not_active': return 'connection_inactive'
    case 'connection_expired': return 'connection_expired'
    case 'lease_expired': return 'lease_expired'
    case 'lease_inactive': return 'lease_inactive'
    case 'lease_generation_stale': return 'lease_generation_stale'
    case 'lease_digest_stale': return 'lease_digest_stale'
    case 'lease_scope_mismatch':
    case 'approval_scope_mismatch': return 'lease_scope_mismatch'
    case 'lease_resource_mismatch':
    case 'approval_resource_mismatch': return 'lease_resource_mismatch'
    case 'lease_identity_mismatch': return 'lease_identity_mismatch'
    case 'readiness_expired': return 'readiness_expired'
    case 'readiness_mismatch': return 'readiness_mismatch'
    default: return 'lease_digest_stale'
  }
}

export function validateProviderConnectionLeaseAuthority(
  connection: ProviderConnection | undefined,
  lease: ProviderConnectionInvocationLease | undefined,
  expected: ProviderConnectionLeaseAuthoritySnapshot,
  now: number,
  currentApproval: ProviderConnectionLeaseApproval | null,
): ProviderConnectionLeaseAuthorityValidation {
  if (lease === undefined) return { kind: 'unavailable', reason: 'lease_not_found' }
  const refusal = leaseCurrentRefusal(lease, connection, expected, now)
  if (refusal !== null) return { kind: 'unavailable', reason: leaseCredentialFailureReason(refusal) }
  const approvalRefusal = leaseApprovalCurrentRefusal(lease, currentApproval)
  if (approvalRefusal !== null) {
    return { kind: 'unavailable', reason: leaseCredentialFailureReason(approvalRefusal) }
  }
  return { kind: 'valid' }
}

export function resolveProviderConnectionCredentialRefForLease(
  connection: ProviderConnection | undefined,
  lease: ProviderConnectionInvocationLease | undefined,
  expected: ProviderConnectionLeaseAuthoritySnapshot,
  now: number,
  currentApproval: ProviderConnectionLeaseApproval | null,
): ProviderConnectionLeaseCredentialResolution {
  const validation = validateProviderConnectionLeaseAuthority(
    connection,
    lease,
    expected,
    now,
    currentApproval,
  )
  if (validation.kind === 'unavailable') return validation
  if (connection?.credentialRef === null || connection === undefined
    || !isProviderConnectionCredentialRef(connection.credentialRef)) {
    return { kind: 'unavailable', reason: 'credential_unavailable' }
  }
  return { kind: 'resolved', credentialRef: connection.credentialRef }
}

export function consumeProviderConnectionLease(
  lease: ProviderConnectionInvocationLease | undefined,
  current: ProviderConnection | undefined,
  command: ConsumeProviderConnectionLeaseCommand,
  now: number,
): ProviderConnectionLeaseCommandResult {
  if (!leaseIdentity(command.commandId) || !leaseIdentity(command.leaseRef)) return leaseRefusal('invalid_identity')
  if (!Array.isArray(command.evidenceRefs)) return leaseRefusal('invalid_identity')
  const evidenceRefs = normalizeEvidenceRefs(command.evidenceRefs)
  if (evidenceRefs.kind === 'refused') return evidenceRefs
  const commandDigest = leaseCommandDigest(LEASE_COMMAND_KINDS.consume, {
    commandId: command.commandId,
    leaseRef: command.leaseRef,
    expectedAuthorityGeneration: command.expectedAuthorityGeneration,
    expectedAuthorityDigest: command.expectedAuthorityDigest,
    readinessValidUntil: command.readinessValidUntil,
    ...(command.readinessDigest === undefined ? {} : { readinessDigest: command.readinessDigest }),
    evidenceRefs: evidenceRefs.values,
  })
  const replay = leaseReplay(lease, command.commandId, commandDigest)
  if (replay !== null) return replay
  if (lease === undefined) return leaseRefusal('lease_not_found')
  const expected = leaseExpectedSnapshot(lease, { ...command, evidenceRefs: evidenceRefs.values })
  const refusal = leaseCurrentRefusal(lease, current, expected, now)
  if (refusal !== null) return leaseRefusal(refusal)
  const consumed: ProviderConnectionInvocationLease = {
    ...lease,
    state: 'consumed',
    consumedAt: now,
    evidenceRefs: uniqueSorted([...lease.evidenceRefs, ...evidenceRefs.values]),
    updatedAt: now,
  }
  return { kind: 'applied', lease: leaseReceipt(consumed, command.commandId, commandDigest), commandDigest }
}

export function expireProviderConnectionLease(
  lease: ProviderConnectionInvocationLease | undefined,
  command: ExpireProviderConnectionLeaseCommand,
  now: number,
): ProviderConnectionLeaseCommandResult {
  if (!leaseIdentity(command.commandId) || !leaseIdentity(command.leaseRef)) return leaseRefusal('invalid_identity')
  const evidenceRefs = normalizeEvidenceRefs(command.evidenceRefs)
  if (evidenceRefs.kind === 'refused') return evidenceRefs
  const commandDigest = leaseCommandDigest(LEASE_COMMAND_KINDS.expire, {
    commandId: command.commandId, leaseRef: command.leaseRef, evidenceRefs: evidenceRefs.values,
  })
  const replay = leaseReplay(lease, command.commandId, commandDigest)
  if (replay !== null) return replay
  if (lease === undefined) return leaseRefusal('lease_not_found')
  if (lease.leaseRef !== command.leaseRef) return leaseRefusal('lease_identity_mismatch')
  if (lease.state !== 'active') return leaseRefusal('lease_inactive')
  if (!validTimestamp(now)) return leaseRefusal('invalid_time')
  if (now < lease.expiresAt) return leaseRefusal('lease_not_expired')
  const expired: ProviderConnectionInvocationLease = {
    ...lease,
    state: 'expired',
    evidenceRefs: uniqueSorted([...lease.evidenceRefs, ...evidenceRefs.values]),
    updatedAt: now,
  }
  return { kind: 'applied', lease: leaseReceipt(expired, command.commandId, commandDigest), commandDigest }
}

export function invalidateProviderConnectionLease(
  lease: ProviderConnectionInvocationLease | undefined,
  command: InvalidateProviderConnectionLeaseCommand,
  now: number,
): ProviderConnectionLeaseCommandResult {
  if (!leaseIdentity(command.commandId) || !leaseIdentity(command.leaseRef)) return leaseRefusal('invalid_identity')
  if (!['generation_changed', 'revocation_started', 'readiness_expired', 'invocation_aborted'].includes(command.reasonCode)) return leaseRefusal('invalid_transition')
  const evidenceRefs = normalizeEvidenceRefs(command.evidenceRefs)
  if (evidenceRefs.kind === 'refused') return evidenceRefs
  const commandDigest = leaseCommandDigest(LEASE_COMMAND_KINDS.invalidate, {
    commandId: command.commandId, leaseRef: command.leaseRef, reasonCode: command.reasonCode, evidenceRefs: evidenceRefs.values,
  })
  const replay = leaseReplay(lease, command.commandId, commandDigest)
  if (replay !== null) return replay
  if (lease === undefined) return leaseRefusal('lease_not_found')
  if (lease.leaseRef !== command.leaseRef) return leaseRefusal('lease_identity_mismatch')
  if (lease.state !== 'active') return leaseRefusal('lease_inactive')
  if (!validTimestamp(now)) return leaseRefusal('invalid_time')
  const invalidated: ProviderConnectionInvocationLease = {
    ...lease,
    state: 'invalidated',
    invalidatedAt: now,
    evidenceRefs: uniqueSorted([...lease.evidenceRefs, ...evidenceRefs.values]),
    updatedAt: now,
  }
  return { kind: 'applied', lease: leaseReceipt(invalidated, command.commandId, commandDigest), commandDigest }
}

export type ProviderConnectionOwnerProjection = Readonly<{
  connectionRef: string
  businessId: string
  providerRef: string
  providerAccountRef: string
  adapterId: string
  grantedScopes: readonly string[]
  grantedResources: readonly string[]
  authorityGeneration: number
  authorityDigest: string
  lifecycle: ProviderConnectionLifecycle
  available: boolean
  credentialConfigured: boolean
  observedAt: number
  expiresAt?: number
  revokedAt?: number
  reasonCode: string | null
  evidenceRefs: readonly string[]
  createdAt: number
  updatedAt: number
}>

export function projectProviderConnectionOwner(
  connection: ProviderConnection,
  now: number,
): ProviderConnectionOwnerProjection {
  return {
    connectionRef: connection.connectionRef,
    businessId: connection.businessId,
    providerRef: connection.providerRef,
    providerAccountRef: connection.providerAccountRef,
    adapterId: connection.adapterId,
    grantedScopes: uniqueSorted(connection.grantedScopes),
    grantedResources: uniqueSorted(connection.grantedResources),
    authorityGeneration: connection.authorityGeneration,
    authorityDigest: connection.authorityDigest,
    lifecycle: connection.lifecycle,
    available: validTimestamp(now) && connection.lifecycle === 'active'
      && (connection.expiresAt === undefined || connection.expiresAt > now),
    credentialConfigured: connection.credentialRef !== null,
    observedAt: connection.observedAt,
    ...(connection.expiresAt === undefined ? {} : { expiresAt: connection.expiresAt }),
    ...(connection.revokedAt === undefined ? {} : { revokedAt: connection.revokedAt }),
    reasonCode: connection.reasonCode ?? null,
    evidenceRefs: [...connection.evidenceRefs],
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  }
}

export type RotateProviderConnectionCommand = ReauthorizeProviderConnectionCommand
export type ReconnectProviderConnectionCommand = ReauthorizeProviderConnectionCommand

export function rotateProviderConnection(
  current: ProviderConnection | undefined,
  command: RotateProviderConnectionCommand,
  now: number,
): ProviderConnectionCommandResult {
  return reauthorizeProviderConnection(current, command, now)
}

export function reconnectProviderConnection(
  current: ProviderConnection | undefined,
  command: ReconnectProviderConnectionCommand,
  now: number,
): ProviderConnectionCommandResult {
  return reauthorizeProviderConnection(current, command, now)
}