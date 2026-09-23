import * as oauth from 'oauth4webapi'

import { degradeBackend } from '@/lib/observability/degrade-backend'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import { sendGuardedHttpRequest } from '@/modules/network-guard/server'
import type { ProviderConnectionCleanupOutcome } from '../../provider-connection'
import type { ProviderOAuthCleanupResult } from './provider-connection-handoff-contract'
import { StoredMcpOAuthProvider } from './provider-connection-handoff-mcp-session'

export type McpOAuthRevocationRuntime = Readonly<{
  revoke?: (input: Readonly<{
    authorizationServer: oauth.AuthorizationServer
    client: oauth.Client
    token: string
    tokenTypeHint: 'refresh_token' | 'access_token'
  }>) => Promise<Readonly<{ status: number }>>
}>

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
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'exactHttpsEndpoint', reason: 'invalid_response' })
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
  } catch (cause) {
    return degradeBackend(cause, oauthCleanupResult('outcome_unknown', 'oauth_credential_unavailable'), { site: 'revokeStoredMcpProviderConnection', reason: 'invalid_response' })
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
