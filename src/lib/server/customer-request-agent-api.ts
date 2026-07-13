import { authenticateCustomerRequestAgent, type CustomerRequestAgentPrincipal } from '@/lib/server/customer-request-agent-auth'
import { handleCustomerOptionsPost } from '@/lib/server/customer-options-api'
import { handleCustomerRequestFactsPost, type FactsResult } from '@/lib/server/customer-request-facts-api'
import { handleCustomerRequestGet, type InspectResult } from '@/lib/server/customer-request-inspect-api'
import { handleCustomerRequestMessagePost, type MessageResult } from '@/lib/server/customer-request-messages-api'
import { handleCustomerRequestPost, type SubmitResult } from '@/lib/server/customer-request-api'
import type { CustomerOptionsProjection } from '@/modules/customer-request/customer-projection'
import { callPublicSourceAction, sourceAction } from '@/lib/server/convex-source'
import { createCustomerRequestServiceAssertion } from '@/modules/customer-request/service-auth-envelope'

type HandlerOptions = Readonly<{
  authenticate?: NonNullable<Parameters<typeof authenticateCustomerRequestAgent>[0]>['authenticate']
  callAction?: (name: string, args: Record<string, unknown>) => Promise<AgentActionResult>
  env?: Record<string, string | undefined>
  now?: () => number
}>

type AgentActionResult = SubmitResult | FactsResult | MessageResult | CustomerOptionsProjection | InspectResult

export async function handleAgentCustomerRequestPost(request: Request, options: HandlerOptions = {}): Promise<Response> {
  const admitted = await authenticateCustomerRequestAgent({ ...(options.authenticate === undefined ? {} : { authenticate: options.authenticate }) })
  if (admitted.kind === 'refused') return refusal(admitted.reason, admitted.status)
  return await handleCustomerRequestPost(request, {
    submit: async (args) => await callAsAgent('customerRequestApplication:submit', 'submit', {
      ...args, delegatedAgentId: admitted.principal.principalId,
    }, admitted.principal, options),
  })
}

export async function handleAgentCustomerRequestFactsPost(
  request: Request,
  requestRef: string,
  options: HandlerOptions = {},
): Promise<Response> {
  const admitted = await authenticateCustomerRequestAgent({ ...(options.authenticate === undefined ? {} : { authenticate: options.authenticate }) })
  if (admitted.kind === 'refused') return refusal(admitted.reason, admitted.status)
  return await handleCustomerRequestFactsPost(request, requestRef, {
    provideFacts: async (args) => await callAsAgent<FactsResult>('customerRequestApplication:provideFacts', 'facts', args, admitted.principal, options),
  })
}

export async function handleAgentCustomerRequestMessagePost(
  request: Request,
  requestRef: string,
  options: HandlerOptions = {},
): Promise<Response> {
  const admitted = await authenticateCustomerRequestAgent({ ...(options.authenticate === undefined ? {} : { authenticate: options.authenticate }) })
  if (admitted.kind === 'refused') return refusal(admitted.reason, admitted.status)
  return await handleCustomerRequestMessagePost(request, requestRef, {
    refine: async (args) => await callAsAgent<MessageResult>('customerRequestApplication:refine', 'refine', args, admitted.principal, options),
  })
}

export async function handleAgentCustomerOptionsPost(
  request: Request,
  requestRef: string,
  options: HandlerOptions = {},
): Promise<Response> {
  const admitted = await authenticateCustomerRequestAgent({ ...(options.authenticate === undefined ? {} : { authenticate: options.authenticate }) })
  if (admitted.kind === 'refused') return refusal(admitted.reason, admitted.status)
  return await handleCustomerOptionsPost(request, requestRef, {
    compare: async (args) => await callAsAgent<CustomerOptionsProjection>('customerRequestApplication:compare', 'compare', args, admitted.principal, options),
  })
}

export async function handleAgentCustomerRequestGet(requestRef: string, options: HandlerOptions = {}): Promise<Response> {
  const admitted = await authenticateCustomerRequestAgent({ ...(options.authenticate === undefined ? {} : { authenticate: options.authenticate }) })
  if (admitted.kind === 'refused') return refusal(admitted.reason, admitted.status)
  return await handleCustomerRequestGet(requestRef, {
    inspect: async (args) => await callAsAgent<InspectResult>('customerRequestApplication:resume', 'resume', args, admitted.principal, options),
  })
}

async function callAsAgent<Result = SubmitResult>(
  name: string,
  operation: 'submit' | 'facts' | 'refine' | 'compare' | 'resume',
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
