import { readBoundedRequestJson, readBoundedRequestText } from '@/lib/server/bounded-request-body'
import {
  MARKET_SUPPLY_MANAGE_SCOPE,
  agentAuthorityModeForScopes,
  agentAuthorityScopeForMode,
  type AgentAccessAuthorityMode,
} from '@/modules/agent-access/contract'
import { isRecord } from '@/modules/common/is-record'
import {
  AGENT_ACCESS_OAUTH_ERROR_DESCRIPTIONS,
  AGENT_ACCESS_OAUTH_GRANT_TYPES,
  AGENT_ACCESS_OAUTH_TOKEN_ENDPOINT_AUTH_METHODS,
  type AgentAccessOAuthErrorCode,
  type AgentAccessOAuthGrant,
  type AgentAccessOAuthRequestedAccess,
} from '@/modules/agent-access/oauth-state'
import {
  AGENT_ACCESS_MAX_TTL_SECONDS,
  AGENT_ACCESS_MIN_TTL_SECONDS,
} from '@/modules/agent-access/agent-access'
import { buildProductionAgentAccessPolicy } from '@/modules/agent-access/production-policy'
import { normalizeAgentAccessToolSelection } from '@/modules/agent-access/policy'
import { exactAmountSchema, formatExactAmount, type ExactAmount } from '@/modules/money/public'

const MAX_OAUTH_FORM_BODY_BYTES = 16 * 1024
const MAX_OAUTH_JSON_BODY_BYTES = 16 * 1024
export const AUTHORIZATION_CODE_GRANT_TYPE = AGENT_ACCESS_OAUTH_GRANT_TYPES[0]
export const DEVICE_GRANT_TYPE = AGENT_ACCESS_OAUTH_GRANT_TYPES[1]
export const PUBLIC_CLIENT_AUTH_METHOD = AGENT_ACCESS_OAUTH_TOKEN_ENDPOINT_AUTH_METHODS[0]

type OAuthFormResult =
  | Readonly<{ kind: 'ok'; value: URLSearchParams }>
  | Readonly<{ kind: 'invalid' }>
  | Readonly<{ kind: 'too_large' }>

type OAuthJsonResult =
  | Readonly<{ kind: 'ok'; value: unknown }>
  | Readonly<{ kind: 'invalid' }>
  | Readonly<{ kind: 'too_large' }>

type AuthorizationDetailsResult =
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'invalid' }>
  | Readonly<{ kind: 'ok'; requestedAccess: AgentAccessOAuthRequestedAccess }>

const AUTHORIZATION_DETAILS_KEYS = new Set([
  'type',
  'environment',
  'tool_access',
  'tool_refs',
  'expires_in_seconds',
  'maximum_spend_per_call',
  'maximum_daily_spend',
  'maximum_monthly_spend',
  'maximum_concurrent_calls',
  'maximum_calls_per_minute',
  'maximum_calls_per_hour',
])

const everyFact = (facts: readonly boolean[]): boolean => facts.every(Boolean)

function singleRecord(value: unknown): Record<string, unknown> | undefined {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) {
    return undefined
  }
  return value[0]
}

export async function readForm(request: Request): Promise<OAuthFormResult> {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/x-www-form-urlencoded')) return { kind: 'invalid' }
  try {
    const bounded = await readBoundedRequestText(request, MAX_OAUTH_FORM_BODY_BYTES)
    if (!bounded.ok) return { kind: 'too_large' }
    return { kind: 'ok', value: new URLSearchParams(bounded.text) }
  } catch {
    return { kind: 'invalid' }
  }
}

export async function readJson(request: Request): Promise<OAuthJsonResult> {
  const mediaType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (mediaType !== 'application/json') return { kind: 'invalid' }
  try {
    const bounded = await readBoundedRequestJson(request, MAX_OAUTH_JSON_BODY_BYTES)
    if (!bounded.ok) return { kind: bounded.code === 'payload_too_large' ? 'too_large' : 'invalid' }
    return { kind: 'ok', value: bounded.value }
  } catch {
    return { kind: 'invalid' }
  }
}

