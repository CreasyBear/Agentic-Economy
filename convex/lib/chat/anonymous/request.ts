import { degradeBackend } from '@/lib/observability/degrade-backend'
import { constantTimeStringEqual } from '@/lib/server/constant-time'
import { validateAnonymousChatBody, type AnonymousChatHandlerDependencies } from './contracts'

const PROXY_SECRET_MIN_LENGTH = 32
const ADMISSION_KEY_PATTERN = /^(?:principal|session|ip):sha256:[0-9a-f]{64}:sha256:[0-9a-f]{64}$/u

export function jsonError(
  status: number,
  code: string,
  headers: Readonly<Record<string, string>> = {},
): Response {
  return Response.json({ code }, {
    status,
    headers: {
      ...Object.fromEntries(new Headers(headers)),
      'Cache-Control': 'no-store',
    },
  })
}

export async function handleAnonymousChatRequest(
  request: Request,
  dependencies: AnonymousChatHandlerDependencies,
): Promise<Response> {
  const proxySecret = dependencies.proxySecret?.trim()
  if (proxySecret === undefined || proxySecret.length < PROXY_SECRET_MIN_LENGTH) return jsonError(503, 'chat_unavailable')
  if (!constantTimeStringEqual(proxySecret, request.headers.get('x-ae-chat-proxy-secret') ?? '')) {
    return jsonError(404, 'not_found')
  }

  const admissionKey = request.headers.get('x-ae-chat-admission-key')?.trim()
  if (admissionKey === undefined || !ADMISSION_KEY_PATTERN.test(admissionKey)) {
    return jsonError(400, 'invalid_admission_key')
  }

  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return jsonError(415, 'invalid_content_type')
  }

  let value: unknown
  try {
    value = await request.json() as unknown
  } catch (cause) {
    return degradeBackend(cause, jsonError(400, 'invalid_json'), { site: 'handleAnonymousChatRequest', reason: 'invalid_response' })
  }
  const parsed = validateAnonymousChatBody(value)
  if (!parsed.ok) return jsonError(400, parsed.code)

  const admission = await dependencies.admit(admissionKey)
  if (!admission.ok) {
    return jsonError(429, 'rate_limited', { 'Retry-After': String(Math.max(1, Math.ceil(admission.retryAfter / 1_000))) })
  }
  return await dependencies.stream(parsed.body.messages, request.signal, parsed.body.continuation)
}
