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
import { buildInquiryPrefillHref } from '@/modules/inquiries/inquiry-prefill'
import {
  listAgentToolActions,
  type ActionContext,
} from '@/modules/actions'
import { runHarnessTool } from './action-tool'
import { agentAuthorityReceiptHeaders } from './query-authority-receipt'
import {
  buildHarnessToolContracts,
  describeHarnessToolExecutionValidation,
  describeHarnessToolForQuietAgent,
  filterQuietAgentToolContracts,
  harnessToolContractToDefinition,
  type HarnessQuietToolDescriptor,
} from './tool-contract'
import { publicQuietAgentWriteScopeForTool } from './agent-tool-write-scope'

/**
 * Quiet Agent Door — product orchestration for one agentic hop:
 * list/invoke quiet tools, identity → write admission → run → receipt headers.
 *
 * HTTP adapters (`src/routes/api.agent.tools.ts`) stay thin: transport bounds +
 * JSON response mapping only. Clearance, actions registry, and harness run stay
 * their own owners; this module only orders them.
 */

export type QuietAgentDoorErrorCode =
  | 'agent_tools_unknown_tool'
  | 'agent_tools_invalid_schema'
  | 'agent_tools_invalid_input'
  | 'agent_tools_signature_required'
  | 'agent_tools_refused'
  | 'agent_tools_invalid_output'
  | 'agent_tools_run_failed'

export type QuietAgentDoorListResult = {
  tools: readonly HarnessQuietToolDescriptor[]
}

export type QuietAgentDoorSuccess = {
  kind: 'ok'
  status: 200
  body: unknown
  headers: Record<string, string>
}

export type QuietAgentDoorFailure = {
  kind: 'error'
  status: number
  code: QuietAgentDoorErrorCode | string
  reason: string
  headers?: Record<string, string>
  extra?: Record<string, unknown>
}

export type QuietAgentDoorInvokeResult = QuietAgentDoorSuccess | QuietAgentDoorFailure

export function listQuietAgentTools(): QuietAgentDoorListResult {
  const contracts = quietAgentToolContracts()
  return {
    tools: contracts.map((contract) => describeHarnessToolForQuietAgent(contract).descriptor),
  }
}

