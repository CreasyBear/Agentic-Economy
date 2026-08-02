import { describe, expect, it } from 'vitest'

import { isSecureRequest, readCookie, serializeCookie } from '@/lib/http/cookies'

describe('cookie seam', () => {
  it('reads one decoded named cookie', () => {
    expect(readCookie('other=ignored; ae_session=session%20value; trailing=value', 'ae_session')).toBe('session value')
    expect(readCookie('ae_session=', 'ae_session')).toBeUndefined()
    expect(readCookie('other=value', 'ae_session')).toBeUndefined()
    expect(readCookie('ae_session=%E0%A4%A', 'ae_session')).toBeUndefined()
  })

  it('serializes the existing session policy', () => {
    expect(serializeCookie('ae_session', 'session value', {
      path: '/',
      maxAge: 400,
      httpOnly: true,
      sameSite: 'Lax',
      secure: true,
    })).toBe('ae_session=session%20value; Path=/; Max-Age=400; HttpOnly; SameSite=Lax; Secure')
  })

  it('uses production and forwarded protocol when deciding Secure', () => {
    const forwardedHttp = new Request('https://ae.example/api/requests', {
      headers: { 'X-Forwarded-Proto': 'http' },
    })
    const forwardedHttps = new Request('http://ae.example/api/requests', {
      headers: { 'X-Forwarded-Proto': 'https, http' },
    })

    expect(isSecureRequest(forwardedHttp, { NODE_ENV: 'test' })).toBe(false)
    expect(isSecureRequest(forwardedHttps, { NODE_ENV: 'test' })).toBe(true)
    expect(isSecureRequest(forwardedHttp, { NODE_ENV: 'production' })).toBe(true)
    expect(isSecureRequest(new Request('https://ae.example/api/requests'), { NODE_ENV: 'test' })).toBe(true)
  })
})
