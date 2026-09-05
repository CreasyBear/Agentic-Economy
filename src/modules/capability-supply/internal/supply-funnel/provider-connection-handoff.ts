import { z } from 'zod'
import {
  Client,
  StreamableHTTPClientTransport,
  UnauthorizedError,
  type OAuthClientInformationContext,
  type OAuthClientMetadata,
  type OAuthClientProvider,
  type OAuthDiscoveryState,
  type StoredOAuthClientInformation,
  type StoredOAuthTokens,
} from '@modelcontextprotocol/client'
import {
  OAuthMetadataSchema,
  OAuthProtectedResourceMetadataSchema,
  OpenIdProviderDiscoveryMetadataSchema,
  SafeUrlSchema,
} from '@modelcontextprotocol/sdk/shared/auth.js'
import * as oauth from 'oauth4webapi'

import { requireStrictClerkConsequenceProof } from '@/lib/server/clerk-consequence-proof'
import {
  callSourceMutation,
  callSourceQuery,
  createConvexServerFunctionAssertion,
  sourceMutation,
  sourceQuery,
} from '@/lib/server/convex-source'
import { readTrimmedEnv } from '@/lib/server/read-trimmed-env'
import { package5RolloutDecision } from '@/lib/server/package5-rollout'
import { sourceWriteAdmissionFromContext } from '@/lib/server/source-write-admission'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import { sendGuardedHttpRequest } from '@/modules/network-guard/server'
import { defaultDnsResolver, isPublicHttpTarget } from '@/modules/network-guard/public'
import { sourceWriteRequestFromAdmission } from '@/modules/security/source-write-admission'
import type {
  ProviderConnectionCleanupOutcome,
  ProviderConnectionSourceAuthentication,
} from '../../provider-connection'
import type { McpSourceDiscovery } from '../../source-preview'
import type { ValidOpenApiDocument } from '../openapi-import/validation'
import { validateOpenApiDocument } from '../openapi-import/validation'
import {
  InfisicalCloudSecretStore,
  VercelOidcIdentityTokenProvider,
  secretGeneration,
  secretRef,
} from '@/modules/secrets/public'
import {
  cancelOwnerProviderConnectionAttemptInputSchema,
  completeOwnerHttpProviderConnectionInputSchema,
  completeOwnerMcpProviderConnectionInputSchema,
  ownerProviderConnectionAttemptInputSchema,
  startOwnerMcpProviderConnectionInputSchema,
  type OwnerHttpProviderConnectionResult,
  type CancelOwnerProviderConnectionAttemptResult,
  type OwnerMcpProviderConnectionStartResult,
  type OwnerProviderConnectionAttemptReadback,
  type ProviderOAuthCleanupResult,
  type SecretPointerInput,
} from './provider-connection-handoff-contract'

export {
  cancelOwnerProviderConnectionAttemptInputSchema,
  completeOwnerHttpProviderConnectionInputSchema,
  completeOwnerMcpProviderConnectionInputSchema,
  ownerProviderConnectionAttemptInputSchema,
  startOwnerMcpProviderConnectionInputSchema,
} from './provider-connection-handoff-contract'
export type {
  CancelOwnerProviderConnectionAttemptResult,
  OwnerHttpProviderConnectionResult,
  OwnerMcpProviderConnectionStartResult,
  OwnerProviderConnectionAttemptReadback,
  ProviderOAuthCleanupResult,
  SecretPointerInput,
} from './provider-connection-handoff-contract'

type SecretAuthority = Readonly<{
  operation: 'provision' | 'rotate'
  snapshotRef: string
  accountRef: string
  actorPrincipalRef: string
  grantRef: string
  grantGeneration: number
  correlationRef: string
  idempotencyRef: string
  occurredAt: number
}>

type PrepareResult =
  | Readonly<{
      kind: 'prepared'
      attemptRef: string
      secretRef: string
      authority: SecretAuthority
    }>
  | Readonly<{ kind: 'refused'; code: string }>

type ProvisionInput = Readonly<{
  action?: 'provision' | 'rotate'
  secretRef: string
  authority: SecretAuthority
  idempotencyRef: string
  material: Uint8Array
}>

type ProviderConnectionHandoffRuntime = Readonly<{
  provision?: (input: ProvisionInput) => Promise<Readonly<{ kind: 'active' | 'unavailable' }>>
}>

type McpOAuthHandoffRuntime = Readonly<{
  beginAuth?: (input: Readonly<{
    serverUrl: string
    authProvider: OAuthClientProvider
  }>) => Promise<void>
  finishAuth?: (input: Readonly<{
    serverUrl: string
    authProvider: OAuthClientProvider
    callbackParams: URLSearchParams
  }>) => Promise<void>
  writeSecret?: (input: ProvisionInput) => Promise<Readonly<{ kind: 'active' | 'unavailable' }>>
  readSecret?: (pointer: SecretPointerInput) => Promise<Uint8Array>
  verifyMcp?: (input: Readonly<{
    serverUrl: string
    registryName?: string
    remoteRef?: string
    environment: 'sandbox' | 'production'
    authProvider: OAuthClientProvider
  }>) => Promise<McpSourceDiscovery>
  randomState?: () => string
  now?: () => number
}>

type McpOAuthPreviewRuntime = McpOAuthHandoffRuntime & Readonly<{
  prepareRuntime?: (input: Readonly<{
    connectionRef: string
    correlationRef: string
  }>) => Promise<McpRuntimeReadback>
  randomCorrelation?: () => string
}>

type HttpCredentialPreviewRuntime = Readonly<{
  prepareRuntime?: (input: Readonly<{
    connectionRef: string
    correlationRef: string
  }>) => Promise<HttpRuntimeReadback>
  readSecret?: (pointer: SecretPointerInput) => Promise<Uint8Array>
  loadOpenApi?: (input: Readonly<{
    definitionUrl: string
    authentication: Exclude<ProviderConnectionSourceAuthentication, Readonly<{ kind: 'mcp_oauth' }>>
    credential: Uint8Array
  }>) => Promise<ValidOpenApiDocument>
  randomCorrelation?: () => string
}>

type McpOAuthRevocationRuntime = Readonly<{
  revoke?: (input: Readonly<{
    authorizationServer: oauth.AuthorizationServer
    client: oauth.Client
    token: string
    tokenTypeHint: 'refresh_token' | 'access_token'
  }>) => Promise<Readonly<{ status: number }>>
}>

