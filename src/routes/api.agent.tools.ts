import { createFileRoute } from '@tanstack/react-router'
import {
  acceptSignatureHeaderValue,
  verifyAgentIdentity,
  type AgentIdentity,
  type AgentIdentityVerificationOptions,
} from '@/modules/clearance/public'
import {
  recordAgentIdentityThroughSource,
  resolveAgentToolWriteAdmissionThroughSource,
  type AgentToolWriteAdmissionResult,
} from '@/modules/clearance/server'
import { sourceWriteBodyDigest } from '@/modules/security/source-write-admission'

import {
  listAgentToolActions,
  type ActionContext,
} from '@/modules/actions'
import {
  buildHarnessToolContracts,
  describeHarnessToolExecutionValidation,
  describeHarnessToolForQuietAgent,
  filterQuietAgentToolContracts,
  harnessToolContractToDefinition,
  runHarnessTool,
} from '@/modules/harness/public'
import { jsonResponse } from './api.businesses'

/**
 * The quiet agent door. Lists assistant actions and invokes them.
 *
 * The agent layer is real but quiet; this endpoint is the machine counterpart
 * to the human "Get as agent JSON" affordance. Public copy never names it.
 */
export const Route = createFileRoute('/api/agent/tools')({
  server: {
    handlers: {
      GET: () => handleListAgentTools(),
      POST: ({ request }) => handleInvokeAgentTool(request),
    },
  },
})

export async function handleListAgentTools(): Promise<Response> {
  const contracts = quietAgentToolContracts()
  const tools = contracts.map((contract) => describeHarnessToolForQuietAgent(contract).descriptor)
  return jsonResponse({ tools })
}

type InvokeRequestBody = {
  tool?: unknown
  input?: unknown
}

export async function handleInvokeAgentTool(request: Request): Promise<Response> {
  if (!isJsonContentType(request)) {
    return jsonError('agent_tools_invalid_content_type', 'Request body must be JSON.', 415)
  }

  const bodyText = await request.text()
  const bodyDigest = sourceWriteBodyDigest(bodyText)
  let body: InvokeRequestBody
  try {
    body = JSON.parse(bodyText) as InvokeRequestBody
  } catch {
    return jsonError('agent_tools_invalid_body', 'Request body could not be parsed as JSON.', 400)
  }

  const toolId = typeof body.tool === 'string' ? body.tool : ''
  const contract = quietAgentToolContracts().find((toolContract) => toolContract.id === toolId)
  if (contract === undefined) {
    return jsonError('agent_tools_unknown_tool', `No agent tool named '${toolId}'.`, 404)
  }

  const validation = describeHarnessToolExecutionValidation(contract)
  if (validation.strictInputSchemaViolation !== undefined || validation.strictOutputSchemaViolation !== undefined) {
    return jsonError('agent_tools_invalid_schema', 'Tool schema is not strict enough to run.', 500)
  }

  const tool = harnessToolContractToDefinition(contract)
  const parsedInput = tool.inputSchema.safeParse(body.input)
  if (!parsedInput.success) {
    return jsonResponse(
      {
        kind: 'error',
        code: 'agent_tools_invalid_input',
        retryable: false,
        reason: 'Input did not match the tool schema.',
      },
      { status: 400 }
    )
  }

  const agentIdentity = await verifyAgentIdentity(request, agentIdentityOptionsFromRequest(request, bodyText))
  if (agentIdentity.kind === 'error') {
    return jsonError(agentIdentity.code, agentIdentity.reason, agentIdentity.status)
  }

  if (agentIdentity.kind === 'identity') {
    await recordAgentIdentityThroughSource(agentIdentity, request).catch(() => undefined)
  }

  let writeAdmission: Extract<AgentToolWriteAdmissionResult, { kind: 'admitted' }> | undefined
  if (tool.tier === 'write') {
    if (agentIdentity.kind === 'unsigned') {
      return jsonError(
        'agent_tools_signature_required',
        'Signed request identity is required before this agent tool can consider a write.',
        403,
        { 'Accept-Signature': acceptSignatureHeaderValue() },
      )
    }

    if (agentIdentity.kind !== 'identity') {
      return jsonError('agent_tools_refused', 'agent_identity_required', 403)
    }

    const admission = await resolveAgentToolWriteAdmissionThroughSource({
      identity: agentIdentity,
      toolId: tool.id,
      scope: 'public_inquiry',
    })
    if (admission.kind === 'refused') {
      return jsonError('agent_tools_refused', admission.reason, 403)
    }
    writeAdmission = admission
  }


  const context = contextFromRequest(
    request,
    agentIdentity.kind === 'identity' ? agentIdentity : undefined,
    writeAdmission,
    bodyDigest,
  )
  const outcome = await runHarnessTool({
    tool,
    input: parsedInput.data,
    context,
    surface: 'agentTools',
    allowWrites: writeAdmission?.toolId === 'inquiry.submit',
  })

  if (outcome.result.status === 'ok' && outcome.result.output !== undefined) {
    return jsonResponse(outcome.result.output)
  }

  if (outcome.result.errorCode === 'invalid_input') {
    return jsonResponse(
      {
        kind: 'error',
        code: 'agent_tools_invalid_input',
        retryable: false,
        reason: 'Input did not match the tool schema.',
      },
      { status: 400 }
    )
  }

  if (outcome.result.status === 'blocked' || outcome.result.status === 'refused') {
    return jsonError(
      'agent_tools_refused',
      outcome.result.errorCode ?? 'Tool was refused by policy.',
      403,
    )
  }

  if (outcome.result.errorCode === 'invalid_output') {
    return jsonError('agent_tools_invalid_output', 'Tool result did not match its schema.', 502)
  }

  return jsonError('agent_tools_run_failed', outcome.result.errorCode ?? 'Tool run failed.', 500)
}