export function parseAuthorizationDetails(raw: string | null): AuthorizationDetailsResult {
  if (raw === null) return { kind: 'absent' }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    return { kind: 'invalid' }
  }
  const detail = singleRecord(parsed)
  if (detail === undefined) return { kind: 'invalid' }
  if (Object.keys(detail).some((key) => !AUTHORIZATION_DETAILS_KEYS.has(key))) return { kind: 'invalid' }
  if (detail.type !== 'agentic_economy_market_tools') return { kind: 'invalid' }
  const environment = detail.environment
  if (environment !== 'sandbox' && environment !== 'production') return { kind: 'invalid' }
  const toolSelection = parseToolSelection(detail)
  if (toolSelection === undefined) return { kind: 'invalid' }
  const expiresInSeconds = detail.expires_in_seconds
  if (!isSafeInteger(expiresInSeconds)) return { kind: 'invalid' }
  if (!everyFact([
    expiresInSeconds >= AGENT_ACCESS_MIN_TTL_SECONDS,
    expiresInSeconds <= AGENT_ACCESS_MAX_TTL_SECONDS,
  ])) return { kind: 'invalid' }

  const budgetValues = [
    detail.maximum_spend_per_call,
    detail.maximum_daily_spend,
    detail.maximum_monthly_spend,
  ]
  const budgetKeys = [
    'maximum_spend_per_call',
    'maximum_daily_spend',
    'maximum_monthly_spend',
  ]
  const budgetCount = budgetKeys.filter((key) => Object.hasOwn(detail, key)).length
  if (![0, budgetKeys.length].includes(budgetCount)) return { kind: 'invalid' }

  const rateKeys = [
    'maximum_concurrent_calls',
    'maximum_calls_per_minute',
    'maximum_calls_per_hour',
  ] as const
  const maximumConcurrentCalls = optionalPositiveSafeInteger(detail.maximum_concurrent_calls)
  const maximumCallsPerMinute = optionalPositiveSafeInteger(detail.maximum_calls_per_minute)
  const maximumCallsPerHour = optionalPositiveSafeInteger(detail.maximum_calls_per_hour)
  const suppliedRatesAreValid = everyFact([
    detail.maximum_concurrent_calls === undefined || maximumConcurrentCalls !== undefined,
    detail.maximum_calls_per_minute === undefined || maximumCallsPerMinute !== undefined,
    detail.maximum_calls_per_hour === undefined || maximumCallsPerHour !== undefined,
  ])
  if (!suppliedRatesAreValid) return { kind: 'invalid' }
  const sandboxHasControls = budgetCount !== 0
    || rateKeys.some((key) => Object.hasOwn(detail, key))
  if (environment === 'sandbox' && sandboxHasControls) {
    return { kind: 'invalid' }
  }

  let maximumSpendPerCall: ExactAmount | undefined
  let maximumDailySpend: ExactAmount | undefined
  let maximumMonthlySpend: ExactAmount | undefined
  if (budgetCount === budgetKeys.length) {
    const firstAmount = exactAmountSchema.safeParse(budgetValues[0])
    const dailyAmount = exactAmountSchema.safeParse(budgetValues[1])
    const monthlyAmount = exactAmountSchema.safeParse(budgetValues[2])
    if (!firstAmount.success) return { kind: 'invalid' }
    if (!dailyAmount.success) return { kind: 'invalid' }
    if (!monthlyAmount.success) return { kind: 'invalid' }
    maximumSpendPerCall = firstAmount.data
    maximumDailySpend = dailyAmount.data
    maximumMonthlySpend = monthlyAmount.data
    try {
      buildProductionAgentAccessPolicy({
        currency: maximumSpendPerCall.currency,
        exponent: maximumSpendPerCall.exponent,
        maximumSpendPerCall,
        maximumDailySpend,
        maximumMonthlySpend,
      })
    } catch {
      return { kind: 'invalid' }
    }
  }

  return {
    kind: 'ok',
    requestedAccess: {
      environment,
      toolAccess: toolSelection.toolAccess,
      toolRefs: toolSelection.toolRefs,
      expiresInSeconds,
      ...(maximumSpendPerCall === undefined ? {} : { maximumSpendPerCall }),
      ...(maximumDailySpend === undefined ? {} : { maximumDailySpend }),
      ...(maximumMonthlySpend === undefined ? {} : { maximumMonthlySpend }),
      ...(maximumConcurrentCalls === undefined ? {} : { maximumConcurrentCalls }),
      ...(maximumCallsPerMinute === undefined ? {} : { maximumCallsPerMinute }),
      ...(maximumCallsPerHour === undefined ? {} : { maximumCallsPerHour }),
    },
  }
}