type PrepareOAuthResult =
  | Readonly<{
      kind: 'prepared'
      attemptRef: string
      secretRef: string
      provisionAuthority: SecretAuthority
      rotationAuthority: SecretAuthority
    }>
  | Readonly<{ kind: 'refused'; code: string }>

type BindOAuthResult =
  | Readonly<{ kind: 'bound' | 'replayed' }>
  | Readonly<{ kind: 'refused'; code: string }>

type OAuthCallbackReadback =
  | Readonly<{
      kind: 'available'
      attempt: Readonly<{
        attemptRef: string
        sourceUrl: string
        environment: 'sandbox' | 'production'
        secretRef: string
        activeGeneration: string
        pointerRevision: number
      }>
    }>
  | Readonly<{ kind: 'not_found' }>

type McpRuntimeReadback =
  | Readonly<{
      kind: 'available'
      connection: Readonly<{
        connectionRef: string
        businessRef: string
        sourceUrl: string
        secretRef: string
        activeGeneration: string
        pointerRevision: number
        rotationAuthority: SecretAuthority
      }>
    }>
  | Readonly<{ kind: 'not_found' }>

type HttpRuntimeReadback =
  | Readonly<{
      kind: 'available'
      connection: Readonly<{
        connectionRef: string
        businessRef: string
        sourceUrl: string
        sourceOrigin: string
        environment: 'sandbox' | 'production'
        authentication: Exclude<ProviderConnectionSourceAuthentication, Readonly<{ kind: 'mcp_oauth' }>>
        secretRef: string
        activeGeneration: string
        pointerRevision: number
      }>
    }>
  | Readonly<{ kind: 'not_found' }>

const readOwnerAttemptQuery = sourceQuery<
  { attemptRef: string },
  OwnerProviderConnectionAttemptReadback
>('capabilityProviderConnectionAttempts:readOwner')

const prepareOwnerAttemptMutation = sourceMutation<
  Record<string, unknown>,
  PrepareResult
>('capabilityProviderConnectionAttempts:prepareOwner')

const finalizeOwnerAttemptMutation = sourceMutation<
  Record<string, unknown>,
  OwnerHttpProviderConnectionResult
>('capabilityProviderConnectionAttempts:finalizeOwner')
const cancelOwnerAttemptMutation = sourceMutation<Record<string, unknown>, CancelOwnerProviderConnectionAttemptResult>('capabilityProviderConnectionAttempts:cancelOwner')

export async function cancelOwnerProviderConnectionAttempt({ data, context }: {
  data: z.infer<typeof cancelOwnerProviderConnectionAttemptInputSchema>
  context: unknown
}): Promise<CancelOwnerProviderConnectionAttemptResult> {
  const operationKey = canonicalDigest({ action: 'supply.connection.cancel', attemptRef: data.attemptRef, idempotencyKey: data.idempotencyKey })
  let proof: Awaited<ReturnType<typeof requireStrictClerkConsequenceProof>>
  try { proof = await requireStrictClerkConsequenceProof(operationKey) } catch { return { kind: 'refused', code: 'reauthentication_required' } }
  try {
    return await admittedMutation(cancelOwnerAttemptMutation, { attemptRef: data.attemptRef, commandId: operationKey, operationKey, correlationId: operationKey, proof }, context, operationKey)
  } catch { return { kind: 'refused', code: 'source_unavailable' } }
}

const prepareOwnerOAuthAttemptMutation = sourceMutation<
  Record<string, unknown>,
  PrepareOAuthResult
>('capabilityProviderConnectionAttempts:prepareOAuthOwner')

const bindOwnerOAuthAttemptMutation = sourceMutation<
  Record<string, unknown>,
  BindOAuthResult
>('capabilityProviderConnectionAttempts:bindOAuthOwner')

const readOwnerOAuthCallbackQuery = sourceQuery<
  { attemptRef: string; stateHash: string; observedAt: number },
  OAuthCallbackReadback
>('capabilityProviderConnectionAttempts:readOAuthCallbackOwner')

const prepareOwnerMcpRuntimeMutation = sourceMutation<
  Record<string, unknown>,
  McpRuntimeReadback
>('capabilityProviderConnections:prepareOwnerMcpRuntimeForServer')

const prepareOwnerHttpRuntimeMutation = sourceMutation<
  Record<string, unknown>,
  HttpRuntimeReadback
>('capabilityProviderConnections:prepareOwnerHttpRuntimeForServer')

export async function readOwnerProviderConnectionAttempt({
  data,
}: {
  data: z.infer<typeof ownerProviderConnectionAttemptInputSchema>
}): Promise<OwnerProviderConnectionAttemptReadback> {
  return await callSourceQuery(readOwnerAttemptQuery, { attemptRef: data.attemptRef })
}

