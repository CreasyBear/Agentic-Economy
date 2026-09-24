import { type Infer } from 'convex/values'
import { degradeBackend } from '../../../../src/lib/observability/degrade-backend'
import {
  projectProviderConnectionOwner,
  providerConnectionAuthorityProvenanceIsValid,
  reauthorizeProviderConnection,
  type ProviderConnection,
  type ProviderConnectionCommandResult,
} from '../../../../src/modules/capability-supply/provider-connection'
import {
  DelegationService,
  delegationGrantRef,
} from '../../../../src/modules/authority/delegation/public'
import { MARKET_SUPPLY_MANAGE_SCOPE } from '../../../../src/modules/agent-access/contract'
import {
  verifyCustomerRequestServiceAssertion,
  type CustomerRequestServiceAssertion,
} from '../../../../src/modules/agent-access/service-auth-envelope'
import type { BusinessActor } from '../../../../src/modules/business/public'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import { env, type MutationCtx, type QueryCtx } from '../../../_generated/server'
import type { Id } from '../../../_generated/dataModel'
import {
  invalidateActiveLeases,
  resolveProviderConnectionProvenance,
  toDomain,
  toRow,
} from '../providerConnections/lifecycle'
import {
  ensureOwnerProviderConnectionGrant,
  type CanonicalActor,
} from '../providerConnections/authority'
import { resolveBusinessActor } from '../../../authz'
import { accountRef, principalRef } from '../../../../src/modules/principal-account/public'
import {
  createConvexDelegationContextPort,
  createConvexDelegationStore,
} from '../../authority/delegation/persistence'
import { providerRouteabilityIsFrozen } from '../providerOffboarding/freeze'
import {
  prepareOwnerMcpRuntimeArgsValue,
  type ProviderConnectionActor,
  type ReauthorizeOwnerArgs,
} from './contracts'

type AuthenticatedBusinessActor = Extract<BusinessActor, { kind: 'authenticated_owner' }>

function providerGrantResources(connection: ProviderConnection): readonly string[] {
  if (connection.adapterId === 'x402-fetch:v2') {
    return [
      'connection-provider:x402',
      `connection-provider:x402:${connection.grantedResources[0] ?? connection.providerAccountRef.replace(/^x402:/u, '')}`,
    ]
  }
  const providerNamespace = `capability-provider/${connection.adapterId}`
  return [
    `connection-provider:${providerNamespace}`,
    `connection-provider:${providerNamespace}:${connection.providerAccountRef}`,
    ...(connection.credentialRef === null ? [] : [`secret:${connection.credentialRef}`]),
  ]
}

export async function exactGrantRefForConnection(
  ctx: MutationCtx,
  actor: ProviderConnectionActor,
  canonicalActor: CanonicalActor,
  connection: ProviderConnection,
  repeatCommand: boolean,
): Promise<string> {
  if (actor.authorityGrantRef !== undefined) return actor.authorityGrantRef
  if (repeatCommand) return connection.authorityGrantRef
  return (await ensureOwnerProviderConnectionGrant(ctx, canonicalActor, {
    connectionRef: connection.connectionRef,
    providerResourceRefs: providerGrantResources(connection),
  })).grantRef
}

export function projectOwnerProjection(connection: ProviderConnection, now: number) {
  const projection = projectProviderConnectionOwner(connection, now)
  return {
    ...projection,
    grantedScopes: [...projection.grantedScopes],
    grantedResources: [...projection.grantedResources],
    evidenceRefs: [...projection.evidenceRefs],
  }
}

export function projectOwnerResult(result: ProviderConnectionCommandResult, now: number) {
  if (result.kind === 'refused') return result
  const connection = projectOwnerProjection(result.connection, now)
  return result.kind === 'applied'
    ? { kind: 'applied' as const, connection, commandDigest: result.commandDigest }
    : { kind: 'duplicate' as const, connection, commandDigest: result.commandDigest }
}
export async function readProviderConnectionForActor(
  ctx: Pick<QueryCtx, 'db'>,
  connectionRef: string,
  actor: ProviderConnectionActor,
  requireUsable = true,
) {
  const row = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (index) => index.eq('connectionRef', connectionRef)).unique()
  if (row === null) return null
  const business = await ctx.db.get(row.businessId)
  if (business === null
    || business.owningAccountRef !== actor.canonicalAccountRef
    || row.owningAccountRef !== actor.canonicalAccountRef) return null
  const connection = toDomain(row)
  if (!providerConnectionAuthorityProvenanceIsValid(connection)
    || (requireUsable && connection.lifecycle !== 'active')) return null
  return { row, connection, actor }
}

