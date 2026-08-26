import { marketDispatchWorkpool } from './marketDispatchWorkpool'
import { v } from 'convex/values'
import {
  canonicalProviderConnectionProjection,
  canonicalProviderConnectionProjectionIsCurrent,
  canonicalProviderConnectionProjectionMatches,
  beginProviderConnectionRevocation,
  createProviderConnection,
  invalidateProviderConnectionLease,
  recordProviderConnectionCleanupResult,
  reauthorizeProviderConnection,
  type ProviderConnection,
  type ProviderConnectionAuthorityValidation,
  type ProviderConnectionCommandResult,
  type ProviderConnectionCredentialResolution,
  type ProviderConnectionInvocationLease,
} from '../src/modules/capability-supply/provider-connection'
import {
  DELEGATION_MAX_ANCESTRY_GRANTS,
  DelegationError,
  DelegationService,
  parsePersistedDelegationGrant,
  type DelegationGrant,
  type DelegationGrantRef,
} from '../src/modules/authority/delegation/public'
import {
  ConnectionLifecycleError,
  ConnectionLifecycleService,
  parsePersistedConnection,
  type Connection,
  type ConnectionOperation,
  type ConnectionShare,
} from '../src/modules/connections/lifecycle/public'
import {
  accountRef,
  principalRef,
  type AccountRef,
  type PrincipalRef,
} from '../src/modules/principal-account/public'
import { secretRef } from '../src/modules/secrets/convex'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import { internal } from './_generated/api'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import {
  createDelegationBackedConnectionAuthority,
  createConvexConnectionLifecycleStore,
} from './lib/connectionLifecyclePersistence'
import {
  createConvexDelegationContextPort,
  createConvexDelegationStore,
} from './lib/delegationPersistence'