export async function completeOwnerHttpProviderConnection(
  {
    data,
    context,
  }: {
    data: z.infer<typeof completeOwnerHttpProviderConnectionInputSchema>
    context: unknown
  },
  runtime: ProviderConnectionHandoffRuntime = {},
): Promise<OwnerHttpProviderConnectionResult> {
  let attempt: OwnerProviderConnectionAttemptReadback
  try {
    attempt = await readOwnerProviderConnectionAttempt({ data: { attemptRef: data.attemptRef } })
  } catch {
    return refusal('source_unavailable')
  }
  if (attempt.kind !== 'available') return refusal('not_found')
  if (attempt.attempt.sourceKind !== 'http_credential') return refusal('not_supported')
  if (attempt.attempt.state === 'expired' || attempt.attempt.expiresAt <= Date.now()) {
    return refusal('attempt_expired')
  }
  if (attempt.attempt.state !== 'pending') return refusal('not_found')

  const operationKey = canonicalDigest({
    action: 'supply.connection.connect',
    attemptRef: data.attemptRef,
    idempotencyKey: data.idempotencyKey,
  })

  let proof: Awaited<ReturnType<typeof requireStrictClerkConsequenceProof>>
  try {
    proof = await requireStrictClerkConsequenceProof(operationKey)
  } catch {
    return refusal('reauthentication_required')
  }

  const prepareCommand = {
    attemptRef: data.attemptRef,
    commandId: operationKey,
    operationKey,
    correlationId: operationKey,
    proof,
  }
  let prepared: PrepareResult
  try {
    prepared = await admittedMutation(
      prepareOwnerAttemptMutation,
      prepareCommand,
      context,
      operationKey,
    )
  } catch {
    return refusal('source_unavailable')
  }
  if (prepared.kind === 'refused') return mapPrepareRefusal(prepared.code)

  const material = new TextEncoder().encode(data.credential)
  let provisioned: Readonly<{ kind: 'active' | 'unavailable' }>
  try {
    provisioned = await (runtime.provision ?? writeThroughExistingSecretLifecycle)({
      action: 'provision',
      secretRef: prepared.secretRef,
      authority: prepared.authority,
      idempotencyRef: operationKey,
      material,
    })
  } catch {
    return refusal('secret_unavailable')
  } finally {
    material.fill(0)
  }
  if (provisioned.kind !== 'active') return refusal('secret_unavailable')

  const finalizeOperationKey = `${operationKey}:finalize`
  const finalizeCommand = {
    attemptRef: data.attemptRef,
    secretRef: prepared.secretRef,
    provisionCommandId: operationKey,
    commandId: finalizeOperationKey,
    operationKey: finalizeOperationKey,
    correlationId: operationKey,
  }
  try {
    return await admittedMutation(
      finalizeOwnerAttemptMutation,
      finalizeCommand,
      context,
      finalizeOperationKey,
    )
  } catch {
    return refusal('source_unavailable')
  }
}

export async function startOwnerMcpProviderConnection(
  {
    data,
    context,
  }: {
    data: z.infer<typeof startOwnerMcpProviderConnectionInputSchema>
    context: unknown
  },
  runtime: McpOAuthHandoffRuntime = {},
): Promise<OwnerMcpProviderConnectionStartResult> {
  if (!package5RolloutDecision('mcpOAuth').enabled) return startRefusal('not_supported')
  const now = runtime.now ?? Date.now
  let attempt: OwnerProviderConnectionAttemptReadback
  try { attempt = await readOwnerProviderConnectionAttempt({ data: { attemptRef: data.attemptRef } }) } catch { return startRefusal('source_unavailable') }
  if (attempt.kind !== 'available') return startRefusal('not_found')
  if (attempt.attempt.sourceKind !== 'mcp_oauth') return startRefusal('not_supported')
  if (attempt.attempt.state === 'expired' || attempt.attempt.expiresAt <= now()) {
    return startRefusal('attempt_expired')
  }
  if (attempt.attempt.state !== 'pending') return startRefusal('not_found')

  const callback = canonicalOAuthCallback(data.callbackUrl, data.attemptRef)
  if (callback === undefined) return startRefusal('connection_conflict')
  const operationKey = canonicalDigest({
    action: 'supply.connection.connect.mcp-oauth',
    attemptRef: data.attemptRef,
    idempotencyKey: data.idempotencyKey,
  })
  let proof: Awaited<ReturnType<typeof requireStrictClerkConsequenceProof>>
  try {
    proof = await requireStrictClerkConsequenceProof(operationKey)
  } catch {
    return startRefusal('reauthentication_required')
  }
  let prepared: PrepareOAuthResult
  try {
    prepared = await admittedMutation(prepareOwnerOAuthAttemptMutation, {
      attemptRef: data.attemptRef,
      commandId: operationKey,
      operationKey,
      correlationId: operationKey,
      proof,
    }, context, operationKey)
  } catch {
    return startRefusal('source_unavailable')
  }
  if (prepared.kind === 'refused') return startRefusal(mapPrepareRefusal(prepared.code).code)

  const state = (runtime.randomState ?? randomOAuthState)()
  if (!validOAuthState(state)) return startRefusal('connection_conflict')
  const provider = new StoredMcpOAuthProvider({
    attemptRef: data.attemptRef,
    serverUrl: attempt.attempt.sourceUrl,
    environment: attempt.attempt.environment,
    redirectUrl: callback,
    state,
    rotationAuthority: prepared.rotationAuthority,
    rotationIdempotencyRef: prepared.rotationAuthority.idempotencyRef,
  })
  try {
    await (runtime.beginAuth ?? beginMcpOAuthAuthorization)({
      serverUrl: attempt.attempt.sourceUrl,
      authProvider: provider,
    })
  } catch {
    return startRefusal('source_unavailable')
  }
  const authorizationUrl = provider.authorizationUrl
  if (authorizationUrl === undefined || !provider.readyForRedirect()) {
    return startRefusal('connection_conflict')
  }
  const material = new TextEncoder().encode(provider.serialize())
  try {
    const stored = await (runtime.writeSecret ?? writeThroughExistingSecretLifecycle)({
      action: 'provision',
      secretRef: prepared.secretRef,
      authority: prepared.provisionAuthority,
      idempotencyRef: prepared.provisionAuthority.idempotencyRef,
      material,
    })
    if (stored.kind !== 'active') return startRefusal('secret_unavailable')
  } catch {
    return startRefusal('secret_unavailable')
  } finally {
    material.fill(0)
  }
  const bindOperationKey = `${operationKey}:bind`
  try {
    const bound = await admittedMutation(bindOwnerOAuthAttemptMutation, {
      attemptRef: data.attemptRef,
      stateHash: oauthStateHash(state),
      secretRef: prepared.secretRef,
      provisionCommandId: prepared.provisionAuthority.idempotencyRef,
      commandId: bindOperationKey,
      operationKey: bindOperationKey,
      correlationId: operationKey,
    }, context, bindOperationKey)
    if (bound.kind === 'refused') return startRefusal(mapPrepareRefusal(bound.code).code)
  } catch {
    return startRefusal('source_unavailable')
  }
  return { kind: 'redirect', authorizationUrl }
}