export async function readProviderBusinessForActor(
  ctx: Pick<QueryCtx, 'db'>,
  businessId: Id<'businesses'>,
  actor: ProviderConnectionActor,
) {
  const business = await ctx.db.get(businessId)
  return business !== null && business.owningAccountRef === actor.canonicalAccountRef
    ? { business, actor }
    : null
}

export async function reauthorizeProviderConnectionForActor(
  ctx: MutationCtx,
  args: ReauthorizeOwnerArgs,
  actor: ProviderConnectionActor,
  now: number,
) {
  const owned = await readProviderConnectionForActor(ctx, args.connectionRef, actor, false)
  if (owned === null) return { kind: 'refused' as const, code: 'invalid_transition' as const }
  const { row } = owned
  if (await providerRouteabilityIsFrozen(ctx, row.businessId)) {
    return { kind: 'refused' as const, code: 'invalid_transition' as const }
  }
  const current = toDomain(row)
  const canonicalActor = {
    principalRef: principalRef(actor.canonicalPrincipalRef),
    accountRef: accountRef(actor.canonicalAccountRef),
  }
  const expectedGrantRef = await exactGrantRefForConnection(
    ctx, actor, canonicalActor, current, row.lastCommandId === args.commandId,
  )
  const provenance = await resolveProviderConnectionProvenance(
    ctx,
    canonicalActor,
    'refresh',
    [`connection:${current.connectionRef}`],
    current.credentialRef,
    expectedGrantRef,
  )
  if (provenance === null) return { kind: 'refused' as const, code: 'invalid_transition' as const }
  const result = reauthorizeProviderConnection(current, {
    ...current,
    ...args,
    ...provenance,
    businessId: String(current.businessId),
    credentialRef: current.credentialRef,
    requestedScopes: current.grantedScopes,
    grantedScopes: current.grantedScopes,
    requestedResources: current.grantedResources,
    grantedResources: current.grantedResources,
    ...(current.expiresAt === undefined ? {} : { expiresAt: current.expiresAt }),
    ...(args.reasonCode === undefined ? {} : { reasonCode: args.reasonCode }),
    evidenceRefs: args.evidenceRefs,
  }, now)
  if (result.kind === 'applied') {
    await ctx.db.replace(row._id, toRow(result.connection, args.commandId, result.commandDigest))
    await invalidateActiveLeases(ctx, args.connectionRef, 'generation_changed', now, args.commandId)
  }
  return result
}

export async function readOwnerHandler(ctx: QueryCtx, args: { connectionRef: string }) {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return null
  const owned = await readProviderConnectionForActor(ctx, args.connectionRef, actor)
  return owned === null ? null : projectOwnerProjection(toDomain(owned.row), owned.row.updatedAt)
}

export async function listProviderConnectionsForActor(
  ctx: Pick<QueryCtx, 'db'>,
  args: Readonly<{
    businessId: Id<'businesses'>
    lifecycle?: ProviderConnection['lifecycle']
    limit: number
  }>,
  actor: ProviderConnectionActor,
) {
  const ownedBusiness = await readProviderBusinessForActor(ctx, args.businessId, actor)
  if (ownedBusiness === null) return null
  const states: readonly ProviderConnection['lifecycle'][] = args.lifecycle === undefined
    ? ['active', 'reauthorization_required', 'revocation_pending', 'cleanup_required', 'revoked']
    : [args.lifecycle]
  const rows = (await Promise.all(states.map(async (state) => (
    await ctx.db.query('capabilityProviderConnections')
      .withIndex('by_businessId_and_lifecycle', (index) => index.eq('businessId', args.businessId).eq('lifecycle', state))
      .take(args.limit)
  )))).flat()
    .filter((row) => row.owningAccountRef === actor.canonicalAccountRef)
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, args.limit)
  return rows.flatMap((row) => {
    const connection = toDomain(row)
    return providerConnectionAuthorityProvenanceIsValid(connection)
      ? [projectOwnerProjection(connection, row.updatedAt)]
      : []
  })
}

export async function listOwnerHandler(ctx: QueryCtx) {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return []
  const businesses = await ctx.db.query('businesses')
    .withIndex('by_owningAccountRef_and_updatedAt', (index) => index.eq('owningAccountRef', actor.canonicalAccountRef))
    .take(50)
  const rows = (await Promise.all(businesses.map((business) => (
    Promise.all([
      ...['active', 'reauthorization_required', 'revocation_pending', 'revoked', 'cleanup_required'].map((state) => (
        ctx.db.query('capabilityProviderConnections')
          .withIndex('by_businessId_and_lifecycle', (index) => index.eq('businessId', business._id).eq('lifecycle', state as never))
          .take(100)
      )),
    ])
  )))).flat(2)
  return rows.flatMap((row) => {
    const connection = toDomain(row)
    return row.owningAccountRef === actor.canonicalAccountRef
      && providerConnectionAuthorityProvenanceIsValid(connection)
      ? [projectOwnerProjection(connection, row.updatedAt)]
      : []
  })
}