export const lifecycle = v.union(
  v.literal('active'),
  v.literal('reauthorization_required'),
  v.literal('revocation_pending'),
  v.literal('revoked'),
  v.literal('cleanup_required'),
)
export const connectionValue = v.object({
  connectionRef: v.string(),
  canonicalConnectionRef: v.optional(v.string()),
  owningAccountRef: v.optional(v.string()),
  installedByPrincipalRef: v.optional(v.string()),
  authorityGrantRef: v.optional(v.string()),
  authorityGrantGeneration: v.optional(v.number()),
  canonicalConnectionGeneration: v.optional(v.number()),
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
    canonicalConnectionRef: v.string(),
    connectionGeneration: v.number(),
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
  canonicalConnectionRef: string
  connectionGeneration: number
  owningAccountRef: string
  actorPrincipalRef: string
  accountRevision: number
  ownershipRef: string
  grantRef: string
  grantGeneration: number
  authorityExpiresAt: number
}>

type ProviderConnectionRow = {
  connectionRef: string
  canonicalConnectionRef?: string
  owningAccountRef?: string
  installedByPrincipalRef?: string
  authorityGrantRef?: string
  authorityGrantGeneration?: number
  canonicalConnectionGeneration?: number
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

type ProviderConnectionLeaseRow = {
  leaseRef: string
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

type AuthorityCommandArgs = {
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

type ReauthorizeCommandArgs = AuthorityCommandArgs & {
  expectedAuthorityGeneration: number
  expectedAuthorityDigest: string
}

type BeginRevocationArgs = {
  connectionRef: string
  commandId: string
  expectedAuthorityGeneration: number
  expectedAuthorityDigest: string
  reasonCode?: string
  evidenceRefs: string[]
  now: number
}

type AdvanceLeaseDrainArgs = {
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

type RecordCleanupResultArgs = {
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

type ReadCleanupTargetArgs = {
  connectionRef: string
  commandId: string
  expectedAuthorityGeneration: number
  expectedAuthorityDigest: string
  requestDigest: string
  cleanupAttempt: number
  now: number
}

type ListByBusinessLifecycleArgs = {
  businessId: Id<'businesses'>
  lifecycle: ProviderConnection['lifecycle']
  limit: number
}

type ListByProviderLifecycleArgs = {
  providerRef: string
  lifecycle: ProviderConnection['lifecycle']
  limit: number
}

const CLEANUP_CALLBACK_GRACE_MS = 10_000

export type CanonicalActor = Readonly<{
  principalRef: PrincipalRef
  accountRef: AccountRef
}>

function withoutSystemFields<Value extends { _id: unknown; _creationTime: number }>(value: Value) {
  const { _id, _creationTime, ...domain } = value
  void _id
  void _creationTime
  return domain
}

export async function readCanonicalConnectionForProjection(
  ctx: Pick<QueryCtx, 'db'>,
  legacy: ProviderConnection,
  requireUsable = false,
): Promise<Connection | null> {
  if (legacy.canonicalConnectionRef === undefined) return null
  const row = await ctx.db.query('connections')
    .withIndex('by_connectionRef', (query) => query.eq('connectionRef', legacy.canonicalConnectionRef as never))
    .unique()
  if (row === null) return null
  try {
    const canonical = parsePersistedConnection(withoutSystemFields(row))
    const valid = requireUsable
      ? canonicalProviderConnectionProjectionIsCurrent(legacy, canonical)
      : canonicalProviderConnectionProjectionMatches(legacy, canonical)
    return valid ? canonical : null
  } catch {
    return null
  }
}

export async function resolveCanonicalBusinessOwner(
  ctx: Pick<MutationCtx, 'db'>,
  businessId: Id<'businesses'>,
): Promise<CanonicalActor | null> {
  const business = await ctx.db.get(businessId)
  if (business === null) return null
  const owner = await ctx.db.get(business.ownerId)
  if (owner === null || owner.canonicalPrincipalRef === undefined || owner.canonicalAccountRef === undefined) return null
  const [principal, account] = await Promise.all([
    ctx.db.query('principals').withIndex('by_principalRef', (query) => query.eq('principalRef', owner.canonicalPrincipalRef as never)).unique(),
    ctx.db.query('accounts').withIndex('by_accountRef', (query) => query.eq('accountRef', owner.canonicalAccountRef as never)).unique(),
  ])
  if (principal === null || principal.lifecycle !== 'active' || account === null || account.lifecycle !== 'active') return null
  const ownership = await ctx.db.query('accountOwnerships')
    .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', account.currentOwnershipRef))
    .unique()
  if (ownership === null || ownership.lifecycle !== 'active'
    || ownership.accountRef !== account.accountRef
    || ownership.ownerPrincipalRef !== principal.principalRef) return null
  try {
    return Object.freeze({
      principalRef: principalRef(principal.principalRef),
      accountRef: accountRef(account.accountRef),
    })
  } catch {
    return null
  }
}

function authorityValuesNarrowed(child: readonly string[], parent: readonly string[]): boolean {
  return child.every((value) => parent.includes(value))
}

async function readCurrentCleanupGrantChain(
  ctx: Pick<QueryCtx, 'db'>,
  input: Readonly<{
    grantRef: string
    grantGeneration: number
    accountRef: string
    actorPrincipalRef: string
    resourceRef: string
    now: number
  }>,
): Promise<{ leaf: DelegationGrant; expiresAt: number } | null> {
  let expectedRef = input.grantRef
  let expectedGeneration = input.grantGeneration
  let child: DelegationGrant | undefined
  let leaf: DelegationGrant | undefined
  let expiresAt = Number.MAX_SAFE_INTEGER
  const seen = new Set<string>()
  for (let position = 0; position < DELEGATION_MAX_ANCESTRY_GRANTS; position += 1) {
    if (seen.has(expectedRef)) return null
    seen.add(expectedRef)
    const row = await ctx.db.query('authorityDelegationGrants')
      .withIndex('by_grantRef', (query) => query.eq('grantRef', expectedRef as never))
      .unique()
    if (row === null) return null
    let grant: DelegationGrant
    try {
      const { _id, _creationTime, ...stored } = row
      void _id
      void _creationTime
      grant = parsePersistedDelegationGrant(stored)
    } catch {
      return null
    }
    if (grant.grantRef !== expectedRef
      || grant.generation !== expectedGeneration
      || grant.lifecycle !== 'active'
      || grant.accountRef !== input.accountRef
      || grant.expiresAt <= input.now) return null
    if (child !== undefined && (
      child.actorPrincipalRef !== grant.subjectPrincipalRef
      || !authorityValuesNarrowed(child.scopes, grant.scopes)
      || !authorityValuesNarrowed(child.resourceRefs, grant.resourceRefs)
      || child.budgetLimit > grant.budgetLimit
      || child.expiresAt >= grant.expiresAt
    )) return null
    leaf ??= grant
    expiresAt = Math.min(expiresAt, grant.expiresAt)
    if (grant.parentGrantRef === undefined) {
      return leaf.subjectPrincipalRef === input.actorPrincipalRef
        && leaf.scopes.includes('connection:revoke')
        && leaf.resourceRefs.includes(input.resourceRef)
        ? { leaf, expiresAt }
        : null
    }
    child = grant
    expectedRef = grant.parentGrantRef
    // The persisted-grant parser rejects unpaired parent refs/generations.
    expectedGeneration = grant.parentGeneration as number
  }
  return null
}

export async function readCurrentCleanupResourceAuthority(
  ctx: Pick<QueryCtx, 'db'>,
  legacy: ProviderConnection,
  now = Date.now(),
): Promise<CleanupResourceAuthority | null> {
  const canonical = await readCanonicalConnectionForProjection(ctx, legacy)
  if (canonical === null
    || canonical.lifecycle !== 'revoked'
    || canonical.action.operation !== 'revoke'
    || legacy.canonicalConnectionRef !== canonical.connectionRef
    || legacy.canonicalConnectionGeneration !== canonical.generation
    || legacy.owningAccountRef !== canonical.owningAccountRef
    || legacy.installedByPrincipalRef !== canonical.installedByPrincipalRef
    || legacy.authorityGrantRef !== canonical.action.grantRef
    || legacy.authorityGrantGeneration !== canonical.action.grantGeneration) return null
  const [principal, account] = await Promise.all([
    ctx.db.query('principals')
      .withIndex('by_principalRef', (query) => query.eq('principalRef', canonical.action.actorPrincipalRef as never))
      .unique(),
    ctx.db.query('accounts')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', canonical.owningAccountRef as never))
      .unique(),
  ])
  if (principal === null || principal.lifecycle !== 'active'
    || account === null || account.lifecycle !== 'active'
    || !Number.isSafeInteger(account.revision) || account.revision <= 0) return null
  const ownership = await ctx.db.query('accountOwnerships')
    .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', account.currentOwnershipRef))
    .unique()
  if (ownership === null || ownership.lifecycle !== 'active'
    || ownership.accountRef !== canonical.owningAccountRef
    || ownership.ownerPrincipalRef !== canonical.action.actorPrincipalRef) return null
  const resourceRef = `connection:${canonical.connectionRef}`
  const chain = await readCurrentCleanupGrantChain(ctx, {
    grantRef: canonical.action.grantRef,
    grantGeneration: canonical.action.grantGeneration,
    accountRef: canonical.owningAccountRef,
    actorPrincipalRef: canonical.action.actorPrincipalRef,
    resourceRef,
    now,
  })
  if (chain === null
    || canonical.action.activeAccountRef !== canonical.owningAccountRef
    || !canonical.action.resourceRefs.includes(resourceRef)) return null
  return Object.freeze({
    canonicalConnectionRef: canonical.connectionRef,
    connectionGeneration: canonical.generation,
    owningAccountRef: canonical.owningAccountRef,
    actorPrincipalRef: canonical.action.actorPrincipalRef,
    accountRevision: account.revision,
    ownershipRef: ownership.ownershipRef,
    grantRef: chain.leaf.grantRef,
    grantGeneration: chain.leaf.generation,
    authorityExpiresAt: chain.expiresAt,
  })
}

export function cleanupResourceAuthorityMatches(
  left: CleanupResourceAuthority,
  right: CleanupResourceAuthority,
): boolean {
  return left.canonicalConnectionRef === right.canonicalConnectionRef
    && left.connectionGeneration === right.connectionGeneration
    && left.owningAccountRef === right.owningAccountRef
    && left.actorPrincipalRef === right.actorPrincipalRef
    && left.accountRevision === right.accountRevision
    && left.ownershipRef === right.ownershipRef
    && left.grantRef === right.grantRef
    && left.grantGeneration === right.grantGeneration
    && left.authorityExpiresAt === right.authorityExpiresAt
}

async function resolveUniqueCanonicalGrant(
  ctx: Pick<MutationCtx, 'db'>,
  actor: CanonicalActor,
  operation: ConnectionOperation,
  resourceRefs: readonly string[],
): Promise<{ grantRef: DelegationGrantRef; generation: number; expiresAt: number } | null> {
  const now = Date.now()
  const candidates = await ctx.db.query('authorityDelegationGrants')
    .withIndex('by_subjectPrincipalRef_and_lifecycle', (query) => query
      .eq('subjectPrincipalRef', actor.principalRef)
      .eq('lifecycle', 'active'))
    .take(DELEGATION_MAX_ANCESTRY_GRANTS + 1)
  if (candidates.length > DELEGATION_MAX_ANCESTRY_GRANTS) return null
  const matching = candidates.filter((grant) => grant.accountRef === actor.accountRef
    && grant.expiresAt > now
    && Number.isSafeInteger(grant.generation)
    && grant.generation > 0
    && grant.scopes.includes(`connection:${operation}`)
    && resourceRefs.every((resource) => grant.resourceRefs.includes(resource)))
  if (matching.length !== 1) return null
  const grant = matching[0] as (typeof matching)[number]
  return { grantRef: grant.grantRef as DelegationGrantRef, generation: grant.generation, expiresAt: grant.expiresAt }
}

export function createCanonicalConnectionLifecycleService(ctx: MutationCtx, actor: CanonicalActor): ConnectionLifecycleService {
  const delegation = new DelegationService(
    createConvexDelegationStore(ctx),
    createConvexDelegationContextPort(ctx, actor.principalRef),
  )
  const authority = createDelegationBackedConnectionAuthority(delegation)
  return new ConnectionLifecycleService(
    createConvexConnectionLifecycleStore(ctx),
    {
      withCurrentAuthority: async (request, consequence) => await authority.withCurrentAuthority(
        request,
        async (snapshot) => await consequence(Object.freeze({
          ...snapshot,
          // Delegation persists canonical set order; Connection actions retain
          // their operation-defined order after the same set was admitted.
          resourceRefs: Object.freeze([...request.resourceRefs]),
        })),
      ),
    },
  )
}

export function canonicalConnectionActionContext(actor: CanonicalActor, operation: ConnectionOperation, commandId: string) {
  const requestRef = canonicalDigest({ operation, commandId, accountRef: actor.accountRef, principalRef: actor.principalRef })
  return {
    actorPrincipalRef: actor.principalRef,
    activeAccountRef: actor.accountRef,
    correlationRef: `provider-connection:${requestRef}`,
    idempotencyRef: `provider-connection:${operation}:${requestRef}`,
  }
}

export function failClosedCanonicalLifecycleError(error: unknown): null {
  if (error instanceof ConnectionLifecycleError || error instanceof DelegationError) return null
  throw error
}

export async function installCanonicalProviderConnection(
  ctx: MutationCtx,
  input: Readonly<{
    actor: CanonicalActor
    commandId: string
    providerNamespace: string
    providerLocator?: string
    credentialRef: string | null
  }>,
): Promise<Connection | null> {
  let pointer: ReturnType<typeof secretRef> | undefined
  try {
    pointer = input.credentialRef === null ? undefined : secretRef(input.credentialRef)
  } catch {
    return null
  }
  const resourceRefs = [
    `connection-provider:${input.providerNamespace}`,
    ...(input.providerLocator === undefined ? [] : [`connection-provider:${input.providerNamespace}:${input.providerLocator}`]),
    ...(pointer === undefined ? [] : [`secret:${pointer}`]),
  ]
  const grant = await resolveUniqueCanonicalGrant(ctx, input.actor, 'install', resourceRefs)
  if (grant === null) return null
  try {
    return await createCanonicalConnectionLifecycleService(ctx, input.actor).install({
      context: canonicalConnectionActionContext(input.actor, 'install', input.commandId),
      grantRef: grant.grantRef,
      expectedGrantGeneration: grant.generation,
      providerNamespace: input.providerNamespace,
      ...(input.providerLocator === undefined ? {} : { providerLocator: input.providerLocator }),
      ...(pointer === undefined ? {} : { secretRef: pointer }),
      externalState: { kind: 'known', value: 'ready' },
    })
  } catch (error) {
    return failClosedCanonicalLifecycleError(error)
  }
}

export async function transitionCanonicalProviderConnection(
  ctx: MutationCtx,
  input: Readonly<{
    actor: CanonicalActor
    commandId: string
    connection: Connection
    operation: 'refresh' | 'revoke' | 'delete'
    externalState: Readonly<{ kind: 'known'; value: 'ready' | 'deleted' } | { kind: 'unknown'; value: string }>
  }>,
): Promise<Connection | null> {
  const resources = [`connection:${input.connection.connectionRef}`]
  const grant = await resolveUniqueCanonicalGrant(ctx, input.actor, input.operation, resources)
  if (grant === null) return null
  const request = {
    connectionRef: input.connection.connectionRef,
    expectedGeneration: input.connection.generation,
    externalState: input.externalState,
    context: canonicalConnectionActionContext(input.actor, input.operation, input.commandId),
    grantRef: grant.grantRef,
    expectedGrantGeneration: grant.generation,
  }
  try {
    if (input.operation === 'refresh') return await createCanonicalConnectionLifecycleService(ctx, input.actor).refresh(request)
    if (input.operation === 'revoke') return await createCanonicalConnectionLifecycleService(ctx, input.actor).revoke(request)
    return await createCanonicalConnectionLifecycleService(ctx, input.actor).delete(request)
  } catch (error) {
    return failClosedCanonicalLifecycleError(error)
  }
}

export async function shareCanonicalProviderConnection(
  ctx: MutationCtx,
  input: Readonly<{
    actor: CanonicalActor
    commandId: string
    connection: Connection
    granteeAccountRef: AccountRef
  }>,
): Promise<ConnectionShare | null> {
  const resources = [
    `connection:${input.connection.connectionRef}`,
    `account:${input.granteeAccountRef}`,
  ]
  const grant = await resolveUniqueCanonicalGrant(ctx, input.actor, 'share', resources)
  if (grant === null) return null
  try {
    return await createCanonicalConnectionLifecycleService(ctx, input.actor).share({
      connectionRef: input.connection.connectionRef,
      granteeAccountRef: input.granteeAccountRef,
      context: canonicalConnectionActionContext(input.actor, 'share', input.commandId),
      grantRef: grant.grantRef,
      expectedGrantGeneration: grant.generation,
    })
  } catch (error) {
    return failClosedCanonicalLifecycleError(error)
  }
}

export function toDomain(row: ProviderConnectionRow): ProviderConnection {
  return row
}

export function toRow(connection: ProviderConnection, _commandId: string, _commandDigest: string) {
  if (connection.lastCommandId === undefined || connection.lastCommandDigest === undefined) {
    throw new Error('provider_connection_command_receipt_missing')
  }
  return {
    connectionRef: connection.connectionRef,
    ...(connection.canonicalConnectionRef === undefined ? {} : { canonicalConnectionRef: connection.canonicalConnectionRef }),
    ...(connection.owningAccountRef === undefined ? {} : { owningAccountRef: connection.owningAccountRef }),
    ...(connection.installedByPrincipalRef === undefined ? {} : { installedByPrincipalRef: connection.installedByPrincipalRef }),
    ...(connection.authorityGrantRef === undefined ? {} : { authorityGrantRef: connection.authorityGrantRef }),
    ...(connection.authorityGrantGeneration === undefined ? {} : { authorityGrantGeneration: connection.authorityGrantGeneration }),
    ...(connection.canonicalConnectionGeneration === undefined ? {} : { canonicalConnectionGeneration: connection.canonicalConnectionGeneration }),
    ...(connection.secretRef === undefined ? {} : { secretRef: connection.secretRef }),
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
    ...(connection.expiresAt === undefined ? {} : { expiresAt: connection.expiresAt }),
    ...(connection.revocationRef === undefined ? {} : { revocationRef: connection.revocationRef }),
    ...(connection.cleanupAttempt === undefined ? {} : { cleanupAttempt: connection.cleanupAttempt }),
    ...(connection.cleanupWorkId === undefined ? {} : { cleanupWorkId: connection.cleanupWorkId }),
    ...(connection.cleanupWorkKind === undefined ? {} : { cleanupWorkKind: connection.cleanupWorkKind }),
    ...(connection.cleanupCommandId === undefined ? {} : { cleanupCommandId: connection.cleanupCommandId }),
    ...(connection.cleanupRequestDigest === undefined ? {} : { cleanupRequestDigest: connection.cleanupRequestDigest }),
    ...(connection.cleanupCallbackGraceUntil === undefined ? {} : { cleanupCallbackGraceUntil: connection.cleanupCallbackGraceUntil }),
    ...(connection.revokedAt === undefined ? {} : { revokedAt: connection.revokedAt }),
    ...(connection.reasonCode === undefined ? {} : { reasonCode: connection.reasonCode }),
    evidenceRefs: [...connection.evidenceRefs],
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
    lastCommandId: connection.lastCommandId,
    lastCommandDigest: connection.lastCommandDigest,
  }
}

function projectCommandResult(result: ProviderConnectionCommandResult) {
  if (result.kind === 'refused') return result
  const connection = toRow(result.connection, result.connection.lastCommandId ?? '', result.commandDigest)
  return result.kind === 'applied'
    ? { kind: 'applied' as const, connection, commandDigest: result.commandDigest }
    : { kind: 'duplicate' as const, connection, commandDigest: result.commandDigest }
}

export function toLeaseDomain(row: ProviderConnectionLeaseRow): ProviderConnectionInvocationLease {
  return row
}

export function toLeaseRow(lease: ProviderConnectionInvocationLease, _commandId: string, _commandDigest: string) {
  if (lease.lastCommandId === undefined || lease.lastCommandDigest === undefined) {
    throw new Error('provider_connection_lease_command_receipt_missing')
  }
  return {
    leaseRef: lease.leaseRef,
    ...(lease.canonicalLeaseRef === undefined ? {} : { canonicalLeaseRef: lease.canonicalLeaseRef }),
    ...(lease.canonicalConnectionRef === undefined ? {} : { canonicalConnectionRef: lease.canonicalConnectionRef }),
    ...(lease.canonicalConnectionGeneration === undefined ? {} : { canonicalConnectionGeneration: lease.canonicalConnectionGeneration }),
    ...(lease.owningAccountRef === undefined ? {} : { owningAccountRef: lease.owningAccountRef }),
    ...(lease.activeAccountRef === undefined ? {} : { activeAccountRef: lease.activeAccountRef }),
    ...(lease.actorPrincipalRef === undefined ? {} : { actorPrincipalRef: lease.actorPrincipalRef }),
    ...(lease.grantRef === undefined ? {} : { grantRef: lease.grantRef }),
    ...(lease.grantGeneration === undefined ? {} : { grantGeneration: lease.grantGeneration }),
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
    ...(lease.readinessDigest === undefined ? {} : { readinessDigest: lease.readinessDigest }),
    state: lease.state,
    issuedAt: lease.issuedAt,
    expiresAt: lease.expiresAt,
    ...(lease.consumedAt === undefined ? {} : { consumedAt: lease.consumedAt }),
    ...(lease.invalidatedAt === undefined ? {} : { invalidatedAt: lease.invalidatedAt }),
    evidenceRefs: [...lease.evidenceRefs],
    createdAt: lease.createdAt,
    updatedAt: lease.updatedAt,
    lastCommandId: lease.lastCommandId,
    lastCommandDigest: lease.lastCommandDigest,
  }
}

export async function invalidateActiveLeases(
  ctx: MutationCtx,
  connectionRef: string,
  reasonCode: 'generation_changed' | 'revocation_started',
  now: number,
  commandPrefix: string,
): Promise<boolean> {
  const rows = await ctx.db.query('capabilityProviderConnectionLeases')
    .withIndex('by_connectionRef_and_state', (index) => (
      index.eq('connectionRef', connectionRef).eq('state', 'active')
    ))
    .take(1001)
  const batch = rows.slice(0, 1000)
  await Promise.all(batch.map(async (row) => {
    const result = invalidateProviderConnectionLease(toLeaseDomain(row), {
      commandId: `${commandPrefix}:lease:${row.leaseRef}`,
      leaseRef: row.leaseRef,
      reasonCode,
      evidenceRefs: [`provider_connection:${reasonCode}`],
    }, now)
    if (result.kind === 'applied') {
      await ctx.db.replace(row._id, toLeaseRow(result.lease, row.lastCommandId, result.commandDigest))
    }
  }))
  return rows.length > batch.length
}

export async function enqueueCleanupWork(
  ctx: MutationCtx,
  rowId: Id<'capabilityProviderConnections'>,
  connection: ProviderConnection,
  context: Omit<CleanupWorkContext, 'workKind' | 'resourceAuthority'> & { workKind: CleanupWorkKind },
  now: number,
): Promise<ProviderConnection> {
  const resourceAuthority = await readCurrentCleanupResourceAuthority(ctx, connection, now)
  if (resourceAuthority === null) throw new Error('provider_cleanup_resource_authority_invalid')
  const workId = await marketDispatchWorkpool.enqueueAction(
    ctx,
    internal.capabilityProviderConnectionCleanup.run,
    {
      connectionRef: connection.connectionRef,
      commandId: context.commandId,
      expectedAuthorityGeneration: context.expectedAuthorityGeneration,
      expectedAuthorityDigest: context.expectedAuthorityDigest,
      requestDigest: context.requestDigest,
      cleanupAttempt: context.cleanupAttempt,
      workKind: context.workKind,
      resourceAuthority,
    },
    {
      retry: false,
      onComplete: internal.capabilityProviderConnectionCleanup.completeWork,
      context: { ...context, resourceAuthority },
    },
  )
  const next = {
    ...connection,
    cleanupAttempt: context.cleanupAttempt,
    cleanupWorkId: workId,
    cleanupWorkKind: context.workKind,
    cleanupCommandId: context.commandId,
    cleanupRequestDigest: context.requestDigest,
    cleanupCallbackGraceUntil: now + CLEANUP_CALLBACK_GRACE_MS,
    updatedAt: now,
  }
  await ctx.db.patch(rowId, toRow(next, context.commandId, canonicalDigest(context)))
  return next
}

async function cleanupWorkMatches(
  ctx: MutationCtx,
  args: Pick<CleanupWorkContext, 'connectionRef' | 'commandId' | 'expectedAuthorityGeneration' | 'expectedAuthorityDigest' | 'requestDigest' | 'cleanupAttempt'>
    & { workId: string; resourceAuthority?: CleanupResourceAuthority },
) {
  const row = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (query) => query.eq('connectionRef', args.connectionRef)).unique()
  const matches = row !== null
    && row.lifecycle === 'revocation_pending'
    && row.cleanupWorkId === args.workId
    && row.cleanupAttempt === args.cleanupAttempt
    && row.cleanupCommandId === args.commandId
    && row.cleanupRequestDigest === args.requestDigest
    && row.authorityGeneration === args.expectedAuthorityGeneration
    && row.authorityDigest === args.expectedAuthorityDigest
    ? row
    : null
  if (matches === null) return null
  const currentAuthority = await readCurrentCleanupResourceAuthority(ctx, toDomain(matches))
  return args.resourceAuthority !== undefined
    && currentAuthority !== null
    && cleanupResourceAuthorityMatches(currentAuthority, args.resourceAuthority)
    ? matches
    : null
}

export async function advanceLeaseDrainHandler(ctx: MutationCtx, args: AdvanceLeaseDrainArgs) {
  const row = await cleanupWorkMatches(ctx, args)
  if (row === null || row.cleanupWorkKind !== 'lease_drain') return null
  const connection = toDomain(row)
  const hasMore = await invalidateActiveLeases(
    ctx,
    args.connectionRef,
    'revocation_started',
    Date.now(),
    `${args.commandId}:drain:${args.cleanupAttempt}`,
  )
  const nextKind: CleanupWorkKind = hasMore ? 'lease_drain' : 'cleanup'
  await enqueueCleanupWork(ctx, row._id, connection, {
    connectionRef: args.connectionRef,
    commandId: args.commandId,
    expectedAuthorityGeneration: args.expectedAuthorityGeneration,
    expectedAuthorityDigest: args.expectedAuthorityDigest,
    requestDigest: args.requestDigest,
    cleanupAttempt: args.cleanupAttempt,
    workKind: nextKind,
  }, Date.now())
  return null
}

export async function createHandler(ctx: MutationCtx, args: AuthorityCommandArgs) {
  const existing = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (query) => query.eq('connectionRef', args.connectionRef)).unique()
  const now = Date.now()
  const legacyResult = createProviderConnection({
    commandId: args.commandId,
    connectionRef: args.connectionRef,
    businessId: args.businessId,
    providerRef: args.providerRef,
    providerAccountRef: args.providerAccountRef,
    adapterId: args.adapterId,
    credentialRef: args.credentialRef,
    requestedScopes: args.requestedScopes,
    grantedScopes: args.grantedScopes,
    requestedResources: args.requestedResources,
    grantedResources: args.grantedResources,
    ...(args.expiresAt === undefined ? {} : { expiresAt: args.expiresAt }),
    ...(args.reasonCode === undefined ? {} : { reasonCode: args.reasonCode }),
    evidenceRefs: args.evidenceRefs,
  }, now, existing === null ? undefined : toDomain(existing))
  if (legacyResult.kind === 'refused') return legacyResult
  const actor = await resolveCanonicalBusinessOwner(ctx, args.businessId)
  if (actor === null) return { kind: 'refused' as const, code: 'invalid_identity' as const }
  const canonical = await installCanonicalProviderConnection(ctx, {
    actor,
    commandId: args.commandId,
    providerNamespace: `capability-provider/${args.adapterId}`,
    providerLocator: args.providerAccountRef,
    credentialRef: args.credentialRef,
  })
  if (canonical === null || canonical.owningAccountRef !== actor.accountRef) {
    return { kind: 'refused' as const, code: 'invalid_transition' as const }
  }
  const projected = canonicalProviderConnectionProjection(legacyResult.connection, canonical)
  if (legacyResult.kind === 'duplicate') {
    if (!canonicalProviderConnectionProjectionIsCurrent(projected, canonical)
    || existing === null
    || !canonicalProviderConnectionProjectionIsCurrent(toDomain(existing), canonical)) {
      return { kind: 'refused' as const, code: 'invalid_transition' as const }
    }
    return projectCommandResult({ ...legacyResult, connection: toDomain(existing) })
  }
  await ctx.db.insert('capabilityProviderConnections', toRow(projected, args.commandId, legacyResult.commandDigest))
  return projectCommandResult({ ...legacyResult, connection: projected })
}

export async function reauthorizeHandler(ctx: MutationCtx, args: ReauthorizeCommandArgs) {
  const existing = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (query) => query.eq('connectionRef', args.connectionRef)).unique()
  if (existing === null) return { kind: 'refused' as const, code: 'invalid_transition' as const }
  const currentLegacy = toDomain(existing)
  const currentCanonical = await readCanonicalConnectionForProjection(ctx, currentLegacy, true)
  const actor = await resolveCanonicalBusinessOwner(ctx, args.businessId)
  if (currentCanonical === null || actor === null || currentCanonical.owningAccountRef !== actor.accountRef) {
    return { kind: 'refused' as const, code: 'invalid_identity' as const }
  }
  const now = Date.now()
  const legacyResult = reauthorizeProviderConnection(currentLegacy, {
    commandId: args.commandId,
    connectionRef: args.connectionRef,
    businessId: args.businessId,
    providerRef: args.providerRef,
    providerAccountRef: args.providerAccountRef,
    adapterId: args.adapterId,
    credentialRef: args.credentialRef,
    requestedScopes: args.requestedScopes,
    grantedScopes: args.grantedScopes,
    requestedResources: args.requestedResources,
    grantedResources: args.grantedResources,
    ...(args.expiresAt === undefined ? {} : { expiresAt: args.expiresAt }),
    ...(args.reasonCode === undefined ? {} : { reasonCode: args.reasonCode }),
    evidenceRefs: args.evidenceRefs,
    expectedAuthorityGeneration: args.expectedAuthorityGeneration,
    expectedAuthorityDigest: args.expectedAuthorityDigest,
  }, now)
  if (legacyResult.kind === 'refused') return legacyResult
  if (legacyResult.kind === 'duplicate') return projectCommandResult({ ...legacyResult, connection: currentLegacy })
  const canonical = await transitionCanonicalProviderConnection(ctx, {
    actor,
    commandId: args.commandId,
    connection: currentCanonical,
    operation: 'refresh',
    externalState: { kind: 'known', value: 'ready' },
  })
  if (canonical === null) return { kind: 'refused' as const, code: 'invalid_transition' as const }
  const projected = canonicalProviderConnectionProjection(legacyResult.connection, canonical)
  await ctx.db.replace(existing._id, toRow(projected, args.commandId, legacyResult.commandDigest))
  await invalidateActiveLeases(ctx, args.connectionRef, 'generation_changed', now, args.commandId)
  return projectCommandResult({ ...legacyResult, connection: projected })
}

export async function beginRevocationHandler(ctx: MutationCtx, args: BeginRevocationArgs) {
  const existing = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (query) => query.eq('connectionRef', args.connectionRef)).unique()
  if (existing === null) return { kind: 'refused' as const, code: 'invalid_transition' as const }
  const currentLegacy = toDomain(existing)
  const currentCanonical = await readCanonicalConnectionForProjection(ctx, currentLegacy, true)
  const actor = await resolveCanonicalBusinessOwner(ctx, existing.businessId)
  if (currentCanonical === null || actor === null || currentCanonical.owningAccountRef !== actor.accountRef) {
    return { kind: 'refused' as const, code: 'invalid_identity' as const }
  }
  const now = Date.now()
  const legacyResult = beginProviderConnectionRevocation(currentLegacy, args, now)
  if (legacyResult.kind === 'refused') return legacyResult
  const canonical = await transitionCanonicalProviderConnection(ctx, {
    actor,
    commandId: args.commandId,
    connection: currentCanonical,
    operation: 'revoke',
    externalState: { kind: 'unknown', value: 'revocation_pending' },
  })
  if (canonical === null) return { kind: 'refused' as const, code: 'invalid_transition' as const }
  const projected = canonicalProviderConnectionProjection(legacyResult.connection, canonical)
  await ctx.db.replace(existing._id, toRow(projected, args.commandId, legacyResult.commandDigest))
  await invalidateActiveLeases(ctx, args.connectionRef, 'revocation_started', now, args.commandId)
  return projectCommandResult({ ...legacyResult, connection: projected })
}

export async function recordCleanupResultHandler(ctx: MutationCtx, args: RecordCleanupResultArgs) {
  const existing = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (query) => query.eq('connectionRef', args.connectionRef)).unique()
  if (existing === null) return { kind: 'refused' as const, code: 'invalid_transition' as const }
  const current = toDomain(existing)
  const resourceAuthority = await readCurrentCleanupResourceAuthority(ctx, current)
  if (args.resourceAuthority === undefined
    || resourceAuthority === null
    || !cleanupResourceAuthorityMatches(resourceAuthority, args.resourceAuthority)) {
    return { kind: 'refused' as const, code: 'invalid_transition' as const }
  }
  const result = recordProviderConnectionCleanupResult(current, args, Date.now())
  if (result.kind === 'applied') await ctx.db.replace(existing._id, toRow(result.connection, args.commandId, result.commandDigest))
  return projectCommandResult(result)
}

export async function readHandler(ctx: QueryCtx, args: { connectionRef: string }) {
  const row = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (query) => query.eq('connectionRef', args.connectionRef)).unique()
  if (row === null) return null
  const legacy = toDomain(row)
  return await readCanonicalConnectionForProjection(ctx, legacy, true) === null
    ? null
    : toRow(legacy, row.lastCommandId, row.lastCommandDigest)
}

