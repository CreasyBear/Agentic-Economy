import { describe, expect, it } from 'vitest'

import { assertCsrf } from '@/modules/security/public'

describe('CSRF and rate limit controls', () => {
  it('accepts matching CSRF token/cookie and same-site origin', () => {
    expect(
      assertCsrf({
        csrfToken: 'token',
        csrfCookie: 'token',
        allowedOrigins: ['https://ae.example'],
      })
    ).toEqual({ kind: 'accepted', mode: 'csrf_token' })

    expect(
      assertCsrf({
        origin: 'https://ae.example',
        allowedOrigins: ['https://ae.example'],
      })
    ).toEqual({ kind: 'accepted', mode: 'same_site_origin' })
  })

  it('rejects missing and foreign CSRF evidence', () => {
    expect(assertCsrf({ allowedOrigins: ['https://ae.example'] })).toEqual({
      kind: 'rejected',
      reason: 'missing_csrf',
    })
    expect(assertCsrf({ origin: 'https://evil.example', allowedOrigins: ['https://ae.example'] })).toEqual({
      kind: 'rejected',
      reason: 'foreign_origin',
    })
  })

})
