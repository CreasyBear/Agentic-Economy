import { v } from 'convex/values'
import type { Id } from '../../_generated/dataModel'
import type {
  ProviderConnection,
  ProviderConnectionInvocationLease,
} from '../../../src/modules/capability-supply/provider-connection'

export const lifecycle = v.union(
  v.literal('active'),
  v.literal('reauthorization_required'),
  v.literal('revocation_pending'),
  v.literal('revoked'),
  v.literal('cleanup_required'),
)
export const connectionValue = v.object({
  connectionRef: v.string(),
  owningAccountRef: v.string(),
  installedByPrincipalRef: v.string(),
  authorityGrantRef: v.string(),
  authorityGrantGeneration: v.number(),
  secretRef: v.optional(v.string()),
  businessId: v.id('businesses'),
  providerRef: v.string(),
  providerAccountRef: v.string(),
  adapterId: v.string(),
  credentialRef: v.union(v.string(), v.null()),
  grantedScopes: v.array(v.string()),
  grantedResources: v.array(v.string()),
  authorityGeneration: v.number(),
  authorityDigest: v.string(),
  lifecycle,
  observedAt: v.number(),
  expiresAt: v.optional(v.number()),
  revokedAt: v.optional(v.number()),
  reasonCode: v.optional(v.string()),
  evidenceRefs: v.array(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
  lastCommandId: v.string(),
  lastCommandDigest: v.string(),
  revocationRef: v.optional(v.string()),
  cleanupAttempt: v.optional(v.number()),
  cleanupWorkId: v.optional(v.string()),
  cleanupWorkKind: v.optional(v.union(v.literal('lease_drain'), v.literal('cleanup'))),
  cleanupCommandId: v.optional(v.string()),
  cleanupRequestDigest: v.optional(v.string()),
  cleanupCallbackGraceUntil: v.optional(v.number()),
})
export const authorityFields = {
  connectionRef: v.string(),
  businessId: v.id('businesses'),
  providerRef: v.string(),
  providerAccountRef: v.string(),
  adapterId: v.string(),
  credentialRef: v.union(v.string(), v.null()),
  requestedScopes: v.array(v.string()),
  grantedScopes: v.array(v.string()),
  requestedResources: v.array(v.string()),
  grantedResources: v.array(v.string()),
  expiresAt: v.optional(v.number()),
  reasonCode: v.optional(v.string()),
  evidenceRefs: v.array(v.string()),
} as const
export const cleanupTargetValue = v.object({
  connectionRef: v.string(),
  providerRef: v.string(),
  providerAccountRef: v.string(),
  adapterId: v.string(),
  credentialRef: v.union(v.literal('redacted'), v.null()),
  grantedScopes: v.array(v.string()),
  grantedResources: v.array(v.string()),
  authorityGeneration: v.number(),
  authorityDigest: v.string(),
  lifecycle,
  revocationRef: v.optional(v.string()),
  cleanupAttempt: v.optional(v.number()),
  resourceAuthority: v.object({
    connectionRef: v.string(),
    authorityGeneration: v.number(),
    owningAccountRef: v.string(),
    actorPrincipalRef: v.string(),
    accountRevision: v.number(),
    ownershipRef: v.string(),
    grantRef: v.string(),
    grantGeneration: v.number(),
    authorityExpiresAt: v.number(),
  }),
})
export const cleanupResourceAuthorityValue = cleanupTargetValue.fields.resourceAuthority
export const commandResult = v.union(
  v.object({ kind: v.literal('applied'), connection: connectionValue, commandDigest: v.string() }),
  v.object({ kind: v.literal('duplicate'), connection: connectionValue, commandDigest: v.string() }),
  v.object({
    kind: v.literal('refused'),
    code: v.union(
      v.literal('invalid_identity'), v.literal('invalid_time'), v.literal('invalid_scope'),
      v.literal('invalid_resource'), v.literal('invalid_generation'), v.literal('invalid_digest'),
      v.literal('invalid_transition'), v.literal('command_identity_conflict'),
    ),
  }),
)
export const credentialResolution = v.union(
  v.object({ kind: v.literal('resolved'), credentialRef: v.string() }),
  v.object({
    kind: v.literal('unavailable'),
    reason: v.union(
      v.literal('not_found'), v.literal('inactive'), v.literal('stale_generation'),
      v.literal('expired'), v.literal('digest_mismatch'), v.literal('credential_unavailable'),
    ),
  }),
)
export const connectionAuthorityValidation = v.union(
  v.object({ kind: v.literal('valid') }),
  v.object({
    kind: v.literal('unavailable'),
    reason: v.union(
      v.literal('not_found'), v.literal('inactive'), v.literal('stale_generation'),
      v.literal('expired'), v.literal('digest_mismatch'), v.literal('credential_unavailable'),
    ),
  }),
)

export const createArgs = {
  ...authorityFields,
  commandId: v.string(),
  now: v.number(),
} as const
export const reauthorizeArgs = {
  ...authorityFields,
  commandId: v.string(),
  expectedAuthorityGeneration: v.number(),
  expectedAuthorityDigest: v.string(),
  now: v.number(),
} as const
export const beginRevocationArgs = {
  connectionRef: v.string(),
  commandId: v.string(),
  expectedAuthorityGeneration: v.number(),
  expectedAuthorityDigest: v.string(),
  reasonCode: v.optional(v.string()),
  evidenceRefs: v.array(v.string()),
  now: v.number(),
} as const
export const advanceLeaseDrainArgs = {
  connectionRef: v.string(),
  commandId: v.string(),
  expectedAuthorityGeneration: v.number(),
  expectedAuthorityDigest: v.string(),
  requestDigest: v.string(),
  cleanupAttempt: v.number(),
  workId: v.string(),
  resourceAuthority: v.optional(cleanupResourceAuthorityValue),
  now: v.number(),
} as const
export const recordCleanupResultArgs = {
  connectionRef: v.string(),
  commandId: v.string(),
  expectedAuthorityGeneration: v.number(),
  expectedAuthorityDigest: v.string(),
  cleanupAttempt: v.number(),
  workId: v.string(),
  requestDigest: v.string(),
  outcome: v.union(
    v.literal('detached'),
    v.literal('revoked'),
    v.literal('already_revoked'),
    v.literal('unsupported'),
    v.literal('provider_refused'),
    v.literal('outcome_unknown'),
  ),
  responseDigest: v.optional(v.string()),
  reasonCode: v.optional(v.string()),
  evidenceRefs: v.array(v.string()),
  resourceAuthority: v.optional(cleanupResourceAuthorityValue),
  now: v.number(),
} as const
export const readArgs = {
  connectionRef: v.string(),
} as const
export const readCleanupTargetArgs = {
  connectionRef: v.string(),
  commandId: v.string(),
  expectedAuthorityGeneration: v.number(),
  expectedAuthorityDigest: v.string(),
  requestDigest: v.string(),
  cleanupAttempt: v.number(),
  now: v.number(),
} as const
export const listByBusinessLifecycleArgs = {
  businessId: v.id('businesses'),
  lifecycle,
  limit: v.number(),
} as const
export const listByProviderLifecycleArgs = {
  providerRef: v.string(),
  lifecycle,
  limit: v.number(),
} as const
export const readAtGenerationArgs = {
  connectionRef: v.string(),
  authorityGeneration: v.number(),
} as const
export const resolveCredentialRefArgs = {
  connectionRef: v.string(),
  expectedAuthorityGeneration: v.number(),
  expectedAuthorityDigest: v.string(),
  now: v.number(),
} as const
export const validateAuthorityArgs = {
  connectionRef: v.string(),
  expectedAuthorityGeneration: v.number(),
  expectedAuthorityDigest: v.string(),
  now: v.number(),
} as const

export type CleanupWorkKind = 'lease_drain' | 'cleanup'
export type CleanupWorkContext = Readonly<{
  connectionRef: string
  commandId: string
  expectedAuthorityGeneration: number
  expectedAuthorityDigest: string
  requestDigest: string
  cleanupAttempt: number
  workKind: CleanupWorkKind
  resourceAuthority: CleanupResourceAuthority
}>

export type CleanupResourceAuthority = Readonly<{
  connectionRef: string
  authorityGeneration: number
  owningAccountRef: string
  actorPrincipalRef: string
  accountRevision: number
  ownershipRef: string
  grantRef: string
  grantGeneration: number
  authorityExpiresAt: number
}>

export type ProviderConnectionRow = {
  connectionRef: string
  owningAccountRef: string
  installedByPrincipalRef: string
  authorityGrantRef: string
  authorityGrantGeneration: number
  secretRef?: string
  businessId: Id<'businesses'>
  providerRef: string
  providerAccountRef: string
  adapterId: string
  credentialRef: string | null
  grantedScopes: string[]
  grantedResources: string[]
  authorityGeneration: number
  authorityDigest: string
  lifecycle: ProviderConnection['lifecycle']
  observedAt: number
  expiresAt?: number
  revokedAt?: number
  reasonCode?: string
  evidenceRefs: string[]
  createdAt: number
  updatedAt: number
  lastCommandId: string
  lastCommandDigest: string
  revocationRef?: string
  cleanupAttempt?: number
  cleanupWorkId?: string
  cleanupWorkKind?: CleanupWorkKind
  cleanupCommandId?: string
  cleanupRequestDigest?: string
  cleanupCallbackGraceUntil?: number
}

export type ProviderConnectionLeaseRow = {
  leaseRef: string
  owningAccountRef: string
  activeAccountRef: string
  actorPrincipalRef: string
  grantRef: string
  grantGeneration: number
  invocationRef: string
  operationRef: string
  connectionRef: string
  providerRef: string
  providerAccountRef: string
  adapterId: string
  authorityGeneration: number
  authorityDigest: string
  grantedScopes: string[]
  grantedResources: string[]
  approvalDecisionRef: string
  approvalDecisionDigest: string
  readinessValidUntil: number
  readinessDigest?: string
  state: ProviderConnectionInvocationLease['state']
  issuedAt: number
  expiresAt: number
  consumedAt?: number
  invalidatedAt?: number
  evidenceRefs: string[]
  createdAt: number
  updatedAt: number
  lastCommandId: string
  lastCommandDigest: string
}

export type AuthorityCommandArgs = {
  connectionRef: string
  businessId: Id<'businesses'>
  providerRef: string
  providerAccountRef: string
  adapterId: string
  credentialRef: string | null
  requestedScopes: string[]
  grantedScopes: string[]
  requestedResources: string[]
  grantedResources: string[]
  expiresAt?: number
  reasonCode?: string
  evidenceRefs: string[]
  commandId: string
  now: number
}

export type ReauthorizeCommandArgs = AuthorityCommandArgs & {
  expectedAuthorityGeneration: number
  expectedAuthorityDigest: string
}

export type BeginRevocationArgs = {
  connectionRef: string
  commandId: string
  expectedAuthorityGeneration: number
  expectedAuthorityDigest: string
  reasonCode?: string
  evidenceRefs: string[]
  now: number
}

export type AdvanceLeaseDrainArgs = {
  connectionRef: string
  commandId: string
  expectedAuthorityGeneration: number
  expectedAuthorityDigest: string
  requestDigest: string
  cleanupAttempt: number
  workId: string
  resourceAuthority?: CleanupResourceAuthority
  now: number
}

export type RecordCleanupResultArgs = {
  connectionRef: string
  commandId: string
  expectedAuthorityGeneration: number
  expectedAuthorityDigest: string
  cleanupAttempt: number
  workId: string
  requestDigest: string
  outcome: 'detached' | 'revoked' | 'already_revoked' | 'unsupported' | 'provider_refused' | 'outcome_unknown'
  responseDigest?: string
  reasonCode?: string
  evidenceRefs: string[]
  resourceAuthority?: CleanupResourceAuthority
  now: number
}

export type ReadCleanupTargetArgs = {
  connectionRef: string
  commandId: string
  expectedAuthorityGeneration: number
  expectedAuthorityDigest: string
  requestDigest: string
  cleanupAttempt: number
  now: number
}

export type ListByBusinessLifecycleArgs = {
  businessId: Id<'businesses'>
  lifecycle: ProviderConnection['lifecycle']
  limit: number
}

export type ListByProviderLifecycleArgs = {
  providerRef: string
  lifecycle: ProviderConnection['lifecycle']
  limit: number
}
