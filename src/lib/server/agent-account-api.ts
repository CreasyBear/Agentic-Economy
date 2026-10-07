import { z } from 'zod'

import { gatewayFailureToProblem } from '@/lib/errors'
import { degrade } from '@/lib/observability/degrade'
import {
  authRefusalProblem,
  authenticateAgentAccess,
  resolveAgentAccessPrincipal,
  type AgentAccessAuthenticationOptions,
  type AgentAccessPrincipalResolver,
} from '@/lib/server/agent-access-auth'
import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import { response } from '@/lib/server/no-store-response'
import { duplicateQueryParameterProblem, problem } from '@/lib/server/problem'
import { withHttpRateLimit } from '@/lib/server/rate-limit'
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

const accountGetQuerySchema = z.strictObject({})

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
    return withRequestCorrelationHeader(await withHttpRateLimit(request, 'public-read', async () => {
    const url = new URL(request.url)
    const duplicate = duplicateQueryParameterProblem(url)
    if (duplicate !== undefined) return duplicate
    if (!accountGetQuerySchema.safeParse(Object.fromEntries(url.searchParams)).success) {
      return problem({ status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_query_parameter', detail: 'Current-account inspection does not accept query parameters.' })
    }
    const resolvePrincipal = options.resolvePrincipal
      ?? (options.authenticate === undefined
        ? resolveAgentAccessPrincipal(request, '', correlationId)
        : undefined)
    const admitted = await authenticateAgentAccess({
      request,
      ...(options.authenticate === undefined ? {} : { authenticate: options.authenticate }),
      ...(resolvePrincipal === undefined ? {} : { resolvePrincipal }),
      requiredScope: null,
      requiredAnyScopes: AGENT_ACCOUNT_SELF_ROUTE_CONTRACT.anyScopes,
      consequenceResource: 'surface:http:account-self',
    })
    if (admitted.kind !== 'authenticated') {
      return authRefusalProblem(request, admitted, undefined, undefined, correlationId)
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
    return withRequestCorrelationHeader(await withHttpRateLimit(request, 'public-mutation', async () => {
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
      request,
      ...(options.authenticate === undefined ? {} : { authenticate: options.authenticate }),
      ...(resolvePrincipal === undefined ? {} : { resolvePrincipal }),
      requiredScope: contract.scope,
      consequenceResource: `surface:http:account-${actionName}`,
    })
    if (admitted.kind !== 'authenticated') {
      return authRefusalProblem(request, admitted, contract.scope, undefined, correlationId)
    }
    let rawBody: unknown
    try {
      rawBody = JSON.parse(bounded.text) as unknown
    } catch (cause) {
      return degrade(cause, withRequestCorrelationHeader(problem({
        status: 400,
        kind: 'INVALID_ARGUMENT',
        code: 'invalid_json',
        detail: 'The account action body must be valid JSON.',
      }), correlationId), { site: 'handleAgentAccountActionPost', reason: 'invalid_response' })
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
    } catch (cause) {
      const failure = gatewayFailureToProblem({ kind: 'error', code: 'source_unavailable', retryable: true })
      return degrade(cause, withRequestCorrelationHeader(problem({
        ...failure,
        detail: 'The account money source is temporarily unavailable.',
      }), correlationId), { site: 'handleAgentAccountActionPost', reason: 'source_unavailable' })
    }
    }), correlationId)
  })
}