export async function readCleanupTargetHandler(ctx: QueryCtx, args: ReadCleanupTargetArgs) {
  if (!Number.isSafeInteger(args.now) || args.now < 0) return null
  const row = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (query) => query.eq('connectionRef', args.connectionRef)).unique()
  if (
    row === null
    || (row.lifecycle !== 'revocation_pending' && row.lifecycle !== 'cleanup_required')
    || row.cleanupAttempt !== args.cleanupAttempt
    || row.cleanupCommandId !== args.commandId
    || row.cleanupRequestDigest !== args.requestDigest
    || row.authorityGeneration !== args.expectedAuthorityGeneration
    || row.authorityDigest !== args.expectedAuthorityDigest
  ) return null
  const resourceAuthority = await readCurrentCleanupResourceAuthority(ctx, toDomain(row), args.now)
  if (resourceAuthority === null) return null
  return row === null ? null : {
    connectionRef: row.connectionRef,
    providerRef: row.providerRef,
    providerAccountRef: row.providerAccountRef,
    adapterId: row.adapterId,
    credentialRef: row.credentialRef === null ? null : 'redacted' as const,
    grantedScopes: row.grantedScopes,
    grantedResources: row.grantedResources,
    authorityGeneration: row.authorityGeneration,
    authorityDigest: row.authorityDigest,
    lifecycle: row.lifecycle,
    ...(row.revocationRef === undefined ? {} : { revocationRef: row.revocationRef }),
    ...(row.cleanupAttempt === undefined ? {} : { cleanupAttempt: row.cleanupAttempt }),
    resourceAuthority,
  }
}

