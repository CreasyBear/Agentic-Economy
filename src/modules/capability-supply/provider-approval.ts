import { canonicalDigest, isCanonicalDigest } from '@/modules/common/canonical-digest'
import { uniqueSorted } from '@/modules/common/unique-sorted'

import { boundedTrimmed, MAX_CONTEXT_VALUE_LENGTH, MAX_EVIDENCE_REF_LENGTH } from './internal/shared'

export const PROVIDER_APPROVAL_DECISIONS = ['granted', 'refused', 'partial'] as const
export type ProviderApprovalDecisionKind = (typeof PROVIDER_APPROVAL_DECISIONS)[number]

export const PROVIDER_APPROVAL_REFUSAL_CODES = [
  'invalid_identity',
  'invalid_scope',
  'invalid_resource',
  'invalid_decision',
  'invalid_time',
  'invalid_generation',
  'invalid_digest',
  'invalid_evidence',
  'connection_not_found',
  'connection_not_active',
  'stale_generation',
  'stale_digest',
  'authority_identity_mismatch',
  'credential_material_forbidden',
  'decision_conflict',
  'command_identity_conflict',
] as const
export type ProviderApprovalRefusalCode = (typeof PROVIDER_APPROVAL_REFUSAL_CODES)[number]

export type ProviderApprovalAuthoritySnapshot = Readonly<{
  connectionRef: string
  providerRef: string
  providerAccountRef: string
  authorityGeneration: number
  authorityDigest: string
}>

export type IssueProviderApprovalDecisionCommand = Readonly<{
  commandId: string
  decisionRef: string
  providerRef: string
  providerAccountRef: string
  connectionRef: string
  authorityGeneration: number
  connectionAuthorityDigest: string
  requestedScopes: readonly string[]
  grantedScopes: readonly string[]
  requestedResources: readonly string[]
  grantedResources: readonly string[]
  decision: ProviderApprovalDecisionKind
  decisionMakerAuthorityRef: string
  reasonCode: string
  evidenceRefs: readonly string[]
}>


export type ProviderApprovalDecision = Readonly<{
  decisionRef: string
  commandId: string
  commandDigest: string
  providerRef: string
  providerAccountRef: string
  connectionRef: string
  authorityGeneration: number
  connectionAuthorityDigest: string
  requestedScopes: readonly string[]
  grantedScopes: readonly string[]
  requestedResources: readonly string[]
  grantedResources: readonly string[]
  decision: ProviderApprovalDecisionKind
  decisionDigest: string
  decisionTime: number
  decisionMakerAuthorityRef: string
  reasonCode: string
  evidenceRefs: readonly string[]
}>

export type ProviderApprovalDecisionCommandResult =
  | Readonly<{ kind: 'applied'; decision: ProviderApprovalDecision; commandDigest: string }>
  | Readonly<{ kind: 'duplicate'; decision: ProviderApprovalDecision; commandDigest: string }>
  | Readonly<{ kind: 'refused'; code: ProviderApprovalRefusalCode }>


export type ExistingProviderApprovalDecisions = Readonly<{
  byCommandId?: ProviderApprovalDecision
  byDecisionRef?: ProviderApprovalDecision
  byConnectionGeneration?: ProviderApprovalDecision
}>

const MAX_SET_ITEMS = 64
const VALID_DECISIONS: Record<ProviderApprovalDecisionKind, true> = { granted: true, refused: true, partial: true }
const CREDENTIAL_VALUE = /(?:^|\b)(?:bearer|basic)\s+\S+|(?:eyJ|sk-|pk-|ghp_|github_pat_|xox[baprs]-|ya29\.)|(?:access[_-]?token|refresh[_-]?token|api[_-]?key|client[_-]?secret|authorization|token|secret|password|oauth|credential)\s*[:=]\s*\S+/i
const FORBIDDEN_COMMAND_KEYS = /(?:authorization|credential|token|secret|password|oauth|api[_-]?key)/i