const PREPARE_OWNER_MCP_RUNTIME_OPERATION = 'capabilityProviderConnections.prepareOwnerMcpRuntimeForServer'

async function validOwnerRuntimeAssertion(
  operation: string,
  input: Readonly<{ connectionRef: string; correlationRef: string }>,
  assertion: CustomerRequestServiceAssertion,
): Promise<boolean> {
  const key = env.AE_CONVEX_SERVER_FUNCTION_TOKEN?.trim()
  return key !== undefined
    && key.length >= 32
    && assertion.principalId === 'ae:server-function'
    && assertion.ownerId === 'ae:server-function'
    && assertion.credentialId === 'ae:server-function'
    && assertion.scopes.includes(MARKET_SUPPLY_MANAGE_SCOPE)
    && await verifyCustomerRequestServiceAssertion({
      key,
      operation,
      command: input,
      assertion,
    })
}

function mcpRuntimeSource(
  connection: ProviderConnection,
  actor: AuthenticatedBusinessActor,
): Readonly<{ sourceUrl: string; secret: string }> | null {
  const sourceUrl = connection.grantedResources.length === 1
    ? connection.grantedResources[0]
    : undefined
  const secret = connection.secretRef ?? connection.credentialRef ?? undefined
  return connection.adapterId !== 'mcp-jsonrpc:v1'
    || sourceUrl === undefined
    || secret === undefined
    || connection.installedByPrincipalRef !== actor.canonicalPrincipalRef
    ? null
    : { sourceUrl, secret }
}

async function readOwnerMcpRuntimeConnection(
  ctx: MutationCtx,
  actor: AuthenticatedBusinessActor,
  connectionRef: string,
) {
  const owned = await readProviderConnectionForActor(ctx, connectionRef, actor)
  if (owned === null) return null
  const connection = toDomain(owned.row)
  const source = mcpRuntimeSource(connection, actor)
  if (source === null) return null
  const { sourceUrl, secret } = source
  const pointer = await ctx.db.query('secretPointers')
    .withIndex('by_secretRef', (query) => query.eq('secretRef', secret))
    .unique()
  return pointer === null || pointer.owningAccountRef !== actor.canonicalAccountRef
    ? null
    : { connection, sourceUrl, secret, pointer }
}

async function admitOwnerMcpRotation(
  ctx: MutationCtx,
  actor: AuthenticatedBusinessActor,
  input: Readonly<{
    connection: ProviderConnection
    secret: string
    correlationRef: string
    idempotencyRef: string
  }>,
) {
  try {
    return await new DelegationService(
      createConvexDelegationStore(ctx),
      createConvexDelegationContextPort(ctx, actor.canonicalPrincipalRef),
      { now: Date.now },
    ).admitConsequence({
      grantRef: delegationGrantRef(input.connection.authorityGrantRef),
      expectedGeneration: input.connection.authorityGrantGeneration,
      context: {
        actorPrincipalRef: actor.canonicalPrincipalRef,
        activeAccountRef: actor.canonicalAccountRef,
        correlationRef: input.correlationRef,
        idempotencyRef: input.idempotencyRef,
      },
      requiredScopes: ['secret:rotate'],
      resourceRefs: [`secret:${input.secret}`],
      budgetAmount: 0,
    })
  } catch (cause) {
    return degradeBackend(cause, null, { site: 'admitOwnerMcpRotation', reason: 'invalid_response' })
  }
}

export async function prepareOwnerMcpRuntimeHandler(
  ctx: MutationCtx,
  args: Infer<typeof prepareOwnerMcpRuntimeArgsValue>,
) {
  const command = { connectionRef: args.connectionRef, correlationRef: args.correlationRef }
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner'
    || !await validOwnerRuntimeAssertion(PREPARE_OWNER_MCP_RUNTIME_OPERATION, command, args.serviceAuth)) {
    return { kind: 'not_found' as const }
  }
  const runtime = await readOwnerMcpRuntimeConnection(ctx, actor, args.connectionRef)
  if (runtime === null) return { kind: 'not_found' as const }
  const { connection, sourceUrl, secret, pointer } = runtime
  const idempotencyRef = canonicalDigest({
    format: 'provider-mcp-runtime-refresh:v1',
    connectionRef: connection.connectionRef,
    authorityGeneration: connection.authorityGeneration,
    pointerRevision: pointer.revision,
    correlationRef: args.correlationRef,
  })
  const snapshot = await admitOwnerMcpRotation(ctx, actor, {
    connection,
    secret,
    correlationRef: args.correlationRef,
    idempotencyRef,
  })
  return snapshot === null
    ? { kind: 'not_found' as const }
    : {
      kind: 'available' as const,
      connection: {
        connectionRef: connection.connectionRef,
        businessRef: connection.businessId,
        sourceUrl,
        secretRef: secret,
        activeGeneration: pointer.activeGeneration,
        pointerRevision: pointer.revision,
        rotationAuthority: {
          operation: 'rotate' as const,
          snapshotRef: snapshot.snapshotRef,
          accountRef: snapshot.accountRef,
          actorPrincipalRef: snapshot.actorPrincipalRef,
          grantRef: snapshot.grantRef,
          grantGeneration: snapshot.generation,
          correlationRef: snapshot.correlationRef,
          idempotencyRef: snapshot.idempotencyRef,
          occurredAt: snapshot.admittedAt,
        },
      },
    }
}

