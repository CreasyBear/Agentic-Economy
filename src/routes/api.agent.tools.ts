import { createFileRoute } from '@tanstack/react-router'

import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import { invokeQuietAgentTool, listQuietAgentTools } from '@/modules/harness/public'
import { jsonResponse } from './api.businesses'

/**
 * HTTP adapter for the quiet agent door.
 * Orchestration lives in `src/modules/harness/agent-door.ts`.
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
  return jsonResponse(listQuietAgentTools())
}

type InvokeRequestBody = {
  tool?: unknown
  input?: unknown
}

// Domain-owned inquiry body cap is 2_000 chars (defaultInquiryOperatorControls.maxBodyLength in
// src/modules/inquiries/internal/schema.ts). Worst case 4-byte-per-char UTF-8 that is ~8 KiB;
// add generous contact-field maxes (name/email/phone), the business/service target refs, and
// JSON/tool-envelope overhead and a legitimate inquiry.submit payload stays comfortably under
// 16 KiB. 64 KiB keeps 4x+ headroom over that while still bounding memory/CPU spent reading and
// digesting bodies the route boundary should reject outright.
const MAX_AGENT_TOOL_BODY_BYTES = 64 * 1024

export async function handleInvokeAgentTool(request: Request): Promise<Response> {
  const declaredContentLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredContentLength) && declaredContentLength > MAX_AGENT_TOOL_BODY_BYTES) {
    return jsonError(
      'agent_tools_payload_too_large',
      `Request body must be at most ${MAX_AGENT_TOOL_BODY_BYTES} bytes.`,
      413,
    )
  }

  if (!isJsonContentType(request)) {
    return jsonError('agent_tools_invalid_content_type', 'Request body must be JSON.', 415)
  }

  const boundedBody = await readBoundedRequestText(request, MAX_AGENT_TOOL_BODY_BYTES)
  if (!boundedBody.ok) {
    return jsonError(
      'agent_tools_payload_too_large',
      `Request body must be at most ${MAX_AGENT_TOOL_BODY_BYTES} bytes.`,
      413,
    )
  }
  const bodyText = boundedBody.text
  let body: InvokeRequestBody
  try {
    body = JSON.parse(bodyText) as InvokeRequestBody
  } catch {
    return jsonError('agent_tools_invalid_body', 'Request body could not be parsed as JSON.', 400)
  }

  const toolId = typeof body.tool === 'string' ? body.tool : ''
  const result = await invokeQuietAgentTool({
    request,
    bodyText,
    tool: toolId,
    toolInput: body.input,
  })

  if (result.kind === 'ok') {
    return jsonResponse(result.body, { headers: result.headers })
  }

  return jsonError(result.code, result.reason, result.status, result.headers ?? {}, result.extra)
}

function isJsonContentType(request: Request): boolean {
  const type = request.headers.get('Content-Type') ?? ''
  return type.toLowerCase().includes('application/json')
}

function jsonError(
  code: string,
  reason: string,
  status: number,
  headers: HeadersInit = {},
  extra?: Record<string, unknown>,
): Response {
  return jsonResponse({ kind: 'error', code, retryable: false, reason, ...(extra ?? {}) }, { status, headers })
}
