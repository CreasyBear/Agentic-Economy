import {
  createConnectionHealthAuditEvent,
  createConnectionLifecycleAuditEvent,
  createX402ProviderConnection,
  reauthorizeProviderConnection,
  type ProviderConnection,
  type ProviderConnectionCommandResult,
} from '../../../src/modules/capability-supply/provider-connection'
import {
  ConsequenceAuthorityBoundary,
  type AuthorityConsequenceAdmission,
} from '../../../src/modules/authority/context/public'
import {
  canonicalEvmAddress,
  validPublicHttpsEndpoint,
} from '../../../src/modules/capability-supply/convex'
import { canonicalDigest, isCanonicalDigest } from '../../../src/modules/common/canonical-digest'
import type { MutationCtx } from '../../_generated/server'
import type { Doc } from '../../_generated/dataModel'
import {
  resolveProviderConnectionProvenance,
  toDomain,
  toRow,
} from './lifecycle'
import {
  ensureOwnerProviderConnectionGrant,
  type CanonicalActor,
} from './authority'
import { resolveBusinessActor } from '../../authz'
import { accountRef, ownershipRef, principalRef } from '../../../src/modules/principal-account/public'
import {
  validX402SellerClaimTime,
  x402SellerClaimDigest,
} from '../../../src/modules/capability-supply/public'
import { requireSourceWrite } from '../../sourceWriteAdmission'
import { persistAuditEvent } from '../../securityShared'
import { admitAuthorityCredentialChangeRate } from '../rateLimit'
import {
  consumeConsequenceProof,
  deriveStrictConsequenceProof,
  isValidClerkFactorEvidence,
} from '../consequenceProof'
import { providerRouteabilityIsFrozen } from '../providerOffboardingFreeze'
import {
  type CheckX402OwnerArgs,
  type ConnectX402OwnerArgs,
  type ProviderConnectionActor,
} from './ownerContracts'
import {
  projectOwnerProjection,
  projectOwnerResult,
  readProviderBusinessForActor,
  readProviderConnectionForActor,
} from './ownerRead'

type VerifiedConnectionSellerClaim = Readonly<{
  businessId: string
  endpointUrl: string
  method: 'GET' | 'POST'
  observationDigest: string
  payTo: `0x${string}`
  expiresAt: number
}>

async function verifiedConnectionSellerClaim(
  args: ConnectX402OwnerArgs,
  canonicalResourceUrl: string,
  now: number,
): Promise<
  | Readonly<{ kind: 'verified'; claim: VerifiedConnectionSellerClaim }>
  | Readonly<{ kind: 'refused'; code: 'invalid_identity' | 'invalid_time' | 'invalid_digest' | 'invalid_resource' }>
> {
  const payTo = canonicalEvmAddress(args.payTo)
  if (payTo === undefined || !isCanonicalDigest(args.observationDigest)) {
    return { kind: 'refused', code: 'invalid_identity' }
  }
  if (!validX402SellerClaimTime(args.claimExpiresAt, now)) {
    return { kind: 'refused', code: 'invalid_time' }
  }
  const claim = {
    businessId: String(args.businessId),
    endpointUrl: canonicalResourceUrl,
    method: args.method,
    observationDigest: args.observationDigest,
    payTo,
    expiresAt: args.claimExpiresAt,
  } as const
  if (args.claimDigest !== x402SellerClaimDigest(claim)) {
    return { kind: 'refused', code: 'invalid_identity' }
  }
  return /^0x[0-9a-fA-F]{130}$/u.test(args.claimSignature)
    ? { kind: 'verified', claim }
    : { kind: 'refused', code: 'invalid_digest' }
}
export async function connectX402OwnerHandler(ctx: MutationCtx, args: ConnectX402OwnerArgs) {
  const sourceWrite = await requireSourceWrite(ctx, args, 'catalog_publish')
  if (sourceWrite.kind === 'rejected') {
    return { kind: 'refused' as const, code: 'invalid_identity' as const }
  }
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') {
    return { kind: 'refused' as const, code: 'invalid_identity' as const }
  }
  return await connectX402ProviderConnectionForActor(ctx, args, actor, true)
}

