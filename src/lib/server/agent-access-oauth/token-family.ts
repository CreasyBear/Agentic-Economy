import {
  AGENT_ACCESS_KEY_TTL_SECONDS,
  AGENT_ACCESS_MIN_TTL_SECONDS,
} from '@/modules/agent-access/agent-access'
import { issuedAgentGrantRef } from '@/modules/agent-access/issued-agent-binding'
import { deploymentPaymentEnvironment } from '@/lib/deployment/environment'
import {
  promoteAgentCredentialReplacement,
  recordAgentProviderRevocation,
} from '@/modules/agent-access/agent-access.functions'
import {
  AGENT_ACCESS_OAUTH_REFRESH_FAMILY_TTL_SECONDS,
  AGENT_ACCESS_OAUTH_REFRESH_REPLAY_SECONDS,
  claimGrantDelivery,
  completeGrantDelivery,
  createOpaqueOAuthValue,
  hashOAuthValue,
  normalizeRequestedScopes,
  pollDeviceGrant,
  resetGrantDelivery,
  type AgentAccessOAuthGrant,
  type AgentAccessOAuthTransition,
} from '@/modules/agent-access/oauth-state'
import type { AgentAccessOAuthRefreshFamily, AgentAccessOAuthRefreshStore } from '@/lib/server/agent-access-oauth-store'
import { degrade } from '@/lib/observability/degrade'
import { captureRouteException } from '@/lib/observability/capture-route-exception'
import {
  accessCredentialTtlSeconds,
  cancelExpiredReplacement,
  completeRefreshProviderCleanup,
  defaultIssueRefreshKey,
  defaultOAuthKeySecret,
  revokeProviderCredentialIfCurrent,
} from './credential-issuance'
import { oauthError, oauthTransitionError, readForm } from './protocol'
import {
  currentNow,
  oauthAdmissionResponse,
  readClient,
  requireRefreshStore,
  requireStore,
  type OAuthApiOptions,
} from './runtime'

export async function handleOAuthRevokePost(request: Request, options: OAuthApiOptions = {}): Promise<Response> {
  const formResult = await readForm(request)
  if (formResult.kind === 'too_large') return oauthError('invalid_request', 413)
  if (formResult.kind !== 'ok') return oauthError('invalid_request', 400)
  const form = formResult.value
  const token = form.get('token')
  const clientId = form.get('client_id')
  if (token === null || token.length === 0 || clientId === null) return oauthError('invalid_request', 400)
  const limited = await oauthAdmissionResponse(request, options, `revocation:${clientId}`)
  if (limited !== undefined) return limited
  const client = await readClient(clientId, options)
  if (client === null) return oauthError('invalid_client', 401)
  const store = requireRefreshStore(options)
  const now = currentNow(options)
  try {
    // RFC 7009 token_type_hint is advisory. Hash lookup keeps both current and
    // historical credentials revocable even after the provider rejects them.
    const tokenHash = await hashOAuthValue(token)
    const refresh = await store.revokeRefreshFamily({ tokenHash, clientId, now, reason: 'oauth_revocation' })
    if (refresh.kind !== 'unknown') return oauthRevokedResponse()
    await store.revokeRefreshFamilyByAccessToken({ tokenHash, clientId, now, reason: 'oauth_revocation' })
    return oauthRevokedResponse()
  } catch (cause) {
    return degrade(cause, oauthError('server_error', 503), { site: 'handleOAuthRevokePost', reason: 'source_unavailable' })
  }
}

export async function pollDeviceGrantRequest(form: URLSearchParams, request: Request, options: OAuthApiOptions): Promise<Response> {
  const clientId = form.get('client_id')
  const deviceCode = form.get('device_code')
  if (clientId === null || deviceCode === null) return oauthError('invalid_request', 400)
  const limited = await oauthAdmissionResponse(request, options, `device_code:${deviceCode}`, 'device_poll')
  if (limited !== undefined) return limited
  const client = await readClient(clientId, options)
  if (client === null) return oauthError('invalid_client', 401)
  const now = currentNow(options)
  let result = await pollDeviceGrant(requireStore(options), { clientId: client.clientId, deviceCode, now })
  if (result.kind === 'issuance_recovery_required') {
    return oauthError('server_error', 503)
  }
  if (result.kind === 'authorization_pending') return oauthError('authorization_pending', 400)
  if (result.kind === 'slow_down') return oauthError('slow_down', 400)
  if (result.kind !== 'ready') {
    if (result.kind === 'refused' && result.reason === 'expired_token') {
      const expired = await requireStore(options).getGrantByHash('device', await hashOAuthValue(deviceCode))
      if (expired !== null && !await cancelExpiredReplacement(expired, options)) {
        return oauthError('server_error', 503)
      }
    }
    return oauthTransitionError(result)
  }
  const claimed = await claimGrantDelivery(requireStore(options), { credential: { kind: 'device', grantRef: result.grant.grantRef, clientId: client.clientId }, now: currentNow(options) })
  return await deliverClaimedGrant(claimed, options)
}

