import { canonicalDigest, isCanonicalDigest } from '@/modules/common/canonical-digest'
import { uniqueSorted } from '@/modules/common/unique-sorted'

import { isProviderConnectionCredentialRef, type ProviderConnection } from './types'
import {
  isProviderConnectionAuthorityCurrent,
  normalizeEvidenceRefs,
  normalizeValues,
  stateIntegrity,
  validGeneration,
  validIdentity,
  validTimestamp,
} from './shared'

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
  /** Staged compatibility mapping. Absence is a denial, not a legacy fallback. */
  canonicalLeaseRef?: string
  canonicalConnectionRef?: string
  canonicalConnectionGeneration?: number
  owningAccountRef?: string
  activeAccountRef?: string
  actorPrincipalRef?: string
  grantRef?: string
  grantGeneration?: number
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
