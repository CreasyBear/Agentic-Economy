import { auth } from '@clerk/tanstack-react-start/server'
import { deploymentPaymentEnvironment, type PaymentEnvironment } from '@/lib/deployment/environment'
import { reverificationErrorResponse } from '@clerk/shared/authorization-errors'
import {
  AGENT_ACCESS_AUTHORITY_MODE_VALUES,
  type AgentAccessAuthorityMode,
} from '@/modules/agent-access/contract'
import {
  AGENT_ACCESS_OAUTH_SAFE_MCP_SCOPES,
  approveGrant,
  denyGrant,
  normalizeRequestedScopes,
  readGrantForConsent,
  type AgentAccessOAuthClient,
  type AgentAccessOAuthGrant,
  type AgentAccessOAuthRequestedAccess,
  type AgentAccessOAuthStore,
  type AgentConnectionTarget,
} from '@/modules/agent-access/oauth-state'
import {
  normalizeAgentAccessToolSelection,
  type AgentAccessToolAccess,
} from '@/modules/agent-access/policy'
import { assertCsrf } from '@/modules/security/public'
import { loadAgentDirectoryReadback, loadOwnerReconnectCandidates } from '@/modules/agent-access/agent-access-console'
import {
  reserveAgentAccessConsentForOwner,
  type AgentAccessConsentReservationResult,
} from '@/lib/server/agent-access-oauth-store'
import { degrade } from '@/lib/observability/degrade'
import { confirmCompromisedPredecessorRevocation, issueGrantKey } from './credential-issuance'
import {
  consentCompletedHtml,
  consentHtml,
  consentRecoveryHtml,
  modeForGrant,
  oauthError,
  oauthTransitionError,
  readForm,
} from './protocol'
import {
  baseUrl,
  currentNow,
  oauthAdmissionResponse,
  oauthAuthorizationUnavailableResponse,
  ownerIdentity,
  redirectTo,
  requireStore,
  type OAuthApiOptions,
  type OAuthConsentAuthObject,
} from './runtime'

type ConsentAgentTargets = Readonly<{
  items: readonly Readonly<{ principalRef: string; principalRevision: number; displayName: string }>[]
  nextCursor?: string
  unavailable?: true
  reconnectPrincipalRef?: string
  reconnectAmbiguous?: true
}>

export function defaultOAuthScopeText(includeOfflineAccess: boolean): string {
  return AGENT_ACCESS_OAUTH_SAFE_MCP_SCOPES
    .filter((scope) => includeOfflineAccess || scope !== 'offline_access')
    .join(' ')
}

export function authorizationRequestScopeError(
  client: AgentAccessOAuthClient,
  normalizedScopes: ReturnType<typeof normalizeRequestedScopes>,
  requestedAccess: AgentAccessOAuthRequestedAccess | undefined,
): 'invalid_scope' | 'invalid_request' | undefined {
  if (normalizedScopes?.offlineAccess === true && !client.grantTypes.includes('refresh_token')) return 'invalid_scope'
  return requestedAccess !== undefined && (normalizedScopes?.mode === 'unrestricted_test_only'
    || (normalizedScopes?.profile === 'provider' && requestedAccess.toolAccess !== 'all_admitted'))
    ? 'invalid_request'
    : undefined
}

export async function locatedConsentResponse(
  request: Request,
  options: OAuthApiOptions,
  agentCursor: string | null,
  userCode: string | null,
  grantRef: string | null,
): Promise<Response> {
  const locator = userCode === null ? `grant_ref:${grantRef}` : `user_code:${userCode}`
  const limited = await oauthAdmissionResponse(request, options, locator)
  if (limited !== undefined) return limited
  const owner = await ownerIdentity(options)
  if (!owner.isAuthenticated || owner.userId === null) {
    return redirectTo(new URL('/sign-in', baseUrl(request, options)))
  }
  let result: Awaited<ReturnType<typeof readGrantForConsent>>
  try {
    result = await readGrantForConsent(requireStore(options), {
      ...(userCode === null ? {} : { userCode }),
      ...(grantRef === null ? {} : { grantRef }),
      ownerId: owner.userId,
      now: currentNow(options),
    })
  } catch (cause) {
    return degrade(cause, oauthAuthorizationUnavailableResponse(), { site: 'locatedConsentResponse', reason: 'source_unavailable' })
  }
  if (result.kind === 'outcome_unknown') {
    return new Response(consentRecoveryHtml(result.grant.grantRef), {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    })
  }
  if (result.kind === 'completed') {
    return new Response(consentCompletedHtml(result.grant.grantRef), {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    })
  }
  if (result.kind !== 'ok') return oauthTransitionError(result)
  const mode = modeForGrant(result.value)
  if (mode === undefined) return oauthError('invalid_scope', 400)
  return await consentResponse(result.value, mode, '', options, agentCursor)
}

