import { describe, expect, it } from 'vitest'
import { signUnsubscribeToken, verifyUnsubscribeToken, UNSUBSCRIBE_TTL_MS } from '../../../convex/lib/principalAccount/notifications/unsubscribe'

const payload = { principalRef: 'p1', accountRef: 'a1', stream: 'alert' } as const
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url')

describe('unsubscribe token expiry and key version', () => {
  it('verifies a fresh token', async () => {
    const token = await signUnsubscribeToken('s', payload)
    await expect(verifyUnsubscribeToken('s', token)).resolves.toEqual(payload)
  })
  it('rejects an expired token', async () => {
    const token = await signUnsubscribeToken('s', payload, 1_000)
    await expect(verifyUnsubscribeToken('s', token, 1_000 + UNSUBSCRIBE_TTL_MS + 1)).resolves.toBeNull()
  })
  it('rejects a correctly signed token with an unknown kid', async () => {
    const body = b64(new TextEncoder().encode(JSON.stringify({ ...payload, kid: 'v0', iat: 0, exp: Date.now() + 1e9 })))
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('s'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const sig = b64(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))))
    await expect(verifyUnsubscribeToken('s', `${body}.${sig}`)).resolves.toBeNull()
  })
  it('rejects a validly signed token with no kid or exp', async () => {
    const body = b64(new TextEncoder().encode(JSON.stringify(payload)))
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('s'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const sig = b64(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))))
    await expect(verifyUnsubscribeToken('s', `${body}.${sig}`, Date.UTC(2026, 10, 20))).resolves.toBeNull()
  })
})
