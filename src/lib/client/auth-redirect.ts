/**
 * Shared by both auth routes so sign-in and sign-up cannot disagree about what
 * a safe destination is. Only a same-origin relative path is accepted;
 * protocol-relative ("//host") and absolute URLs are rejected to avoid an open
 * redirect.
 */
const authRedirectOrigin = 'https://aecon.ai'

export type AuthRedirectSearch = Readonly<{ redirect?: string }>

export function sanitizeAuthRedirectTarget(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  if (
    !trimmed.startsWith('/') ||
    trimmed.startsWith('//') ||
    trimmed.includes('\\') ||
    /[\t\n\r]/.test(trimmed)
  ) {
    return undefined
  }

  let resolved: URL
  try {
    resolved = new URL(trimmed, authRedirectOrigin)
  } catch (cause) {
    void cause;
    return undefined
  }

  const isAuthRoute =
    resolved.pathname === '/sign-in' ||
    resolved.pathname.startsWith('/sign-in/') ||
    resolved.pathname === '/sign-up' ||
    resolved.pathname.startsWith('/sign-up/')

  if (resolved.origin !== authRedirectOrigin || resolved.pathname.startsWith('//') || isAuthRoute) {
    return undefined
  }

  return trimmed
}
