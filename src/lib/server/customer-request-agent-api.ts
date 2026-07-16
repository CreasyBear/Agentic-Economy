import { authenticateCustomerRequestAgent, type CustomerRequestAgentPrincipal } from '@/lib/server/customer-request-agent-auth'
import { handleCustomerOptionsPost } from '@/lib/server/customer-options-api'
import { handleCustomerRequestFactsPost, type FactsResult } from '@/lib/server/customer-request-facts-api'
import { handleCustomerRequestGet, type InspectResult } from '@/lib/server/customer-request-inspect-api'
import { handleCustomerRequestMessagePost, type MessageResult } from '@/lib/server/customer-request-messages-api'
import { handleCustomerRequestPost, type SubmitResult } from '@/lib/server/customer-request-api'
import {
  handleCustomerRequestConfirmationPost,
  type ConfirmationResult,
} from '@/lib/server/customer-request-confirmation-api'
import type { CustomerOptionsProjection } from '@/modules/customer-request/customer-projection'
import { callPublicSourceAction, sourceAction } from '@/lib/server/convex-source'
import { createCustomerRequestServiceAssertion } from '@/modules/customer-request/service-auth-envelope'
import type {
  CustomerRequestEvidenceResult,
  CustomerRequestProblemResult,
  CustomerRequestProblemStatusChange,
  CustomerRequestRepeatPermissionResult,
} from '@/modules/customer-request/agent-contract'
import { CUSTOMER_REQUEST_STANDING_AUTHORITY_SCOPE } from '@/modules/customer-request/agent-contract'
import {
  handleCustomerRequestCancelPost,
  handleCustomerRequestRunPost,
} from '@/lib/server/customer-request-route-action-api'
import {
  handleCustomerRequestRepeatPermissionAllowPost,
  handleCustomerRequestRepeatPermissionGet,
  handleCustomerRequestRepeatPermissionUsePost,
  handleCustomerRequestRepeatPermissionWithdrawPost,
} from '@/lib/server/customer-request-repeat-permission-api'
import {
  handleCustomerRequestEvidenceGet,
  handleCustomerRequestProblemPost,
  handleCustomerRequestProblemReplyPost,
} from '@/lib/server/customer-request-recovery-api'
import { withCustomerRequestAgentNavigation } from '@/modules/customer-request/agent-navigation'

type HandlerOptions = Readonly<{
  authenticate?: NonNullable<Parameters<typeof authenticateCustomerRequestAgent>[0]>['authenticate']
  callAction?: (name: string, args: Record<string, unknown>) => Promise<AgentActionResult>
  env?: Record<string, string | undefined>
  now?: () => number
}>

type AgentActionResult = SubmitResult | FactsResult | MessageResult | CustomerOptionsProjection | InspectResult | ConfirmationResult
  | CustomerRequestProblemResult | CustomerRequestProblemStatusChange | CustomerRequestEvidenceResult
  | CustomerRequestRepeatPermissionResult

export async function handleAgentCustomerRequestPost(request: Request, options: HandlerOptions = {}): Promise<Response> {
  const admitted = await authenticateCustomerRequestAgent({ ...(options.authenticate === undefined ? {} : { authenticate: options.authenticate }) })
  if (admitted.kind === 'refused') return refusal(admitted.reason, admitted.status)
  return await withCustomerRequestAgentNavigation(await handleCustomerRequestPost(request, {
    submit: async (args) => await callAsAgent('customerRequestApplication:submit', 'submit', {
      ...args, delegatedAgentId: admitted.principal.principalId,
    }, admitted.principal, options),
  }))
}

export async function handleAgentCustomerRequestFactsPost(
  request: Request,
  requestRef: string,
  options: HandlerOptions = {},
): Promise<Response> {
  const admitted = await authenticateCustomerRequestAgent({ ...(options.authenticate === undefined ? {} : { authenticate: options.authenticate }) })
  if (admitted.kind === 'refused') return refusal(admitted.reason, admitted.status)
  return await withCustomerRequestAgentNavigation(await handleCustomerRequestFactsPost(request, requestRef, {
    provideFacts: async (args) => await callAsAgent<FactsResult>('customerRequestApplication:provideFacts', 'facts', args, admitted.principal, options),
  }))
}

export async function handleAgentCustomerRequestMessagePost(
  request: Request,
  requestRef: string,
  options: HandlerOptions = {},
): Promise<Response> {
  const admitted = await authenticateCustomerRequestAgent({ ...(options.authenticate === undefined ? {} : { authenticate: options.authenticate }) })
  if (admitted.kind === 'refused') return refusal(admitted.reason, admitted.status)
  return await withCustomerRequestAgentNavigation(await handleCustomerRequestMessagePost(request, requestRef, {
    refine: async (args) => await callAsAgent<MessageResult>('customerRequestApplication:refine', 'refine', args, admitted.principal, options),
  }))
}

