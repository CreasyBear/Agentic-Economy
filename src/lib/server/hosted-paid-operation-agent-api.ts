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
  runtime?: AgentRuntimeFactory
  gateway?: HostedPaidOperationTransportGateway
  provenance?: string
  currentVersion?: (
    invocationRef: string,
    actor: HostedPaidOperationAgentPrincipal['actor'],
  ) => Promise<number | undefined>
  requestId?: () => string
}>

type AgentCreationOptions = Readonly<{
  authenticate?: () => Promise<AgentAuthResult>
  runtime?: AgentRuntimeFactory
  creation?: HostedPaidOperationCreationGateway
}>

type AgentRuntime = Readonly<{
  gateway: HostedPaidOperationTransportGateway
  creation: HostedPaidOperationCreationGateway
  provenance: string
  currentVersion(invocationRef: string): Promise<number | undefined>
}>

type AgentRuntimeFactory = (
  principal: HostedPaidOperationAgentPrincipal,
) => Promise<AgentRuntime>

export async function handleHostedPaidOperationAgentCreate(
  request: Request,
  options: AgentCreationOptions,
): Promise<Response> {
  const admitted = await admit(options)
  if (admitted.kind === 'refused') return authRefusal(admitted)
  const runtime = await options.runtime?.(admitted.principal)
  const creation = options.creation ?? runtime?.creation
  if (creation === undefined) throw new Error('hosted_paid_operation_agent_runtime_missing')
  const setup = await parseHostedPaidOperationSetup(request)
  if (setup === undefined) {
    return noStore({ kind: 'refused', code: 'invalid_setup_input', issues: ['providerKey'] }, 422)
  }
  const result = await creation.create({ actor: admitted.principal.actor, setup })
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
  const runtime = await options.runtime?.(admitted.principal)
  const gateway = options.gateway ?? runtime?.gateway
  if (gateway === undefined) throw new Error('hosted_paid_operation_agent_runtime_missing')
  try {
    const result = await gateway.inspect({
      actor: admitted.principal.actor,
      invocationRef,
      expectedInvocationVersion,
    })
    return await agentResult(
      result,
      invocationRef,
      expectedInvocationVersion,
      admitted.principal,
      withRuntime(options, runtime),
      'inspect',
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
  const runtime = await options.runtime?.(admitted.principal)
  const gateway = options.gateway ?? runtime?.gateway
  if (gateway === undefined) throw new Error('hosted_paid_operation_agent_runtime_missing')
  const parsed = await parseHostedPaidOperationCommand(request)
  if (parsed.kind === 'invalid') {
    return noStore({ kind: 'refused', code: 'invalid_command_input', issues: parsed.issues }, 422)
  }
  try {
    const result = await gateway.command({
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
      withRuntime(options, runtime),
      'command',
    )
  } catch {
    return agentUpdateNotConfirmed(
      invocationRef,
      parsed.expectedInvocationVersion,
      options,
    )
  }
}

async function admit(options: Pick<AgentHandlerOptions, 'authenticate'>): Promise<AgentAuthResult> {
  return await (options.authenticate ?? authenticateHostedPaidOperationAgent)()
}

function withRuntime(
  options: AgentHandlerOptions,
  runtime: AgentRuntime | undefined,
): AgentHandlerOptions {
  return {
    ...options,
    ...(options.provenance !== undefined
      ? {}
      : { provenance: runtime?.provenance ?? 'Labelled hosted sandbox source' }),
    ...(options.currentVersion !== undefined || runtime === undefined
      ? {}
      : { currentVersion: (invocationRef) => runtime.currentVersion(invocationRef) }),
  }
}

async function agentResult(
  result: Awaited<ReturnType<HostedPaidOperationTransportGateway['inspect']>>,
  invocationRef: string,
  suppliedVersion: number,
  principal: HostedPaidOperationAgentPrincipal,
  options: AgentHandlerOptions,
  source: 'inspect' | 'command',
) {
  if (result.kind === 'accepted') {
    return noStore(projectHostedPaidOperation(
      result.value,
      options.provenance ?? 'Labelled hosted sandbox source',
      'agent',
    ), 200)
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
  return source === 'command'
    ? agentUpdateNotConfirmed(invocationRef, suppliedVersion, options)
    : noStore({ kind: 'refused', code: result.code }, 503)
}

function agentUpdateNotConfirmed(
  invocationRef: string,
  expectedInvocationVersion: number,
  options: Pick<AgentHandlerOptions, 'requestId'>,
): Response {
  return noStore({
    kind: 'update_not_confirmed',
    requestId: options.requestId?.() ?? crypto.randomUUID(),
    relation: {
      inspect: `/api/v1/paid-operations/${encodeURIComponent(invocationRef)}?expectedInvocationVersion=${expectedInvocationVersion}`,
    },
  }, 503)
}

function authRefusal(result: Extract<AgentAuthResult, { kind: 'refused' }>) {
  return noStore({ kind: 'refused', code: result.reason }, result.status)
}
