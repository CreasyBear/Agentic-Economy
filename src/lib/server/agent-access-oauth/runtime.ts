import { auth } from '@clerk/tanstack-react-start/server'
import type { RateLimitAdmission } from '@/lib/server/rate-limit'
import type { ProblemInput } from '@/lib/errors'
import { problem } from '@/lib/server/problem'
import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'
import type { AgentAccessAuthorityMode } from '@/modules/agent-access/contract'
import type {
  AgentAccessOAuthClient,
  AgentAccessOAuthRequestedAccess,
  AgentAccessOAuthStore,
  AgentConnectionTarget,
  AgentCredentialReplacement,
} from '@/modules/agent-access/oauth-state'
import type { AgentAccessPolicy } from '@/modules/agent-access/policy'
import {
  reserveAgentAccessConsentForOwner,
  type AgentAccessOAuthRefreshFamily,
  type AgentAccessOAuthRefreshStore,
} from '@/lib/server/agent-access-oauth-store'
import type { ConvexSourceAuth } from '@/lib/server/convex-source'
import {
  prepareAgentCredentialReplacement,
  registerIssuedAgentBinding,
} from '@/modules/agent-access/agent-access.functions'
import { oauthError } from './protocol'

const OAUTH_AUTHORIZATION_UNAVAILABLE: ProblemInput = {
  status: 503,
  kind: 'UNAVAILABLE',
  code: 'oauth_authorization_unavailable',
  detail: 'The authorization request is temporarily unavailable.',
  retryable: true,
}

export function oauthAuthorizationUnavailableResponse(): Response {
  return problem(OAUTH_AUTHORIZATION_UNAVAILABLE)
}

export type OAuthConsentAuthObject = ConvexSourceAuth & Readonly<{
  userId: string | null
  has: (params: { reverification: 'strict' }) => boolean
  sessionClaims: Record<string, unknown> | null
  factorVerificationAge: readonly [number, number] | null
}>

export type OAuthApiOptions = Readonly<{
  store?: AgentAccessOAuthStore
  now?: () => number
  canonicalBaseUrl?: string
  authenticateOwner?: () => Promise<{ isAuthenticated: boolean; userId: string | null }>
  authObject?: OAuthConsentAuthObject
  reserveConsent?: typeof reserveAgentAccessConsentForOwner
  issueKey?: (input: Readonly<{
    ownerId: string
    name: string
    idempotencyKey: string
    scopes: readonly string[]
    grantRef: string
    authorityMode: AgentAccessAuthorityMode
    approvedAccess: AgentAccessOAuthRequestedAccess
    spendingPolicy: AgentAccessPolicy
    target: AgentConnectionTarget
  }>) => Promise<Readonly<{ keyId: string; secret?: string; replacement?: AgentCredentialReplacement }>>
  registerBinding?: typeof registerIssuedAgentBinding
  prepareReplacement?: typeof prepareAgentCredentialReplacement
  getSecret?: (keyId: string) => Promise<{ secret: string }>
  promoteReplacement?: (replacement: AgentCredentialReplacement) => Promise<Readonly<{ kind: 'completed' | 'replayed'; providerCredentialId: string } | { kind: 'conflict' | 'unavailable' }>>
  cancelReplacement?: (replacement: AgentCredentialReplacement) => Promise<Readonly<{ kind: 'completed' | 'replayed'; providerCredentialId: string } | { kind: 'conflict' | 'unavailable' }>>
  getProviderCredential?: (credentialId: string) => Promise<Readonly<{ revoked: boolean }>>
  revokeProviderCredential?: (credentialId: string, reason: string) => Promise<void>
  recordProviderRevocation?: (input: Readonly<{
    principalRef: string
    credentialRef: string
    providerCredentialId: string
    correlationRef: string
    outcome: 'revoked'
  }>) => Promise<Readonly<{ kind: 'completed' | 'replayed' | 'conflict' } | { kind: 'refused'; code: 'authentication_required' }>>
  refreshStore?: AgentAccessOAuthRefreshStore
  issueRefreshKey?: (input: Readonly<{
    family: AgentAccessOAuthRefreshFamily
    issuanceKey: string
    grantRef: string
    expiresInSeconds: number
  }>) => Promise<Readonly<{ keyId: string }>>
  rateLimit?: RateLimitAdmission
  devicePollRateLimit?: RateLimitAdmission
  listAgents?: (cursor: string | null) => Promise<Readonly<{
    items: readonly Readonly<{ principalRef: string; principalRevision: number; displayName: string }>[]
    nextCursor?: string
  }>>
  listReconnectCandidates?: (input: Readonly<{
    clientId: string
    principalRefs: readonly string[]
    now: number
  }>) => Promise<readonly Readonly<{ principalRef: string; principalRevision: number }>[]>
}>