function refused(code: ProviderApprovalRefusalCode): ProviderApprovalDecisionCommandResult {
  return { kind: 'refused', code }
}

function validTimestamp(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

function validGeneration(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1
}

function containsCredentialMaterial(value: string): boolean {
  return CREDENTIAL_VALUE.test(value)
}

function validIdentity(value: unknown, maximumLength = MAX_CONTEXT_VALUE_LENGTH): value is string {
  return typeof value === 'string' && boundedTrimmed(value, maximumLength) && !containsCredentialMaterial(value)
}

function hasForbiddenCommandKey(command: object): boolean {
  return Object.keys(command).some((key) => FORBIDDEN_COMMAND_KEYS.test(key))
}

function normalizeSet(
  values: readonly string[],
  code: 'invalid_scope' | 'invalid_resource',
): { kind: 'ok'; values: readonly string[] } | { kind: 'refused'; code: ProviderApprovalRefusalCode } {
  if (!Array.isArray(values) || values.length > MAX_SET_ITEMS) return { kind: 'refused', code }
  if (values.some((value) => !validIdentity(value))) return { kind: 'refused', code }
  return { kind: 'ok', values: uniqueSorted(values) }
}

function normalizeEvidenceRefs(
  values: readonly string[],
): { kind: 'ok'; values: readonly string[] } | { kind: 'refused'; code: ProviderApprovalRefusalCode } {
  if (!Array.isArray(values) || values.length === 0 || values.length > MAX_SET_ITEMS) {
    return { kind: 'refused', code: 'invalid_evidence' }
  }
  if (values.some((value) => !validIdentity(value, MAX_EVIDENCE_REF_LENGTH))) {
    return { kind: 'refused', code: 'invalid_evidence' }
  }
  return { kind: 'ok', values: uniqueSorted(values) }
}

type NormalizedApprovalCommand = Omit<
  IssueProviderApprovalDecisionCommand,
  'requestedScopes' | 'grantedScopes' | 'requestedResources' | 'grantedResources' | 'evidenceRefs'
> & Readonly<{
  requestedScopes: readonly string[]
  grantedScopes: readonly string[]
  requestedResources: readonly string[]
  grantedResources: readonly string[]
  evidenceRefs: readonly string[]
}>

function normalizeCommand(
  command: IssueProviderApprovalDecisionCommand,
): { kind: 'ok'; command: NormalizedApprovalCommand } | { kind: 'refused'; code: ProviderApprovalRefusalCode } {
  if (typeof command !== 'object' || command === null || hasForbiddenCommandKey(command)) {
    return { kind: 'refused', code: 'credential_material_forbidden' }
  }
  if (!validIdentity(command.commandId) || !validIdentity(command.decisionRef)
    || !validIdentity(command.providerRef) || !validIdentity(command.providerAccountRef)
    || !validIdentity(command.connectionRef) || !validIdentity(command.decisionMakerAuthorityRef)
    || !validIdentity(command.reasonCode)) {
    return { kind: 'refused', code: 'invalid_identity' }
  }
  if (!validGeneration(command.authorityGeneration)) return { kind: 'refused', code: 'invalid_generation' }
  if (!isCanonicalDigest(command.connectionAuthorityDigest)) return { kind: 'refused', code: 'invalid_digest' }
  if (VALID_DECISIONS[command.decision] !== true) return { kind: 'refused', code: 'invalid_decision' }

  const requestedScopes = normalizeSet(command.requestedScopes, 'invalid_scope')
  const grantedScopes = normalizeSet(command.grantedScopes, 'invalid_scope')
  const requestedResources = normalizeSet(command.requestedResources, 'invalid_resource')
  const grantedResources = normalizeSet(command.grantedResources, 'invalid_resource')
  const evidenceRefs = normalizeEvidenceRefs(command.evidenceRefs)
  if (requestedScopes.kind === 'refused') return requestedScopes
  if (grantedScopes.kind === 'refused') return grantedScopes
  if (requestedResources.kind === 'refused') return requestedResources
  if (grantedResources.kind === 'refused') return grantedResources
  if (evidenceRefs.kind === 'refused') return evidenceRefs

  if (grantedScopes.values.some((scope) => !requestedScopes.values.includes(scope))) {
    return { kind: 'refused', code: 'invalid_scope' }
  }
  if (grantedResources.values.some((resource) => !requestedResources.values.includes(resource))) {
    return { kind: 'refused', code: 'invalid_resource' }
  }

  const scopesEqual = sameSet(requestedScopes.values, grantedScopes.values)
  const resourcesEqual = sameSet(requestedResources.values, grantedResources.values)
  if (command.decision === 'granted' && (!scopesEqual || !resourcesEqual)) {
    return { kind: 'refused', code: 'invalid_decision' }
  }
  if (command.decision === 'refused' && (grantedScopes.values.length > 0 || grantedResources.values.length > 0)) {
    return { kind: 'refused', code: 'invalid_decision' }
  }
  if (command.decision === 'partial' && (
    grantedScopes.values.length === 0 || grantedResources.values.length === 0
    || scopesEqual || resourcesEqual
  )) {
    return { kind: 'refused', code: 'invalid_decision' }
  }

  return {
    kind: 'ok',
    command: {
      commandId: command.commandId,
      decisionRef: command.decisionRef,
      providerRef: command.providerRef,
      providerAccountRef: command.providerAccountRef,
      connectionRef: command.connectionRef,
      authorityGeneration: command.authorityGeneration,
      connectionAuthorityDigest: command.connectionAuthorityDigest,
      requestedScopes: requestedScopes.values,
      grantedScopes: grantedScopes.values,
      requestedResources: requestedResources.values,
      grantedResources: grantedResources.values,
      decision: command.decision,
      decisionMakerAuthorityRef: command.decisionMakerAuthorityRef,
      reasonCode: command.reasonCode,
      evidenceRefs: evidenceRefs.values,
    },
  }
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function commandMaterial(command: NormalizedApprovalCommand): object {
  return {
    kind: 'provider_approval_decision',
    commandId: command.commandId,
    decisionRef: command.decisionRef,
    providerRef: command.providerRef,
    providerAccountRef: command.providerAccountRef,
    connectionRef: command.connectionRef,
    authorityGeneration: command.authorityGeneration,
    connectionAuthorityDigest: command.connectionAuthorityDigest,
    requestedScopes: command.requestedScopes,
    grantedScopes: command.grantedScopes,
    requestedResources: command.requestedResources,
    grantedResources: command.grantedResources,
    decision: command.decision,
    decisionMakerAuthorityRef: command.decisionMakerAuthorityRef,
    reasonCode: command.reasonCode,
    evidenceRefs: command.evidenceRefs,
  }
}

export function providerApprovalCommandDigest(command: IssueProviderApprovalDecisionCommand): string {
  const normalized = normalizeCommand(command)
  if (normalized.kind === 'refused') throw new Error(`provider_approval_command_invalid:${normalized.code}`)
  return canonicalDigest(commandMaterial(normalized.command))
}

export function providerApprovalDecisionDigest(
  decision: Omit<ProviderApprovalDecision, 'decisionDigest' | 'commandDigest'>,
): string {
  return canonicalDigest({
    kind: 'provider_approval_decision',
    decisionRef: decision.decisionRef,
    providerRef: decision.providerRef,
    providerAccountRef: decision.providerAccountRef,
    connectionRef: decision.connectionRef,
    authorityGeneration: decision.authorityGeneration,
    connectionAuthorityDigest: decision.connectionAuthorityDigest,
    requestedScopes: uniqueSorted(decision.requestedScopes),
    grantedScopes: uniqueSorted(decision.grantedScopes),
    requestedResources: uniqueSorted(decision.requestedResources),
    grantedResources: uniqueSorted(decision.grantedResources),
    decision: decision.decision,
    decisionTime: decision.decisionTime,
    decisionMakerAuthorityRef: decision.decisionMakerAuthorityRef,
    reasonCode: decision.reasonCode,
    evidenceRefs: uniqueSorted(decision.evidenceRefs),
  })
}
export function isProviderApprovalDecisionIntegrityValid(decision: ProviderApprovalDecision): boolean {
  if (!validTimestamp(decision.decisionTime) || !validGeneration(decision.authorityGeneration)) return false
  if (!isCanonicalDigest(decision.commandDigest) || !isCanonicalDigest(decision.decisionDigest)
    || !isCanonicalDigest(decision.connectionAuthorityDigest)) return false
  if (!validIdentity(decision.decisionRef) || !validIdentity(decision.commandId)
    || !validIdentity(decision.providerRef) || !validIdentity(decision.providerAccountRef)
    || !validIdentity(decision.connectionRef) || !validIdentity(decision.decisionMakerAuthorityRef)
    || !validIdentity(decision.reasonCode)) return false
  if (!Array.isArray(decision.requestedScopes) || !Array.isArray(decision.grantedScopes)
    || !Array.isArray(decision.requestedResources) || !Array.isArray(decision.grantedResources)
    || !Array.isArray(decision.evidenceRefs)) return false
  if (uniqueSorted(decision.requestedScopes).join('\u0000') !== decision.requestedScopes.join('\u0000')
    || uniqueSorted(decision.grantedScopes).join('\u0000') !== decision.grantedScopes.join('\u0000')
    || uniqueSorted(decision.requestedResources).join('\u0000') !== decision.requestedResources.join('\u0000')
    || uniqueSorted(decision.grantedResources).join('\u0000') !== decision.grantedResources.join('\u0000')
    || uniqueSorted(decision.evidenceRefs).join('\u0000') !== decision.evidenceRefs.join('\u0000')) return false
  const normalized = normalizeCommand({
    commandId: decision.commandId,
    decisionRef: decision.decisionRef,
    providerRef: decision.providerRef,
    providerAccountRef: decision.providerAccountRef,
    connectionRef: decision.connectionRef,
    authorityGeneration: decision.authorityGeneration,
    connectionAuthorityDigest: decision.connectionAuthorityDigest,
    requestedScopes: decision.requestedScopes,
    grantedScopes: decision.grantedScopes,
    requestedResources: decision.requestedResources,
    grantedResources: decision.grantedResources,
    decision: decision.decision,
    decisionMakerAuthorityRef: decision.decisionMakerAuthorityRef,
    reasonCode: decision.reasonCode,
    evidenceRefs: decision.evidenceRefs,
  })
  if (normalized.kind === 'refused') return false
  return providerApprovalCommandDigest(normalized.command) === decision.commandDigest
    && providerApprovalDecisionDigest(decision) === decision.decisionDigest
}

function authorityRefusal(
  command: NormalizedApprovalCommand,
  current: ProviderApprovalAuthoritySnapshot | undefined,
): ProviderApprovalRefusalCode | null {
  if (current === undefined) return 'connection_not_found'
  if (current.connectionRef !== command.connectionRef || current.providerRef !== command.providerRef
    || current.providerAccountRef !== command.providerAccountRef) return 'authority_identity_mismatch'
  if (!validGeneration(current.authorityGeneration)) return 'invalid_generation'
  if (current.authorityGeneration !== command.authorityGeneration) return 'stale_generation'
  if (!isCanonicalDigest(current.authorityDigest)) return 'invalid_digest'
  if (current.authorityDigest !== command.connectionAuthorityDigest) return 'stale_digest'
  return null
}

function replayResult(
  command: NormalizedApprovalCommand,
  commandDigest: string,
  existing: ExistingProviderApprovalDecisions | undefined,
): ProviderApprovalDecisionCommandResult | null {
  const byCommandId = existing?.byCommandId
  if (byCommandId !== undefined) {
    if (byCommandId.commandId !== command.commandId || byCommandId.commandDigest !== commandDigest) {
      return refused('command_identity_conflict')
    }
    if (!isProviderApprovalDecisionIntegrityValid(byCommandId)) return refused('invalid_digest')
    return { kind: 'duplicate', decision: byCommandId, commandDigest }
  }
  const byDecisionRef = existing?.byDecisionRef
  if (byDecisionRef !== undefined) {
    if (!isProviderApprovalDecisionIntegrityValid(byDecisionRef)) return refused('invalid_digest')
    return refused('decision_conflict')
  }
  const byConnectionGeneration = existing?.byConnectionGeneration
  if (byConnectionGeneration !== undefined) {
    if (!isProviderApprovalDecisionIntegrityValid(byConnectionGeneration)) return refused('invalid_digest')
    return refused('decision_conflict')
  }
  return null
}

export function issueProviderApprovalDecision(
  command: IssueProviderApprovalDecisionCommand,
  now: number,
  currentAuthority: ProviderApprovalAuthoritySnapshot | undefined,
  existing?: ExistingProviderApprovalDecisions,
): ProviderApprovalDecisionCommandResult {
  const normalized = normalizeCommand(command)
  if (normalized.kind === 'refused') return normalized
  const commandDigest = canonicalDigest(commandMaterial(normalized.command))
  const replay = replayResult(normalized.command, commandDigest, existing)
  if (replay !== null) return replay
  const authorityError = authorityRefusal(normalized.command, currentAuthority)
  if (authorityError !== null) return refused(authorityError)

  const decisionWithoutDigests = {
    decisionRef: normalized.command.decisionRef,
    commandId: normalized.command.commandId,
    providerRef: normalized.command.providerRef,
    providerAccountRef: normalized.command.providerAccountRef,
    connectionRef: normalized.command.connectionRef,
    authorityGeneration: normalized.command.authorityGeneration,
    connectionAuthorityDigest: normalized.command.connectionAuthorityDigest,
    requestedScopes: normalized.command.requestedScopes,
    grantedScopes: normalized.command.grantedScopes,
    requestedResources: normalized.command.requestedResources,
    grantedResources: normalized.command.grantedResources,
    decision: normalized.command.decision,
    decisionTime: now,
    decisionMakerAuthorityRef: normalized.command.decisionMakerAuthorityRef,
    reasonCode: normalized.command.reasonCode,
    evidenceRefs: normalized.command.evidenceRefs,
  } as const
  const decision: ProviderApprovalDecision = {
    ...decisionWithoutDigests,
    commandDigest,
    decisionDigest: providerApprovalDecisionDigest(decisionWithoutDigests),
  }
  return { kind: 'applied', decision, commandDigest }
}

export function projectProviderApprovalDecision(decision: ProviderApprovalDecision) {
  return {
    decisionRef: decision.decisionRef,
    providerRef: decision.providerRef,
    providerAccountRef: decision.providerAccountRef,
    connectionRef: decision.connectionRef,
    authorityGeneration: decision.authorityGeneration,
    connectionAuthorityDigest: decision.connectionAuthorityDigest,
    requestedScopes: [...decision.requestedScopes],
    grantedScopes: [...decision.grantedScopes],
    requestedResources: [...decision.requestedResources],
    grantedResources: [...decision.grantedResources],
    decision: decision.decision,
    decisionDigest: decision.decisionDigest,
    decisionTime: decision.decisionTime,
    decisionMakerAuthorityRef: decision.decisionMakerAuthorityRef,
    reasonCode: decision.reasonCode,
    evidenceRefs: [...decision.evidenceRefs],
  } as const
}