export async function loadOwnerConnectedOpenApi(
  input: Readonly<{
    connectionRef: string
    businessRef: string
    definitionUrl: string
    environment: 'sandbox' | 'production'
  }>,
  runtime: HttpCredentialPreviewRuntime = {},
): Promise<ValidOpenApiDocument> {
  const correlationRef = (runtime.randomCorrelation ?? randomOAuthState)()
  const prepared = await (runtime.prepareRuntime ?? prepareOwnerHttpRuntime)({
    connectionRef: input.connectionRef,
    correlationRef,
  })
  if (prepared.kind !== 'available'
    || prepared.connection.connectionRef !== input.connectionRef
    || prepared.connection.businessRef !== input.businessRef
    || prepared.connection.sourceUrl !== input.definitionUrl
    || prepared.connection.environment !== input.environment
    || new URL(input.definitionUrl).origin !== prepared.connection.sourceOrigin) {
    throw new Error('provider_http_connection_unavailable')
  }
  const pointer: SecretPointerInput = {
    secretRef: prepared.connection.secretRef,
    activeGeneration: prepared.connection.activeGeneration,
    pointerRevision: prepared.connection.pointerRevision,
  }
  let material: Uint8Array
  try {
    material = await (runtime.readSecret ?? readActiveCustomerSecret)(pointer)
  } catch {
    throw new Error('provider_http_connection_unavailable')
  }
  try {
    return await (runtime.loadOpenApi ?? loadAuthenticatedOpenApi)({
      definitionUrl: input.definitionUrl,
      authentication: prepared.connection.authentication,
      credential: material,
    })
  } finally {
    material.fill(0)
  }
}

async function prepareOwnerHttpRuntime(input: Readonly<{
  connectionRef: string
  correlationRef: string
}>): Promise<HttpRuntimeReadback> {
  const command = { connectionRef: input.connectionRef, correlationRef: input.correlationRef }
  const serviceAuth = await createConvexServerFunctionAssertion({
    operation: 'capabilityProviderConnections.prepareOwnerHttpRuntimeForServer',
    scope: 'market_supply:manage',
    command,
  })
  return await callSourceMutation(prepareOwnerHttpRuntimeMutation, { ...command, serviceAuth })
}

async function loadAuthenticatedOpenApi(input: Readonly<{
  definitionUrl: string
  authentication: Exclude<ProviderConnectionSourceAuthentication, Readonly<{ kind: 'mcp_oauth' }>>
  credential: Uint8Array
}>): Promise<ValidOpenApiDocument> {
  const target = new URL(input.definitionUrl)
  if (!await isPublicHttpTarget(target, defaultDnsResolver)) throw new Error('target_not_public')
  const credential = new TextDecoder('utf-8', { fatal: true }).decode(input.credential)
  const headers = new Headers({ Accept: 'application/json, application/yaml, text/yaml, text/plain' })
  if (input.authentication.kind === 'http_bearer') {
    headers.set('Authorization', `Bearer ${credential}`)
  } else if (input.authentication.location === 'header') {
    headers.set(input.authentication.name, credential)
  } else {
    target.searchParams.set(input.authentication.name, credential)
  }
  const response = await sendGuardedHttpRequest(new Request(target, {
    method: 'GET',
    headers,
    redirect: 'manual',
    referrerPolicy: 'no-referrer',
    signal: AbortSignal.timeout(10_000),
  }), 262_144)
  if (!response.ok || response.status >= 300) throw new Error('source_unavailable')
  const parsed = await validateOpenApiDocument(await response.text())
  if (parsed.kind === 'refused') throw new Error(parsed.reason)
  return parsed.document
}

export async function previewOwnerMcpProviderConnection(
  input: Readonly<{
    connectionRef: string
    businessRef: string
    serverUrl?: string
    registryName?: string
    remoteRef?: string
    environment: 'sandbox' | 'production'
  }>,
  runtime: McpOAuthPreviewRuntime = {},
): Promise<McpSourceDiscovery> {
  const correlationRef = (runtime.randomCorrelation ?? randomOAuthState)()
  let prepared: McpRuntimeReadback
  try {
    prepared = await (runtime.prepareRuntime ?? prepareOwnerMcpRuntime)({
      connectionRef: input.connectionRef,
      correlationRef,
    })
  } catch {
    return { kind: 'refused', reason: 'mcp_connection_unavailable' }
  }
  if (prepared.kind !== 'available'
    || prepared.connection.businessRef !== input.businessRef
    || (input.serverUrl !== undefined && prepared.connection.sourceUrl !== input.serverUrl)
    || (input.serverUrl === undefined && input.registryName === undefined)) {
    return { kind: 'refused', reason: 'mcp_connection_unavailable' }
  }
  let material: Uint8Array
  try {
    material = await (runtime.readSecret ?? readActiveCustomerSecret)({
      secretRef: prepared.connection.secretRef,
      activeGeneration: prepared.connection.activeGeneration,
      pointerRevision: prepared.connection.pointerRevision,
    })
  } catch {
    return { kind: 'refused', reason: 'mcp_connection_unavailable' }
  }
  let provider: StoredMcpOAuthProvider
  try {
    provider = StoredMcpOAuthProvider.parse(new TextDecoder('utf-8', { fatal: true }).decode(material))
  } catch {
    return { kind: 'refused', reason: 'mcp_connection_unavailable' }
  } finally {
    material.fill(0)
  }
  if (provider.serverUrl !== prepared.connection.sourceUrl || provider.environment !== input.environment) {
    return { kind: 'refused', reason: 'mcp_connection_unavailable' }
  }
  const before = provider.serialize()
  let discovery: McpSourceDiscovery
  try {
    discovery = await (runtime.verifyMcp ?? defaultVerifyMcp)({
      serverUrl: prepared.connection.sourceUrl,
      ...(input.registryName === undefined ? {} : { registryName: input.registryName }),
      ...(input.remoteRef === undefined ? {} : { remoteRef: input.remoteRef }),
      environment: input.environment,
      authProvider: provider,
    })
  } catch {
    return { kind: 'refused', reason: 'mcp_connection_unavailable' }
  }
  if (discovery.kind !== 'ready') return discovery
  const after = provider.serialize()
  if (after !== before) {
    const rotated = new TextEncoder().encode(after)
    try {
      const stored = await (runtime.writeSecret ?? writeThroughExistingSecretLifecycle)({
        action: 'rotate',
        secretRef: prepared.connection.secretRef,
        authority: prepared.connection.rotationAuthority,
        idempotencyRef: prepared.connection.rotationAuthority.idempotencyRef,
        material: rotated,
      })
      if (stored.kind !== 'active') return { kind: 'refused', reason: 'mcp_connection_unavailable' }
    } catch {
      return { kind: 'refused', reason: 'mcp_connection_unavailable' }
    } finally {
      rotated.fill(0)
    }
  }
  return discovery
}

