/**
 * Shared by both auth routes so sign-in and sign-up cannot disagree about what
 * a safe destination is. Only a same-origin relative path is accepted;
 * protocol-relative ("//host") and absolute URLs are rejected to avoid an open
 * redirect.
 */
const authRedirectOrigin = 'https://aecon.ai'

export type AuthRedirectSearch = Readonly<{ redirect?: string }>

/** Auth-mode switches retain the same safe destination, including nested Call context. */
export function authSwitchUrl(route: '/sign-in' | '/sign-up', target: unknown): string {
  const redirect = sanitizeAuthRedirectTarget(target)
  return redirect === undefined ? route : `${route}?${new URLSearchParams({ redirect })}`
}

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

/** Same-origin path plus query for a sign-in return. Absolute URLs keep only that path. */
export function signedInReturnPath(href: string, fallback = '/'): string {
  const relative = href.startsWith('/') && !href.startsWith('//')
    ? href
    : (() => {
        try {
          const url = new URL(href)
          return `${url.pathname}${url.search}`
        } catch (cause) {
          void cause
          return undefined
        }
      })()
  return sanitizeAuthRedirectTarget(relative) ?? fallback
}
