import { createFileRoute } from '@tanstack/react-router'

import { readBoundedRequestJson } from '@/lib/server/bounded-request-body'
import { methodNotAllowed } from '@/lib/server/method-guard'
import { problem } from '@/lib/server/problem'
import { readTrimmedEnv, type StringEnvironment } from '@/lib/server/read-trimmed-env'
import {
  assertHttpAdmission,
  rateLimitedResponse,
  requestAdmissionKey,
  type RateLimitResult,
} from '@/lib/server/rate-limit'
import {
  runWithRequestCorrelation,
  withRequestCorrelationHeader,
} from '@/lib/server/request-correlation'

const MAX_ANONYMOUS_CHAT_REQUEST_BODY_BYTES = 18 * 1024
const SAFE_UPSTREAM_HEADERS = [
  'content-type',
  'x-vercel-ai-ui-message-stream',
  'x-accel-buffering',
] as const

type AnonymousChatProxyDependencies = Readonly<{
  env?: StringEnvironment
  fetch?: typeof globalThis.fetch
  admit?: (request: Request, name: 'chat-anonymous') => Promise<RateLimitResult>
}>

export const Route = createFileRoute('/api/chat/anonymous')({
  server: {
    handlers: {
      POST: ({ request }) => handleAnonymousChatProxyRequest(request),
      GET: () => methodNotAllowed(['POST']),
      PUT: () => methodNotAllowed(['POST']),
      PATCH: () => methodNotAllowed(['POST']),
      DELETE: () => methodNotAllowed(['POST']),
      HEAD: () => methodNotAllowed(['POST']),
      OPTIONS: () => methodNotAllowed(['POST']),
      TRACE: () => methodNotAllowed(['POST']),
      CONNECT: () => methodNotAllowed(['POST']),
    },
  },
})

function validOrigin(value: string, allowLocal: boolean): string | undefined {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return undefined
  }
  if (
    (url.protocol !== 'https:' && !(allowLocal && url.protocol === 'http:'))
    || url.username.length > 0
    || url.password.length > 0
    || url.pathname !== '/'
    || url.search.length > 0
    || url.hash.length > 0
  ) {
    return undefined
  }
  return url.origin
}

export function resolveAnonymousChatSiteUrl(
  environment: StringEnvironment = process.env,
): string | undefined {
  const explicit = readTrimmedEnv(environment, 'CONVEX_SITE_URL')
  if (explicit !== undefined) return validOrigin(explicit, true)

  const deployment = readTrimmedEnv(environment, 'CONVEX_URL')
    ?? readTrimmedEnv(environment, 'VITE_CONVEX_URL')
  if (deployment === undefined) return undefined
  const origin = validOrigin(deployment, false)
  if (origin === undefined) return undefined
  const url = new URL(origin)
  if (!url.hostname.endsWith('.convex.cloud')) return undefined
  url.hostname = `${url.hostname.slice(0, -'.convex.cloud'.length)}.convex.site`
  return url.origin
}

function proxyProblem(
  status: number,
  kind: 'INVALID_ARGUMENT' | 'PAYLOAD_TOO_LARGE' | 'UNAVAILABLE' | 'UNSUPPORTED_MEDIA_TYPE',
  code: string,
): Response {
  return problem({ status, kind, code })
}

function projectedUpstreamResponse(response: Response): Response {
  const headers = new Headers({ 'Cache-Control': 'no-store' })
  for (const name of SAFE_UPSTREAM_HEADERS) {
    const value = response.headers.get(name)
    if (value !== null) headers.set(name, value)
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export async function handleAnonymousChatProxyRequest(
  request: Request,
  dependencies: AnonymousChatProxyDependencies = {},
): Promise<Response> {
  return await runWithRequestCorrelation(request, async ({ correlationId }) => {
    let response: Response
    if (request.method !== 'POST') {
      response = methodNotAllowed(['POST'])
    } else if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
      response = proxyProblem(415, 'UNSUPPORTED_MEDIA_TYPE', 'invalid_content_type')
    } else {
      const bounded = await readBoundedRequestJson(request, MAX_ANONYMOUS_CHAT_REQUEST_BODY_BYTES)
      if (!bounded.ok) {
        response = proxyProblem(
          bounded.code === 'payload_too_large' ? 413 : 400,
          bounded.code === 'payload_too_large' ? 'PAYLOAD_TOO_LARGE' : 'INVALID_ARGUMENT',
          bounded.code,
        )
      } else {
        const env = dependencies.env ?? process.env
        const siteUrl = resolveAnonymousChatSiteUrl(env)
        const proxySecret = readTrimmedEnv(env, 'AE_CHAT_PROXY_SECRET')
        if (siteUrl === undefined || proxySecret === undefined || proxySecret.length < 32) {
          response = proxyProblem(503, 'UNAVAILABLE', 'chat_proxy_unavailable')
        } else {
          try {
            const admission = await (dependencies.admit ?? assertHttpAdmission)(request, 'chat-anonymous')
            if (!admission.ok) {
              response = rateLimitedResponse(admission.retryAfter)
            } else {
              const upstream = await (dependencies.fetch ?? globalThis.fetch)(
                `${siteUrl}/chat/anonymous`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-ae-chat-proxy-secret': proxySecret,
                    'x-ae-chat-admission-key': requestAdmissionKey(request, 'chat-anonymous'),
                  },
                  body: JSON.stringify(bounded.value),
                  signal: request.signal,
                },
              )
              response = projectedUpstreamResponse(upstream)
            }
          } catch {
            response = proxyProblem(503, 'UNAVAILABLE', 'chat_proxy_unavailable')
          }
        }
      }
    }
    return withRequestCorrelationHeader(response, correlationId)
  })
}
