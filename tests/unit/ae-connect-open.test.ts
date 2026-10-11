import { describe, expect, it } from 'vitest'

import { isSafeVerificationUri } from '../../tools/ae/commands/connect'

describe('isSafeVerificationUri', () => {
  it('accepts https and loopback http', () => {
    expect(isSafeVerificationUri('https://example.com/device?user_code=ABCD-1234')).toBe(true)
    expect(isSafeVerificationUri('http://localhost:3000/device')).toBe(true)
  })
  it('rejects shell metacharacters', () => {
    expect(isSafeVerificationUri('https://example.com/&calc')).toBe(false)
    expect(isSafeVerificationUri('https://example.com/a|b')).toBe(false)
    expect(isSafeVerificationUri('https://example.com/a b')).toBe(false)
  })
  it('rejects non-loopback http and other schemes', () => {
    expect(isSafeVerificationUri('http://example.com/device')).toBe(false)
    expect(isSafeVerificationUri('file:///etc/passwd')).toBe(false)
  })
})
