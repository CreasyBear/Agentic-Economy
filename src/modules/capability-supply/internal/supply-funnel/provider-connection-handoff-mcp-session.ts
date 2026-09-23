import { z } from 'zod'
import {
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

import { canonicalDigest } from '@/modules/common/canonical-digest'

export type SecretAuthority = Readonly<{
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

export class StoredMcpOAuthProvider implements OAuthClientProvider {
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

export function randomOAuthState(): string {
  return `${crypto.randomUUID().replaceAll('-', '')}${crypto.randomUUID().replaceAll('-', '')}`
}

export function validOAuthState(value: string): boolean {
  return /^[A-Za-z0-9._~-]{16,500}$/u.test(value)
}

export function oauthStateHash(state: string): string {
  return canonicalDigest({ format: 'ae.provider-mcp-oauth-state:v1', state })
}
