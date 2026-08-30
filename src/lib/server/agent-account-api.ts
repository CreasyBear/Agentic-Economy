import { bearerChallenge } from '@/lib/http/oauth-challenge'
import { gatewayFailureToProblem } from '@/lib/errors'
import {
  authenticateAgentAccess,
  resolveAgentAccessPrincipal,
  type AgentAccessAuthenticationOptions,
  type AgentAccessPrincipalResolver,
} from '@/lib/server/agent-access-auth'
import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import { response } from '@/lib/server/no-store-response'
import { problem } from '@/lib/server/problem'
import {
  runWithRequestCorrelation,
  withRequestCorrelationHeader,
} from '@/lib/server/request-correlation'
import {
  AGENT_ACCOUNT_SELF_ROUTE_CONTRACT,
  AGENT_ACCOUNT_MONEY_ROUTE_CONTRACTS,
  agentAccountActivityAction,
  agentAccountBalanceAction,
  agentAccountSelfAction,
  createAccountManagementService,
  type AccountManagementService,
} from '@/modules/agent-access/account.actions'

const MAX_ACCOUNT_ACTION_BODY_BYTES = 64 * 1024

const accountMoneyActions = Object.freeze({
  balance: agentAccountBalanceAction,
  activity: agentAccountActivityAction,
})

export type AgentAccountMoneyActionName = keyof typeof accountMoneyActions

export type AgentAccountHandlerOptions = Readonly<{
  authenticate?: AgentAccessAuthenticationOptions['authenticate']
  resolvePrincipal?: AgentAccessPrincipalResolver
  accountManagementService?: AccountManagementService
}>

/** HTTP adapter for the canonical current-agent account interface. */
export async function handleAgentAccountGet(
  request: Request,
  options: AgentAccountHandlerOptions = {},
): Promise<Response> {
  return await runWithRequestCorrelation(request, async ({ correlationId }) => {
    const resolvePrincipal = options.resolvePrincipal
      ?? (options.authenticate === undefined
        ? resolveAgentAccessPrincipal(request, '', correlationId)
        : undefined)
    const admitted = await authenticateAgentAccess({
      ...(options.authenticate === undefined ? {} : { authenticate: options.authenticate }),
      ...(resolvePrincipal === undefined ? {} : { resolvePrincipal }),
      requiredScope: null,
      requiredAnyScopes: AGENT_ACCOUNT_SELF_ROUTE_CONTRACT.anyScopes,
      consequenceResource: 'surface:http:account-self',
    })
    if (admitted.kind !== 'authenticated') {
      const failure = gatewayFailureToProblem({
        code: admitted.reason,
        kind: 'refused',
        retryable: false,
      })
      const challenge = bearerChallenge(resolveCanonicalBaseUrl(request).baseUrl)
      return withRequestCorrelationHeader(problem({
        ...failure,
        status: admitted.status,
        detail: admitted.reason === 'scope_required'
          ? 'The current agent credential is not an AE buyer or supplier profile.'
          : 'Connect an agent credential before inspecting the current account.',
      }, {
        Vary: 'Authorization',
        'WWW-Authenticate': challenge,
      }), correlationId)
    }

    const result = await agentAccountSelfAction.run({
      data: {},
      context: {
        caller: 'http',
        correlationId,
        agentAccessPrincipal: admitted.principal,
      },
    })
    return withRequestCorrelationHeader(response(result, 200, {
      'Content-Type': AGENT_ACCOUNT_SELF_ROUTE_CONTRACT.media.response,
    }), correlationId)
  })
}

/** Authenticated HTTP adapter for bounded account balance and activity reads. */
export async function handleAgentAccountActionPost(
  request: Request,
  actionName: AgentAccountMoneyActionName,
  options: AgentAccountHandlerOptions = {},
): Promise<Response> {
  return await runWithRequestCorrelation(request, async ({ correlationId }) => {
    const bounded = await readBoundedRequestText(request, MAX_ACCOUNT_ACTION_BODY_BYTES)
    if (!bounded.ok) {
      return withRequestCorrelationHeader(problem({
        status: 413,
        kind: 'PAYLOAD_TOO_LARGE',
        code: bounded.code,
        detail: 'The account action body is too large.',
      }), correlationId)
    }
    const resolvePrincipal = options.resolvePrincipal
      ?? (options.authenticate === undefined
        ? resolveAgentAccessPrincipal(request, bounded.text, correlationId)
        : undefined)
    const contract = AGENT_ACCOUNT_MONEY_ROUTE_CONTRACTS[actionName]
    const admitted = await authenticateAgentAccess({
      ...(options.authenticate === undefined ? {} : { authenticate: options.authenticate }),
      ...(resolvePrincipal === undefined ? {} : { resolvePrincipal }),
      requiredScope: contract.scope,
      consequenceResource: `surface:http:account-${actionName}`,
    })
    if (admitted.kind !== 'authenticated') {
      const failure = gatewayFailureToProblem({ code: admitted.reason, kind: 'refused', retryable: false })
      return withRequestCorrelationHeader(problem({
        ...failure,
        status: admitted.status,
        detail: admitted.reason === 'scope_required'
          ? 'The current agent credential does not grant buyer account reads.'
          : 'Connect a buyer agent credential before reading account money state.',
      }, {
        Vary: 'Authorization',
        'WWW-Authenticate': bearerChallenge(resolveCanonicalBaseUrl(request).baseUrl, contract.scope),
      }), correlationId)
    }
    let rawBody: unknown
    try {
      rawBody = JSON.parse(bounded.text) as unknown
    } catch {
      return withRequestCorrelationHeader(problem({
        status: 400,
        kind: 'INVALID_ARGUMENT',
        code: 'invalid_json',
        detail: 'The account action body must be valid JSON.',
      }), correlationId)
    }
    const action = accountMoneyActions[actionName]
    const parsed = action.schema.safeParse(rawBody)
    if (!parsed.success) {
      return withRequestCorrelationHeader(problem({
        status: 400,
        kind: 'INVALID_ARGUMENT',
        code: 'invalid_request',
        detail: `The request did not match ${action.invocationContract.version}.`,
      }), correlationId)
    }
    try {
      const context = {
        caller: 'http' as const,
        correlationId,
        agentAccessPrincipal: admitted.principal,
        accountManagementService: options.accountManagementService
          ?? createAccountManagementService(request, bounded.text),
      }
      const result = actionName === 'balance'
        ? await agentAccountBalanceAction.run({
            data: agentAccountBalanceAction.schema.parse(rawBody),
            context,
          })
        : await agentAccountActivityAction.run({
            data: agentAccountActivityAction.schema.parse(rawBody),
            context,
          })
      const projected = action.outputSchema.safeParse(result)
      if (!projected.success) throw new Error('agent_account_action_result_invalid')
      return withRequestCorrelationHeader(response(projected.data, 200, {
        'Content-Type': 'application/json; charset=utf-8',
      }), correlationId)
    } catch {
      const failure = gatewayFailureToProblem({ kind: 'error', code: 'source_unavailable', retryable: true })
      return withRequestCorrelationHeader(problem({
        ...failure,
        detail: 'The account money source is temporarily unavailable.',
      }), correlationId)
    }
  })
}
