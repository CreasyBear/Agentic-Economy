import type { CsrfCheckInput, CsrfDecision } from '@/modules/security/public'

export function assertCsrf(input: CsrfCheckInput): CsrfDecision {
  if (
    input.csrfToken !== undefined
    && input.csrfCookie !== undefined
    && input.csrfToken.length > 0
    && input.csrfToken === input.csrfCookie
  ) {
    return { kind: 'accepted', mode: 'csrf_token' }
  }
  if (input.origin !== undefined) {
    return input.allowedOrigins.includes(input.origin)
      ? { kind: 'accepted', mode: 'same_site_origin' }
      : { kind: 'rejected', reason: 'foreign_origin' }
  }
  return { kind: 'rejected', reason: 'missing_csrf' }
}