function x402HealthAuthorityMatches(
  current: ProviderConnection,
  args: CheckX402OwnerArgs,
  resource: URL,
  now: number,
): boolean {
  const checkedAtIsCurrent = Number.isSafeInteger(args.checkedAt)
    && args.checkedAt >= 0
    && args.checkedAt <= now
    && now - args.checkedAt <= 2 * 60_000
  return ![
    current.adapterId !== 'x402-fetch:v2',
    current.x402Method === undefined,
    current.x402Payee === undefined,
    current.x402Method !== args.method,
    current.x402Payee !== args.payee,
    resource.hash !== '',
    current.grantedResources.length !== 1,
    current.grantedResources[0] !== resource.toString(),
    !checkedAtIsCurrent,
    !isCanonicalDigest(args.observationDigest),
    args.expectedAuthorityGeneration !== current.authorityGeneration,
    args.expectedAuthorityDigest !== current.authorityDigest,
    args.status === 'healthy' && args.reasonCode !== undefined,
    args.status === 'unhealthy' && (args.reasonCode === undefined || args.reasonCode.trim().length === 0),
  ].some(Boolean)
}

function prepareX402HealthObservation(
  current: ProviderConnection,
  args: CheckX402OwnerArgs,
  actor: ProviderConnectionActor,
  now: number,
) {
  const resource = validPublicHttpsEndpoint(args.resourceUrl)
  if (resource === undefined || !x402HealthAuthorityMatches(current, args, resource, now)) {
    return { kind: 'refused' as const, code: 'invalid_digest' as const }
  }
  return {
    kind: 'prepared' as const,
    audit: createConnectionHealthAuditEvent({
      actorPrincipalRef: actor.canonicalPrincipalRef,
      activeAccountRef: actor.canonicalAccountRef,
      connectionRef: current.connectionRef,
      authorityGeneration: current.authorityGeneration,
      commandId: args.commandId,
      correlationRef: args.correlationId,
      method: args.method,
      resourceUrl: resource.toString(),
      payee: args.payee,
      status: args.status,
      observationDigest: args.observationDigest,
      ...(args.reasonCode === undefined ? {} : { reasonCode: args.reasonCode }),
      observedAt: args.checkedAt,
    }),
  }
}

function projectExistingHealthAuditReplay(
  existing: Doc<'auditEvents'>,
  audit: ReturnType<typeof createConnectionHealthAuditEvent>,
  current: ProviderConnection,
  actor: ProviderConnectionActor,
  now: number,
) {
  const matches = existing.activeAccountRef === actor.canonicalAccountRef
    && existing.targetRef === current.connectionRef
    && existing.payloadHash === audit.payloadHash
  return matches
    ? {
        kind: 'duplicate' as const,
        connection: projectOwnerProjection(current, now),
        commandDigest: audit.payloadHash,
      }
    : { kind: 'refused' as const, code: 'command_identity_conflict' as const }
}

async function persistX402HealthObservation(
  ctx: MutationCtx,
  row: Doc<'capabilityProviderConnections'>,
  current: ProviderConnection,
  args: CheckX402OwnerArgs,
  audit: ReturnType<typeof createConnectionHealthAuditEvent>,
  now: number,
) {
  await ctx.db.patch(row._id, {
    healthStatus: args.status,
    healthCheckedAt: args.checkedAt,
    healthSubject: current.x402Payee,
    healthObservationDigest: args.observationDigest,
    ...(args.reasonCode === undefined
      ? { healthReasonCode: undefined }
      : { healthReasonCode: args.reasonCode }),
  })
  await persistAuditEvent(ctx.db, audit)
  const updated = await ctx.db.get(row._id)
  if (updated === null) throw new Error('provider_connection_health_write_lost')
  return {
    kind: 'applied' as const,
    connection: projectOwnerProjection(toDomain(updated), now),
    commandDigest: audit.payloadHash,
  }
}