async function prepareOwnerMcpRuntime(input: Readonly<{
  connectionRef: string
  correlationRef: string
}>): Promise<McpRuntimeReadback> {
  const command = { connectionRef: input.connectionRef, correlationRef: input.correlationRef }
  const serviceAuth = await createConvexServerFunctionAssertion({
    operation: 'capabilityProviderConnections.prepareOwnerMcpRuntimeForServer',
    scope: 'market_supply:manage',
    command,
  })
  return await callSourceMutation(prepareOwnerMcpRuntimeMutation, { ...command, serviceAuth })
}

export async function completeOwnerMcpProviderConnection(
  {
    data,
    context,
  }: {
    data: z.infer<typeof completeOwnerMcpProviderConnectionInputSchema>
    context: unknown
  },
  runtime: McpOAuthHandoffRuntime = {},
): Promise<OwnerHttpProviderConnectionResult> {
  const now = runtime.now ?? Date.now
  const callbackParams = new URLSearchParams(data.callbackParameters)
  const states = callbackParams.getAll('state')
  const state = states[0]
  if (states.length !== 1 || state === undefined || !validOAuthState(state)) {
    return refusal('not_found')
  }
  let callback: OAuthCallbackReadback
  try {
    callback = await callSourceQuery(readOwnerOAuthCallbackQuery, {
      attemptRef: data.attemptRef,
      stateHash: oauthStateHash(state),
      observedAt: now(),
    })
  } catch {
    return refusal('source_unavailable')
  }
  if (callback.kind !== 'available') return refusal('not_found')

  const pointer: SecretPointerInput = {
    secretRef: callback.attempt.secretRef,
    activeGeneration: callback.attempt.activeGeneration,
    pointerRevision: callback.attempt.pointerRevision,
  }
  let material: Uint8Array
  try {
    material = await (runtime.readSecret ?? readActiveCustomerSecret)(pointer)
  } catch {
    return refusal('secret_unavailable')
  }
  let provider: StoredMcpOAuthProvider
  try {
    provider = StoredMcpOAuthProvider.parse(new TextDecoder('utf-8', { fatal: true }).decode(material))
  } catch {
    return refusal('secret_unavailable')
  } finally {
    material.fill(0)
  }
  if (provider.attemptRef !== data.attemptRef
    || provider.serverUrl !== callback.attempt.sourceUrl
    || oauthStateHash(provider.oauthState) !== oauthStateHash(state)) {
    return refusal('not_found')
  }
  try {
    await (runtime.finishAuth ?? finishMcpOAuthAuthorization)({
      serverUrl: callback.attempt.sourceUrl,
      authProvider: provider,
      callbackParams,
    })
  } catch {
    return refusal('connection_conflict')
  }
  if (provider.currentTokens === undefined) {
    return refusal('connection_conflict')
  }
  const verifyMcp = runtime.verifyMcp ?? defaultVerifyMcp
  let verified: McpSourceDiscovery
  try {
    verified = await verifyMcp({
      serverUrl: callback.attempt.sourceUrl,
      environment: callback.attempt.environment,
      authProvider: provider,
    })
  } catch {
    return refusal('source_unavailable')
  }
  if (verified.kind !== 'ready') return refusal('source_unavailable')

  const rotated = new TextEncoder().encode(provider.serialize())
  try {
    const stored = await (runtime.writeSecret ?? writeThroughExistingSecretLifecycle)({
      action: 'rotate',
      secretRef: callback.attempt.secretRef,
      authority: provider.rotationAuthority,
      idempotencyRef: provider.rotationIdempotencyRef,
      material: rotated,
    })
    if (stored.kind !== 'active') return refusal('secret_unavailable')
  } catch {
    return refusal('secret_unavailable')
  } finally {
    rotated.fill(0)
  }

  const finalizeOperationKey = `${provider.rotationIdempotencyRef}:finalize`
  try {
    return await admittedMutation(finalizeOwnerAttemptMutation, {
      attemptRef: data.attemptRef,
      secretRef: callback.attempt.secretRef,
      provisionCommandId: provider.rotationIdempotencyRef,
      commandId: finalizeOperationKey,
      operationKey: finalizeOperationKey,
      correlationId: provider.rotationIdempotencyRef,
    }, context, finalizeOperationKey)
  } catch {
    return refusal('source_unavailable')
  }
}

async function admittedMutation<Result>(
  mutation: ReturnType<typeof sourceMutation<Record<string, unknown>, Result>>,
  command: Record<string, unknown>,
  context: unknown,
  operationKey: string,
): Promise<Result> {
  const sourceWrite = await sourceWriteAdmissionFromContext({
    context,
    command,
    scope: 'catalog_publish',
    operationKey,
    correlationId: String(command.correlationId),
  })
  return await callSourceMutation(mutation, {
    ...command,
    sourceWrite,
    sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
  })
}

async function writeThroughExistingSecretLifecycle(
  input: ProvisionInput,
): Promise<Readonly<{ kind: 'active' | 'unavailable' }>> {
  const token = readTrimmedEnv(process.env, 'AE_SECRET_LIFECYCLE_RPC_TOKEN')
  if (token === undefined) return { kind: 'unavailable' }

  const materialBase64 = Buffer.from(input.material).toString('base64')
  try {
    const { handleSecretLifecycleRequest } = await import('@/routes/api.internal.secret-lifecycle')
    const response = await handleSecretLifecycleRequest(new Request(
      'https://internal.agentic-economy.invalid/api/internal/secret-lifecycle',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: input.action ?? 'provision',
          authority: input.authority,
          secretRef: input.secretRef,
          idempotencyRef: input.idempotencyRef,
          materialBase64,
        }),
      },
    ), process.env)
    if (!response.ok) return { kind: 'unavailable' }
    const body: unknown = await response.json().catch(() => undefined)
    return typeof body === 'object' && body !== null && Reflect.get(body, 'kind') === 'active'
      ? { kind: 'active' }
      : { kind: 'unavailable' }
  } finally {
    // The encoded string is immutable and scoped to this call. The mutable source
    // bytes are cleared by the caller immediately after this function returns.
  }
}