export async function invokeQuietAgentTool(input: {
  request: Request
  bodyText: string
  tool: string
  toolInput: unknown
}): Promise<QuietAgentDoorInvokeResult> {
  const contract = quietAgentToolContracts().find((toolContract) => toolContract.id === input.tool)
  if (contract === undefined) {
    return doorError('agent_tools_unknown_tool', `No agent tool named '${input.tool}'.`, 404)
  }

  const validation = describeHarnessToolExecutionValidation(contract)
  if (validation.strictInputSchemaViolation !== undefined || validation.strictOutputSchemaViolation !== undefined) {
    return doorError('agent_tools_invalid_schema', 'Tool schema is not strict enough to run.', 500)
  }

  const tool = harnessToolContractToDefinition(contract)
  const parsedInput = tool.inputSchema.safeParse(input.toolInput)
  if (!parsedInput.success) {
    return {
      kind: 'error',
      status: 400,
      code: 'agent_tools_invalid_input',
      reason: 'Input did not match the tool schema.',
    }
  }

  const agentIdentity = await verifyAgentIdentity(
    input.request,
    agentIdentityOptionsFromRequest(input.request, input.bodyText),
  )
  if (agentIdentity.kind === 'error') {
    return doorError(agentIdentity.code, agentIdentity.reason, agentIdentity.status)
  }

  const inquiryHandoffUrl =
    tool.id === 'inquiry.submit' ? inquirySubmitHandoffUrl(parsedInput.data) : undefined
  const handoffExtra = inquiryHandoffUrl === undefined ? undefined : { handoffUrl: inquiryHandoffUrl }

  let writeAdmission: Extract<AgentToolWriteAdmissionResult, { kind: 'admitted' }> | undefined
  if (tool.tier === 'write') {
    if (agentIdentity.kind === 'unsigned') {
      return doorError(
        'agent_tools_signature_required',
        'Signed request identity is required before this agent tool can consider a write.',
        403,
        { 'Accept-Signature': acceptSignatureHeaderValue() },
        handoffExtra,
      )
    }

    if (agentIdentity.kind !== 'identity') {
      return doorError('agent_tools_refused', 'agent_identity_required', 403, {}, handoffExtra)
    }
    await recordAgentIdentityThroughSource(agentIdentity, input.request).catch(() => undefined)

    const writeScope = publicQuietAgentWriteScopeForTool(tool)
    if (writeScope === undefined) {
      return doorError('agent_tools_refused', 'agent_tool_write_not_declared', 403)
    }

    const admission = await resolveAgentToolWriteAdmissionThroughSource({
      identity: agentIdentity,
      toolId: tool.id,
      scope: writeScope,
    })
    if (admission.kind === 'refused') {
      return doorError('agent_tools_refused', admission.reason, 403, {}, handoffExtra)
    }
    writeAdmission = admission
  }

  const bodyDigest = sourceWriteBodyDigest(input.bodyText)
  const context = contextFromRequest(
    input.request,
    agentIdentity.kind === 'identity' ? agentIdentity : undefined,
    writeAdmission,
    bodyDigest,
  )
  const outcome = await runHarnessTool({
    tool,
    input: parsedInput.data,
    context,
    surface: 'agentTools',
    allowWrites: writeAdmission !== undefined && writeAdmission.toolId === tool.id,
  })

  if (outcome.result.status === 'ok' && outcome.result.output !== undefined) {
    return {
      kind: 'ok',
      status: 200,
      body: outcome.result.output,
      headers: agentAuthorityReceiptHeaders({
        result: outcome.result,
        surface: 'agentTools',
        ...(typeof process === 'undefined' ? {} : { env: process.env }),
      }),
    }
  }

  if (outcome.result.errorCode === 'invalid_input') {
    return {
      kind: 'error',
      status: 400,
      code: 'agent_tools_invalid_input',
      reason: 'Input did not match the tool schema.',
    }
  }

  if (outcome.result.status === 'blocked' || outcome.result.status === 'refused') {
    return doorError(
      'agent_tools_refused',
      outcome.result.errorCode ?? 'Tool was refused by policy.',
      403,
    )
  }

  if (outcome.result.errorCode === 'invalid_output') {
    return doorError('agent_tools_invalid_output', 'Tool result did not match its schema.', 502)
  }

  return doorError('agent_tools_run_failed', outcome.result.errorCode ?? 'Tool run failed.', 500)
}

function quietAgentToolContracts() {
  return filterQuietAgentToolContracts(buildHarnessToolContracts(listAgentToolActions()))
}

function agentIdentityOptionsFromRequest(
  request: Request,
  bodyText?: string,
): AgentIdentityVerificationOptions {
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

function inquirySubmitHandoffUrl(input: unknown): string | undefined {
  if (input === null || typeof input !== 'object' || !('target' in input)) {
    return undefined
  }
  const target = input.target
  if (target === null || typeof target !== 'object' || !('businessSlug' in target)) {
    return undefined
  }
  const slug = target.businessSlug
  if (typeof slug !== 'string') {
    return undefined
  }
  const body = 'body' in input ? input.body : undefined
  const serviceSlug = 'serviceSlug' in target ? target.serviceSlug : undefined
  return buildInquiryPrefillHref({
    slug,
    ...(typeof body === 'string' ? { draft: body } : {}),
    ...(typeof serviceSlug === 'string' ? { service: serviceSlug } : {}),
  })
}

function readEnv(name: string): string | undefined {
  const value = typeof process === 'undefined' ? undefined : process.env[name]
  return value === undefined || value.trim().length === 0 ? undefined : value.trim()
}

function doorError(
  code: string,
  reason: string,
  status: number,
  headers: Record<string, string> = {},
  extra?: Record<string, unknown>,
): QuietAgentDoorFailure {
  return {
    kind: 'error',
    status,
    code,
    reason,
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
    ...(extra === undefined ? {} : { extra }),
  }
}