/**
 * `Response.redirect` returns a response whose Headers are immutable per the
 * Fetch spec, which crashes `clerkMiddleware` when it appends its own headers
 * to the authorize response. Build the redirect by hand so its headers stay
 * mutable.
 */
export function redirectTo(url: URL | string): Response {
  return new Response(null, { status: 302, headers: { location: url.toString() } })
}

export async function readClient(clientId: string | null, options: OAuthApiOptions): Promise<AgentAccessOAuthClient | null> {
  if (clientId === null) return null
  return await requireStore(options).getClient(clientId)
}

export async function ownerIdentity(
  options: OAuthApiOptions,
  authObject?: Pick<OAuthConsentAuthObject, 'isAuthenticated' | 'userId'>,
): Promise<{ isAuthenticated: boolean; userId: string | null }> {
  return options.authenticateOwner === undefined ? authObject ?? await auth() : await options.authenticateOwner()
}

export function requireStore(options: OAuthApiOptions): AgentAccessOAuthStore {
  if (options.store === undefined) throw new Error('agent_access_oauth_state_unavailable')
  return options.store
}

export function requireRefreshStore(options: OAuthApiOptions): AgentAccessOAuthRefreshStore {
  if (options.refreshStore !== undefined) return options.refreshStore
  const candidate = options.store as Partial<AgentAccessOAuthRefreshStore> | undefined
  if (candidate === undefined
    || candidate.createRefreshFamily === undefined
    || candidate.claimRefreshFamily === undefined
    || candidate.commitRefreshFamilyRotation === undefined
    || candidate.revokeRefreshFamily === undefined
    || candidate.revokeRefreshFamilyByAccessToken === undefined) {
    throw new Error('agent_access_oauth_refresh_state_unavailable')
  }
  return candidate as AgentAccessOAuthRefreshStore
}

export function currentNow(options: OAuthApiOptions): number {
  const now = options.now
  return now === undefined ? Date.now() : now()
}

export async function oauthAdmissionResponse(
  request: Request,
  options: OAuthApiOptions,
  keySuffix: string,
  kind: 'default' | 'device_poll' = 'default',
): Promise<Response | undefined> {
  const rateLimit = kind === 'device_poll'
    ? (options.devicePollRateLimit ?? options.rateLimit)
    : options.rateLimit
  if (rateLimit === undefined) return undefined
  // Caller-independent IP-only bucket first: rotated client_id/device_code values share one per-IP budget.
  let admission = await rateLimit({ request, keySuffix: 'oauth-aggregate' })
  if (admission.ok) admission = await rateLimit({ request, keySuffix })
  if (admission.ok) return undefined
  return oauthError('rate_limited', 429, {
    'Retry-After': String(Math.max(1, Math.ceil(admission.retryAfter / 1_000))),
  })
}

export function baseUrl(request: Request, options: OAuthApiOptions): string {
  const configured = options.canonicalBaseUrl
  return configured === undefined ? resolveCanonicalBaseUrl(request).baseUrl : trimTrailingSlashes(configured)
}
