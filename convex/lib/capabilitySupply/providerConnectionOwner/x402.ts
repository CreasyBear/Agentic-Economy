import {
  createConnectionLifecycleAuditEvent,
  createX402ProviderConnection,
  reauthorizeProviderConnection,
  type ProviderConnectionCommandResult,
} from '../../../../src/modules/capability-supply/provider-connection'
import { canonicalEvmAddress, validPublicHttpsEndpoint } from '../../../../src/modules/capability-supply/convex'
import { canonicalDigest, isCanonicalDigest } from '../../../../src/modules/common/canonical-digest'
import type { MutationCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'
import { resolveProviderConnectionProvenance, toDomain, toRow } from '../providerConnections/lifecycle'
import { ensureOwnerProviderConnectionGrant, type CanonicalActor } from '../providerConnections/authority'
import { resolveBusinessActor } from '../../../authz'
import { accountRef, principalRef } from '../../../../src/modules/principal-account/public'
import { validX402SellerClaimTime, x402SellerClaimDigest } from '../../../../src/modules/capability-supply/public'
import { requireSourceWrite } from '../../security/sourceWrite/admission'
import { persistAuditEvent } from '../../security/audit/persistence'
import { providerRouteabilityIsFrozen } from '../providerOffboarding/freeze'
import {
  type ConnectX402OwnerArgs,
  type ProviderConnectionActor,
  type VerifiedConnectionSellerClaim,
} from './contracts'
import { projectOwnerResult, readProviderBusinessForActor } from './reads'
import { admitX402OwnerProof } from './x402Proof'

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
    actor: actor as ProviderConnectionActor,
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