export async function handleAgentCustomerOptionsPost(
  request: Request,
  requestRef: string,
  options: HandlerOptions = {},
): Promise<Response> {
  const admitted = await authenticateCustomerRequestAgent({ ...(options.authenticate === undefined ? {} : { authenticate: options.authenticate }) })
  if (admitted.kind === 'refused') return refusal(admitted.reason, admitted.status)
  return await withCustomerRequestAgentNavigation(await handleCustomerOptionsPost(request, requestRef, {
    compare: async (args) => await callAsAgent<CustomerOptionsProjection>('customerRequestApplication:compare', 'compare', args, admitted.principal, options),
  }))
}

export async function handleAgentCustomerRequestConfirmationPost(
  request: Request,
  requestRef: string,
  options: HandlerOptions = {},
): Promise<Response> {
  const admitted = await authenticateCustomerRequestAgent({ ...(options.authenticate === undefined ? {} : { authenticate: options.authenticate }) })
  if (admitted.kind === 'refused') return refusal(admitted.reason, admitted.status)
  return await withCustomerRequestAgentNavigation(await handleCustomerRequestConfirmationPost(request, requestRef, {
    confirm: async (args) => await callAsAgent<ConfirmationResult>(
      'customerRequestApplication:confirmRoute', 'confirm', args, admitted.principal, options,
    ),
  }))
}

export async function handleAgentCustomerRequestRunPost(
  request: Request,
  requestRef: string,
  options: HandlerOptions = {},
): Promise<Response> {
  const admitted = await authenticateCustomerRequestAgent({ ...(options.authenticate === undefined ? {} : { authenticate: options.authenticate }) })
  if (admitted.kind === 'refused') return refusal(admitted.reason, admitted.status)
  return await withCustomerRequestAgentNavigation(await handleCustomerRequestRunPost(request, requestRef, {
    run: async (args) => await callAsAgent('customerRequestApplication:runRoute', 'run', args, admitted.principal, options),
  }))
}

export async function handleAgentCustomerRequestRepeatPermissionAllowPost(
  request: Request,
  requestRef: string,
  options: HandlerOptions = {},
): Promise<Response> {
  const admitted = await authenticateCustomerRequestAgent({
    ...(options.authenticate === undefined ? {} : { authenticate: options.authenticate }),
  })
  if (admitted.kind === 'refused') return refusal(admitted.reason, admitted.status)
  if (!admitted.principal.scopes.includes(CUSTOMER_REQUEST_STANDING_AUTHORITY_SCOPE)) {
    return refusal('scope_required', 403)
  }
  return await handleCustomerRequestRepeatPermissionAllowPost(request, requestRef, {
    allow: async (args) => await callAsAgent<CustomerRequestRepeatPermissionResult>(
      'customerRequestApplication:allowRepeatRoute',
      'allow_repeat',
      args,
      admitted.principal,
      options,
    ),
  })
}

export async function handleAgentCustomerRequestRepeatPermissionUsePost(
  request: Request,
  requestRef: string,
  permissionRef: string,
  options: HandlerOptions = {},
): Promise<Response> {
  const admitted = await authenticateCustomerRequestAgent({
    ...(options.authenticate === undefined ? {} : { authenticate: options.authenticate }),
  })
  if (admitted.kind === 'refused') return refusal(admitted.reason, admitted.status)
  if (!admitted.principal.scopes.includes(CUSTOMER_REQUEST_STANDING_AUTHORITY_SCOPE)) {
    return refusal('scope_required', 403)
  }
  return await withCustomerRequestAgentNavigation(
    await handleCustomerRequestRepeatPermissionUsePost(request, requestRef, permissionRef, {
      use: async (args) => await callAsAgent(
        'customerRequestApplication:useRepeatRoute',
        'use_repeat',
        args,
        admitted.principal,
        options,
      ),
    }),
  )
}

export async function handleAgentCustomerRequestRepeatPermissionGet(
  request: Request,
  requestRef: string,
  permissionRef: string,
  options: HandlerOptions = {},
): Promise<Response> {
  const admitted = await authenticateCustomerRequestAgent({
    ...(options.authenticate === undefined ? {} : { authenticate: options.authenticate }),
  })
  if (admitted.kind === 'refused') return refusal(admitted.reason, admitted.status)
  if (!admitted.principal.scopes.includes(CUSTOMER_REQUEST_STANDING_AUTHORITY_SCOPE)) {
    return refusal('scope_required', 403)
  }
  return await handleCustomerRequestRepeatPermissionGet(request, requestRef, permissionRef, {
    inspect: async (args) => await callAsAgent<CustomerRequestRepeatPermissionResult>(
      'customerRequestApplication:inspectRepeatRoute',
      'inspect_repeat',
      args,
      admitted.principal,
      options,
    ),
  })
}