export async function exchangeAuthorizationCode(form: URLSearchParams, request: Request, options: OAuthApiOptions): Promise<Response> {
  const code = form.get('code')
  const clientId = form.get('client_id')
  const redirectUri = form.get('redirect_uri')
  const verifier = form.get('code_verifier')
  if (code === null || clientId === null || redirectUri === null || verifier === null) return oauthError('invalid_request', 400)
  const limited = await oauthAdmissionResponse(request, options, `authorization_code:${code}`)
  if (limited !== undefined) return limited
  const claimed = await claimGrantDelivery(requireStore(options), {
    credential: { kind: 'authorization', authorizationCode: code, clientId, redirectUri, codeVerifier: verifier },
    now: currentNow(options),
  })
  if (claimed.kind === 'refused' && claimed.reason === 'expired_token') {
    const expired = await requireStore(options).getGrantByHash('authorization', await hashOAuthValue(code))
    if (expired !== null && !await cancelExpiredReplacement(expired, options)) {
      return oauthError('server_error', 503)
    }
  }
  return await deliverClaimedGrant(claimed, options)
}

export async function exchangeRefreshToken(form: URLSearchParams, request: Request, options: OAuthApiOptions): Promise<Response> {
  const refreshToken = form.get('refresh_token')
  const clientId = form.get('client_id')
  if (refreshToken === null || refreshToken.length === 0 || clientId === null) return oauthError('invalid_request', 400)
  const limited = await oauthAdmissionResponse(request, options, `refresh:${clientId}`)
  if (limited !== undefined) return limited
  const client = await readClient(clientId, options)
  if (client === null || !client.grantTypes.includes('refresh_token')) return oauthError('invalid_client', 401)

  const rawSuccessorToken = createOpaqueOAuthValue(32)
  const tokenHash = await hashOAuthValue(refreshToken)
  const successorTokenHash = await hashOAuthValue(rawSuccessorToken)
  const claimRef = `refresh:${createOpaqueOAuthValue(18)}`
  const now = currentNow(options)
  const refreshStore = requireRefreshStore(options)
  let claimed: Awaited<ReturnType<AgentAccessOAuthRefreshStore['claimRefreshFamily']>>
  try {
    claimed = await refreshStore.claimRefreshFamily({
      tokenHash,
      clientId,
      claimRef,
      successorTokenHash,
      now,
      claimExpiresAt: now + 30_000,
    })
  } catch (cause) {
    return degrade(cause, oauthError('server_error', 503), { site: 'exchangeRefreshToken', reason: 'source_unavailable' })
  }
  if (!('family' in claimed)) {
    return claimed.kind === 'busy' ? oauthError('server_error', 503) : oauthError('invalid_grant', 400)
  }

  const family = claimed.family
  if (deploymentPaymentEnvironment(process.env) !== family.environment
    || (family.environment === 'production' && family.authorityMode === 'unrestricted_test_only')) {
    return oauthError('invalid_grant', 400)
  }
  if (!refreshScopeMatches(form.get('scope'), family)) {
    await refreshStore.revokeRefreshFamily({ tokenHash, clientId, now, reason: 'scope_expansion_attempt' }).catch(() => {})
    return oauthError('invalid_scope', 400)
  }
  const accessExpiresAt = Math.min(
    family.expiresAt,
    now + AGENT_ACCESS_KEY_TTL_SECONDS * 1_000,
  )
  const expiresInSeconds = Math.floor((accessExpiresAt - now) / 1_000)
  if (expiresInSeconds < AGENT_ACCESS_MIN_TTL_SECONDS) {
    await refreshStore.revokeRefreshFamily({ tokenHash, clientId, now, reason: 'expired' }).catch(() => {})
    return oauthError('invalid_grant', 400)
  }
  const issuanceKey = `oauth-${claimRef.replaceAll(':', '-')}`
  const successorGrantRef = issuedAgentGrantRef(family.providerSubject, issuanceKey)
  let successorKeyId: string
  try {
    const successor = await (options.issueRefreshKey ?? defaultIssueRefreshKey)({
      family,
      issuanceKey,
      grantRef: successorGrantRef,
      expiresInSeconds,
    })
    successorKeyId = successor.keyId
  } catch (cause) {
    return degrade(cause, oauthError('server_error', 503), { site: 'exchangeRefreshToken', reason: 'source_unavailable' })
  }

  let successorSecret: string
  try {
    successorSecret = (await (options.getSecret ?? defaultOAuthKeySecret)(successorKeyId)).secret
  } catch (cause) {
    await revokeProviderCredentialIfCurrent(successorKeyId, 'Refresh credential could not be delivered.', options).catch(() => {})
    return degrade(cause, oauthError('server_error', 503), { site: 'exchangeRefreshToken', reason: 'source_unavailable' })
  }
  const commitInput = {
      familyRef: family.familyRef,
      expectedRevision: family.revision,
      tokenHash,
      claimRef: claimed.claimRef,
      successorTokenHash,
      issuanceKey,
      successorGrantRef,
      successorCredentialId: successorKeyId,
      successorAccessTokenHash: await hashOAuthValue(successorSecret),
      createdAt: now,
      accessExpiresAt,
      replayUntil: now + AGENT_ACCESS_OAUTH_REFRESH_REPLAY_SECONDS * 1_000,
  } as const
  let committed: Awaited<ReturnType<AgentAccessOAuthRefreshStore['commitRefreshFamilyRotation']>>
  try {
    committed = await refreshStore.commitRefreshFamilyRotation(commitInput)
  } catch (cause) {
    void cause;
    try {
      committed = await refreshStore.commitRefreshFamilyRotation(commitInput)
    } catch (cause) {
      // The first response may have been lost after Convex committed. Keep the
      // successor intact so the same idempotent commit or recovery can converge.
      return degrade(cause, oauthError('server_error', 503), { site: 'exchangeRefreshToken', reason: 'source_unavailable' })
    }
  }
  if (committed.kind === 'conflict') {
    await revokeProviderCredentialIfCurrent(successorKeyId, 'Refresh rotation was rejected.', options).catch(() => {})
    await refreshStore.revokeRefreshFamily({ tokenHash, clientId, now, reason: 'rotation_conflict' }).catch(() => {})
    return oauthError('invalid_grant', 400)
  }
  try {
    await completeRefreshProviderCleanup(committed, options)
    return refreshTokenResponse(successorSecret, rawSuccessorToken, committed.family, now)
  } catch (cause) {
    return degrade(cause, oauthError('server_error', 503), { site: 'exchangeRefreshToken', reason: 'source_unavailable' })
  }
}