export async function checkX402OwnerHandler(ctx: MutationCtx, args: CheckX402OwnerArgs) {
  const sourceWrite = await requireSourceWrite(ctx, args, 'catalog_publish')
  if (sourceWrite.kind === 'rejected') {
    return { kind: 'refused' as const, code: 'invalid_identity' as const }
  }
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') {
    return { kind: 'refused' as const, code: 'invalid_identity' as const }
  }
  const owned = await readProviderConnectionForActor(ctx, args.connectionRef, actor, false)
  if (owned === null) return { kind: 'refused' as const, code: 'invalid_transition' as const }
  const current = toDomain(owned.row)
  const now = Date.now()
  const prepared = prepareX402HealthObservation(current, args, actor, now)
  if (prepared.kind === 'refused') return prepared
  const existing = await ctx.db.query('auditEvents')
    .withIndex('by_eventId', (index) => index.eq('eventId', prepared.audit.eventId))
    .unique()
  if (existing !== null) {
    return projectExistingHealthAuditReplay(existing, prepared.audit, current, actor, now)
  }
  return await persistX402HealthObservation(ctx, owned.row, current, args, prepared.audit, now)
}

async function prepareX402ConnectionClaim(
  ctx: MutationCtx,
  args: ConnectX402OwnerArgs,
  actor: ProviderConnectionActor,
) {
  const ownedBusiness = await readProviderBusinessForActor(ctx, args.businessId, actor)
  const resourceUrl = validPublicHttpsEndpoint(args.resourceUrl)
  const now = Date.now()
  if (ownedBusiness === null || resourceUrl === undefined || resourceUrl.hash !== '') {
    return { kind: 'refused' as const, code: 'invalid_identity' as const }
  }
  if (await providerRouteabilityIsFrozen(ctx, args.businessId)) {
    return { kind: 'refused' as const, code: 'invalid_transition' as const }
  }
  const canonicalResourceUrl = resourceUrl.toString()
  const verification = await verifiedConnectionSellerClaim(args, canonicalResourceUrl, now)
  return verification.kind === 'refused'
    ? verification
    : {
        kind: 'prepared' as const,
        ownedBusiness,
        resourceUrl,
        canonicalResourceUrl,
        claim: verification.claim,
        now,
      }
}

async function resolveX402ConnectionAuthority(
  ctx: MutationCtx,
  actor: CanonicalActor,
  input: Readonly<{
    connectionRef: string
    canonicalResourceUrl: string
    existing: Doc<'capabilityProviderConnections'> | null
    provisionOwnerGrant: boolean
    commandId: string
    delegatedGrantRef?: string
  }>,
) {
  const installResources = [
    'connection-provider:x402',
    `connection-provider:x402:${input.canonicalResourceUrl}`,
  ]
  const expectedGrantRef = input.existing !== null
    && input.existing.lastCommandId === input.commandId
    ? input.existing.authorityGrantRef
    : input.provisionOwnerGrant
      ? (await ensureOwnerProviderConnectionGrant(ctx, actor, {
          connectionRef: input.connectionRef,
          providerResourceRefs: installResources,
        })).grantRef
      : input.delegatedGrantRef
  if (expectedGrantRef === undefined) return null
  return await resolveProviderConnectionProvenance(
    ctx,
    actor,
    input.existing === null ? 'install' : 'refresh',
    input.existing === null ? installResources : [`connection:${input.connectionRef}`],
    null,
    expectedGrantRef,
  )
}

async function persistX402ConnectionResult(
  ctx: MutationCtx,
  existing: Doc<'capabilityProviderConnections'> | null,
  commandId: string,
  result: ProviderConnectionCommandResult,
) {
  if (result.kind !== 'applied') return
  const row = toRow(result.connection, commandId, result.commandDigest)
  if (existing === null) await ctx.db.insert('capabilityProviderConnections', row)
  else await ctx.db.replace(existing._id, row)
}

type X402OwnerAuthorityActor = ProviderConnectionActor

function strictX402AdmissionIsValid(
  admission: AuthorityConsequenceAdmission | null,
): admission is AuthorityConsequenceAdmission & Required<Pick<AuthorityConsequenceAdmission, 'descriptor' | 'proofPolicy'>> {
  return admission !== null
    && admission.descriptor !== undefined
    && admission.proofPolicy?.kind === 'clerk_reverification'
    && admission.proofPolicy.preset === 'strict'
    && admission.proofPolicy.uniquePerCommand === true
}

