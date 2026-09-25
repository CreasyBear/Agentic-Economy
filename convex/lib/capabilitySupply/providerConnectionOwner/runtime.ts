import { type Infer } from 'convex/values'
import { degradeBackend } from '../../../../src/lib/observability/degrade-backend'
import type { ProviderConnection } from '../../../../src/modules/capability-supply/provider-connection'
import { DelegationService, delegationGrantRef } from '../../../../src/modules/authority/delegation/public'
import { MARKET_SUPPLY_MANAGE_SCOPE } from '../../../../src/modules/agent-access/contract'
import {
  verifyCustomerRequestServiceAssertion,
  type CustomerRequestServiceAssertion,
} from '../../../../src/modules/agent-access/service-auth-envelope'
import type { BusinessActor } from '../../../../src/modules/business/public'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import { env, type MutationCtx } from '../../../_generated/server'
import { toDomain } from '../providerConnections/lifecycle'
import { resolveBusinessActor } from '../../../authz'
import {
  createConvexDelegationContextPort,
  createConvexDelegationStore,
} from '../../authority/delegation/persistence'
import { prepareOwnerMcpRuntimeArgsValue } from './contracts'
import { readProviderConnectionForActor } from './reads'

type AuthenticatedBusinessActor = Extract<BusinessActor, { kind: 'authenticated_owner' }>

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
