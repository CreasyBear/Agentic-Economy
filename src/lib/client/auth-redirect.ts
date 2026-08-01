/**
 * Shared by both auth routes so sign-in and sign-up cannot disagree about what
 * a safe destination is. Only a same-origin relative path is accepted;
 * protocol-relative ("//host") and absolute URLs are rejected to avoid an open
 * redirect.
 */
export function sanitizeAuthRedirectTarget(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return undefined
  }

  return trimmed
}