async function inspectX402ProofReplay(
  ctx: MutationCtx,
  args: ConnectX402OwnerArgs,
  actor: ProviderConnectionActor,
  existing: Doc<'capabilityProviderConnections'> | null,
) {
  const proofInput = args.proof
  if (proofInput === undefined || !isValidClerkFactorEvidence(proofInput)) {
    return { kind: 'refused' as const, code: 'reauthentication_required' as const }
  }
  const existingProof = await ctx.db.query('consequenceProofUses')
    .withIndex('by_reverificationId', (query) => query.eq('reverificationId', proofInput.reverificationId))
    .unique()
  if (existingProof === null || existing?.lastCommandId !== args.commandId) {
    return { kind: 'fresh' as const, proofInput, existingProof }
  }
  if (existingProof.actorPrincipalRef !== actor.canonicalPrincipalRef
    || existingProof.activeAccountRef !== actor.canonicalAccountRef) {
    return { kind: 'refused' as const, code: 'proof_replayed' as const }
  }
  return { kind: 'replay' as const }
}

async function consumeFreshX402OwnerProof(
  ctx: MutationCtx,
  input: Readonly<{
    args: ConnectX402OwnerArgs
    actor: X402OwnerAuthorityActor
    connectionRef: string
    canonicalResourceUrl: string
    claim: VerifiedConnectionSellerClaim
    existing: Doc<'capabilityProviderConnections'> | null
    now: number
    proofInput: NonNullable<ConnectX402OwnerArgs['proof']>
    existingProof: Doc<'consequenceProofUses'> | null
  }>,
) {
  const admission = await x402ConnectionConsequenceAdmission({
    ctx,
    actor: input.actor,
    connectionRef: input.connectionRef,
    canonicalResourceUrl: input.canonicalResourceUrl,
    method: input.claim.method,
    payee: input.claim.payTo,
    observationDigest: input.claim.observationDigest,
    claimDigest: input.args.claimDigest,
    commandId: input.args.commandId,
    existing: input.existing,
    now: input.now,
  })
  if (!strictX402AdmissionIsValid(admission)) {
    return { kind: 'refused' as const, code: 'invalid_transition' as const }
  }
  if (input.existingProof !== null) {
    const sameActor = input.existingProof.actorPrincipalRef === admission.actorPrincipalRef
      && input.existingProof.activeAccountRef === admission.activeAccountRef
    if (!sameActor) return { kind: 'refused' as const, code: 'proof_replayed' as const }
    return {
      kind: 'refused' as const,
      code: input.existingProof.commandDigest === admission.descriptor.commandDigest
        ? 'proof_replayed' as const
        : 'command_changed' as const,
    }
  }
  const proof = deriveStrictConsequenceProof({ ...input.proofInput, now: input.now })
  if (proof.kind === 'refused') return proof
  const rate = await admitAuthorityCredentialChangeRate(ctx, admission.activeAccountRef)
  if (rate.kind === 'unavailable') {
    return {
      kind: 'refused' as const,
      code: 'security_control_unavailable' as const,
      correlationRef: input.args.correlationId,
    }
  }
  if (rate.kind === 'rate_limited') {
    return { kind: 'refused' as const, code: 'rate_limited' as const }
  }
  const consumed = await consumeConsequenceProof(ctx, {
    reverificationId: input.proofInput.reverificationId,
    actorPrincipalRef: admission.actorPrincipalRef,
    activeAccountRef: admission.activeAccountRef,
    commandDigest: admission.descriptor.commandDigest,
    proof: proof.proof,
    correlationRef: admission.correlationRef,
    idempotencyRef: admission.idempotencyRef,
  })
  return consumed.kind === 'refused' ? consumed : { kind: 'admitted' as const, proofReplay: false }
}