const PREPARE_OWNER_HTTP_RUNTIME_OPERATION = 'capabilityProviderConnections.prepareOwnerHttpRuntimeForServer'

type HttpRuntimeConnection = ProviderConnection & Readonly<{
  sourceOrigin: string
  sourceEnvironment: 'sandbox' | 'production'
  sourceAuthentication:
    | Readonly<{ kind: 'api_key'; location: 'header' | 'query'; name: string }>
    | Readonly<{ kind: 'http_bearer' }>
  secretRef: string
}>

function isHttpRuntimeConnection(
  connection: ProviderConnection,
  actor: AuthenticatedBusinessActor,
): connection is HttpRuntimeConnection {
  return [
    connection.adapterId === 'http-json:v1',
    connection.grantedResources.length === 1,
    typeof connection.secretRef === 'string',
    typeof connection.sourceOrigin === 'string',
    connection.sourceEnvironment === 'sandbox' || connection.sourceEnvironment === 'production',
    connection.sourceAuthentication?.kind === 'api_key' || connection.sourceAuthentication?.kind === 'http_bearer',
    connection.installedByPrincipalRef === actor.canonicalPrincipalRef,
  ].every(Boolean)
}

function httpRuntimeSource(connection: ProviderConnection, actor: AuthenticatedBusinessActor) {
  if (!isHttpRuntimeConnection(connection, actor)) return null
  const [sourceUrl] = connection.grantedResources
  if (sourceUrl === undefined) throw new Error('provider_connection_http_runtime_granted_resource_missing')
  return {
    sourceUrl,
    secret: connection.secretRef,
    sourceOrigin: connection.sourceOrigin,
    environment: connection.sourceEnvironment,
    authentication: connection.sourceAuthentication,
  }
}

export async function prepareOwnerHttpRuntimeHandler(
  ctx: MutationCtx,
  args: Infer<typeof prepareOwnerMcpRuntimeArgsValue>,
) {
  const command = { connectionRef: args.connectionRef, correlationRef: args.correlationRef }
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner'
    || !await validOwnerRuntimeAssertion(PREPARE_OWNER_HTTP_RUNTIME_OPERATION, command, args.serviceAuth)) {
    return { kind: 'not_found' as const }
  }
  const owned = await readProviderConnectionForActor(ctx, args.connectionRef, actor)
  if (owned === null) return { kind: 'not_found' as const }
  const connection = toDomain(owned.row)
  const runtime = httpRuntimeSource(connection, actor)
  if (runtime === null) return { kind: 'not_found' as const }
  const pointer = await ctx.db.query('secretPointers')
    .withIndex('by_secretRef', (query) => query.eq('secretRef', runtime.secret))
    .unique()
  if (pointer === null || pointer.owningAccountRef !== actor.canonicalAccountRef) {
    return { kind: 'not_found' as const }
  }
  return {
    kind: 'available' as const,
    connection: {
      connectionRef: connection.connectionRef,
      businessRef: connection.businessId,
      sourceUrl: runtime.sourceUrl,
      sourceOrigin: runtime.sourceOrigin,
      environment: runtime.environment,
      authentication: runtime.authentication,
      secretRef: runtime.secret,
      activeGeneration: pointer.activeGeneration,
      pointerRevision: pointer.revision,
    },
  }
}
export async function reauthorizeOwnerHandler(ctx: MutationCtx, args: ReauthorizeOwnerArgs) {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') {
    return { kind: 'refused' as const, code: 'invalid_transition' as const }
  }
  const owned = await readProviderConnectionForActor(ctx, args.connectionRef, actor, false)
  if (owned !== null && owned.connection.adapterId === 'x402-fetch:v2') {
    return { kind: 'refused' as const, code: 'invalid_transition' as const }
  }
  const now = Date.now()
  return projectOwnerResult(await reauthorizeProviderConnectionForActor(ctx, args, actor, now), now)
}