function refreshScopeMatches(scopeText: string | null, family: AgentAccessOAuthRefreshFamily): boolean {
  if (scopeText === null) return true
  const normalized = normalizeRequestedScopes(scopeText)
  if (normalized === undefined || !normalized.offlineAccess) return false
  const requested = [...normalized.scopes].sort()
  const approved = [...family.scopes].sort()
  return requested.length === approved.length && requested.every((scope, index) => scope === approved[index])
}

function refreshTokenResponse(
  accessToken: string,
  refreshToken: string,
  family: AgentAccessOAuthRefreshFamily,
  now: number,
): Response {
  return Response.json({
    access_token: accessToken,
    token_type: 'Bearer',
    scope: [...family.scopes, 'offline_access'].join(' '),
    expires_in: Math.max(1, Math.floor((family.currentAccessExpiresAt - now) / 1_000)),
    refresh_token: refreshToken,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

async function deliverClaimedGrant(
  claimed: AgentAccessOAuthTransition<Readonly<{ grant: AgentAccessOAuthGrant; claimToken: string }>>,
  options: OAuthApiOptions,
): Promise<Response> {
  if (claimed.kind !== 'ok') return oauthTransitionError(claimed)
  const environment = deploymentPaymentEnvironment(process.env)
  if (environment === undefined
    || claimed.value.grant.requestedAccess.environment !== environment
    || claimed.value.grant.approvedAccess.environment !== environment) return oauthError('invalid_grant', 400)
  const keyId = claimed.value.grant.keyId
  if (keyId === undefined) return oauthError('invalid_grant', 400)
  const firstDelivery = claimed.value.grant.status !== 'consumed'
  if (!firstDelivery && claimed.value.grant.offlineAccess === true) {
    // Authorization codes are single-use. An offline exchange must never
    // degrade into an access-only response after its refresh token has left
    // process memory; reconnecting is the only safe recovery at this seam.
    return oauthError('invalid_grant', 400)
  }
  try {
    const secret = await (options.getSecret ?? defaultOAuthKeySecret)(keyId)
    if (claimed.value.grant.status !== 'consumed'
      && claimed.value.grant.replacement !== undefined) {
      const replacement = claimed.value.grant.replacement
      const promoted = options.promoteReplacement === undefined
        ? await promoteAgentCredentialReplacement({
            principalRef: replacement.principalRef,
            successorCredentialRef: replacement.successorCredentialRef,
            successorGrantRef: replacement.successorGrantRef,
          })
        : await options.promoteReplacement(replacement)
      if (promoted.kind !== 'completed' && promoted.kind !== 'replayed') throw new Error('replacement_promotion_failed')
      const reason = 'Replaced by a newer Agentic Economy credential.'
      await revokeProviderCredentialIfCurrent(promoted.providerCredentialId, reason, options)
      const recorded = await (options.recordProviderRevocation ?? recordAgentProviderRevocation)({
        principalRef: replacement.principalRef,
        credentialRef: replacement.predecessorCredentialRef,
        providerCredentialId: promoted.providerCredentialId,
        correlationRef: `replacement:${replacement.successorGrantRef}`,
        outcome: 'revoked',
      })
      if (recorded.kind !== 'completed' && recorded.kind !== 'replayed') {
        throw new Error('replacement_provider_revocation_record_failed')
      }
    }
    const consumed = await completeGrantDelivery(requireStore(options), {
      grantRef: claimed.value.grant.grantRef,
      claimToken: claimed.value.claimToken,
      now: currentNow(options),
    })
    if (consumed.kind !== 'ok') return oauthTransitionError(consumed)
    let refreshToken: string | undefined
    if (firstDelivery
      && claimed.value.grant.flow === 'authorization_code'
      && claimed.value.grant.offlineAccess === true) {
      refreshToken = createOpaqueOAuthValue(32)
      const now = currentNow(options)
      const family = await requireRefreshStore(options).createRefreshFamily({
        grantRef: claimed.value.grant.grantRef,
        keyId,
        clientId: claimed.value.grant.clientId,
        tokenHash: await hashOAuthValue(refreshToken),
        accessTokenHash: await hashOAuthValue(secret.secret),
        createdAt: now,
        expiresAt: now + Math.min(
          claimed.value.grant.approvedAccess.expiresInSeconds,
          AGENT_ACCESS_OAUTH_REFRESH_FAMILY_TTL_SECONDS,
        ) * 1_000,
      })
      if (family.kind === 'conflict') throw new Error('refresh_family_creation_failed')
    }
    return Response.json({
      access_token: secret.secret,
      token_type: 'Bearer',
      scope: [
        ...claimed.value.grant.requestedScopes,
        ...(claimed.value.grant.offlineAccess === true ? ['offline_access'] : []),
      ].join(' '),
      expires_in: accessCredentialTtlSeconds(claimed.value.grant.approvedAccess),
      ...(refreshToken === undefined ? {} : { refresh_token: refreshToken }),
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (cause) {
    try {
      await resetGrantDelivery(requireStore(options), { grantRef: claimed.value.grant.grantRef, claimToken: claimed.value.claimToken })
    } catch (resetCause) {
      // A retryable server response is still safer than converting a transient
      // store failure into a terminal OAuth grant error.
      captureRouteException(resetCause, { site: 'deliverClaimedGrant' }, 'warning')
    }
    return degrade(cause, oauthError('server_error', 503), { site: 'deliverClaimedGrant', reason: 'source_unavailable' })
  }
}

export function oauthRevokedResponse(): Response {
  return new Response(null, { status: 200, headers: { 'Cache-Control': 'no-store' } })
}