async function admitX402OwnerProof(
  ctx: MutationCtx,
  input: Readonly<{
    args: ConnectX402OwnerArgs
    actor: X402OwnerAuthorityActor
    connectionRef: string
    canonicalResourceUrl: string
    claim: VerifiedConnectionSellerClaim
    existing: Doc<'capabilityProviderConnections'> | null
    now: number
    provisionOwnerGrant: boolean
  }>,
) {
  if (!input.provisionOwnerGrant) return { kind: 'admitted' as const, proofReplay: false }
  const replay = await inspectX402ProofReplay(ctx, input.args, input.actor, input.existing)
  if (replay.kind === 'refused') return replay
  if (replay.kind === 'replay') return { kind: 'admitted' as const, proofReplay: true }
  return await consumeFreshX402OwnerProof(ctx, { ...input, ...replay })
}

function createOrReauthorizeX402Connection(
  existing: Doc<'capabilityProviderConnections'> | null,
  connectionCommand: Parameters<typeof createX402ProviderConnection>[0],
  canonicalResourceUrl: string,
  claim: VerifiedConnectionSellerClaim,
  now: number,
): ProviderConnectionCommandResult {
  if (existing === null) return createX402ProviderConnection(connectionCommand, now)
  if (existing.lastCommandId === connectionCommand.commandId) {
    return createX402ProviderConnection(connectionCommand, now, toDomain(existing))
  }
  const current = toDomain(existing)
  return reauthorizeProviderConnection({
    ...current,
    evidenceRefs: current.evidenceRefs.filter((ref) =>
      !ref.startsWith('x402-endpoint-inspection:')
      && !ref.startsWith('x402-payee-claim:')),
  }, {
    ...connectionCommand,
    adapterId: 'x402-fetch:v2',
    credentialRef: null,
    x402Method: claim.method,
    x402Payee: claim.payTo,
    requestedScopes: [],
    grantedScopes: [],
    requestedResources: [canonicalResourceUrl],
    grantedResources: [canonicalResourceUrl],
    expectedAuthorityGeneration: existing.authorityGeneration,
    expectedAuthorityDigest: existing.authorityDigest,
  }, now)
}

async function persistX402ConnectionLifecycleAudit(
  ctx: MutationCtx,
  input: Readonly<{
    args: ConnectX402OwnerArgs
    actor: ProviderConnectionActor
    existing: Doc<'capabilityProviderConnections'> | null
    result: Extract<ProviderConnectionCommandResult, { kind: 'applied' }>
    claim: VerifiedConnectionSellerClaim
    canonicalResourceUrl: string
    now: number
  }>,
) {
  await persistAuditEvent(ctx.db, createConnectionLifecycleAuditEvent({
    eventType: input.existing === null ? 'connection.connected' : 'connection.reauthorized',
    actorPrincipalRef: input.actor.canonicalPrincipalRef,
    activeAccountRef: input.actor.canonicalAccountRef,
    connectionRef: input.result.connection.connectionRef,
    authorityGeneration: input.result.connection.authorityGeneration,
    commandId: input.args.commandId,
    correlationRef: input.args.correlationId,
    commandDigest: input.result.commandDigest,
    adapterId: input.result.connection.adapterId,
    beforeState: input.existing === null ? 'missing' : toDomain(input.existing).lifecycle,
    outcome: input.existing === null ? 'connected' : 'reauthorized',
    method: input.claim.method,
    resourceUrl: input.canonicalResourceUrl,
    payee: input.claim.payTo,
    occurredAt: input.now,
  }))
}

function delegatedX402Grant(actor: ProviderConnectionActor): Readonly<{ delegatedGrantRef?: string }> {
  return actor.authorityGrantRef === undefined
    ? {}
    : { delegatedGrantRef: actor.authorityGrantRef }
}

