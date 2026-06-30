export const AE_SESSION_COOKIE = 'ae_session'
export const AE_SESSION_MAX_AGE_SECONDS = 400 * 24 * 60 * 60

export function readSessionIdFromRequest(request: Request): string | undefined {
  const cookieHeader = request.headers.get('cookie')
  if (cookieHeader === null) {
    return undefined
  }

  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim()
    if (!trimmed.startsWith(`${AE_SESSION_COOKIE}=`)) {
      continue
    }
    const value = decodeURIComponent(trimmed.slice(AE_SESSION_COOKIE.length + 1)).trim()
    if (value.length > 0) {
      return value
    }
  }

  return undefined
}

export function resolveOrCreateSessionId(request: Request): { sessionId: string; setCookie: boolean } {
  const existing = readSessionIdFromRequest(request)
  if (existing !== undefined) {
    return { sessionId: existing, setCookie: false }
  }

  return { sessionId: crypto.randomUUID(), setCookie: true }
}

export function buildSessionSetCookieHeader(sessionId: string, request?: Request): string {
  const maxAge = AE_SESSION_MAX_AGE_SECONDS
  const secure = request !== undefined && isSecureRequest(request)
  return `${AE_SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`
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

function isSecureRequest(request: Request): boolean {
  if (process.env.NODE_ENV === 'production') {
    return true
  }

  const forwarded = request.headers.get('x-forwarded-proto')
  if (forwarded !== null) {
    return forwarded.split(',')[0]?.trim() === 'https'
  }

  try {
    return new URL(request.url).protocol === 'https:'
  } catch {
    return false
  }
}