function parseToolSelection(detail: Record<string, unknown>) {
  const hasToolAccess = Object.hasOwn(detail, 'tool_access')
  const hasToolRefs = Object.hasOwn(detail, 'tool_refs')
  if (hasToolAccess !== hasToolRefs) return undefined
  const toolAccess = hasToolAccess ? detail.tool_access : 'all_admitted'
  const toolRefs = hasToolRefs ? detail.tool_refs : []
  if ((toolAccess !== 'all_admitted' && toolAccess !== 'selected_tools')
    || !Array.isArray(toolRefs)
    || toolRefs.some((ref) => typeof ref !== 'string')) return undefined
  return normalizeAgentAccessToolSelection({
    toolAccess,
    toolRefs: toolRefs as string[],
  })
}

export function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value)
}

export function optionalPositiveSafeInteger(value: unknown): number | undefined {
  if (value === undefined) return undefined
  return isSafeInteger(value) && value > 0 ? value : undefined
}

export function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value.map((item) => item.trim()).filter((item) => item.length > 0) : []
}

export function validRedirectUri(value: string): boolean {
  if (value.includes('*')) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]')
  } catch {
    return false
  }
}

export function modeForGrant(grant: AgentAccessOAuthGrant): AgentAccessAuthorityMode | undefined {
  return agentAuthorityModeForScopes(grant.requestedScopes, { allowCustomerDefault: true })
}

export function accessProfileForGrant(grant: Pick<AgentAccessOAuthGrant, 'requestedScopes'>): 'market' | 'provider' {
  return grant.requestedScopes.length === 1 && grant.requestedScopes[0] === MARKET_SUPPLY_MANAGE_SCOPE
    ? 'provider'
    : 'market'
}