async function completeX402ConnectionCommand(
  ctx: MutationCtx,
  input: Readonly<{
    args: ConnectX402OwnerArgs
    actor: ProviderConnectionActor
    connectionRef: string
    providerRef: string
    providerAccountRef: string
    canonicalResourceUrl: string
    claim: VerifiedConnectionSellerClaim
    existing: Doc<'capabilityProviderConnections'> | null
    provisionOwnerGrant: boolean
    proofReplay: boolean
    now: number
  }>,
) {
  const canonicalActor = {
    principalRef: principalRef(input.actor.canonicalPrincipalRef),
    accountRef: accountRef(input.actor.canonicalAccountRef),
  }
  const provenance = await resolveX402ConnectionAuthority(ctx, canonicalActor, {
    connectionRef: input.connectionRef,
    canonicalResourceUrl: input.canonicalResourceUrl,
    existing: input.existing,
    provisionOwnerGrant: input.provisionOwnerGrant,
    commandId: input.args.commandId,
    ...delegatedX402Grant(input.actor),
  })
  if (provenance === null) {
    if (input.provisionOwnerGrant) throw new Error('provider_connection_authority_resolution_failed_after_proof')
    return { kind: 'refused' as const, code: 'invalid_transition' as const }
  }
  const connectionCommand = {
    commandId: input.args.commandId,
    connectionRef: input.connectionRef,
    businessId: String(input.args.businessId),
    providerRef: input.providerRef,
    providerAccountRef: input.providerAccountRef,
    resourceUrl: input.canonicalResourceUrl,
    method: input.claim.method,
    payee: input.claim.payTo,
    evidenceRefs: [
      ...input.args.evidenceRefs,
      `x402-payee-claim:${x402SellerClaimDigest(input.claim)}`,
    ],
    ...provenance,
  }
  const result = createOrReauthorizeX402Connection(
    input.existing, connectionCommand, input.canonicalResourceUrl, input.claim, input.now,
  )
  if (result.kind === 'refused') {
    if (input.provisionOwnerGrant && input.proofReplay) {
      return { kind: 'refused' as const, code: 'command_changed' as const }
    }
    if (input.provisionOwnerGrant) throw new Error(`provider_connection_state_refused_after_proof:${result.code}`)
    return result
  }
  if (input.proofReplay && result.kind !== 'duplicate') {
    throw new Error('provider_connection_proof_replay_state_mismatch')
  }
  await persistX402ConnectionResult(ctx, input.existing, input.args.commandId, result)
  if (result.kind === 'applied') {
    await persistX402ConnectionLifecycleAudit(ctx, { ...input, result })
  }
  return projectOwnerResult(result, input.now)
}

export async function connectX402ProviderConnectionForActor(
  ctx: MutationCtx,
  args: ConnectX402OwnerArgs,
  actor: ProviderConnectionActor,
  provisionOwnerGrant = false,
) {
  // Connections are private supplier infrastructure. Publication happens only
  // after the Operation is admitted, so first-party onboarding must work while
  // the supplier business is still unpublished.
  const prepared = await prepareX402ConnectionClaim(ctx, args, actor)
  if (prepared.kind === 'refused') return prepared
  const { resourceUrl, canonicalResourceUrl, claim, now } = prepared
  const connectionRef = `connection:x402:${canonicalDigest({ businessId: String(args.businessId), resourceUrl: canonicalResourceUrl })}`
  const providerRef = `provider:x402:${resourceUrl.host}`
  const providerAccountRef = `x402:${canonicalResourceUrl}`
  const existing = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (index) => index.eq('connectionRef', connectionRef)).unique()
  if (existing !== null && String(existing.businessId) !== String(args.businessId)) {
    return { kind: 'refused' as const, code: 'invalid_identity' as const }
  }
  const proof = await admitX402OwnerProof(ctx, {
    args,
    actor: actor as X402OwnerAuthorityActor,
    connectionRef,
    canonicalResourceUrl,
    claim,
    existing,
    now,
    provisionOwnerGrant,
  })
  if (proof.kind === 'refused') return proof
  return await completeX402ConnectionCommand(ctx, {
    args,
    actor,
    connectionRef,
    providerRef,
    providerAccountRef,
    canonicalResourceUrl,
    claim,
    existing,
    provisionOwnerGrant,
    proofReplay: proof.proofReplay,
    now,
  })
}

