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
const SECRET_POINTER_REF = /^sec_[0-9a-f]{32}$/u

export function isProviderConnectionCredentialRef(value: unknown): value is string {
  return typeof value === 'string' && (PRIVATE_CREDENTIAL_REF.test(value) || SECRET_POINTER_REF.test(value))
}

export type ProviderConnection = Readonly<{
  connectionRef: string
  owningAccountRef: string
  installedByPrincipalRef: string
  authorityGrantRef: string
  authorityGrantGeneration: number
  secretRef?: string
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

export type AuthorityCommandFields = Readonly<{
  connectionRef: string
  owningAccountRef: string
  installedByPrincipalRef: string
  authorityGrantRef: string
  authorityGrantGeneration: number
  secretRef?: string
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

export const COMMAND_KINDS = {
  create: 'create', reauthorize: 'reauthorize', beginRevocation: 'begin_revocation', recordCleanupResult: 'record_cleanup_result',
} as const
export type CommandKind = (typeof COMMAND_KINDS)[keyof typeof COMMAND_KINDS]

export type CreateX402ProviderConnectionCommand = Readonly<{
  commandId: string
  connectionRef: string
  businessId: string
  providerRef: string
  providerAccountRef: string
  resourceUrl: string
  evidenceRefs: readonly string[]
  expiresAt?: number
  owningAccountRef: string
  installedByPrincipalRef: string
  authorityGrantRef: string
  authorityGrantGeneration: number
}>
