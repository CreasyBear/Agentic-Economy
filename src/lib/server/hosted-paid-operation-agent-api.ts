import {
  authenticateHostedPaidOperationAgent,
  type HostedPaidOperationAgentPrincipal,
} from '@/lib/server/hosted-paid-operation-agent-auth'
import {
  noStore,
  parseHostedPaidOperationCommand,
  parseHostedPaidOperationSetup,
  projectHostedPaidOperation,
  type HostedPaidOperationCreationGateway,
  type HostedPaidOperationTransportGateway,
} from '@/lib/server/hosted-paid-operation-human-api'

type AgentAuthResult =
  | Readonly<{ kind: 'authenticated'; principal: HostedPaidOperationAgentPrincipal }>
  | Readonly<{
      kind: 'refused'
      status: 401 | 403
      reason: 'authentication_required' | 'scope_required'
    }>

type AgentHandlerOptions = Readonly<{
  authenticate?: () => Promise<AgentAuthResult>
  gateway: HostedPaidOperationTransportGateway
  provenance: string
  currentVersion?: (
    invocationRef: string,
    actor: HostedPaidOperationAgentPrincipal['actor'],
  ) => Promise<number | undefined>
  requestId?: () => string
}>

type AgentCreationOptions = Readonly<{
  authenticate?: () => Promise<AgentAuthResult>
  creation: HostedPaidOperationCreationGateway
}>

export async function handleHostedPaidOperationAgentCreate(
  request: Request,
  options: AgentCreationOptions,
): Promise<Response> {
  const admitted = await admit(options)
  if (admitted.kind === 'refused') return authRefusal(admitted)
  const setup = await parseHostedPaidOperationSetup(request)
  if (setup === undefined) {
    return noStore({ kind: 'refused', code: 'invalid_setup_input', issues: ['providerKey'] }, 422)
  }
  const result = await options.creation.create({ actor: admitted.principal.actor, setup })
  if (result.kind === 'refused') {
    const status = result.code === 'setup_shape_invalid' ? 422 : 403
    return noStore(result, status)
  }
  return noStore({
    ...result,
    relation: {
      inspect: `/api/v1/paid-operations/${encodeURIComponent(result.invocationRef)}?expectedInvocationVersion=${result.expectedInvocationVersion}`,
    },
  }, 201)
}

export async function handleHostedPaidOperationAgentInspect(
  invocationRef: string,
  expectedInvocationVersion: number,
  options: AgentHandlerOptions,
): Promise<Response> {
  const admitted = await admit(options)
  if (admitted.kind === 'refused') return authRefusal(admitted)
  try {
    const result = await options.gateway.inspect({
      actor: admitted.principal.actor,
      invocationRef,
      expectedInvocationVersion,
    })
    return await agentResult(
      result,
      invocationRef,
      expectedInvocationVersion,
      admitted.principal,
      options,
    )
  } catch {
    return noStore({ kind: 'refused', code: 'hosted_read_unavailable' }, 503)
  }
}

export async function handleHostedPaidOperationAgentCommand(
  request: Request,
  invocationRef: string,
  options: AgentHandlerOptions,
): Promise<Response> {
  const admitted = await admit(options)
  if (admitted.kind === 'refused') return authRefusal(admitted)
  const parsed = await parseHostedPaidOperationCommand(request)
  if (parsed.kind === 'invalid') {
    return noStore({ kind: 'refused', code: 'invalid_command_input', issues: parsed.issues }, 422)
  }
  try {
    const result = await options.gateway.command({
      actor: admitted.principal.actor,
      invocationRef,
      expectedInvocationVersion: parsed.expectedInvocationVersion,
      commandId: parsed.commandId,
      command: parsed.command,
    })
    return await agentResult(
      result,
      invocationRef,
      parsed.expectedInvocationVersion,
      admitted.principal,
      options,
    )
  } catch {
    return noStore({
      kind: 'update_not_confirmed',
      requestId: options.requestId?.() ?? crypto.randomUUID(),
      relation: {
        inspect: `/api/v1/paid-operations/${encodeURIComponent(invocationRef)}?expectedInvocationVersion=${parsed.expectedInvocationVersion}`,
      },
    }, 503)
  }
}

async function admit(options: Pick<AgentHandlerOptions, 'authenticate'>): Promise<AgentAuthResult> {
  return await (options.authenticate ?? authenticateHostedPaidOperationAgent)()
}

async function agentResult(
  result: Awaited<ReturnType<HostedPaidOperationTransportGateway['inspect']>>,
  invocationRef: string,
  suppliedVersion: number,
  principal: HostedPaidOperationAgentPrincipal,
  options: AgentHandlerOptions,
) {
  if (result.kind === 'accepted') {
    return noStore(projectHostedPaidOperation(result.value, options.provenance, 'agent'), 200)
  }
  if (result.code === 'invocation_not_found' || result.code === 'cross_principal_refused') {
    return noStore({ kind: 'refused', code: 'invocation_not_found' }, 404)
  }
  if (result.code === 'stale_invocation_version') {
    const current = await options.currentVersion?.(invocationRef, principal.actor) ?? suppliedVersion
    return noStore({
      kind: 'refused',
      code: result.code,
      suppliedVersion,
      currentExpectedInvocationVersion: current,
      relation: {
        inspect: `/api/v1/paid-operations/${encodeURIComponent(invocationRef)}?expectedInvocationVersion=${current}`,
      },
    }, 409)
  }
  if (result.code === 'continuation_not_allowed') {
    return noStore({
      kind: 'refused',
      code: result.code,
      currentExpectedInvocationVersion: suppliedVersion,
      relation: {
        inspect: `/api/v1/paid-operations/${encodeURIComponent(invocationRef)}?expectedInvocationVersion=${suppliedVersion}`,
      },
    }, 409)
  }
  return noStore({ kind: 'refused', code: result.code }, 503)
}

function authRefusal(result: Extract<AgentAuthResult, { kind: 'refused' }>) {
  return noStore({ kind: 'refused', code: result.reason }, result.status)
}
