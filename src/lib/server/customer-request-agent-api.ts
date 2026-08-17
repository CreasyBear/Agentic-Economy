import { authenticateAgentAccess, resolveAgentAccessPrincipal, type AgentAccessPrincipal } from '@/lib/server/agent-access-auth'
import { handleCustomerOptionsPost } from '@/lib/server/customer-options-api'
import { handleCustomerRequestFactsPost, type FactsResult } from '@/lib/server/customer-request-facts-api'
import { handleCustomerRequestGet, type InspectResult } from '@/lib/server/customer-request-inspect-api'
import { handleCustomerRequestMessagePost, type MessageResult } from '@/lib/server/customer-request-messages-api'
import { handleCustomerRequestPost, type SubmitResult } from '@/lib/server/customer-request-api'
import {
  handleCustomerRequestConfirmationPost,
  type ConfirmationResult,
} from '@/lib/server/customer-request-confirmation-api'
import type { CustomerRequestProjection } from '@/modules/customer-request/customer-projection'
import { callPublicSourceAction, sourceAction } from '@/lib/server/convex-source'
import { bearerChallenge } from '@/lib/http/oauth-challenge'
import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import { problem } from '@/lib/server/problem'
import { readRequestCorrelationId } from '@/lib/server/request-correlation'
import type {
  CustomerRequestEvidenceResult,
  CustomerRequestConnectedAssistantsResult,
  CustomerRequestProblemResult,
  CustomerRequestProblemStatusChange,
  CustomerRequestRepeatPermissionResult,
} from '@/modules/customer-request/agent-contract'
import {
  CUSTOMER_REQUEST_AGENT_SCOPE,
  customerRequestScopeForMode,
  type CustomerRequestAuthorityMode,
} from '@/modules/customer-request/agent-contract'
import {
  handleCustomerRequestCancelPost,
  handleCustomerRequestRunPost,
} from '@/lib/server/customer-request-route-action-api'
import {
  handleCustomerRequestRepeatPermissionAllowPost,
  handleCustomerRequestConnectedAssistantsGet,
  handleCustomerRequestRepeatPermissionGet,
  handleCustomerRequestRepeatPermissionUsePost,
  handleCustomerRequestRepeatPermissionWithdrawPost,
} from '@/lib/server/customer-request-repeat-permission-api'
import {
  handleCustomerRequestEvidenceGet,
  handleCustomerRequestProblemPost,
  handleCustomerRequestProblemReplyPost,
} from '@/lib/server/customer-request-recovery-api'
import { createCustomerRequestServiceAssertion, toStableHashValue } from '@/modules/agent-access/service-auth-envelope'
import { withCustomerRequestAgentNavigation } from '@/modules/customer-request/agent-navigation'

type HandlerOptions = Readonly<{
  authenticate?: NonNullable<Parameters<typeof authenticateAgentAccess>[0]>['authenticate']
  resolvePrincipal?: NonNullable<Parameters<typeof authenticateAgentAccess>[0]>['resolvePrincipal']
  callAction?: (name: string, args: Record<string, unknown>) => Promise<AgentActionResult>
  env?: Record<string, string | undefined>
  now?: () => number
}>

type AgentActionResult = SubmitResult | FactsResult | MessageResult | CustomerRequestProjection | InspectResult | ConfirmationResult
  | CustomerRequestProblemResult | CustomerRequestProblemStatusChange | CustomerRequestEvidenceResult
  | CustomerRequestRepeatPermissionResult
  | CustomerRequestConnectedAssistantsResult
export async function handleAgentCustomerRequestPost(request: Request, options: HandlerOptions = {}): Promise<Response> {
  return await withCustomerRequestAgentAuth(request, options, undefined, async (principal) =>
    withCustomerRequestAgentNavigation(await handleCustomerRequestPost(request, {
      submit: async (args) => await callAsAgent('customerRequestApplication:submit', 'submit', {
        ...args, delegatedAgentId: principal.principalId,
      }, principal, options),
    })))
}

export async function handleAgentCustomerRequestFactsPost(
  request: Request,
  requestRef: string,
  options: HandlerOptions = {},
): Promise<Response> {
  return await withCustomerRequestAgentAuth(request, options, undefined, async (principal) =>
    withCustomerRequestAgentNavigation(await handleCustomerRequestFactsPost(request, requestRef, {
      provideFacts: async (args) => await callAsAgent<FactsResult>('customerRequestApplication:provideFacts', 'facts', args, principal, options),
    })))
}

export async function handleAgentCustomerRequestMessagePost(
  request: Request,
  requestRef: string,
  options: HandlerOptions = {},
): Promise<Response> {
  return await withCustomerRequestAgentAuth(request, options, undefined, async (principal) =>
    withCustomerRequestAgentNavigation(await handleCustomerRequestMessagePost(request, requestRef, {
      refine: async (args) => await callAsAgent<MessageResult>('customerRequestApplication:refine', 'refine', args, principal, options),
    })))
}

