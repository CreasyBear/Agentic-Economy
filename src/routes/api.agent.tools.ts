import { createFileRoute } from '@tanstack/react-router'

import {
  findAction,
  listAgentToolActions,
  type ActionContext,
} from '@/modules/actions'
import {
  actionToHarnessTool,
  buildHarnessToolContracts,
  describeHarnessToolForQuietAgent,
  filterQuietAgentToolContracts,
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
  const contracts = filterQuietAgentToolContracts(buildHarnessToolContracts(listAgentToolActions()))
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

  let body: InvokeRequestBody
  try {
    body = (await request.json()) as InvokeRequestBody
  } catch {
    return jsonError('agent_tools_invalid_body', 'Request body could not be parsed as JSON.', 400)
  }

  const toolId = typeof body.tool === 'string' ? body.tool : ''
  const action = findAction(toolId)
  if (action === undefined) {
    return jsonError('agent_tools_unknown_tool', `No agent tool named '${toolId}'.`, 404)
  }
  if (!action.surfaces.includes('agentTools')) {
    return jsonError('agent_tools_not_exposed', `Action '${toolId}' is not exposed to agents.`, 403)
  }

  const tool = actionToHarnessTool(action)
  if (tool.strictInputSchemaViolation !== undefined || tool.strictOutputSchemaViolation !== undefined) {
    return jsonError('agent_tools_invalid_schema', 'Tool schema is not strict enough to run.', 500)
  }

  const context = contextFromRequest(request)
  const outcome = await runHarnessTool({
    tool,
    input: body.input,
    context,
    surface: 'agentTools',
    allowWrites: true,
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

function contextFromRequest(request: Request): ActionContext {
  const url = new URL(request.url)
  return {
    request,
    sourceWriteRequest: {
      method: request.method.toUpperCase(),
      origin: request.headers.get('Origin') ?? url.origin,
      pathname: url.pathname,
    },
  }
}

function isJsonContentType(request: Request): boolean {
  const type = request.headers.get('Content-Type') ?? ''
  return type.toLowerCase().includes('application/json')
}

function jsonError(code: string, reason: string, status: number): Response {
  return jsonResponse({ kind: 'error', code, retryable: false, reason }, { status })
}