function quietAgentToolContracts() {
  return filterQuietAgentToolContracts(buildHarnessToolContracts(listAgentToolActions()))
}

function agentIdentityOptionsFromRequest(request: Request, bodyText?: string): AgentIdentityVerificationOptions {
  const expectedAuthority = new URL(request.url).host
  const devSignatureAgent = readDevWbaSignatureAgent()
  if (devSignatureAgent === undefined) {
    return { expectedAuthority, ...(bodyText === undefined ? {} : { bodyText }) }
  }

  return {
    expectedAuthority,
    allowedSignatureAgents: [devSignatureAgent],
    pretrustedDirectoryOrigins: [devSignatureAgent],
    ...(bodyText === undefined ? {} : { bodyText }),
  }
}

function readDevWbaSignatureAgent(): string | undefined {
  if (readEnv('NODE_ENV') === 'production' || readEnv('AE_DEV_WBA_SMOKE_ENABLED') !== '1') {
    return undefined
  }

  const value = readEnv('AE_DEV_WBA_SIGNATURE_AGENT')
  if (value === undefined) {
    return undefined
  }

  try {
    const url = new URL(value)
    return url.protocol === 'http:' && url.hostname === '127.0.0.1' ? url.origin : undefined
  } catch {
    return undefined
  }
}

function contextFromRequest(
  request: Request,
  agentIdentity: AgentIdentity | undefined,
  agentToolAdmission: Extract<AgentToolWriteAdmissionResult, { kind: 'admitted' }> | undefined,
  bodyDigest: string,
): ActionContext {
  const url = new URL(request.url)
  return {
    request,
    ...(agentIdentity === undefined ? {} : { agentIdentity }),
    ...(agentToolAdmission === undefined ? {} : { agentToolAdmission }),
    sourceWriteRequest: {
      method: request.method.toUpperCase(),
      origin: request.headers.get('Origin') ?? url.origin,
      pathname: url.pathname,
      bodyDigest,
    },
  }
}

function isJsonContentType(request: Request): boolean {
  const type = request.headers.get('Content-Type') ?? ''
  return type.toLowerCase().includes('application/json')
}


function readEnv(name: string): string | undefined {
  const value = typeof process === 'undefined' ? undefined : process.env[name]
  return value === undefined || value.trim().length === 0 ? undefined : value.trim()
}
function jsonError(code: string, reason: string, status: number, headers: HeadersInit = {}): Response {
  return jsonResponse({ kind: 'error', code, retryable: false, reason }, { status, headers })
}