export function consentHtml(input: Readonly<{
  grantRef: string
  grantRevision: number
  flow: AgentAccessOAuthGrant['flow']
  clientName: string
  mode: AgentAccessAuthorityMode
  requestedScopes: readonly string[]
  state: string
  requestedAccess: AgentAccessOAuthRequestedAccess
  agentTargets?: readonly Readonly<{ principalRef: string; principalRevision: number; displayName: string }>[]
  agentTargetsNextCursor?: string
  agentTargetsUnavailable?: boolean
  reconnectPrincipalRef?: string
  reconnectAmbiguous?: boolean
}>): string {
  const escapedName = escapeHtml(input.clientName)
  const escapedGrantRef = escapeHtml(input.grantRef)
  const grantRevision = String(input.grantRevision)
  const escapedState = escapeHtml(input.state)
  const profile = accessProfileForGrant({ requestedScopes: input.requestedScopes })
  const scope = profile === 'provider' ? MARKET_SUPPLY_MANAGE_SCOPE : agentAuthorityScopeForMode(input.mode)
  const permission = consentPermissionCopy(input.mode, profile)
  const environment = escapeHtml(input.requestedAccess.environment)
  const toolAccess = escapeHtml(input.requestedAccess.toolAccess)
  const toolRefs = escapeHtml(encodeURIComponent(JSON.stringify(input.requestedAccess.toolRefs)))
  const authorityMode = escapeHtml(input.mode)
  const expiry = String(input.requestedAccess.expiresInSeconds)
  const accessSummary = escapeHtml(consentAccessSummary(input.requestedAccess))
  const toolSummary = escapeHtml(consentToolAccessSummary(input.requestedAccess))
  const targets = escapeHtml(encodeURIComponent(JSON.stringify(input.agentTargets ?? [])))
  const nextCursor = input.agentTargetsNextCursor === undefined
    ? ''
    : escapeHtml(encodeURIComponent(input.agentTargetsNextCursor))
  const targetsUnavailable = input.agentTargetsUnavailable === true ? 'true' : 'false'
  const reconnectPrincipalRef = input.reconnectPrincipalRef === undefined ? '' : escapeHtml(input.reconnectPrincipalRef)
  const reconnectAmbiguous = input.reconnectAmbiguous === true ? 'true' : 'false'
  return `<main data-ae-consent data-grant-ref="${escapedGrantRef}" data-grant-revision="${grantRevision}" data-flow="${input.flow}" data-client-name="${escapedName}" data-authority-mode="${authorityMode}" data-access-profile="${profile}" data-environment="${environment}" data-tool-access="${toolAccess}" data-tool-refs="${toolRefs}" data-expires-in-seconds="${expiry}" data-access-summary="${accessSummary}" data-agent-targets="${targets}" data-agent-targets-next-cursor="${nextCursor}" data-agent-targets-unavailable="${targetsUnavailable}" data-reconnect-principal-ref="${reconnectPrincipalRef}" data-reconnect-ambiguous="${reconnectAmbiguous}"><h1>Connect ${escapedName} to Agentic Economy</h1><p>This agent may ${permission.allowed}.</p><p>${permission.approval}</p><p data-ae-tools>${toolSummary}</p><p data-ae-access>Environment: ${environment}. Access expires in ${expiry} seconds. Authority mode: ${authorityMode}. ${accessSummary}</p><p>You can revoke it at any time from the Access &amp; usage workspace.</p><details><summary>Technical details</summary><p data-ae-scope>Technical permission: ${escapeHtml(scope)}</p></details><form method="post" action="/oauth/authorize"><input type="hidden" name="grant_ref" value="${escapedGrantRef}"><input type="hidden" name="state" value="${escapedState}"><input type="hidden" name="authority_mode" value="${authorityMode}"><button name="decision" value="approve">Approve access</button><button name="decision" value="deny">Decline</button></form></main>`
}

export function consentRecoveryHtml(grantRef: string): string {
  const escapedGrantRef = escapeHtml(grantRef)
  return `<main data-ae-consent data-ae-consent-state="outcome_unknown" data-grant-ref="${escapedGrantRef}"><h1>Check the current access status</h1><p>The approval may have completed. Do not submit it again.</p><p>Request reference: ${escapedGrantRef}</p></main>`
}

export function consentCompletedHtml(grantRef: string): string {
  const escapedGrantRef = escapeHtml(grantRef)
  return `<main data-ae-consent data-ae-consent-state="succeeded" data-grant-ref="${escapedGrantRef}"><h1>Access approved</h1><p>This approval has completed. Open Agents for the current credential status.</p><p>Request reference: ${escapedGrantRef}</p></main>`
}

export function consentPermissionCopy(mode: AgentAccessAuthorityMode, profile: 'market' | 'provider' = 'market'): Readonly<{ allowed: string; approval: string }> {
  if (profile === 'provider') return { allowed: 'inspect and manage your published Provider Tools', approval: 'It cannot fund buyers, spend buyer credit, or manage unrelated account settings.' }
  if (mode === 'read_only') return { allowed: 'browse and compare Tools', approval: 'Any Call still waits for your approval.' }
  if (mode === 'approval_required') return { allowed: 'bring each request to you', approval: 'You approve each request before it moves forward.' }
  if (mode === 'spending_policy') return { allowed: 'work within the requested spend controls', approval: 'Paid calls proceed only within the requested controls.' }
  return { allowed: 'carry out approved work on your behalf', approval: 'AE still asks for your approval where required.' }
}

