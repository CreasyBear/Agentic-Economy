import { describe, expect, it } from 'vitest'

import { redactPayload } from '@/modules/observability/public'

describe('redactPayload', () => {
  it('blanks password, apiKey, and privateKey keys without scanning every string', () => {
    expect(redactPayload({
      password: 'hunter2',
      apiKey: 'sk_live_visible_if_unredacted',
      privateKey: '-----BEGIN PRIVATE KEY-----',
      note: 'keep this sentence with token in the value',
    })).toEqual({
      password: '[redacted]',
      apiKey: '[redacted]',
      privateKey: '[redacted]',
      note: 'keep this sentence with token in the value',
    })
  })

  it('blanks api_key, private_key, and credential keys', () => {
    expect(redactPayload({
      api_key: 'sk_live_snake',
      private_key: '-----BEGIN PRIVATE KEY-----',
      credential: 'bearer-secret',
      note: 'keep this sentence with token in the value',
    })).toEqual({
      api_key: '[redacted]',
      private_key: '[redacted]',
      credential: '[redacted]',
      note: 'keep this sentence with token in the value',
    })
  })
})
