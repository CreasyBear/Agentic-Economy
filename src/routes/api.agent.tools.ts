import { createFileRoute } from '@tanstack/react-router'

import {
  describeActionForAgent,
  findAction,
  listAgentToolActions,
  type ActionContext,
} from '@/modules/actions'
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
  const tools = listAgentToolActions().map(describeActionForAgent)
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

  let parsed: unknown
  try {
    parsed = action.schema.parse(body.input)
  } catch (error) {
    return jsonResponse(
      {
        kind: 'error',
        code: 'agent_tools_invalid_input',
        retryable: false,
        reason: issueText(error),
      },
      { status: 400 }
    )
  }

  const context = contextFromRequest(request)
  const result = await action.run({ data: parsed, context })
  return jsonResponse(result)
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

function issueText(error: unknown): string {
  if (error && typeof error === 'object' && 'issues' in error) {
    const issues = (error as { issues?: unknown }).issues
    if (Array.isArray(issues)) {
      return issues
        .map((issue) => {
          const path = Array.isArray(issue.path) ? issue.path.join('.') : ''
          const message = typeof issue.message === 'string' ? issue.message : 'invalid value'
          return path.length > 0 ? `${path}: ${message}` : message
        })
        .join('; ')
    }
  }
  return 'Input did not match the tool schema.'
}