export function consentAccessSummary(requestedAccess: AgentAccessOAuthRequestedAccess): string {
  const controls: string[] = []
  if (requestedAccess.maximumSpendPerCall !== undefined) {
    controls.push(`Maximum spend per Call: ${formatConsentAmount(requestedAccess.maximumSpendPerCall)}.`)
  }
  if (requestedAccess.maximumDailySpend !== undefined) {
    controls.push(`Maximum daily spend: ${formatConsentAmount(requestedAccess.maximumDailySpend)}.`)
  }
  if (requestedAccess.maximumMonthlySpend !== undefined) {
    controls.push(`Maximum monthly spend: ${formatConsentAmount(requestedAccess.maximumMonthlySpend)}.`)
  }
  if (requestedAccess.maximumConcurrentCalls !== undefined) {
    controls.push(`Maximum concurrent Calls: ${requestedAccess.maximumConcurrentCalls}.`)
  }
  if (requestedAccess.maximumCallsPerMinute !== undefined) {
    controls.push(`Maximum calls per minute: ${requestedAccess.maximumCallsPerMinute}.`)
  }
  if (requestedAccess.maximumCallsPerHour !== undefined) {
    controls.push(`Maximum calls per hour: ${requestedAccess.maximumCallsPerHour}.`)
  }
  if (requestedAccess.environment === 'production'
    && requestedAccess.maximumSpendPerCall === undefined
    && requestedAccess.maximumDailySpend === undefined
    && requestedAccess.maximumMonthlySpend === undefined) {
    controls.push('Spending is disabled by the zero default.')
  }
  if (controls.length === 0) controls.push('No additional spend or rate controls were supplied.')
  return controls.join(' ')
}

function consentToolAccessSummary(requestedAccess: AgentAccessOAuthRequestedAccess): string {
  return requestedAccess.toolAccess === 'all_admitted'
    ? 'Tools: all admitted Tools, including Tools admitted in the future.'
    : `Tools: selected only — ${requestedAccess.toolRefs.join(', ')}.`
}

export function formatConsentAmount(amount: ExactAmount): string {
  const formatted = formatExactAmount(amount)
  return `${escapeHtml(amount.currency)} ${escapeHtml(formatted ?? '—')}`
}

export function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll('\'', '&#39;')
}

type OAuthErrorBody = Readonly<{ error: AgentAccessOAuthErrorCode; error_description: string }>

const OAUTH_ERROR_DESCRIPTIONS = AGENT_ACCESS_OAUTH_ERROR_DESCRIPTIONS

export function oauthError(
  error: AgentAccessOAuthErrorCode,
  status: 400 | 401 | 403 | 413 | 429 | 503,
  headers: Readonly<Record<string, string>> = {},
): Response {
  const body: OAuthErrorBody = { error, error_description: OAUTH_ERROR_DESCRIPTIONS[error] }
  const retryAfter = error === 'authorization_pending'
    ? '5'
    : error === 'slow_down'
      ? '10'
      : undefined
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...(retryAfter === undefined ? {} : { 'Retry-After': retryAfter }),
      ...headers,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}

export function oauthTransitionError(result: { kind: 'refused' | 'conflict'; reason: string }): Response {
  if (result.kind === 'conflict') return oauthError('invalid_grant', 400)
  if (result.reason === 'invalid_client') return oauthError('invalid_client', 401)
  if (result.reason === 'invalid_scope') return oauthError('invalid_scope', 400)
  if (result.reason === 'authorization_pending') return oauthError('authorization_pending', 400)
  if (result.reason === 'slow_down') return oauthError('slow_down', 400)
  if (result.reason === 'access_denied' || result.reason === 'owner_mismatch' || result.reason === 'owner_required') return oauthError('access_denied', 403)
  if (result.reason === 'expired_token') return oauthError('expired_token', 400)
  if (result.reason === 'issuance_unavailable' || result.reason === 'missing_key') return oauthError('server_error', 503)
  return oauthError('invalid_grant', 400)
}
