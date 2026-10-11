import { z } from 'zod'
import {
  Client,
  StreamableHTTPClientTransport,
  UnauthorizedError,
  type OAuthClientProvider,
} from '@modelcontextprotocol/client'

import { requireStrictClerkConsequenceProof } from '@/lib/server/clerk-consequence-proof'
import {
  callSourceMutation,
  callSourceQuery,
  createConvexServerFunctionAssertion,
  sourceMutation,
  sourceQuery,
} from '@/lib/server/convex-source'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import { readTrimmedEnv } from '@/lib/server/read-trimmed-env'
import { package5RolloutDecision } from '@/lib/server/package5-rollout'
import { sourceWriteAdmissionFromContext } from '@/lib/server/source-write-admission'
import { isSafeAuthorizationUrl } from '../../provider-connection.contracts'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { sendGuardedHttpRequest } from '@/modules/network-guard/server'
import { defaultDnsResolver, isPublicHttpTarget } from '@/modules/network-guard/public'
import { sourceWriteRequestFromAdmission } from '@/modules/security/source-write-admission'
import type {
  ProviderConnectionSourceAuthentication,
} from '../../provider-connection'
import type { McpSourceDiscovery } from '../mcp-source-discovery'
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
  type SecretPointerInput,
} from './provider-connection-handoff-contract'
import {
  StoredMcpOAuthProvider,
  oauthStateHash,
  randomOAuthState,
  validOAuthState,
  type SecretAuthority,
} from './provider-connection-handoff-mcp-session'

export { revokeStoredMcpProviderConnection } from './provider-connection-handoff-revoke'

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
  try { proof = await requireStrictClerkConsequenceProof(operationKey) } catch (cause) { return degradeBackend(cause, { kind: 'refused', code: 'reauthentication_required' }, { site: 'cancelOwnerProviderConnectionAttempt', reason: 'source_unavailable' }) }
  try {
    return await admittedMutation(cancelOwnerAttemptMutation, { attemptRef: data.attemptRef, commandId: operationKey, operationKey, correlationId: operationKey, proof }, context, operationKey)
  } catch (cause) { return degradeBackend(cause, { kind: 'refused', code: 'source_unavailable' }, { site: 'cancelOwnerProviderConnectionAttempt', reason: 'source_unavailable' }) }
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
  } catch (cause) {
    return degradeBackend(cause, refusal('source_unavailable'), { site: 'completeOwnerHttpProviderConnection', reason: 'source_unavailable' })
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
  } catch (cause) {
    return degradeBackend(cause, refusal('reauthentication_required'), { site: 'completeOwnerHttpProviderConnection', reason: 'source_unavailable' })
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
  } catch (cause) {
    return degradeBackend(cause, refusal('source_unavailable'), { site: 'completeOwnerHttpProviderConnection', reason: 'source_unavailable' })
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
  } catch (cause) {
    return degradeBackend(cause, refusal('secret_unavailable'), { site: 'completeOwnerHttpProviderConnection', reason: 'source_unavailable' })
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
  } catch (cause) {
    return degradeBackend(cause, refusal('source_unavailable'), { site: 'completeOwnerHttpProviderConnection', reason: 'source_unavailable' })
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
  try { attempt = await readOwnerProviderConnectionAttempt({ data: { attemptRef: data.attemptRef } }) } catch (cause) { return degradeBackend(cause, startRefusal('source_unavailable'), { site: 'startOwnerMcpProviderConnection', reason: 'source_unavailable' }) }
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
  } catch (cause) {
    return degradeBackend(cause, startRefusal('reauthentication_required'), { site: 'startOwnerMcpProviderConnection', reason: 'source_unavailable' })
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
  } catch (cause) {
    return degradeBackend(cause, startRefusal('source_unavailable'), { site: 'startOwnerMcpProviderConnection', reason: 'source_unavailable' })
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
  } catch (cause) {
    return degradeBackend(cause, startRefusal('source_unavailable'), { site: 'startOwnerMcpProviderConnection', reason: 'source_unavailable' })
  }
  const authorizationUrl = provider.authorizationUrl
  if (authorizationUrl === undefined || !isSafeAuthorizationUrl(authorizationUrl) || !provider.readyForRedirect()) {
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
  } catch (cause) {
    return degradeBackend(cause, startRefusal('secret_unavailable'), { site: 'startOwnerMcpProviderConnection', reason: 'source_unavailable' })
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
  } catch (cause) {
    return degradeBackend(cause, startRefusal('source_unavailable'), { site: 'startOwnerMcpProviderConnection', reason: 'source_unavailable' })
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
  } catch (cause) {
    degradeBackend(cause, undefined, { site: 'loadOwnerConnectedOpenApi', reason: 'source_unavailable' })
    throw new Error('provider_http_connection_unavailable', { cause })
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
  } catch (cause) {
    return degradeBackend(cause, { kind: 'refused', reason: 'mcp_connection_unavailable' }, { site: 'previewOwnerMcpProviderConnection', reason: 'source_unavailable' })
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
  } catch (cause) {
    return degradeBackend(cause, { kind: 'refused', reason: 'mcp_connection_unavailable' }, { site: 'previewOwnerMcpProviderConnection', reason: 'source_unavailable' })
  }
  let provider: StoredMcpOAuthProvider
  try {
    provider = StoredMcpOAuthProvider.parse(new TextDecoder('utf-8', { fatal: true }).decode(material))
  } catch (cause) {
    return degradeBackend(cause, { kind: 'refused', reason: 'mcp_connection_unavailable' }, { site: 'previewOwnerMcpProviderConnection', reason: 'invalid_response' })
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
  } catch (cause) {
    return degradeBackend(cause, { kind: 'refused', reason: 'mcp_connection_unavailable' }, { site: 'previewOwnerMcpProviderConnection', reason: 'source_unavailable' })
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
    } catch (cause) {
      return degradeBackend(cause, { kind: 'refused', reason: 'mcp_connection_unavailable' }, { site: 'previewOwnerMcpProviderConnection', reason: 'source_unavailable' })
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
  } catch (cause) {
    return degradeBackend(cause, refusal('source_unavailable'), { site: 'completeOwnerMcpProviderConnection', reason: 'source_unavailable' })
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
  } catch (cause) {
    return degradeBackend(cause, refusal('secret_unavailable'), { site: 'completeOwnerMcpProviderConnection', reason: 'source_unavailable' })
  }
  let provider: StoredMcpOAuthProvider
  try {
    provider = StoredMcpOAuthProvider.parse(new TextDecoder('utf-8', { fatal: true }).decode(material))
  } catch (cause) {
    return degradeBackend(cause, refusal('secret_unavailable'), { site: 'completeOwnerMcpProviderConnection', reason: 'invalid_response' })
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
  } catch (cause) {
    return degradeBackend(cause, refusal('connection_conflict'), { site: 'completeOwnerMcpProviderConnection', reason: 'source_unavailable' })
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
  } catch (cause) {
    return degradeBackend(cause, refusal('source_unavailable'), { site: 'completeOwnerMcpProviderConnection', reason: 'source_unavailable' })
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
  } catch (cause) {
    return degradeBackend(cause, refusal('secret_unavailable'), { site: 'completeOwnerMcpProviderConnection', reason: 'source_unavailable' })
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
  } catch (cause) {
    return degradeBackend(cause, refusal('source_unavailable'), { site: 'completeOwnerMcpProviderConnection', reason: 'source_unavailable' })
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
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'canonicalOAuthCallback', reason: 'invalid_response' })
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