export async function handleAgentCustomerOptionsPost(
  request: Request,
  requestRef: string,
  options: HandlerOptions = {},
): Promise<Response> {
  return await withCustomerRequestAgentAuth(request, options, undefined, async (principal) =>
    withCustomerRequestAgentNavigation(await handleCustomerOptionsPost(request, requestRef, {
      compare: async (args) => await callAsAgent<CustomerRequestProjection>('customerRequestApplication:compare', 'compare', args, principal, options),
    })))
}

export async function handleAgentCustomerRequestConfirmationPost(
  request: Request,
  requestRef: string,
  options: HandlerOptions = {},
): Promise<Response> {
  return await withCustomerRequestAgentAuth(request, options, 'approve_each', async (principal) =>
    withCustomerRequestAgentNavigation(await handleCustomerRequestConfirmationPost(request, requestRef, {
      confirm: async (args) => await callAsAgent<ConfirmationResult>(
        'customerRequestApplication:confirmRoute', 'confirm', args, principal, options,
      ),
    })))
}

export async function handleAgentCustomerRequestRunPost(
  request: Request,
  requestRef: string,
  options: HandlerOptions = {},
): Promise<Response> {
  return await withCustomerRequestAgentAuth(request, options, 'approve_each', async (principal) =>
    withCustomerRequestAgentNavigation(await handleCustomerRequestRunPost(request, requestRef, {
      run: async (args) => await callAsAgent('customerRequestApplication:runRoute', 'run', args, principal, options),
    })))
}

export async function handleAgentCustomerRequestRepeatPermissionAllowPost(
  request: Request,
  requestRef: string,
  options: HandlerOptions = {},
): Promise<Response> {
  return await withCustomerRequestAgentAuth(request, options, 'bounded_mandate', (principal) =>
    handleCustomerRequestRepeatPermissionAllowPost(request, requestRef, {
      allow: async (args) => await callAsAgent<CustomerRequestRepeatPermissionResult>(
        'customerRequestApplication:allowRepeatRoute',
        'allow_repeat',
        args,
        principal,
        options,
      ),
    }))
}

export async function handleAgentCustomerRequestRepeatPermissionsGet(
  request: Request,
  requestRef: string,
  options: HandlerOptions = {},
): Promise<Response> {
  return await withCustomerRequestAgentAuth(request, options, 'bounded_mandate', (principal) =>
    handleCustomerRequestConnectedAssistantsGet(request, requestRef, {
      list: async (args) => await callAsAgent<CustomerRequestConnectedAssistantsResult>(
        'customerRequestApplication:listRepeatPermissionAssistants',
        'inspect_repeat',
        args,
        principal,
        options,
      ),
    }))
}

export async function handleAgentCustomerRequestRepeatPermissionUsePost(
  request: Request,
  requestRef: string,
  permissionRef: string,
  options: HandlerOptions = {},
): Promise<Response> {
  return await withCustomerRequestAgentAuth(request, options, 'bounded_mandate', async (principal) =>
    withCustomerRequestAgentNavigation(
      await handleCustomerRequestRepeatPermissionUsePost(request, requestRef, permissionRef, {
        use: async (args) => await callAsAgent(
          'customerRequestApplication:useRepeatRoute',
          'use_repeat',
          args,
          principal,
          options,
        ),
      }),
    ))
}

export async function handleAgentCustomerRequestRepeatPermissionGet(
  request: Request,
  requestRef: string,
  permissionRef: string,
  options: HandlerOptions = {},
): Promise<Response> {
  return await withCustomerRequestAgentAuth(request, options, 'bounded_mandate', (principal) =>
    handleCustomerRequestRepeatPermissionGet(request, requestRef, permissionRef, {
      inspect: async (args) => await callAsAgent<CustomerRequestRepeatPermissionResult>(
        'customerRequestApplication:inspectRepeatRoute',
        'inspect_repeat',
        args,
        principal,
        options,
      ),
    }))
}

export async function handleAgentCustomerRequestRepeatPermissionWithdrawPost(
  request: Request,
  requestRef: string,
  permissionRef: string,
  options: HandlerOptions = {},
): Promise<Response> {
  return await withCustomerRequestAgentAuth(request, options, 'bounded_mandate', (principal) =>
    handleCustomerRequestRepeatPermissionWithdrawPost(request, requestRef, permissionRef, {
      withdraw: async (args) => await callAsAgent<CustomerRequestRepeatPermissionResult>(
        'customerRequestApplication:revokeRepeatRoute',
        'revoke_repeat',
        args,
        principal,
        options,
      ),
    }))
}

export async function handleAgentCustomerRequestCancelPost(
  request: Request,
  requestRef: string,
  options: HandlerOptions = {},
): Promise<Response> {
  return await withCustomerRequestAgentAuth(request, options, undefined, async (principal) =>
    withCustomerRequestAgentNavigation(await handleCustomerRequestCancelPost(request, requestRef, {
      cancel: async (args) => await callAsAgent('customerRequestApplication:cancelRoute', 'cancel', args, principal, options),
    })))
}

