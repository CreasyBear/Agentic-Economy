import { isSecureRequest, readCookie, serializeCookie } from '@/lib/http/cookies'

const AE_SESSION_COOKIE = 'ae_session'
const AE_SESSION_MAX_AGE_SECONDS = 400 * 24 * 60 * 60

export function resolveOrCreateSessionId(request: Request): { sessionId: string; setCookie: boolean } {
  const existing = readCookie(request.headers.get('cookie'), AE_SESSION_COOKIE)
  if (existing !== undefined) {
    return { sessionId: existing, setCookie: false }
  }

  return { sessionId: crypto.randomUUID(), setCookie: true }
}

function buildSessionSetCookieHeader(sessionId: string, request?: Request): string {
  const nodeEnv = process.env.NODE_ENV
  return serializeCookie(AE_SESSION_COOKIE, sessionId, {
    path: '/',
    maxAge: AE_SESSION_MAX_AGE_SECONDS,
    httpOnly: true,
    sameSite: 'Lax',
    secure: request !== undefined && isSecureRequest(request, nodeEnv === undefined ? {} : { NODE_ENV: nodeEnv }),
  })
}

export function appendSessionCookie(
  response: Response,
  sessionId: string,
  shouldSet: boolean,
  request?: Request,
): Response {
  if (!shouldSet) {
    return response
  }

  const headers = new Headers(response.headers)
  headers.append('Set-Cookie', buildSessionSetCookieHeader(sessionId, request))
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

