import { gatewayFailureToProblem } from '@/lib/errors'
import { bearerChallenge } from '@/lib/http/oauth-challenge'
import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import {
  authenticateAgentAccess,
  resolveAgentAccessPrincipal,
  type AgentAccessAuthenticationOptions,
  type AgentAccessPrincipalResolver,
} from '@/lib/server/agent-access-auth'
import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import { response } from '@/lib/server/no-store-response'
import { problem } from '@/lib/server/problem'
import {
  runWithRequestCorrelation,
  withRequestCorrelationHeader,
} from '@/lib/server/request-correlation'
import type { AnyAction } from '@/modules/actions'
import {
  createSupplyManagementService,
  SUPPLY_ACTION_ROUTE_CONTRACTS,
  supplyConnectionConnectAction,
  supplyConnectionDetailAction,
  supplyConnectionListAction,
  supplyConnectionReconnectAction,
  supplyConnectionRetryCleanupAction,
  supplyConnectionRevokeAction,
  supplyEarningsAction,
  supplyPublishAction,
  supplyRecheckAction,
  supplyRepublishAction,
  supplyStatusAction,
  supplyWithdrawAction,
  type SupplyManagementService,
} from '@/modules/capability-supply/supply-actions'

const MAX_SUPPLY_ACTION_BODY_BYTES = 320 * 1024

export const SUPPLY_HTTP_ACTIONS = Object.freeze({
  status: supplyStatusAction,
  publish: supplyPublishAction,
  withdraw: supplyWithdrawAction,
  recheck: supplyRecheckAction,
  republish: supplyRepublishAction,
  earnings: supplyEarningsAction,
  connectionList: supplyConnectionListAction,
  connectionDetail: supplyConnectionDetailAction,
  connectionConnect: supplyConnectionConnectAction,
  connectionReconnect: supplyConnectionReconnectAction,
  connectionRevoke: supplyConnectionRevokeAction,
  connectionRetryCleanup: supplyConnectionRetryCleanupAction,
})

export type SupplyHttpActionName = keyof typeof SUPPLY_HTTP_ACTIONS

function supplyActionConsequenceResource(actionName: SupplyHttpActionName): string {
  const canonicalActionName = actionName.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`)
  return `surface:http:supply-${canonicalActionName}`
}

export type SupplyActionHandlerOptions = Readonly<{
  authenticate?: AgentAccessAuthenticationOptions['authenticate']
  resolvePrincipal?: AgentAccessPrincipalResolver
  supplyManagementService?: SupplyManagementService
}>

function authenticationFailure(request: Request, reason: string, status: number, correlationId: string): Response {
  const scope = SUPPLY_ACTION_ROUTE_CONTRACTS.status.scope
  const failure = gatewayFailureToProblem({ code: reason, kind: 'refused', retryable: false })
  return withRequestCorrelationHeader(problem({
    ...failure,
    status,
    detail: reason === 'scope_required'
      ? `The current agent credential does not grant ${scope}.`
      : 'Connect an owner-issued supplier credential before managing supplier Operations.',
  }, {
    Vary: 'Authorization',
    'WWW-Authenticate': bearerChallenge(resolveCanonicalBaseUrl(request).baseUrl, scope),
  }), correlationId)
}

/** Canonical authenticated HTTP adapter for every supplier action contract. */
export async function handleSupplyActionPost(
  request: Request,
  actionName: SupplyHttpActionName,
  options: SupplyActionHandlerOptions = {},
): Promise<Response> {
  return await runWithRequestCorrelation(request, async ({ correlationId }) => {
    const bounded = await readBoundedRequestText(request, MAX_SUPPLY_ACTION_BODY_BYTES)
    if (!bounded.ok) {
      return withRequestCorrelationHeader(problem({
        status: 413,
        kind: 'PAYLOAD_TOO_LARGE',
        code: bounded.code,
        detail: 'The supplier action body is too large.',
      }), correlationId)
    }

    const resolvePrincipal = options.resolvePrincipal
      ?? (options.authenticate === undefined
        ? resolveAgentAccessPrincipal(request, bounded.text, correlationId)
        : undefined)
    const admitted = await authenticateAgentAccess({
      ...(options.authenticate === undefined ? {} : { authenticate: options.authenticate }),
      ...(resolvePrincipal === undefined ? {} : { resolvePrincipal }),
      requiredScope: SUPPLY_ACTION_ROUTE_CONTRACTS[actionName].scope,
      consequenceResource: supplyActionConsequenceResource(actionName),
    })
    if (admitted.kind !== 'authenticated') {
      return authenticationFailure(request, admitted.reason, admitted.status, correlationId)
    }

    let rawBody: unknown
    try {
      rawBody = JSON.parse(bounded.text) as unknown
    } catch {
      return withRequestCorrelationHeader(problem({
        status: 400,
        kind: 'INVALID_ARGUMENT',
        code: 'invalid_json',
        detail: 'The supplier action body must be valid JSON.',
      }), correlationId)
    }

    const action: AnyAction = SUPPLY_HTTP_ACTIONS[actionName]
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
      const service = options.supplyManagementService
        ?? createSupplyManagementService(request, bounded.text)
      const result = await action.run({
        data: parsed.data,
        context: {
          caller: 'http',
          correlationId,
          agentAccessPrincipal: admitted.principal,
          supplyManagementService: service,
        },
      })
      const projected = action.outputSchema.safeParse(result)
      if (!projected.success) throw new Error('supply_action_result_invalid')
      return withRequestCorrelationHeader(response(projected.data, 200, {
        'Content-Type': 'application/json; charset=utf-8',
      }), correlationId)
    } catch {
      const failure = gatewayFailureToProblem({ kind: 'error', code: 'source_unavailable', retryable: true })
      return withRequestCorrelationHeader(problem({
        ...failure,
        detail: 'The supplier Operation source is temporarily unavailable.',
      }), correlationId)
    }
  })
}
