import { describe, expect, it } from 'vitest'

import { signUnsubscribeToken, verifyUnsubscribeToken } from '../../../convex/lib/principalAccount/notifications/unsubscribe'

const payload = { principalRef: 'principal:owner', accountRef: 'acc_owner', stream: 'alert' as const }

describe('unsubscribe tokens', () => {
  it('verifies a token it signed and returns the principal, account and stream', async () => {
    const token = await signUnsubscribeToken('secret-a', payload)
    await expect(verifyUnsubscribeToken('secret-a', token)).resolves.toEqual(payload)
  })

  it('refuses a token signed with a different secret', async () => {
    const token = await signUnsubscribeToken('secret-a', payload)
    await expect(verifyUnsubscribeToken('secret-b', token)).resolves.toBeNull()
  })

  it('refuses a payload swapped onto another token signature', async () => {
    const alert = await signUnsubscribeToken('secret-a', payload)
    const lifecycle = await signUnsubscribeToken('secret-a', { ...payload, stream: 'lifecycle' })
    const forged = `${lifecycle.split('.')[0]}.${alert.split('.')[1]}`
    await expect(verifyUnsubscribeToken('secret-a', forged)).resolves.toBeNull()
  })

  it('refuses a validly signed token for a stream that cannot be unsubscribed', async () => {
    const token = await signUnsubscribeToken('secret-a', { ...payload, stream: 'transactional' as never })
    await expect(verifyUnsubscribeToken('secret-a', token)).resolves.toBeNull()
  })

  it('refuses malformed input', async () => {
    await expect(verifyUnsubscribeToken('secret-a', '')).resolves.toBeNull()
    await expect(verifyUnsubscribeToken('secret-a', 'not-a-token')).resolves.toBeNull()
    await expect(verifyUnsubscribeToken('secret-a', 'a.b.c')).resolves.toBeNull()
  })
})