export async function handleAgentCustomerRequestRepeatPermissionWithdrawPost(
  request: Request,
  requestRef: string,
  permissionRef: string,
  options: HandlerOptions = {},
): Promise<Response> {
  const admitted = await authenticateCustomerRequestAgent({
    ...(options.authenticate === undefined ? {} : { authenticate: options.authenticate }),
  })
  if (admitted.kind === 'refused') return refusal(admitted.reason, admitted.status)
  if (!admitted.principal.scopes.includes(CUSTOMER_REQUEST_STANDING_AUTHORITY_SCOPE)) {
    return refusal('scope_required', 403)
  }
  return await handleCustomerRequestRepeatPermissionWithdrawPost(request, requestRef, permissionRef, {
    withdraw: async (args) => await callAsAgent<CustomerRequestRepeatPermissionResult>(
      'customerRequestApplication:revokeRepeatRoute',
      'revoke_repeat',
      args,
      admitted.principal,
      options,
    ),
  })
}

export async function handleAgentCustomerRequestCancelPost(
  request: Request,
  requestRef: string,
  options: HandlerOptions = {},
): Promise<Response> {
  const admitted = await authenticateCustomerRequestAgent({ ...(options.authenticate === undefined ? {} : { authenticate: options.authenticate }) })
  if (admitted.kind === 'refused') return refusal(admitted.reason, admitted.status)
  return await withCustomerRequestAgentNavigation(await handleCustomerRequestCancelPost(request, requestRef, {
    cancel: async (args) => await callAsAgent('customerRequestApplication:cancelRoute', 'cancel', args, admitted.principal, options),
  }))
}

export async function handleAgentCustomerRequestProblemPost(
  request: Request,
  requestRef: string,
  options: HandlerOptions = {},
): Promise<Response> {
  const admitted = await authenticateCustomerRequestAgent({ ...(options.authenticate === undefined ? {} : { authenticate: options.authenticate }) })
  if (admitted.kind === 'refused') return refusal(admitted.reason, admitted.status)
  return await handleCustomerRequestProblemPost(request, requestRef, {
    report: async (args) => await callAsAgent('customerRequestApplication:reportRouteProblem', 'report', args, admitted.principal, options),
  })
}

export async function handleAgentCustomerRequestProblemReplyPost(
  request: Request,
  requestRef: string,
  reportRef: string,
  options: HandlerOptions = {},
): Promise<Response> {
  const admitted = await authenticateCustomerRequestAgent({
    ...(options.authenticate === undefined ? {} : { authenticate: options.authenticate }),
  })
  if (admitted.kind === 'refused') return refusal(admitted.reason, admitted.status)
  return await handleCustomerRequestProblemReplyPost(request, requestRef, reportRef, {
    reply: async (args) => await callAsAgent(
      'customerRequestApplication:replyRouteProblem',
      'reply',
      args,
      admitted.principal,
      options,
    ),
  })
}

export async function handleAgentCustomerRequestEvidenceGet(
  request: Request,
  requestRef: string,
  options: HandlerOptions = {},
): Promise<Response> {
  const admitted = await authenticateCustomerRequestAgent({ ...(options.authenticate === undefined ? {} : { authenticate: options.authenticate }) })
  if (admitted.kind === 'refused') return refusal(admitted.reason, admitted.status)
  return await handleCustomerRequestEvidenceGet(request, requestRef, {
    inspect: async (args) => await callAsAgent('customerRequestApplication:exportRouteEvidence', 'evidence', args, admitted.principal, options),
  })
}

export async function handleAgentCustomerRequestGet(requestRef: string, options: HandlerOptions = {}): Promise<Response> {
  const admitted = await authenticateCustomerRequestAgent({ ...(options.authenticate === undefined ? {} : { authenticate: options.authenticate }) })
  if (admitted.kind === 'refused') return refusal(admitted.reason, admitted.status)
  return await withCustomerRequestAgentNavigation(await handleCustomerRequestGet(requestRef, {
    inspect: async (args) => await callAsAgent<InspectResult>('customerRequestApplication:resume', 'resume', args, admitted.principal, options),
  }))
}

async function callAsAgent<Result = SubmitResult>(
  name: string,
  operation: 'submit' | 'facts' | 'refine' | 'compare' | 'confirm' | 'run' | 'cancel' | 'report' | 'reply'
    | 'evidence' | 'resume' | 'allow_repeat' | 'use_repeat' | 'inspect_repeat' | 'revoke_repeat',
  command: Record<string, unknown>,
  principal: CustomerRequestAgentPrincipal,
  options: HandlerOptions,
): Promise<Result> {
  const key = (options.env ?? process.env).AE_CONVEX_SERVER_FUNCTION_TOKEN?.trim()
  if (key === undefined || key.length < 32) throw new Error('customer_request_service_auth_unavailable')
  const serviceAuth = await createCustomerRequestServiceAssertion({
    key, operation, command: command as never, principal, issuedAt: (options.now ?? Date.now)(),
  })
  const args = { ...command, serviceAuth }
  if (options.callAction !== undefined) return await options.callAction(name, args) as Result
  return await callPublicSourceAction(sourceAction<Record<string, unknown>, Result>(name), args)
}

function refusal(reason: string, status: 401 | 403): Response {
  return Response.json({ kind: 'refused', reason }, { status, headers: { 'Cache-Control': 'no-store' } })
}