function canonicalOAuthCallback(value: string, attemptRef: string): string | undefined {
  try {
    const url = new URL(value)
    const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))
      || url.username !== ''
      || url.password !== ''
      || url.hash !== ''
      || url.pathname !== '/owner/supply/connections/oauth/callback'
      || url.searchParams.get('attempt') !== attemptRef
      || [...url.searchParams.keys()].some((key) => key !== 'attempt')) return undefined
    return url.toString()
  } catch {
    return undefined
  }
}

function randomOAuthState(): string {
  return `${crypto.randomUUID().replaceAll('-', '')}${crypto.randomUUID().replaceAll('-', '')}`
}

function validOAuthState(value: string): boolean {
  return /^[A-Za-z0-9._~-]{16,500}$/u.test(value)
}

function oauthStateHash(state: string): string {
  return canonicalDigest({ format: 'ae.provider-mcp-oauth-state:v1', state })
}

type StoredSession = Readonly<{
  version: 'ae.mcp-oauth-session:v1'
  attemptRef: string
  serverUrl: string
  environment: 'sandbox' | 'production'
  redirectUrl: string
  state: string
  codeVerifier?: string
  clientInformation?: StoredOAuthClientInformation
  tokens?: StoredOAuthTokens
  discoveryState?: OAuthDiscoveryState
  resourceUrl?: string
  rotationAuthority: SecretAuthority
  rotationIdempotencyRef: string
}>

const secretAuthoritySchema = z.strictObject({
  operation: z.enum(['provision', 'rotate']),
  snapshotRef: z.string().min(1),
  accountRef: z.string().min(1),
  actorPrincipalRef: z.string().min(1),
  grantRef: z.string().min(1),
  grantGeneration: z.number().int().positive(),
  correlationRef: z.string().min(1),
  idempotencyRef: z.string().min(1),
  occurredAt: z.number().int().nonnegative(),
})

const oauthDiscoveryStateSchema = z.looseObject({
  authorizationServerUrl: SafeUrlSchema,
  authorizationServerMetadata: OAuthMetadataSchema
    .or(OpenIdProviderDiscoveryMetadataSchema)
    .optional(),
  resourceMetadata: OAuthProtectedResourceMetadataSchema.optional(),
  resourceMetadataUrl: SafeUrlSchema.optional(),
}).transform(({
  authorizationServerUrl,
  authorizationServerMetadata,
  resourceMetadata,
  resourceMetadataUrl,
  ...extensions
}) => ({
  ...extensions,
  authorizationServerUrl,
  ...(authorizationServerMetadata === undefined
    ? {}
    : { authorizationServerMetadata }),
  ...(resourceMetadata === undefined ? {} : { resourceMetadata }),
  ...(resourceMetadataUrl === undefined ? {} : { resourceMetadataUrl }),
})) satisfies z.ZodType<OAuthDiscoveryState>

const storedSessionSchema = z.strictObject({
  version: z.literal('ae.mcp-oauth-session:v1'),
  attemptRef: z.string().min(1).max(300),
  serverUrl: z.url().max(2_048),
  environment: z.enum(['sandbox', 'production']),
  redirectUrl: z.url().max(2_048),
  state: z.string().min(16).max(500),
  codeVerifier: z.string().min(43).max(128).optional(),
  clientInformation: z.record(z.string(), z.unknown()).optional(),
  tokens: z.record(z.string(), z.unknown()).optional(),
  discoveryState: oauthDiscoveryStateSchema.optional(),
  resourceUrl: z.url().max(2_048).optional(),
  rotationAuthority: secretAuthoritySchema,
  rotationIdempotencyRef: z.string().min(1).max(200),
})

class StoredMcpOAuthProvider implements OAuthClientProvider {
  readonly attemptRef: string
  readonly serverUrl: string
  readonly environment: 'sandbox' | 'production'
  readonly redirectUrl: string
  readonly oauthState: string
  readonly rotationAuthority: SecretAuthority
  readonly rotationIdempotencyRef: string
  authorizationUrl: string | undefined
  #codeVerifier: string | undefined
  #clientInformation: StoredOAuthClientInformation | undefined
  #tokens: StoredOAuthTokens | undefined
  #discoveryState: OAuthDiscoveryState | undefined
  #resourceUrl: string | undefined

  constructor(session: Omit<StoredSession, 'version'>) {
    this.attemptRef = session.attemptRef
    this.serverUrl = session.serverUrl
    this.environment = session.environment
    this.redirectUrl = session.redirectUrl
    this.oauthState = session.state
    this.rotationAuthority = session.rotationAuthority
    this.rotationIdempotencyRef = session.rotationIdempotencyRef
    this.#codeVerifier = session.codeVerifier
    this.#clientInformation = session.clientInformation
    this.#tokens = session.tokens
    this.#discoveryState = session.discoveryState
    this.#resourceUrl = session.resourceUrl
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: 'Agentic Economy Provider Connection',
      redirect_uris: [this.redirectUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }
  }