async function readCurrentX402Ownership(
  ctx: MutationCtx,
  actor: X402OwnerAuthorityActor,
) {
  const provenance = actor.authorityProvenance
  const revision = actor.authorityRevision
  if (provenance?.accessKind !== 'ownership'
    || provenance.accessRef !== provenance.currentOwnershipRef
    || revision === undefined) return null
  const ownership = await ctx.db.query('accountOwnerships')
    .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', provenance.currentOwnershipRef as never))
    .unique()
  const ownershipIsCurrent = ownership !== null
    && ownership.lifecycle === 'active'
    && ownership.accountRef === actor.canonicalAccountRef
    && ownership.ownerPrincipalRef === actor.canonicalPrincipalRef
    && ownership.revision === revision.currentOwnership
  return ownershipIsCurrent ? { ownership, revision } : null
}

function x402ConsequenceParameters(
  input: Readonly<{
    actor: X402OwnerAuthorityActor
    connectionRef: string
    canonicalResourceUrl: string
    method: 'GET' | 'POST'
    payee: string
    observationDigest: string
    claimDigest: string
    commandId: string
    existing: Doc<'capabilityProviderConnections'> | null
    now: number
  }>,
  currentOwnership: NonNullable<Awaited<ReturnType<typeof readCurrentX402Ownership>>>,
) {
  const action = input.existing === null ? 'connection.connect' as const : 'connection.reauthorize' as const
  return {
    binding: {
      principalClass: 'interactive' as const,
      actorPrincipalRef: principalRef(input.actor.canonicalPrincipalRef),
      activeAccountRef: accountRef(input.actor.canonicalAccountRef),
      authoritySource: {
        kind: 'account_ownership' as const,
        ownershipRef: ownershipRef(currentOwnership.ownership.ownershipRef),
        ownershipRevision: currentOwnership.ownership.revision,
        accountRevision: currentOwnership.revision.account,
        admittedAt: input.now,
        expiresAt: input.now + 1,
      },
    },
    consequence: {
      requiredScopes: [input.existing === null ? 'connection:install' : 'connection:refresh'],
      resourceRefs: [`connection:${input.connectionRef}`, `connection-provider:x402:${input.canonicalResourceUrl}`],
      budgetAmount: 0,
      correlationRef: input.commandId,
      idempotencyRef: input.commandId,
      consequence: {
        action,
        target: {
          targetType: 'provider_connection',
          targetRef: input.connectionRef,
          targetRevision: input.existing?.authorityGeneration ?? 1,
        },
        consequenceSummary: input.existing === null
          ? 'Connect this exact x402 resource and payee authority.'
          : 'Reauthorize this exact x402 resource and payee authority.',
        statusReadbackRef: `provider-connections/${input.connectionRef}`,
        command: {
          version: 'ae.x402-connection-authority:v1',
          action,
          commandId: input.commandId,
          connectionRef: input.connectionRef,
          expectedAuthorityGeneration: input.existing?.authorityGeneration ?? 0,
          expectedAuthorityDigest: input.existing?.authorityDigest ?? null,
          method: input.method,
          resourceUrl: input.canonicalResourceUrl,
          payee: input.payee,
          observationDigest: input.observationDigest,
          claimDigest: input.claimDigest,
        },
      },
    },
  }
}

async function x402ConnectionConsequenceAdmission(input: Readonly<{
  ctx: MutationCtx
  actor: X402OwnerAuthorityActor
  connectionRef: string
  canonicalResourceUrl: string
  method: 'GET' | 'POST'
  payee: string
  observationDigest: string
  claimDigest: string
  commandId: string
  existing: Doc<'capabilityProviderConnections'> | null
  now: number
}>): Promise<AuthorityConsequenceAdmission | null> {
  const currentOwnership = await readCurrentX402Ownership(input.ctx, input.actor)
  if (currentOwnership === null) return null
  const parameters = x402ConsequenceParameters(input, currentOwnership)
  const boundary = new ConsequenceAuthorityBoundary({
    admitConsequence: async () => {
      throw new Error('provider_connection_owner_delegation_unreachable')
    },
  })
  return await boundary.forSurface('convex', {
    resolveCanonicalBinding: async () => parameters.binding,
  }).withCurrentAuthority(parameters.consequence, async (admission) => admission)
}
