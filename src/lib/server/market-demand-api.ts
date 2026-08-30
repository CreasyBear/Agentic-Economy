import { bearerChallenge } from '@/lib/http/oauth-challenge'
import { gatewayFailureToProblem } from '@/lib/errors'
import {
  authenticateAgentAccess,
  resolveAgentAccessPrincipal,
  type AgentAccessAuthenticationOptions,
  type AgentAccessPrincipalResolver,
} from '@/lib/server/agent-access-auth'
import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import { response } from '@/lib/server/no-store-response'
import { problem } from '@/lib/server/problem'
import { runWithRequestCorrelation, withRequestCorrelationHeader } from '@/lib/server/request-correlation'
import {
  MARKET_REQUEST_ROUTE_CONTRACTS,
  createMarketDemandService,
  marketRequestCreateAction,
  marketRequestListAction,
  marketRequestStatusAction,
  type MarketDemandService,
} from '@/modules/market-demand/market-demand.actions'

const MAX_MARKET_REQUEST_BODY_BYTES = 64 * 1024

const requestActions = Object.freeze({
  create: marketRequestCreateAction,
  list: marketRequestListAction,
  status: marketRequestStatusAction,
})

export type MarketRequestActionName = keyof typeof requestActions

export type MarketDemandHandlerOptions = Readonly<{
  authenticate?: AgentAccessAuthenticationOptions['authenticate']
  resolvePrincipal?: AgentAccessPrincipalResolver
  marketDemandService?: MarketDemandService
}>

/** Authenticated HTTP adapter for private, credential-owned market demand memory. */
export async function handleMarketRequestPost(
  request: Request,
  actionName: MarketRequestActionName,
  options: MarketDemandHandlerOptions = {},
): Promise<Response> {
  return await runWithRequestCorrelation(request, async ({ correlationId }) => {
    const bounded = await readBoundedRequestText(request, MAX_MARKET_REQUEST_BODY_BYTES)
    if (!bounded.ok) {
      return withRequestCorrelationHeader(problem({
        status: 413,
        kind: 'PAYLOAD_TOO_LARGE',
        code: bounded.code,
        detail: 'The market request body is too large.',
      }), correlationId)
    }
    const contract = MARKET_REQUEST_ROUTE_CONTRACTS[actionName]
    const resolvePrincipal = options.resolvePrincipal
      ?? (options.authenticate === undefined
        ? resolveAgentAccessPrincipal(request, bounded.text, correlationId)
        : undefined)
    const admitted = await authenticateAgentAccess({
      ...(options.authenticate === undefined ? {} : { authenticate: options.authenticate }),
      ...(resolvePrincipal === undefined ? {} : { resolvePrincipal }),
      requiredScope: contract.scope,
      consequenceResource: `surface:http:market-request-${actionName}`,
    })
    if (admitted.kind !== 'authenticated') {
      const failure = gatewayFailureToProblem({ code: admitted.reason, kind: 'refused', retryable: false })
      return withRequestCorrelationHeader(problem({
        ...failure,
        status: admitted.status,
        detail: admitted.reason === 'scope_required'
          ? 'The current agent credential does not grant buyer market access.'
          : 'Connect a buyer agent credential before using private market requests.',
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
        detail: 'The market request body must be valid JSON.',
      }), correlationId)
    }
    const action = requestActions[actionName]
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
        marketDemandService: options.marketDemandService
          ?? createMarketDemandService(request, bounded.text),
      }
      const result = actionName === 'create'
        ? await marketRequestCreateAction.run({ data: marketRequestCreateAction.schema.parse(rawBody), context })
        : actionName === 'list'
          ? await marketRequestListAction.run({ data: marketRequestListAction.schema.parse(rawBody), context })
          : await marketRequestStatusAction.run({ data: marketRequestStatusAction.schema.parse(rawBody), context })
      const projected = action.outputSchema.safeParse(result)
      if (!projected.success) throw new Error('market_request_action_result_invalid')
      return withRequestCorrelationHeader(response(projected.data, 200, {
        'Content-Type': 'application/json; charset=utf-8',
      }), correlationId)
    } catch {
      const failure = gatewayFailureToProblem({ kind: 'error', code: 'source_unavailable', retryable: true })
      return withRequestCorrelationHeader(problem({
        ...failure,
        detail: 'Private market request storage is temporarily unavailable.',
      }), correlationId)
    }
  })
}