export async function handleAgentCustomerRequestProblemPost(
  request: Request,
  requestRef: string,
  options: HandlerOptions = {},
): Promise<Response> {
  return await withCustomerRequestAgentAuth(request, options, undefined, (principal) =>
    handleCustomerRequestProblemPost(request, requestRef, {
      report: async (args) => await callAsAgent('customerRequestApplication:reportRouteProblem', 'report', args, principal, options),
    }))
}

export async function handleAgentCustomerRequestProblemReplyPost(
  request: Request,
  requestRef: string,
  reportRef: string,
  options: HandlerOptions = {},
): Promise<Response> {
  return await withCustomerRequestAgentAuth(request, options, undefined, (principal) =>
    handleCustomerRequestProblemReplyPost(request, requestRef, reportRef, {
      reply: async (args) => await callAsAgent(
        'customerRequestApplication:replyRouteProblem',
        'reply',
        args,
        principal,
        options,
      ),
    }))
}

export async function handleAgentCustomerRequestEvidenceGet(
  request: Request,
  requestRef: string,
  options: HandlerOptions = {},
): Promise<Response> {
  return await withCustomerRequestAgentAuth(request, options, undefined, (principal) =>
    handleCustomerRequestEvidenceGet(request, requestRef, {
      inspect: async (args) => await callAsAgent('customerRequestApplication:exportRouteEvidence', 'evidence', args, principal, options),
    }))
}

export async function handleAgentCustomerRequestGet(
  request: Request,
  requestRef: string,
  options: HandlerOptions = {},
): Promise<Response> {
  return await withCustomerRequestAgentAuth(request, options, undefined, async (principal) =>
    withCustomerRequestAgentNavigation(await handleCustomerRequestGet(requestRef, {
      inspect: async (args) => await callAsAgent<InspectResult>('customerRequestApplication:resume', 'resume', args, principal, options),
    })))
}

async function withCustomerRequestAgentAuth(
  request: Request,
  options: HandlerOptions,
  requiredMode: CustomerRequestAuthorityMode | undefined,
  handler: (principal: AgentAccessPrincipal) => Promise<Response>,
): Promise<Response> {
  const body = request.body === null ? '' : await request.clone().text()
  const resolvePrincipal = options.resolvePrincipal
    ?? (options.authenticate === undefined
      ? resolveAgentAccessPrincipal(
          request,
          body,
          readRequestCorrelationId(request),
          options.env === undefined ? {} : { env: options.env },
        )
      : undefined)
  const admitted = await authenticateAgentAccess({
    requiredScope: CUSTOMER_REQUEST_AGENT_SCOPE,
    ...(options.authenticate === undefined ? {} : { authenticate: options.authenticate }),
    ...(resolvePrincipal === undefined ? {} : { resolvePrincipal }),
    ...(requiredMode === undefined ? {} : { requiredMode }),
  })
  if (admitted.kind === 'refused') return refusal(admitted.reason, admitted.status, requiredMode, request)
  return await handler(admitted.principal)
}

async function callAsAgent<Result = SubmitResult>(
  name: string,
  operation: 'submit' | 'facts' | 'refine' | 'compare' | 'confirm' | 'run' | 'cancel' | 'report' | 'reply'
    | 'evidence' | 'resume' | 'allow_repeat' | 'use_repeat' | 'inspect_repeat' | 'revoke_repeat',
  command: Record<string, unknown>,
  principal: AgentAccessPrincipal,
  options: HandlerOptions,
): Promise<Result> {
  const key = (options.env ?? process.env).AE_CONVEX_SERVER_FUNCTION_TOKEN?.trim()
  if (key === undefined || key.length < 32) throw new Error('customer_request_service_auth_unavailable')
  const serviceAuth = await createCustomerRequestServiceAssertion({
    key, operation, command: toStableHashValue(command), principal, issuedAt: (options.now ?? Date.now)(),
  })
  const args = { ...command, serviceAuth }
  if (options.callAction !== undefined) return await options.callAction(name, args) as Result
  return await callPublicSourceAction(sourceAction<Record<string, unknown>, Result>(name), args)
}

function refusal(
  reason: string,
  status: 401 | 403,
  requiredMode?: CustomerRequestAuthorityMode,
  request?: Request,
): Response {
  const base = resolveCanonicalBaseUrl(request).baseUrl
  const challenge = requiredMode === undefined ? bearerChallenge(base) : bearerChallenge(base, customerRequestScopeForMode(requiredMode))
  return problem(
    { status, kind: status === 401 ? 'UNAUTHENTICATED' : 'PERMISSION_DENIED', code: reason, detail: reason },
    { 'WWW-Authenticate': challenge, 'Vary': 'Authorization' },
  )
}