export async function listByBusinessLifecycleHandler(ctx: QueryCtx, args: ListByBusinessLifecycleArgs) {
  const rows = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_businessId_and_lifecycle', (query) => query.eq('businessId', args.businessId).eq('lifecycle', args.lifecycle))
    .take(Math.max(1, Math.min(100, Math.trunc(args.limit))))
  const current = await Promise.all(rows.map(async (row) => await readCanonicalConnectionForProjection(ctx, toDomain(row), args.lifecycle === 'active')))
  return rows.flatMap((row, index) => current[index] === null ? [] : [toRow(toDomain(row), row.lastCommandId, row.lastCommandDigest)])
}

export async function listByProviderLifecycleHandler(ctx: QueryCtx, args: ListByProviderLifecycleArgs) {
  const rows = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_providerRef_and_lifecycle', (query) => query.eq('providerRef', args.providerRef).eq('lifecycle', args.lifecycle))
    .take(Math.max(1, Math.min(100, Math.trunc(args.limit))))
  const current = await Promise.all(rows.map(async (row) => await readCanonicalConnectionForProjection(ctx, toDomain(row), args.lifecycle === 'active')))
  return rows.flatMap((row, index) => current[index] === null ? [] : [toRow(toDomain(row), row.lastCommandId, row.lastCommandDigest)])
}

export async function readAtGenerationHandler(
  ctx: QueryCtx,
  args: { connectionRef: string; authorityGeneration: number },
) {
  const row = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef_and_authorityGeneration', (query) => query.eq('connectionRef', args.connectionRef).eq('authorityGeneration', args.authorityGeneration)).unique()
  if (row === null) return null
  const legacy = toDomain(row)
  return await readCanonicalConnectionForProjection(ctx, legacy, true) === null
    ? null
    : toRow(legacy, row.lastCommandId, row.lastCommandDigest)
}

export async function resolveCredentialRefHandler(
  _ctx: QueryCtx,
  _args: { connectionRef: string; expectedAuthorityGeneration: number; expectedAuthorityDigest: string; now: number },
): Promise<ProviderConnectionCredentialResolution> {
  return { kind: 'unavailable' as const, reason: 'inactive' as const }
}

export async function validateAuthorityHandler(
  _ctx: QueryCtx,
  _args: { connectionRef: string; expectedAuthorityGeneration: number; expectedAuthorityDigest: string; now: number },
): Promise<ProviderConnectionAuthorityValidation> {
  return { kind: 'unavailable' as const, reason: 'inactive' as const }
}