  state(): string { return this.oauthState }
  clientInformation(_context?: OAuthClientInformationContext): StoredOAuthClientInformation | undefined {
    return this.#clientInformation
  }
  saveClientInformation(value: StoredOAuthClientInformation): void { this.#clientInformation = value }
  tokens(_context?: OAuthClientInformationContext): StoredOAuthTokens | undefined { return this.#tokens }
  saveTokens(value: StoredOAuthTokens): void { this.#tokens = value }
  redirectToAuthorization(url: URL): void { this.authorizationUrl = url.toString() }
  saveCodeVerifier(value: string): void { this.#codeVerifier = value }
  codeVerifier(): string {
    if (this.#codeVerifier === undefined) throw new TypeError('mcp_oauth_verifier_unavailable')
    return this.#codeVerifier
  }
  saveDiscoveryState(value: OAuthDiscoveryState): void { this.#discoveryState = value }
  discoveryState(): OAuthDiscoveryState | undefined { return this.#discoveryState }
  saveResourceUrl(value: string): void { this.#resourceUrl = value }
  resourceUrl(): string | undefined { return this.#resourceUrl }
  invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery'): void {
    if (scope === 'all' || scope === 'client') this.#clientInformation = undefined
    if (scope === 'all' || scope === 'tokens') this.#tokens = undefined
    if (scope === 'all' || scope === 'verifier') this.#codeVerifier = undefined
    if (scope === 'all' || scope === 'discovery') this.#discoveryState = undefined
  }

  get currentTokens(): StoredOAuthTokens | undefined { return this.#tokens }

  readyForRedirect(): boolean {
    return this.authorizationUrl !== undefined
      && this.#codeVerifier !== undefined
      && this.#clientInformation !== undefined
      && this.#discoveryState !== undefined
  }

  serialize(): string {
    const session: StoredSession = {
      version: 'ae.mcp-oauth-session:v1',
      attemptRef: this.attemptRef,
      serverUrl: this.serverUrl,
      environment: this.environment,
      redirectUrl: this.redirectUrl,
      state: this.oauthState,
      ...(this.#codeVerifier === undefined ? {} : { codeVerifier: this.#codeVerifier }),
      ...(this.#clientInformation === undefined ? {} : { clientInformation: this.#clientInformation }),
      ...(this.#tokens === undefined ? {} : { tokens: this.#tokens }),
      ...(this.#discoveryState === undefined ? {} : { discoveryState: this.#discoveryState }),
      ...(this.#resourceUrl === undefined ? {} : { resourceUrl: this.#resourceUrl }),
      rotationAuthority: this.rotationAuthority,
      rotationIdempotencyRef: this.rotationIdempotencyRef,
    }
    return JSON.stringify(session)
  }

  static parse(value: string): StoredMcpOAuthProvider {
    const parsed = storedSessionSchema.parse(JSON.parse(value) as unknown)
    return new StoredMcpOAuthProvider({
      attemptRef: parsed.attemptRef,
      serverUrl: parsed.serverUrl,
      environment: parsed.environment,
      redirectUrl: parsed.redirectUrl,
      state: parsed.state,
      ...(parsed.codeVerifier === undefined ? {} : { codeVerifier: parsed.codeVerifier }),
      ...(parsed.clientInformation === undefined ? {} : {
        clientInformation: parsed.clientInformation as StoredOAuthClientInformation,
      }),
      ...(parsed.tokens === undefined ? {} : { tokens: parsed.tokens as StoredOAuthTokens }),
      ...(parsed.discoveryState === undefined ? {} : {
        discoveryState: parsed.discoveryState,
      }),
      ...(parsed.resourceUrl === undefined ? {} : { resourceUrl: parsed.resourceUrl }),
      rotationAuthority: parsed.rotationAuthority,
      rotationIdempotencyRef: parsed.rotationIdempotencyRef,
    })
  }
}

function oauthCleanupResult(
  outcome: ProviderConnectionCleanupOutcome,
  reasonCode: string,
  responseDigest?: string,
): ProviderOAuthCleanupResult {
  return {
    outcome,
    reasonCode,
    ...(responseDigest === undefined ? {} : { responseDigest }),
    evidenceRefs: [`provider_cleanup:${reasonCode}`],
  }
}

function exactHttpsEndpoint(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  try {
    const endpoint = new URL(value)
    return endpoint.protocol === 'https:'
      && endpoint.username === ''
      && endpoint.password === ''
      && endpoint.hash === ''
      ? value
      : undefined
  } catch {
    return undefined
  }
}

async function defaultRevokeMcpOAuthToken(input: Readonly<{
  authorizationServer: oauth.AuthorizationServer
  client: oauth.Client
  token: string
  tokenTypeHint: 'refresh_token' | 'access_token'
}>): Promise<Readonly<{ status: number }>> {
  const response = await oauth.revocationRequest(
    input.authorizationServer,
    input.client,
    oauth.None(),
    input.token,
    {
      additionalParameters: { token_type_hint: input.tokenTypeHint },
      [oauth.customFetch]: async (url, options) => await sendGuardedHttpRequest(
        new Request(url, options as RequestInit),
        64 * 1024,
      ),
    },
  )
  await oauth.processRevocationResponse(response)
  return { status: response.status }
}

/**
 * Revokes an MCP OAuth token from an ephemeral Infisical generation. The raw
 * bytes and token never cross the server boundary or enter the cleanup result.
 */
export async function revokeStoredMcpProviderConnection(
  material: Uint8Array,
  runtime: McpOAuthRevocationRuntime = {},
): Promise<ProviderOAuthCleanupResult> {
  let provider: StoredMcpOAuthProvider
  try {
    provider = StoredMcpOAuthProvider.parse(new TextDecoder('utf-8', { fatal: true }).decode(material))
  } catch {
    return oauthCleanupResult('outcome_unknown', 'oauth_credential_unavailable')
  } finally {
    material.fill(0)
  }

  const discovery = provider.discoveryState()
  const metadata = discovery?.authorizationServerMetadata
  if (!isRecord(metadata)) {
    return oauthCleanupResult('unsupported', 'oauth_revocation_unsupported')
  }
  const metadataRecord: Record<string, unknown> = metadata
  const issuer = exactHttpsEndpoint(metadataRecord.issuer)
  const authorizationServerUrl = exactHttpsEndpoint(discovery?.authorizationServerUrl)
  if (issuer === undefined || authorizationServerUrl === undefined || issuer !== authorizationServerUrl) {
    return oauthCleanupResult('outcome_unknown', 'oauth_discovery_invalid')
  }
  const revocationEndpoint = exactHttpsEndpoint(metadataRecord.revocation_endpoint)
  if (revocationEndpoint === undefined) {
    return metadataRecord.revocation_endpoint === undefined
      ? oauthCleanupResult('unsupported', 'oauth_revocation_unsupported')
      : oauthCleanupResult('outcome_unknown', 'oauth_discovery_invalid')
  }
  const clientInformation = provider.clientInformation()
  const tokens = provider.currentTokens
  if (!isRecord(clientInformation)
    || typeof clientInformation.client_id !== 'string'
    || clientInformation.client_id.length === 0
    || (typeof clientInformation.issuer === 'string' && clientInformation.issuer !== issuer)
    || !isRecord(tokens)
    || (typeof tokens.issuer === 'string' && tokens.issuer !== issuer)) {
    return oauthCleanupResult('outcome_unknown', 'oauth_credential_unavailable')
  }
  const tokenTypeHint = typeof tokens.refresh_token === 'string' && tokens.refresh_token.length > 0
    ? 'refresh_token' as const
    : 'access_token' as const
  const token = tokenTypeHint === 'refresh_token' ? tokens.refresh_token : tokens.access_token
  if (typeof token !== 'string' || token.length === 0) {
    return oauthCleanupResult('outcome_unknown', 'oauth_credential_unavailable')
  }
  const authorizationServer = {
    ...metadataRecord,
    issuer,
    revocation_endpoint: revocationEndpoint,
  } as oauth.AuthorizationServer
  const client = { client_id: clientInformation.client_id }
  try {
    const response = await (runtime.revoke ?? defaultRevokeMcpOAuthToken)({
      authorizationServer,
      client,
      token,
      tokenTypeHint,
    })
    return oauthCleanupResult(
      'revoked',
      'oauth_revoked',
      canonicalDigest({
        format: 'provider-mcp-oauth-revocation:v1',
        issuer,
        revocationEndpoint,
        clientId: client.client_id,
        responseStatus: response.status,
      }),
    )
  } catch (error) {
    return error instanceof oauth.ResponseBodyError
      ? oauthCleanupResult('provider_refused', 'oauth_revocation_refused')
      : oauthCleanupResult('outcome_unknown', 'oauth_revocation_unknown')
  }
}

function startRefusal(
  code: Extract<OwnerHttpProviderConnectionResult, { kind: 'refused' }>['code'],
): Extract<OwnerMcpProviderConnectionStartResult, { kind: 'refused' }> {
  return { kind: 'refused', code }
}

async function defaultVerifyMcp(input: Readonly<{
  serverUrl: string
  registryName?: string
  remoteRef?: string
  environment: 'sandbox' | 'production'
  authProvider: OAuthClientProvider
}>): Promise<McpSourceDiscovery> {
  const { discoverMcpSource } = await import('../mcp-source-discovery')
  return await discoverMcpSource({
    ...(input.registryName === undefined ? { serverUrl: input.serverUrl } : {
      registryName: input.registryName,
      ...(input.remoteRef === undefined ? {} : { remoteRef: input.remoteRef }),
    }),
    environment: input.environment,
  }, { authProvider: input.authProvider, requiredServerUrl: input.serverUrl })
}

async function finishMcpOAuthAuthorization(input: Readonly<{
  serverUrl: string
  authProvider: OAuthClientProvider
  callbackParams: URLSearchParams
}>): Promise<void> {
  const { createGuardedMcpFetch } = await import('../mcp-source-discovery')
  const transport = new StreamableHTTPClientTransport(new URL(input.serverUrl), {
    authProvider: input.authProvider,
    fetch: createGuardedMcpFetch(),
    requestInit: { redirect: 'manual' },
  })
  try {
    await transport.finishAuth(input.callbackParams)
  } finally {
    await transport.close().catch(() => undefined)
  }
}

async function beginMcpOAuthAuthorization(input: Readonly<{
  serverUrl: string
  authProvider: OAuthClientProvider
}>): Promise<void> {
  const { createGuardedMcpFetch } = await import('../mcp-source-discovery')
  const transport = new StreamableHTTPClientTransport(new URL(input.serverUrl), {
    authProvider: input.authProvider,
    fetch: createGuardedMcpFetch(),
    requestInit: { redirect: 'manual' },
    reconnectionOptions: {
      initialReconnectionDelay: 10_000,
      maxReconnectionDelay: 10_000,
      reconnectionDelayGrowFactor: 1,
      maxRetries: 0,
    },
  })
  const client = new Client(
    { name: 'Agentic Economy Provider Connection', version: '1' },
    { listMaxPages: 1 },
  )
  try {
    await client.connect(transport, { timeout: 10_000, maxTotalTimeout: 10_000 })
  } catch (error) {
    if (error instanceof UnauthorizedError || (error instanceof Error && error.name === 'UnauthorizedError')) {
      return
    }
    throw error
  } finally {
    await client.close().catch(() => transport.close().catch(() => undefined))
  }
}

function requiredSecretEnvironment(name: string): string {
  const value = readTrimmedEnv(process.env, name)
  if (value === undefined) throw new TypeError('secret_runtime_configuration_invalid')
  return value
}

export async function readActiveCustomerSecret(pointer: SecretPointerInput): Promise<Uint8Array> {
  const organizationSlug = readTrimmedEnv(process.env, 'AE_INFISICAL_CUSTOMER_ORGANIZATION_SLUG')
  const store = new InfisicalCloudSecretStore({
    baseUrl: requiredSecretEnvironment('AE_INFISICAL_BASE_URL'),
    projectId: requiredSecretEnvironment('AE_INFISICAL_CUSTOMER_PROJECT_ID'),
    environment: requiredSecretEnvironment('AE_INFISICAL_CUSTOMER_ENVIRONMENT'),
    secretPath: requiredSecretEnvironment('AE_INFISICAL_CUSTOMER_SECRET_PATH'),
    machineIdentityId: requiredSecretEnvironment('AE_INFISICAL_CUSTOMER_MACHINE_IDENTITY_ID'),
    ...(organizationSlug === undefined ? {} : { organizationSlug }),
    identityTokenProvider: new VercelOidcIdentityTokenProvider(),
  })
  let material: Uint8Array | undefined
  await store.withSecret({
    secretRef: secretRef(pointer.secretRef),
    generation: secretGeneration(pointer.activeGeneration),
  }, async (lease) => {
    await lease.useBytes(async (bytes) => { material = Uint8Array.from(bytes) })
  })
  if (material === undefined) throw new TypeError('secret_unavailable')
  return material
}

function mapPrepareRefusal(
  code: string,
): Extract<OwnerHttpProviderConnectionResult, { kind: 'refused' }> {
  switch (code) {
    case 'attempt_expired':
      return refusal('attempt_expired')
    case 'reauthentication_required':
    case 'proof_stale':
    case 'proof_replayed':
      return refusal('reauthentication_required')
    case 'not_found':
      return refusal('not_found')
    default:
      return refusal('connection_conflict')
  }
}

function refusal(
  code: Extract<OwnerHttpProviderConnectionResult, { kind: 'refused' }>['code'],
): Extract<OwnerHttpProviderConnectionResult, { kind: 'refused' }> {
  return { kind: 'refused', code }
}