async function consentResponse(
  grant: AgentAccessOAuthGrant,
  mode: AgentAccessAuthorityMode,
  state: string,
  options: OAuthApiOptions,
  cursor: string | null,
): Promise<Response> {
  const targets = await consentAgentTargets(options, cursor, grant.clientId, currentNow(options))
  return new Response(consentHtml({
    grantRef: grant.grantRef,
    grantRevision: grant.revision,
    flow: grant.flow,
    clientName: grant.displayName,
    ...(grant.redirectUri === undefined ? {} : { redirectUri: grant.redirectUri }),
    mode,
    requestedScopes: grant.requestedScopes,
    state,
    requestedAccess: grant.requestedAccess,
    agentTargets: targets.items,
    ...(targets.nextCursor === undefined ? {} : { agentTargetsNextCursor: targets.nextCursor }),
    ...(targets.unavailable === true ? { agentTargetsUnavailable: true } : {}),
    ...(targets.reconnectPrincipalRef === undefined ? {} : { reconnectPrincipalRef: targets.reconnectPrincipalRef }),
    ...(targets.reconnectAmbiguous === true ? { reconnectAmbiguous: true } : {}),
  }), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

function consentAuthorityMode(form: URLSearchParams): AgentAccessAuthorityMode | null | undefined {
  const value = form.get('authority_mode')
  if (value === null) return undefined
  return AGENT_ACCESS_AUTHORITY_MODE_VALUES.includes(value as AgentAccessAuthorityMode)
    ? value as AgentAccessAuthorityMode
    : null
}

async function consentAuthObject(
  options: OAuthApiOptions,
): Promise<OAuthConsentAuthObject> {
  if (options.authObject !== undefined) return options.authObject
  return await auth() as OAuthConsentAuthObject
}

export type ConsentApprovalFields = Readonly<{
  expectedGrantRevision: number
  expectedTargetRevision: number
  approvedToolSelection: Readonly<{
    toolAccess: AgentAccessToolAccess
    toolRefs: readonly string[]
  }>
  reservationTarget: Parameters<typeof reserveAgentAccessConsentForOwner>[0]['connectionTarget']
  state: string | null
}>

function boundedConsentState(form: URLSearchParams): string | null | undefined {
  const state = form.get('state')
  return state !== null && state.length > 2_048 ? undefined : state
}

function consentApprovalFields(form: URLSearchParams): ConsentApprovalFields | undefined {
  const expectedGrantRevision = positiveFormInteger(form.get('expected_grant_revision'))
  const expectedTargetRevision = positiveFormInteger(form.get('expected_target_revision'))
  const approvedToolSelection = parseApprovedToolSelection(form)
  const targetKind = form.get('connection_target')
  const principalRef = form.get('principal_ref')
  const replacementMode = form.get('replacement_mode')
  const state = boundedConsentState(form)
  if (
    expectedGrantRevision === undefined
    || expectedTargetRevision === undefined
    || approvedToolSelection === undefined
    || (targetKind !== 'new_agent' && targetKind !== 'replace_credential')
    || state === undefined
  ) return undefined
  let reservationTarget: ConsentApprovalFields['reservationTarget']
  if (targetKind === 'new_agent') {
    reservationTarget = { kind: 'new_agent' }
  } else {
    if (principalRef === null || principalRef.trim().length === 0) return undefined
    if (replacementMode !== 'planned' && replacementMode !== 'compromise') return undefined
    reservationTarget = {
      kind: 'replace_credential',
      principalRef,
      replacementMode,
    }
  }
  return {
    expectedGrantRevision,
    expectedTargetRevision,
    approvedToolSelection,
    reservationTarget,
    state,
  }
}

export async function handleOAuthConsentPost(request: Request, options: OAuthApiOptions = {}): Promise<Response> {
  const sourceBody = await request.clone().text()
  const formResult = await readForm(request)
  if (formResult.kind === 'too_large') return oauthError('invalid_request', 413)
  if (formResult.kind !== 'ok') return oauthError('invalid_request', 400)
  const form = formResult.value
  const requestOrigin = request.headers.get('Origin')
  const csrfDecision = assertCsrf({
    ...(requestOrigin === null ? {} : { origin: requestOrigin }),
    allowedOrigins: [new URL(baseUrl(request, options)).origin],
  })
  if (csrfDecision.kind === 'rejected') return oauthError('access_denied', 403)
  const grantRef = form.get('grant_ref')
  const decision = form.get('decision')
  const state = boundedConsentState(form)
  if (decision !== 'approve' && decision !== 'deny') return oauthError('invalid_request', 400)
  if (state === undefined) return oauthError('invalid_request', 400)
  const authObject = await consentAuthObject(options)
  const [owner, limited] = await Promise.all([
    ownerIdentity(options, authObject),
    oauthAdmissionResponse(request, options, `consent:${grantRef ?? 'missing'}`),
  ])
  if (limited !== undefined) return limited
  if (!owner.isAuthenticated || owner.userId === null || grantRef === null) return oauthError('access_denied', 403)
  const store = requireStore(options)
  if (decision === 'deny') {
    return await denyConsentGrant(store, grantRef, owner.userId, state, options)
  }
  const environment = deploymentPaymentEnvironment(process.env)
  const currentGrant = await store.getGrantByRef(grantRef)
  if (environment === undefined || currentGrant === null
    || currentGrant.requestedAccess.environment !== environment
    || currentGrant.approvedAccess.environment !== environment) return oauthError('invalid_grant', 400)
  const authorityMode = consentAuthorityMode(form)
  if (authorityMode === null || authorityMode === undefined) return oauthError('invalid_scope', 400)
  if (environment === 'production'
    && (authorityMode === 'unrestricted_test_only' || modeForGrant(currentGrant) === 'unrestricted_test_only')) {
    return oauthError('invalid_scope', 400)
  }
  if (!authObject.has({ reverification: 'strict' })) return strictReverificationJson()
  const proof = consentProofFromAuth(authObject)
  if (proof === null) return consentJson({ kind: 'refused', code: 'security_evidence_unavailable' }, 403)
  const approval = consentApprovalFields(form)
  if (approval === undefined) return oauthError('invalid_request', 400)
  return await reserveAndFinalizeConsent({
    environment,
    request,
    sourceBody,
    store,
    authObject,
    ownerId: owner.userId,
    grantRef,
    expectedGrantRevision: approval.expectedGrantRevision,
    expectedTargetRevision: approval.expectedTargetRevision,
    authorityMode,
    approvedToolAccess: approval.approvedToolSelection.toolAccess,
    approvedToolRefs: approval.approvedToolSelection.toolRefs,
    reservationTarget: approval.reservationTarget,
    connectionTarget: parseConnectionTarget(form),
    state: approval.state,
    proof,
    options,
  })
}

async function denyConsentGrant(
  store: AgentAccessOAuthStore,
  grantRef: string,
  ownerId: string,
  state: string | null,
  options: OAuthApiOptions,
): Promise<Response> {
  const denied = await denyGrant(store, {
    grantRef,
    ownerId,
    now: currentNow(options),
  })
  if (denied.kind !== 'ok') return oauthTransitionError(denied)
  if (denied.value.flow === 'authorization_code' && denied.value.redirectUri !== undefined) {
    const redirectTo = new URL(denied.value.redirectUri)
    redirectTo.searchParams.set('error', 'access_denied')
    if (state !== null) redirectTo.searchParams.set('state', state)
    return consentJson({ kind: 'denied', grantRef, redirectTo: redirectTo.toString() }, 200)
  }
  return consentJson({ kind: 'denied', grantRef }, 200)
}

async function reserveAndFinalizeConsent(input: Readonly<{
  environment: PaymentEnvironment
  request: Request
  sourceBody: string
  store: AgentAccessOAuthStore
  authObject: OAuthConsentAuthObject
  ownerId: string
  grantRef: string
  expectedGrantRevision: number
  expectedTargetRevision: number
  authorityMode: AgentAccessAuthorityMode
  approvedToolAccess: AgentAccessToolAccess
  approvedToolRefs: readonly string[]
  reservationTarget: Parameters<typeof reserveAgentAccessConsentForOwner>[0]['connectionTarget']
  connectionTarget: AgentConnectionTarget | undefined
  state: string | null
  proof: NonNullable<ReturnType<typeof consentProofFromAuth>>
  options: OAuthApiOptions
}>): Promise<Response> {
  const reservation = await (input.options.reserveConsent ?? reserveAgentAccessConsentForOwner)({
    request: input.request,
    body: input.sourceBody,
    authObject: input.authObject,
    grantRef: input.grantRef,
    expectedGrantRevision: input.expectedGrantRevision,
    expectedTargetRevision: input.expectedTargetRevision,
    authorityMode: input.authorityMode,
    approvedToolAccess: input.approvedToolAccess,
    approvedToolRefs: input.approvedToolRefs,
    connectionTarget: input.reservationTarget,
    proof: input.proof,
  })
  if (reservation.kind !== 'reserved' && reservation.kind !== 'replayed') {
    if (reservation.kind === 'refused' && reservation.code !== 'authentication_required') {
      const currentGrant = await input.store.getGrantByRef(input.grantRef)
      if (currentGrant?.status === 'pending' && currentGrant.revision === input.expectedGrantRevision) {
        return strictReverificationJson()
      }
    }
    return reservationJson(reservation)
  }
  let reservedGrant = await input.store.getGrantByRef(input.grantRef)
  if (reservedGrant === null) return oauthError('server_error', 503)
  if (reservation.kind === 'replayed') {
    const replay = await readGrantForConsent(input.store, {
      grantRef: input.grantRef,
      ownerId: input.ownerId,
      now: currentNow(input.options),
    })
    if (replay.kind === 'outcome_unknown') {
      const dispatchNotStarted = replay.grant.issuanceStartedAt === replay.grant.consequenceReservation?.reservedAt
      if (!dispatchNotStarted) return consentOutcomeUnknown(input.grantRef, reservation.correlationRef)
      reservedGrant = replay.grant
    }
    if (replay.kind === 'completed') {
      return consentJson({
        kind: 'approved',
        grantRef: input.grantRef,
        readbackRef: `agent-access/oauth/${input.grantRef}`,
      }, 200)
    }
  }
  if (reservedGrant.connectionTarget?.kind === 'replace_credential'
    && reservedGrant.connectionTarget.replacementMode === 'compromise'
    && !await confirmCompromisedPredecessorRevocation(reservedGrant, reservation.correlationRef, input.options)) {
    return consentOutcomeUnknown(input.grantRef, reservation.correlationRef)
  }
  const approved = await approveGrant(input.store, {
    environment: input.environment,
    grantRef: input.grantRef,
    ownerId: input.ownerId,
    now: currentNow(input.options),
    authorityMode: input.authorityMode,
    ...(input.connectionTarget === undefined ? {} : { connectionTarget: input.connectionTarget }),
    issueKey: async ({ grant: sourceGrant, ownerId, target }) => await issueGrantKey(sourceGrant, ownerId, target, input.options),
  })
  if (approved.kind === 'outcome_unknown') {
    return consentJson({
      kind: 'outcome_unknown',
      grantRef: input.grantRef,
      readbackRef: `agent-access/oauth/${input.grantRef}`,
      correlationRef: reservation.correlationRef,
    }, 202)
  }
  if (approved.kind !== 'ok') return oauthTransitionError(approved)
  if (approved.value.grant.flow === 'authorization_code' && approved.value.grant.redirectUri !== undefined && approved.value.authorizationCode !== undefined) {
    const location = new URL(approved.value.grant.redirectUri)
    location.searchParams.set('code', approved.value.authorizationCode)
    if (input.state !== null) location.searchParams.set('state', input.state)
    return consentJson({ kind: 'approved', grantRef: input.grantRef, redirectTo: location.toString() }, 200)
  }
  return consentJson({ kind: 'approved', grantRef: input.grantRef, readbackRef: `agent-access/oauth/${input.grantRef}` }, 200)
}

function consentOutcomeUnknown(grantRef: string, correlationRef: string): Response {
  return consentJson({
    kind: 'outcome_unknown',
    grantRef,
    readbackRef: `agent-access/oauth/${grantRef}`,
    correlationRef,
  }, 202)
}

function parseConnectionTarget(form: URLSearchParams): AgentConnectionTarget | undefined {
  const kind = form.get('connection_target')
  if (kind !== 'replace_credential') return undefined
  const replacementMode = form.get('replacement_mode')
  if (replacementMode !== 'planned' && replacementMode !== 'compromise') return undefined
  return {
    kind: 'replace_credential',
    principalRef: form.get('principal_ref') ?? '',
    replacementMode,
  }
}

function parseApprovedToolSelection(form: URLSearchParams): Readonly<{
  toolAccess: AgentAccessToolAccess
  toolRefs: readonly string[]
}> | undefined {
  const toolAccess = form.get('approved_tool_access')
  if (toolAccess !== 'all_admitted' && toolAccess !== 'selected_tools') return undefined
  return normalizeAgentAccessToolSelection({
    toolAccess,
    toolRefs: form.getAll('approved_tool_ref'),
  })
}

async function consentAgentTargets(
  options: OAuthApiOptions,
  cursor: string | null,
  clientId: string,
  now: number,
): Promise<ConsentAgentTargets> {
  try {
    const listed = options.listAgents !== undefined
      ? await options.listAgents(cursor)
      : await loadAgentDirectoryReadback(cursor).then((directory) => ({
          items: directory.items.map(({ principalRef, principalRevision, displayName }) => ({
            principalRef,
            principalRevision,
            displayName,
          })),
          ...(directory.nextCursor === undefined ? {} : { nextCursor: directory.nextCursor }),
        }))
    const reconnectCandidates = options.listReconnectCandidates !== undefined
      ? await options.listReconnectCandidates({ clientId, principalRefs: listed.items.map(({ principalRef }) => principalRef), now })
      : options.listAgents !== undefined
        ? []
        : await loadOwnerReconnectCandidates(clientId, listed.items.map(({ principalRef }) => principalRef), now)
    return {
      ...listed,
      ...(reconnectCandidates.length === 1
        ? { reconnectPrincipalRef: reconnectCandidates[0]!.principalRef }
        : reconnectCandidates.length > 1
          ? { reconnectAmbiguous: true as const }
          : {}),
    }
  } catch (cause) {
    return degrade(cause, { items: [], unavailable: true }, { site: 'consentAgentTargets', reason: 'source_unavailable' })
  }
}

export function readAgentCursor(url: URL): string | null | undefined {
  const value = url.searchParams.get('agent_cursor')
  if (value === null || value.length === 0) return null
  return value.length <= 2_048 ? value : undefined
}

function consentProofFromAuth(authObject: OAuthConsentAuthObject) {
  const reverificationId = authObject.sessionClaims?.reverification_id
  const factorAges = authObject.factorVerificationAge
  if (typeof reverificationId !== 'string'
    || reverificationId.trim().length === 0
    || reverificationId.length > 256
    || factorAges === null
    || factorAges.length !== 2
    || !factorAges.every((value) => Number.isSafeInteger(value) && value >= -1)) return null
  return {
    reverificationId,
    firstFactorAgeMinutes: factorAges[0],
    secondFactorAgeMinutes: factorAges[1],
  }
}

function positiveFormInteger(value: string | null): number | undefined {
  if (value === null || !/^[1-9][0-9]*$/u.test(value)) return undefined
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : undefined
}

function consentJson(body: Readonly<Record<string, unknown>>, status: number): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

function strictReverificationJson(): Response {
  const maintained = reverificationErrorResponse('strict')
  return new Response(maintained.body, {
    status: maintained.status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

function reservationJson(result: AgentAccessConsentReservationResult): Response {
  if (result.kind === 'rate_limited') {
    return consentJson({ kind: result.kind, retryAfter: result.retryAfter }, 429)
  }
  if (result.kind === 'unavailable') {
    return consentJson(result, 503)
  }
  if (result.kind === 'reserved' || result.kind === 'replayed') {
    return consentJson({ kind: 'conflict', code: 'invalid_state' }, 409)
  }
  return consentJson(result, result.kind === 'refused' ? 403 : 409)
}
